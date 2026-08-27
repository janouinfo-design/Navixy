"""
LOGITRAK — Documents V2 (source documentaire).

Collection Mongo `documents` tenantisée. Les documents ALIMENTENT le moteur
d'échéances (deadline_engine) via load_documents_for_engine() — le statut métier
(VALID/DUE_SOON/EXPIRED) n'est JAMAIS stocké, toujours calculé par le moteur.

Références véhicule :
  - tracker_id        : relation technique (jointure runtime actuelle)
  - navixy_vehicle_id : identité canonique (garage) quand connue
Un document rattaché uniquement à un véhicule garage non lié reste
reconcile_status="to_reconcile" — on ne crée JAMAIS de faux véhicule.
La réconciliation (PATCH tracker_id) rattache sans réimporter le fichier.

Catégories : défauts système (constantes ci-dessous) + catégories custom par tenant
(db.document_categories). Chaque catégorie porte son mapping d'échéance
(deadline_type: None | assurance | leasing | document) et son flag critique
(appliqué uniquement au type générique "document" — assurance/contrôle restent
régis par la règle 2b du moteur).
"""
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse

from auth import audit_event, get_current_user
from deadline_engine import compute_vehicle_deadlines, _parse_date

UPLOAD_DIR = "/app/backend/uploads"
MAX_SIZE = 25 * 1024 * 1024
CHUNK = 1024 * 1024

VALID_DEADLINE_TYPES = (None, "document", "assurance", "leasing")

DEFAULT_CATEGORIES = [
    {"id": "carte_grise", "label": "Carte grise", "deadline_type": None, "critical_when_overdue": False, "is_system": True},
    {"id": "assurance_rc", "label": "Assurance RC", "deadline_type": "assurance", "critical_when_overdue": True, "is_system": True},
    {"id": "leasing", "label": "Leasing", "deadline_type": "leasing", "critical_when_overdue": False, "is_system": True},
    # Contrôle : l'échéance vit dans le module Contrôles (controles[]) — pas de double comptage
    {"id": "controle", "label": "Contrôle", "deadline_type": None, "critical_when_overdue": False, "is_system": True},
    {"id": "facture", "label": "Facture", "deadline_type": None, "critical_when_overdue": False, "is_system": True},
    {"id": "autre", "label": "Autre", "deadline_type": "document", "critical_when_overdue": False, "is_system": True},
]

LEGACY_CATEGORY_MAP = {"carte grise": "carte_grise", "assurance": "assurance_rc", "leasing": "leasing",
                       "contrôle": "controle", "controle": "controle", "facture": "facture"}

DOC_FIELDS = {"_id": 0}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(name or "fichier"))[:120]


def _valid_date_or_400(value, field):
    if value in (None, ""):
        return None
    if _parse_date(value) is None:
        raise HTTPException(status_code=400, detail=f"Date invalide pour {field} (format AAAA-MM-JJ)")
    return str(value)[:10]


def _check_date_order(valid_from, expiry_date):
    if valid_from and expiry_date and valid_from > expiry_date:
        raise HTTPException(status_code=400, detail="La date « Valide du » doit précéder la date d'expiration")


async def get_categories(db, tenant):
    customs = await db.document_categories.find({"tenant": tenant}, {"_id": 0}).to_list(200)
    return DEFAULT_CATEGORIES + customs


def _engine_item(doc, cat):
    dtype = cat.get("deadline_type")
    if not dtype or not _parse_date(doc.get("expiry_date")):
        return None
    label = None
    if dtype == "document":
        label = f"Document : {doc.get('title') or cat.get('label') or 'Document'}"
    return {"document_id": doc["id"], "deadline_type": dtype, "expiry_date": doc["expiry_date"],
            "label": label, "critical": bool(cat.get("critical_when_overdue"))}


async def load_documents_for_engine(db, tenant):
    """{tracker_id str -> [items moteur]} — documents à échéance rattachés à un tracker."""
    cats = {c["id"]: c for c in await get_categories(db, tenant)}
    out = {}
    cursor = db.documents.find({"tenant": tenant, "tracker_id": {"$ne": None},
                                "expiry_date": {"$nin": [None, ""]}}, DOC_FIELDS)
    async for d in cursor:
        item = _engine_item(d, cats.get(d.get("category_id")) or {})
        if item:
            out.setdefault(str(d["tracker_id"]), []).append(item)
    return out


