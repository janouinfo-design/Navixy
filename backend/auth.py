"""LOGITRAK — Module d'authentification (JWT + bcrypt + Fernet). Phase 1 sécurité."""
import os
import uuid
import bcrypt
import jwt
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlparse
from fastapi import APIRouter, Request, Response, HTTPException
from pydantic import BaseModel
from cryptography.fernet import Fernet

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 480
REFRESH_TTL_DAYS = 7
ROLES = ("SUPER_ADMIN", "ADMIN", "MANAGER", "READ_ONLY", "DRIVER")
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

MODULES = [
    {"id": "dashboard", "label": "Vue générale"},
    {"id": "analyse", "label": "Analyse flotte"},
    {"id": "conducteurs", "label": "Conducteurs & Éco-conduite"},
    {"id": "vehicules", "label": "Véhicules & Documents"},
    {"id": "carburant", "label": "Carburant"},
    {"id": "rapports", "label": "Rapports & Exports"},
]

MODULE_PATH_MAP = (
    ("/api/drivers/ecodriving", "conducteurs"),
    ("/api/reports/driver", "conducteurs"),
    ("/api/vehicles/admin", "vehicules"),
    ("/api/vehicles/", "vehicules"),
    ("/api/documents", "vehicules"),
    ("/api/config/fuel", "carburant"),
    ("/api/export/", "rapports"),
)


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def _fernet() -> Fernet:
    return Fernet(os.environ["ENCRYPTION_KEY"].encode())


# ---------- Passwords ----------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# ---------- Chiffrement navixy_hash au repos ----------

def encrypt_hash(plain: str) -> str:
    if not plain or plain.startswith("enc:"):
        return plain
    return "enc:" + _fernet().encrypt(plain.encode()).decode()


def decrypt_hash(stored: str) -> str:
    if not stored or not stored.startswith("enc:"):
        return stored
    return _fernet().decrypt(stored[4:].encode()).decode()


# ---------- JWT ----------

def create_access_token(user: dict) -> str:
    payload = {
        "sub": user["id"], "email": user["email"], "role": user["role"],
        "tenant_id": user.get("tenant_id"), "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str):
    jti = str(uuid.uuid4())
    payload = {"sub": user_id, "type": "refresh", "jti": jti,
               "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TTL_DAYS)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM), jti


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_session(db, user_id: str) -> str:
    """Crée un refresh token adossé à une session serveur (hash stocké, jamais en clair)."""
    token, jti = create_refresh_token(user_id)
    await db.sessions.insert_one({
        "jti": jti, "user_id": user_id, "token_hash": _token_hash(token),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=REFRESH_TTL_DAYS),
        "revoked": False,
    })
    return token


async def audit_event(db, tenant, action: str, by: str, detail: str = None):
    await db.audit_log.insert_one({"tenant": tenant or "-", "action": action, "by": by,
                                   "detail": detail, "at": datetime.now(timezone.utc).isoformat()})


def _set_cookies(response: Response, access: str, refresh: str, iframe: bool = False):
    if iframe:
        # Sessions par lien : SameSite=None + Partitioned (CHIPS) pour fonctionner en iframe cross-site
        for name, val, age in (("access_token", access, ACCESS_TTL_MIN * 60),
                               ("refresh_token", refresh, REFRESH_TTL_DAYS * 86400)):
            response.headers.append(
                "set-cookie",
                f"{name}={val}; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age={age}")
        return
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="lax", max_age=ACCESS_TTL_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="lax", max_age=REFRESH_TTL_DAYS * 86400, path="/")


def _sanitize(user: dict) -> dict:
    return {k: v for k, v in user.items() if k not in ("password_hash", "_id")}


# ---------- Dépendances ----------

def _virtual_link_user(link: dict) -> dict:
    return {"id": f"link:{link['id']}", "email": f"acces-direct@{link['tenant']}",
            "first_name": "Accès", "last_name": "Direct",
            "role": "MANAGER" if link.get("access_mode") == "edit" else "READ_ONLY",
            "tenant_id": link["tenant"], "is_active": True, "via_link": True}


async def get_current_user(request: Request, db) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expirée")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Jeton invalide")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Type de jeton invalide")
    sub = payload["sub"]
    if sub.startswith("link:"):
        link = await db.tenant_access_tokens.find_one({"id": sub[5:], "revoked": False})
        if not link:
            raise HTTPException(status_code=401, detail="Lien d'accès révoqué")
        client = await db.clients.find_one({"tenant": link["tenant"]}, {"is_active": 1})
        if not client or not client.get("is_active", True):
            raise HTTPException(status_code=401, detail="Accès suspendu")
        return _virtual_link_user(link)
    user = await db.users.find_one({"id": sub}, {"_id": 0})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Utilisateur introuvable ou désactivé")
    return user