def _doc_deadline(doc, cats):
    """Échéance d'UN document, calculée par le moteur (aucune logique parallèle)."""
    item = _engine_item(doc, cats.get(doc.get("category_id")) or {})
    if not item:
        return None
    computed = compute_vehicle_deadlines(doc.get("tracker_id") or 0, documents_v2=[item])
    return computed[0] if computed else None


async def migrate_legacy_documents(db):
    """Migration one-shot idempotente : vehicle_admin.documents[] → collection documents.
    Les fichiers restent à leur emplacement d'origine (storage_path). Le tableau legacy
    n'est pas supprimé (phase de transition) mais n'est plus alimenté par l'UI."""
    migrated = 0
    async for rec in db.vehicle_admin.find({"documents.0": {"$exists": True}},
                                           {"_id": 0, "tenant": 1, "tracker_id": 1, "documents": 1}):
        for d in rec.get("documents", []):
            if not d.get("id") or await db.documents.find_one({"id": d["id"]}, {"_id": 1}):
                continue
            cat = LEGACY_CATEGORY_MAP.get((d.get("category") or "").strip().lower(), "autre")
            await db.documents.insert_one({
                "id": d["id"], "tenant": rec["tenant"], "tracker_id": int(rec["tracker_id"]),
                "navixy_vehicle_id": None, "reconcile_status": "linked",
                "category_id": cat, "title": d.get("filename"), "document_number": None,
                "issued_at": None, "valid_from": None, "expiry_date": None,
                "filename": d.get("filename"), "size": d.get("size"), "content_type": d.get("content_type"),
                "storage_path": os.path.join(UPLOAD_DIR, rec["tenant"], str(rec["tracker_id"]),
                                             f"{d['id']}_{d.get('filename')}"),
                "source": "legacy", "ai_extraction": None, "uploaded_by": None,
                "created_at": d.get("uploaded_at") or _now(), "updated_at": _now(),
            })
            migrated += 1
    return migrated