def make_require_user(db):
    async def require_user(request: Request) -> dict:
        user = await get_current_user(request, db)
        role = user.get("role")
        if role != "SUPER_ADMIN":
            if user.get("must_change_password"):
                raise HTTPException(status_code=403, detail="PASSWORD_CHANGE_REQUIRED")
            if role in ("READ_ONLY", "DRIVER") and request.method not in ("GET", "HEAD", "OPTIONS"):
                raise HTTPException(status_code=403, detail="Accès en lecture seule")
            if user.get("via_link") and request.method not in ("GET", "HEAD", "OPTIONS"):
                # Cookies SameSite=None (iframe) → garde anti-CSRF : l'Origin doit correspondre au host servi
                origin = request.headers.get("origin")
                if origin:
                    o_host = (urlparse(origin).hostname or "").lower()
                    allowed = set()
                    for h in (request.headers.get("host", ""), request.headers.get("x-forwarded-host", "")):
                        h = h.split(",")[0].strip().split(":")[0].lower()
                        if h:
                            allowed.add(h)
                    if o_host not in allowed:
                        raise HTTPException(status_code=403, detail="Origine non autorisée")
            tenant = user.get("tenant_id")
            client = None
            if tenant:
                client = await db.clients.find_one({"tenant": tenant},
                                                   {"_id": 0, "is_active": 1, "modules": 1})
                if client is None and tenant != "default":
                    raise HTTPException(status_code=403, detail="Client introuvable")
                if client and not client.get("is_active", True):
                    raise HTTPException(status_code=403, detail="Compte client suspendu")
            modules = (client or {}).get("modules")
            if modules is not None:
                path = request.url.path
                for prefix, mod in MODULE_PATH_MAP:
                    if path.startswith(prefix) and mod not in modules:
                        raise HTTPException(status_code=403, detail=f"Module '{mod}' non activé pour ce client")
        request.state.user = user
        return user
    return require_user


def require_role(*roles):
    async def dep(request: Request) -> dict:
        user = getattr(request.state, "user", None)
        if not user:
            raise HTTPException(status_code=401, detail="Non authentifié")
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Accès refusé — rôle insuffisant")
        if "SUPER_ADMIN" in roles:
            admin_host = os.environ.get("ADMIN_HOST")
            if admin_host and request.headers.get("host", "").split(":")[0] != admin_host:
                raise HTTPException(status_code=403,
                                    detail=f"Espace Super Admin accessible uniquement via https://{admin_host}")
        return user
    return dep


# ---------- Brute force ----------

async def _check_lockout(db, identifier: str):
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if rec and rec.get("count", 0) >= MAX_LOGIN_ATTEMPTS:
        last = datetime.fromisoformat(rec["last_attempt"])
        if datetime.now(timezone.utc) - last < timedelta(minutes=LOCKOUT_MINUTES):
            raise HTTPException(status_code=429, detail=f"Trop de tentatives. Réessayez dans {LOCKOUT_MINUTES} minutes.")
        await db.login_attempts.delete_one({"identifier": identifier})