def create_documents_router(db, get_tenant_context):
    router = APIRouter(prefix="/documents", tags=["documents"])

    async def _by(request):
        user = await get_current_user(request, db)
        return user.get("email") or user.get("id") or "-"

    # ---------- Catégories (déclarées avant /{doc_id}) ----------

    @router.get("/categories")
    async def list_categories(request: Request):
        _, tenant = await get_tenant_context(request)
        return {"success": True, "categories": await get_categories(db, tenant)}

    @router.post("/categories")
    async def create_category(request: Request):
        _, tenant = await get_tenant_context(request)
        user = await get_current_user(request, db)
        if user.get("role") not in ("ADMIN", "SUPER_ADMIN"):
            raise HTTPException(status_code=403, detail="Réservé aux administrateurs")
        body = await request.json()
        label = (body.get("label") or "").strip()
        if not label:
            raise HTTPException(status_code=400, detail="Libellé requis")
        dtype = body.get("deadline_type")
        if dtype not in VALID_DEADLINE_TYPES:
            raise HTTPException(status_code=400, detail="deadline_type invalide")
        existing = await get_categories(db, tenant)
        if any(c["label"].strip().lower() == label.lower() for c in existing):
            raise HTTPException(status_code=409, detail="Cette catégorie existe déjà")
        cat = {"id": uuid.uuid4().hex[:12], "tenant": tenant, "label": label,
               "deadline_type": dtype, "critical_when_overdue": bool(body.get("critical_when_overdue")),
               "is_system": False, "created_at": _now()}
        await db.document_categories.insert_one(dict(cat))
        cat.pop("tenant")
        await audit_event(db, tenant, "DOC_CATEGORY_CREATED", await _by(request), label)
        return {"success": True, "category": cat}

    @router.delete("/categories/{cat_id}")
    async def delete_category(cat_id: str, request: Request):
        _, tenant = await get_tenant_context(request)
        user = await get_current_user(request, db)
        if user.get("role") not in ("ADMIN", "SUPER_ADMIN"):
            raise HTTPException(status_code=403, detail="Réservé aux administrateurs")
        if any(c["id"] == cat_id for c in DEFAULT_CATEGORIES):
            raise HTTPException(status_code=400, detail="Catégorie système non supprimable")
        used = await db.documents.count_documents({"tenant": tenant, "category_id": cat_id})
        if used:
            raise HTTPException(status_code=409, detail=f"Catégorie utilisée par {used} document(s)")
        r = await db.document_categories.delete_one({"tenant": tenant, "id": cat_id})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Catégorie introuvable")
        await audit_event(db, tenant, "DOC_CATEGORY_DELETED", await _by(request), cat_id)
        return {"success": True}

    # ---------- Documents ----------

    @router.get("")
    async def list_documents(request: Request, tracker_id: int = None, navixy_vehicle_id: int = None,
                             category_id: str = None, reconcile: str = None):
        _, tenant = await get_tenant_context(request)
        q = {"tenant": tenant}
        if tracker_id is not None:
            q["tracker_id"] = tracker_id
        if navixy_vehicle_id is not None:
            q["navixy_vehicle_id"] = navixy_vehicle_id
        if category_id:
            q["category_id"] = category_id
        if reconcile:
            q["reconcile_status"] = reconcile
        docs = await db.documents.find(q, DOC_FIELDS).sort("created_at", -1).to_list(2000)
        cats = {c["id"]: c for c in await get_categories(db, tenant)}
        for d in docs:
            d.pop("tenant", None)
            d["category_label"] = (cats.get(d.get("category_id")) or {}).get("label") or d.get("category_id")
            d["deadline"] = _doc_deadline(d, cats)
        return {"success": True, "documents": docs}

    @router.post("")
    async def create_document(request: Request, file: UploadFile = File(...),
                              category_id: str = Form(...), title: str = Form(None),
                              document_number: str = Form(None), issued_at: str = Form(None),
                              valid_from: str = Form(None), expiry_date: str = Form(None),
                              tracker_id: int = Form(None), navixy_vehicle_id: int = Form(None),
                              source: str = Form("manual")):
        _, tenant = await get_tenant_context(request)
        cats = {c["id"]: c for c in await get_categories(db, tenant)}
        if category_id not in cats:
            raise HTTPException(status_code=400, detail="Catégorie inconnue")
        if tracker_id is None and navixy_vehicle_id is None:
            raise HTTPException(status_code=400, detail="Référence véhicule requise (tracker_id ou navixy_vehicle_id)")
        if source not in ("manual", "import", "scan", "ai"):
            raise HTTPException(status_code=400, detail="Source invalide")
        issued_at = _valid_date_or_400(issued_at, "issued_at")
        valid_from = _valid_date_or_400(valid_from, "valid_from")
        expiry_date = _valid_date_or_400(expiry_date, "expiry_date")
        _check_date_order(valid_from, expiry_date)

        doc_id = str(uuid.uuid4())
        fname = _safe_name(file.filename)
        folder = os.path.join(UPLOAD_DIR, tenant, "docs")
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, f"{doc_id}_{fname}")
        size = 0
        with open(path, "wb") as out:
            while True:
                chunk = await file.read(CHUNK)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_SIZE:
                    out.close()
                    os.remove(path)
                    raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 25 Mo)")
                out.write(chunk)

        doc = {"id": doc_id, "tenant": tenant,
               "tracker_id": tracker_id, "navixy_vehicle_id": navixy_vehicle_id,
               "reconcile_status": "linked" if tracker_id is not None else "to_reconcile",
               "category_id": category_id, "title": (title or "").strip() or fname,
               "document_number": (document_number or "").strip() or None,
               "issued_at": issued_at, "valid_from": valid_from, "expiry_date": expiry_date,
               "filename": fname, "size": size, "content_type": file.content_type,
               "storage_path": path, "source": source, "ai_extraction": None,
               "uploaded_by": await _by(request), "created_at": _now(), "updated_at": _now()}
        await db.documents.insert_one(dict(doc))
        await audit_event(db, tenant, "DOC_UPLOADED", doc["uploaded_by"],
                          f"{doc['title']} ({category_id}) tracker={tracker_id} vehicle={navixy_vehicle_id}")
        doc.pop("tenant")
        doc["category_label"] = cats[category_id]["label"]
        doc["deadline"] = _doc_deadline(doc, cats)
        return {"success": True, "document": doc}

    PATCHABLE = ("title", "document_number", "issued_at", "valid_from", "expiry_date",
                 "category_id", "tracker_id", "navixy_vehicle_id")

    @router.patch("/{doc_id}")
    async def update_document(doc_id: str, request: Request):
        _, tenant = await get_tenant_context(request)
        doc = await db.documents.find_one({"tenant": tenant, "id": doc_id}, DOC_FIELDS)
        if not doc:
            raise HTTPException(status_code=404, detail="Document introuvable")
        body = await request.json()
        cats = {c["id"]: c for c in await get_categories(db, tenant)}
        updates = {}
        for k in PATCHABLE:
            if k not in body:
                continue
            v = body[k]
            if v in ("",):
                v = None
            if k in ("issued_at", "valid_from", "expiry_date"):
                v = _valid_date_or_400(v, k)
            if k == "category_id":
                if v not in cats:
                    raise HTTPException(status_code=400, detail="Catégorie inconnue")
            if k in ("tracker_id", "navixy_vehicle_id") and v is not None:
                try:
                    v = int(v)
                except (TypeError, ValueError):
                    raise HTTPException(status_code=400, detail=f"{k} invalide")
            updates[k] = v
        if not updates:
            raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")
        new_tracker = updates.get("tracker_id", doc.get("tracker_id"))
        new_vehicle = updates.get("navixy_vehicle_id", doc.get("navixy_vehicle_id"))
        if new_tracker is None and new_vehicle is None:
            raise HTTPException(status_code=400, detail="Le document doit rester rattaché à un véhicule")
        _check_date_order(updates.get("valid_from", doc.get("valid_from")),
                          updates.get("expiry_date", doc.get("expiry_date")))
        updates["reconcile_status"] = "linked" if new_tracker is not None else "to_reconcile"
        updates["updated_at"] = _now()
        await db.documents.update_one({"tenant": tenant, "id": doc_id}, {"$set": updates})
        doc.update(updates)
        await audit_event(db, tenant, "DOC_UPDATED", await _by(request),
                          f"{doc.get('title')} champs={sorted(k for k in updates if k not in ('updated_at',))}")
        doc.pop("tenant", None)
        doc["category_label"] = (cats.get(doc.get("category_id")) or {}).get("label") or doc.get("category_id")
        doc["deadline"] = _doc_deadline(doc, cats)
        return {"success": True, "document": doc}

    @router.delete("/{doc_id}")
    async def delete_document(doc_id: str, request: Request):
        _, tenant = await get_tenant_context(request)
        doc = await db.documents.find_one({"tenant": tenant, "id": doc_id}, DOC_FIELDS)
        if not doc:
            raise HTTPException(status_code=404, detail="Document introuvable")
        await db.documents.delete_one({"tenant": tenant, "id": doc_id})
        try:
            if doc.get("storage_path") and os.path.exists(doc["storage_path"]):
                os.remove(doc["storage_path"])
        except OSError:
            pass
        await audit_event(db, tenant, "DOC_DELETED", await _by(request), doc.get("title") or doc_id)
        return {"success": True}

    @router.get("/{doc_id}/file")
    async def download_document(doc_id: str, request: Request, inline: int = 0):
        _, tenant = await get_tenant_context(request)
        doc = await db.documents.find_one({"tenant": tenant, "id": doc_id}, DOC_FIELDS)
        if not doc:
            raise HTTPException(status_code=404, detail="Document introuvable")
        path = doc.get("storage_path")
        if not path or not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Fichier introuvable sur le serveur")
        if not inline:
            await audit_event(db, tenant, "DOC_DOWNLOADED", await _by(request), doc.get("title") or doc_id)
        disposition = "inline" if inline else "attachment"
        return FileResponse(path, media_type=doc.get("content_type") or "application/octet-stream",
                            filename=doc.get("filename"),
                            content_disposition_type=disposition)

    return router