async def _record_failure(db, identifier: str, email: str):
    await db.login_attempts.update_one(
        {"identifier": identifier},
        {"$inc": {"count": 1}, "$set": {"last_attempt": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if rec and rec.get("count") == MAX_LOGIN_ATTEMPTS:
        await audit_event(db, "-", "LOGIN_FAILED_LOCKOUT", email, f"Verrou {LOCKOUT_MINUTES} min")


# ---------- Seed + migration idempotente ----------

async def seed_and_migrate(db):
    await db.users.create_index("email", unique=True)
    await db.users.create_index("tenant_id")
    await db.clients.create_index("subdomain", unique=True)
    await db.flows.create_index("tenant")
    await db.login_attempts.create_index("identifier")
    await db.impersonation_logs.create_index([("tenant", 1), ("started_at", -1)])
    await db.tenant_sync.create_index("tenant", unique=True)
    await db.audit_log.create_index([("tenant", 1), ("at", -1)])
    await db.sessions.create_index("jti", unique=True)
    await db.sessions.create_index("user_id")
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.tenant_access_tokens.create_index("token_hash", unique=True)
    await db.tenant_access_tokens.create_index("tenant")

    await db.flows.update_many({"tenant": {"$exists": False}}, {"$set": {"tenant": "default"}})

    default_hash = os.environ.get("NAVIXY_HASH", "")
    async for c in db.clients.find({"tenant": {"$exists": False}}):
        stored = c.get("navixy_hash", "")
        plain = decrypt_hash(stored) if stored.startswith("enc:") else stored
        tenant = "default" if (default_hash and plain == default_hash) else c["subdomain"]
        await db.clients.update_one({"_id": c["_id"]}, {"$set": {"tenant": tenant}})
    await db.clients.update_many({"modules": {"$exists": False}},
                                 {"$set": {"modules": [m["id"] for m in MODULES]}})

    async for c in db.clients.find({"navixy_hash": {"$exists": True, "$ne": ""}}):
        h = c["navixy_hash"]
        if not h.startswith("enc:"):
            await db.clients.update_one({"_id": c["_id"]}, {"$set": {"navixy_hash": encrypt_hash(h)}})

    email = os.environ["SUPER_ADMIN_EMAIL"].lower()
    password = os.environ["SUPER_ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": email,
            "password_hash": hash_password(password),
            "role": "SUPER_ADMIN", "tenant_id": None,
            "first_name": "Super", "last_name": "Admin",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})


# ---------- Router ----------

class LoginInput(BaseModel):
    email: str
    password: str


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str


def create_auth_router(db) -> APIRouter:
    router = APIRouter(prefix="/api/auth")

    @router.post("/login")
    async def login(body: LoginInput, request: Request, response: Response):
        email = body.email.strip().lower()
        ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
        identifier = f"{ip}:{email}"
        await _check_lockout(db, identifier)

        user = await db.users.find_one({"email": email}, {"_id": 0})
        if not user or not verify_password(body.password, user["password_hash"]):
            await _record_failure(db, identifier, email)
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Compte désactivé")
        if user.get("tenant_id"):
            client = await db.clients.find_one({"tenant": user["tenant_id"]}, {"is_active": 1})
            if client and not client.get("is_active", True):
                raise HTTPException(status_code=403, detail="Compte client suspendu — contactez LOGITRAK")

        await db.login_attempts.delete_one({"identifier": identifier})
        await db.users.update_one({"id": user["id"]},
                                  {"$set": {"last_login_at": datetime.now(timezone.utc).isoformat()}})
        refresh = await create_session(db, user["id"])
        _set_cookies(response, create_access_token(user), refresh)
        await audit_event(db, user.get("tenant_id"), "LOGIN_SUCCESS", email)
        return {"success": True, "user": _sanitize(user)}

    @router.post("/logout")
    async def logout(request: Request, response: Response):
        token = request.cookies.get("refresh_token")
        if token:
            try:
                payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM],
                                     options={"verify_exp": False})
                if payload.get("jti"):
                    await db.sessions.update_one({"jti": payload["jti"]}, {"$set": {"revoked": True}})
            except jwt.InvalidTokenError:
                pass
        response.delete_cookie("access_token", path="/")
        response.delete_cookie("refresh_token", path="/")
        return {"success": True}

    @router.get("/me")
    async def me(request: Request):
        user = await get_current_user(request, db)
        return {"success": True, "user": _sanitize(user)}

    @router.post("/refresh")
    async def refresh(request: Request, response: Response):
        token = request.cookies.get("refresh_token")
        if not token:
            raise HTTPException(status_code=401, detail="Aucun jeton de rafraîchissement")
        try:
            payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Jeton invalide")
        if payload.get("type") != "refresh" or not payload.get("jti"):
            raise HTTPException(status_code=401, detail="Type de jeton invalide")

        sess = await db.sessions.find_one({"jti": payload["jti"]})
        if not sess or sess["token_hash"] != _token_hash(token):
            raise HTTPException(status_code=401, detail="Session inconnue")
        if sess.get("revoked"):
            # Réutilisation d'un jeton déjà consommé → révocation de toutes les sessions (vol suspecté)
            await db.sessions.update_many({"user_id": sess["user_id"]}, {"$set": {"revoked": True}})
            await audit_event(db, "-", "REFRESH_REUSE_DETECTED", sess["user_id"])
            raise HTTPException(status_code=401, detail="Jeton déjà utilisé — sessions révoquées")

        sub = payload["sub"]
        if sub.startswith("link:"):
            link = await db.tenant_access_tokens.find_one({"id": sub[5:], "revoked": False})
            if not link:
                raise HTTPException(status_code=401, detail="Lien d'accès révoqué")
            user = _virtual_link_user(link)
        else:
            user = await db.users.find_one({"id": sub}, {"_id": 0})
            if not user or not user.get("is_active", True):
                raise HTTPException(status_code=401, detail="Utilisateur introuvable ou désactivé")

        # Rotation : ancien jeton révoqué, nouveau émis
        await db.sessions.update_one({"jti": payload["jti"]}, {"$set": {
            "revoked": True, "rotated_at": datetime.now(timezone.utc).isoformat()}})
        new_refresh = await create_session(db, user["id"])
        _set_cookies(response, create_access_token(user), new_refresh, iframe=sub.startswith("link:"))
        return {"success": True}

    @router.post("/change-password")
    async def change_password(body: ChangePasswordInput, request: Request, response: Response):
        user = await get_current_user(request, db)
        if user["id"].startswith("link:"):
            raise HTTPException(status_code=403, detail="Non disponible pour un accès par lien")
        if not verify_password(body.current_password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Mot de passe actuel incorrect")
        if len(body.new_password) < 8:
            raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit contenir au moins 8 caractères")
        if body.new_password == body.current_password:
            raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit être différent de l'actuel")
        await db.users.update_one({"id": user["id"]}, {"$set": {
            "password_hash": hash_password(body.new_password),
            "must_change_password": False,
            "password_changed_at": datetime.now(timezone.utc).isoformat()}})
        # Invalider toutes les sessions existantes puis en émettre une nouvelle
        await db.sessions.update_many({"user_id": user["id"]}, {"$set": {"revoked": True}})
        updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        refresh = await create_session(db, user["id"])
        _set_cookies(response, create_access_token(updated), refresh)
        await audit_event(db, user.get("tenant_id"), "PASSWORD_CHANGED", user["email"])
        return {"success": True, "user": _sanitize(updated)}

    return router
