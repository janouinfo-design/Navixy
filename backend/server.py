"""
LOGITRAK Fleet Dashboard — Multi-Client API
Slim route layer. All computation is delegated to AnalyticsEngine.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Query, Request, Response, Depends
from fastapi.responses import StreamingResponse, RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import json
import io
import csv
import uuid
import asyncio
from pathlib import Path
from collections import Counter
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from navixy_client import NavixyClient
from cache_manager import TenantCacheManager
from analytics_engine import AnalyticsEngine
from ecodriving import compute_driver_ecodriving
from vehicle_admin import create_vehicle_admin_router
from documents_v2 import create_documents_router, migrate_legacy_documents, load_documents_for_engine
from deadline_engine import (compute_vehicle_deadlines, compute_fleet_deadlines,
                             ENGINE_VERSION as DEADLINE_ENGINE_VERSION, DUE_SOON_DAYS)
from capabilities import create_capabilities_router
from auth import (
    make_require_user, require_role, create_auth_router,
    seed_and_migrate, encrypt_hash, decrypt_hash, MODULES,
    _token_hash, _virtual_link_user, _set_cookies, create_access_token, create_session,
    audit_event,
)
from super_admin import create_super_admin_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ============ INFRA ============

mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME')
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[db_name]

DEFAULT_NAVIXY_HASH = os.environ.get('NAVIXY_HASH', '')
NAVIXY_API_URL = os.environ.get('NAVIXY_API_URL', 'https://api.navixy.com/v2')
BASE_DOMAIN = os.environ.get('BASE_DOMAIN', 'logitrak.ch')

navixy = NavixyClient(NAVIXY_API_URL, DEFAULT_NAVIXY_HASH)
cache = TenantCacheManager(ttl=300)
engine = AnalyticsEngine(navixy, cache, db)

app = FastAPI(title="LOGITRAK Fleet Dashboard - Multi-Client")
require_user = make_require_user(db)
api_router = APIRouter(prefix="/api", dependencies=[Depends(require_user)])
public_router = APIRouter(prefix="/api")
auth_router = create_auth_router(db)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class _AccessTokenLogFilter(logging.Filter):
    """Rédige le token brut des liens d'accès dans les logs applicatifs."""
    _RE = re.compile(r"/api/access/\S+")

    def filter(self, record):
        try:
            if record.args:
                record.args = tuple(
                    self._RE.sub("/api/access/[REDACTED]", a) if isinstance(a, str) and "/api/access/" in a else a
                    for a in record.args)
            if isinstance(record.msg, str) and "/api/access/" in record.msg:
                record.msg = self._RE.sub("/api/access/[REDACTED]", record.msg)
        except Exception:
            pass
        return True


for _lg in ("uvicorn.access", "uvicorn.error", ""):
    logging.getLogger(_lg).addFilter(_AccessTokenLogFilter())

# ============ MULTI-TENANT ============

async def get_client_from_subdomain(request: Request) -> Optional[dict]:
    host = request.headers.get('host', '')
    match = re.match(r'^([a-zA-Z0-9-]+)\.' + re.escape(BASE_DOMAIN), host)
    if match:
        subdomain = match.group(1).lower()
        if subdomain in ('www', 'admin', 'api'):
            return None
        client = await db.clients.find_one({"subdomain": subdomain, "is_active": True}, {"_id": 0})
        if not client:
            raise HTTPException(status_code=403, detail="Domaine inconnu ou tenant suspendu")
        return client
    return None


async def _resolve_tenant(tenant: str):
    """Returns (navixy_hash, tenant_name) for a validated tenant identifier."""
    client = await db.clients.find_one({"tenant": tenant, "is_active": True}, {"_id": 0})
    if client and client.get('navixy_hash'):
        return decrypt_hash(client['navixy_hash']), tenant
    if tenant == 'default':
        return DEFAULT_NAVIXY_HASH, 'default'
    raise HTTPException(status_code=403, detail="Tenant inconnu ou suspendu")


IMPERSONATION_TTL_MIN = 60


async def _validate_impersonation(user: dict, tenant: str):
    """Le header seul ne suffit pas : une session d'aperçu ouverte et non expirée est requise."""
    sess = await db.impersonation_logs.find_one(
        {"super_admin_id": user["id"], "tenant": tenant, "ended_at": None},
        sort=[("started_at", -1)])
    if not sess:
        raise HTTPException(status_code=403, detail="IMPERSONATION_INVALID")
    started = datetime.fromisoformat(sess["started_at"])
    if datetime.now(timezone.utc) - started > timedelta(minutes=IMPERSONATION_TTL_MIN):
        now = datetime.now(timezone.utc).isoformat()
        await db.impersonation_logs.update_one(
            {"id": sess["id"]}, {"$set": {"ended_at": now, "expired": True}})
        await db.audit_log.insert_one({"tenant": tenant, "action": "IMPERSONATION_EXPIRED",
                                       "by": user["email"], "detail": None, "at": now})
        raise HTTPException(status_code=403, detail="IMPERSONATION_EXPIRED")


async def get_tenant_context(request: Request):
    """Returns (navixy_hash, tenant_name). Tenant = identité du token, jamais le frontend."""
    user = getattr(request.state, 'user', None)
    if user is None:
        raise HTTPException(status_code=401, detail="Non authentifié")
    sub_client = await get_client_from_subdomain(request)

    if user.get('role') == 'SUPER_ADMIN':
        act_as = request.headers.get('X-Act-As-Tenant')
        if act_as:
            act_as = act_as.strip().lower()
            await _validate_impersonation(user, act_as)
            return await _resolve_tenant(act_as)
        if sub_client:
            return decrypt_hash(sub_client['navixy_hash']), sub_client.get('tenant') or sub_client['subdomain']
        return await _resolve_tenant('default')

    tenant = user.get('tenant_id')
    if not tenant:
        raise HTTPException(status_code=403, detail="Aucun tenant associé à ce compte")
    if sub_client and (sub_client.get('tenant') or sub_client['subdomain']) != tenant:
        raise HTTPException(status_code=403, detail="Tenant non autorisé sur ce domaine")
    return await _resolve_tenant(tenant)

# ============ MODELS ============

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class ClientCreate(BaseModel):
    name: str
    subdomain: str
    navixy_hash: str
    logo_url: Optional[str] = None
    primary_color: Optional[str] = "#e53935"
    contact_email: Optional[str] = None

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    company_name: Optional[str] = None
    navixy_hash: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    contact_email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    is_active: Optional[bool] = None

class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    subdomain: str
    navixy_hash: str
    logo_url: Optional[str] = None
    primary_color: str = "#e53935"
    contact_email: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FlowCreate(BaseModel):
    name: str
    nodes: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []

class Flow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    nodes: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FuelConfigUpdate(BaseModel):
    default_fuel_price: Optional[float] = None
    currency: Optional[str] = None
    default_consumption_rate: Optional[float] = None
    fuel_types: Optional[Dict[str, float]] = None

# ============ BASIC ============

@public_router.get("/")
async def root():
    return {"message": "LOGITRAK Fleet Dashboard API - Multi-Client", "engine_version": "1.0.0"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    obj = StatusCheck(**input.model_dump())
    doc = obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.status_checks.insert_one(doc)
    return obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for c in checks:
        if isinstance(c['timestamp'], str):
            c['timestamp'] = datetime.fromisoformat(c['timestamp'])
    return checks

# ============ CLIENT INFO ============

@public_router.get("/client/info")
async def get_client_info(request: Request):
    info = await get_client_from_subdomain(request)
    if info:
        safe = {k: info.get(k) for k in ('name', 'subdomain', 'logo_url', 'primary_color')}
        return {"success": True, "client": safe, "is_multi_tenant": True}
    return {"success": True, "client": {"name": "Default", "primary_color": "#e53935"}, "is_multi_tenant": False}

# ============ ACCÈS DIRECT PAR LIEN TENANT (sans login, clé Navixy jamais exposée) ============

def _access_redirect(path: str) -> RedirectResponse:
    r = RedirectResponse(url=path, status_code=302)
    r.headers["Cache-Control"] = "no-store"
    r.headers["Referrer-Policy"] = "no-referrer"
    return r


@public_router.get("/access/{token}")
async def tenant_access(token: str, request: Request):
    link = await db.tenant_access_tokens.find_one({"token_hash": _token_hash(token), "revoked": False})
    if not link:
        return _access_redirect("/lien-invalide")
    client = await db.clients.find_one({"tenant": link["tenant"]}, {"_id": 0, "navixy_hash": 0})
    if not client or not client.get("is_active", True):
        return _access_redirect("/lien-invalide?motif=suspendu")
    sub_client = await get_client_from_subdomain(request)
    if sub_client and (sub_client.get('tenant') or sub_client['subdomain']) != link["tenant"]:
        return _access_redirect("/lien-invalide?motif=domaine")
    user = _virtual_link_user(link)
    refresh = await create_session(db, user["id"])
    resp = _access_redirect("/")
    _set_cookies(resp, create_access_token(user), refresh, iframe=True)
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or \
        (request.client.host if request.client else None)
    await db.tenant_access_tokens.update_one(
        {"id": link["id"]}, {"$set": {"last_used_at": datetime.now(timezone.utc).isoformat()}})
    await audit_event(db, link["tenant"], "ACCESS_LINK_USED", f"acces-direct@{link['tenant']}", f"IP {ip}")
    return resp

# ============ TENANT CONTEXT (utilisateur authentifié) ============

@api_router.get("/tenant/context")
async def tenant_context(request: Request):
    _, tenant = await get_tenant_context(request)
    user = request.state.user
    client = await db.clients.find_one({"tenant": tenant}, {"_id": 0, "navixy_hash": 0})
    modules = (client or {}).get("modules") or [m["id"] for m in MODULES]
    return {"success": True, "tenant": tenant,
            "client_name": (client or {}).get("name", "Default"),
            "modules": modules, "role": user.get("role"),
            "is_impersonating": user.get("role") == "SUPER_ADMIN" and bool(request.headers.get("X-Act-As-Tenant"))}

# ============ ADMIN — CLIENTS CRUD (SUPER_ADMIN uniquement, hash jamais exposé) ============

def _mask_client(c: dict) -> dict:
    return {k: v for k, v in c.items() if k != 'navixy_hash'}

@api_router.get("/admin/clients")
async def list_clients(user: dict = Depends(require_role("SUPER_ADMIN"))):
    clients = await db.clients.find({}, {"_id": 0}).to_list(1000)
    return {"success": True, "clients": [_mask_client(c) for c in clients]}

@api_router.post("/admin/clients")
async def create_client(client_input: ClientCreate, user: dict = Depends(require_role("SUPER_ADMIN"))):
    existing = await db.clients.find_one({"subdomain": client_input.subdomain.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Subdomain already exists")
    obj = Client(
        name=client_input.name, subdomain=client_input.subdomain.lower(),
        navixy_hash=encrypt_hash(client_input.navixy_hash), logo_url=client_input.logo_url,
        primary_color=client_input.primary_color or "#e53935",
        contact_email=client_input.contact_email,
    )
    doc = obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.clients.insert_one(doc)
    return {"success": True, "client": _mask_client(obj.model_dump()),
            "dashboard_url": f"https://{obj.subdomain}.{BASE_DOMAIN}"}

@api_router.get("/admin/clients/{client_id}")
async def get_client(client_id: str, user: dict = Depends(require_role("SUPER_ADMIN"))):
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"success": True, "client": _mask_client(doc)}

@api_router.put("/admin/clients/{client_id}")
async def update_client(client_id: str, client_input: ClientUpdate, user: dict = Depends(require_role("SUPER_ADMIN"))):
    data = {k: v for k, v in client_input.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No data to update")
    if 'navixy_hash' in data:
        data['navixy_hash'] = encrypt_hash(data['navixy_hash'])
    r = await db.clients.update_one({"id": client_id}, {"$set": data})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"success": True, "message": "Client updated"}

@api_router.delete("/admin/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(require_role("SUPER_ADMIN"))):
    r = await db.clients.delete_one({"id": client_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"success": True, "message": "Client deleted"}

# ============ FUEL CONFIG ============

@api_router.get("/config/fuel")
async def get_fuel_config(request: Request):
    _, tenant = await get_tenant_context(request)
    config = await engine.get_fuel_config(tenant)
    return {"success": True, "tenant": tenant, "fuel_config": config}

@api_router.put("/config/fuel")
async def update_fuel_config(request: Request, body: FuelConfigUpdate):
    _, tenant = await get_tenant_context(request)
    current = await engine.get_fuel_config(tenant)
    update = body.model_dump(exclude_unset=True)
    for key, val in update.items():
        current[key] = val
    await engine.set_fuel_config(tenant, current)
    cache.invalidate_tenant(tenant)
    return {"success": True, "fuel_config": current}

@api_router.delete("/config/fuel")
async def reset_fuel_config(request: Request):
    _, tenant = await get_tenant_context(request)
    await engine.set_fuel_config(tenant, {"default_fuel_price": 2.0, "currency": "CHF", "default_consumption_rate": None, "fuel_types": {"diesel": 2.0, "essence": 2.1, "electric_kwh": 0.25}})
    cache.invalidate_tenant(tenant)
    return {"success": True, "message": "Fuel config reset to defaults"}

# ============ TRACKERS (passthrough) ============

@api_router.get("/trackers")
async def get_trackers(request: Request):
    h, _ = await get_tenant_context(request)
    data = await navixy.get_trackers(h)
    if data.get('success'):
        trackers = [{
            "id": t['id'], "label": t['label'], "group_id": t.get('group_id'),
            "model": t.get('source', {}).get('model'),
            "device_id": t.get('source', {}).get('device_id'),
            "tariff_end_date": t.get('source', {}).get('tariff_end_date'),
            "blocked": t.get('source', {}).get('blocked', False),
        } for t in data.get('list', [])]
        return {"success": True, "trackers": trackers}
    return {"success": False, "error": "Échec récupération trackers"}

@api_router.get("/tracker/{tracker_id}/state")
async def get_tracker_state(tracker_id: int, request: Request):
    h, _ = await get_tenant_context(request)
    return await navixy.get_tracker_state(tracker_id, h)

@api_router.get("/tracker/{tracker_id}/readings")
async def get_tracker_readings(tracker_id: int, request: Request):
    h, _ = await get_tenant_context(request)
    return await navixy.get_tracker_readings(tracker_id, h)

@api_router.get("/groups")
async def get_groups(request: Request):
    h, _ = await get_tenant_context(request)
    data = await navixy.get_groups(h)
    if data.get('success'):
        return {"success": True, "groups": [{"id": g['id'], "title": g['title']} for g in data.get('list', [])]}
    return {"success": False, "error": "Échec récupération groupes"}

# ============ EMPLOYEES (passthrough) ============

@api_router.get("/employees")
async def get_employees(request: Request):
    h, _ = await get_tenant_context(request)
    data = await navixy.get_employees(h)
    if data.get('success'):
        employees = [{
            "id": e['id'], "first_name": e.get('first_name', ''),
            "last_name": e.get('last_name', ''), "tracker_id": e.get('tracker_id'),
            "phone": e.get('phone', ''), "hardware_key": e.get('hardware_key'),
            "personnel_number": e.get('personnel_number', ''),
        } for e in data.get('list', [])]
        return {"success": True, "employees": employees}
    return {"success": False, "error": "Échec récupération employés"}

# ============ ANALYTICS ENGINE ROUTES ============

@api_router.get("/fleet/stats")
async def get_fleet_stats(
    request: Request,
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    tracker_ids: Optional[str] = Query(None),
):
    h, tenant = await get_tenant_context(request)
    result = await engine.compute_fleet_stats(h, from_date, to_date, tracker_ids, tenant)
    if isinstance(result, dict) and result.get('vehicles'):
        await db.tenant_sync.update_one(
            {"tenant": tenant},
            {"$set": {"last_sync_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return result

@api_router.get("/fleet/efficiency")
async def get_fleet_efficiency(
    request: Request,
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
):
    h, tenant = await get_tenant_context(request)
    return await engine.compute_fleet_efficiency(h, from_date, to_date, tenant)

@api_router.get("/fleet/idle-by-group")
async def get_idle_by_group(request: Request):
    h, tenant = await get_tenant_context(request)
    return await engine.compute_idle_by_group(h, tenant)

@api_router.get("/analytics/trends")
async def get_fleet_trends(
    request: Request,
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    tracker_id: Optional[int] = Query(None),
):
    h, tenant = await get_tenant_context(request)
    return await engine.compute_trends(h, from_date, to_date, tracker_id, tenant)

@api_router.get("/analytics/vehicle-comparison")
async def get_vehicle_comparison(
    request: Request,
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
):
    h, tenant = await get_tenant_context(request)
    return await engine.compute_vehicle_comparison(h, from_date, to_date, tenant)

@api_router.get("/reports/driver")
async def get_driver_report(
    request: Request,
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    employee_id: Optional[int] = Query(None),
):
    h, tenant = await get_tenant_context(request)
    return await engine.compute_driver_report(h, from_date, to_date, employee_id, tenant)

@api_router.get("/drivers/ecodriving")
async def get_drivers_ecodriving(
    request: Request,
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
):
    """Suivi conducteur + éco-conduite — score natif LOGITRAK plugin 46."""
    h, tenant = await get_tenant_context(request)
    return await compute_driver_ecodriving(navixy, cache, h, from_date, to_date, tenant)

# ============ IOT FLOWS ============

@api_router.get("/flows")
async def get_flows(request: Request):
    _, tenant = await get_tenant_context(request)
    flows = await db.flows.find({"tenant": tenant}, {"_id": 0}).to_list(100)
    for f in flows:
        for k in ('created_at', 'updated_at'):
            if isinstance(f.get(k), str):
                f[k] = datetime.fromisoformat(f[k])
    return {"success": True, "flows": flows}

@api_router.post("/flows")
async def create_flow(flow_input: FlowCreate, request: Request):
    _, tenant = await get_tenant_context(request)
    flow = Flow(name=flow_input.name, nodes=flow_input.nodes, connections=flow_input.connections)
    doc = flow.model_dump()
    doc['tenant'] = tenant
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    await db.flows.insert_one(doc)
    return {"success": True, "flow": flow.model_dump()}

@api_router.put("/flows/{flow_id}")
async def update_flow(flow_id: str, flow_input: FlowCreate, request: Request):
    _, tenant = await get_tenant_context(request)
    data = {"name": flow_input.name, "nodes": flow_input.nodes,
            "connections": flow_input.connections,
            "updated_at": datetime.now(timezone.utc).isoformat()}
    r = await db.flows.update_one({"id": flow_id, "tenant": tenant}, {"$set": data})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Flow not found")
    return {"success": True, "message": "Flow updated"}

@api_router.delete("/flows/{flow_id}")
async def delete_flow(flow_id: str, request: Request):
    _, tenant = await get_tenant_context(request)
    r = await db.flows.delete_one({"id": flow_id, "tenant": tenant})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Flow not found")
    return {"success": True, "message": "Flow deleted"}

@api_router.get("/flows/{flow_id}/export")
async def export_flow(flow_id: str, request: Request):
    _, tenant = await get_tenant_context(request)
    flow = await db.flows.find_one({"id": flow_id, "tenant": tenant}, {"_id": 0})
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    return StreamingResponse(
        io.BytesIO(json.dumps(flow, indent=2, default=str).encode()),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=flow_{flow_id}.json"},
    )

# ============ EXPORTS ============

@api_router.get("/export/fleet-stats")
async def export_fleet_stats(
    request: Request,
    from_date: str = Query(...), to_date: str = Query(...),
    format: str = Query("csv"),
):
    h, tenant = await get_tenant_context(request)
    stats = await engine.compute_fleet_stats(h, from_date, to_date, None, tenant)

    if format == "json":
        return StreamingResponse(
            io.BytesIO(json.dumps(stats, indent=2, default=str).encode()),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=fleet_{from_date}_{to_date}.json"},
        )

    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(["Véhicule", "ID", "Modèle", "Kilométrage", "Heures moteur", "Statut connexion", "Carburant (L)", "Coût carburant (CHF)"])
    for v in stats.get('vehicles', []):
        w.writerow([v['label'], v['tracker_id'], v['model'], v['mileage'],
                     v['engine_hours'] if v.get('engine_hours') is not None else 'N/A',
                     v['connection_status'],
                     v.get('fuel_used_liters') if v.get('fuel_used_liters') is not None else 'N/A',
                     v.get('fuel_cost_chf') if v.get('fuel_cost_chf') is not None else 'N/A'])
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=fleet_{from_date}_{to_date}.csv"},
    )

@api_router.get("/export/driver-report")
async def export_driver_report(
    request: Request,
    from_date: str = Query(...), to_date: str = Query(...),
    format: str = Query("csv"),
):
    h, tenant = await get_tenant_context(request)
    report = await engine.compute_driver_report(h, from_date, to_date, None, tenant)

    if format == "json":
        return StreamingResponse(
            io.BytesIO(json.dumps(report, indent=2, default=str).encode()),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=drivers_{from_date}_{to_date}.json"},
        )

    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(["Conducteur", "ID", "Téléphone", "Véhicule", "Distance (km)"])
    for d in report.get('drivers', []):
        for v in d.get('vehicles', []):
            w.writerow([d['driver_name'], d['employee_id'], d['phone'],
                        v['vehicle_label'], v.get('distance', 0)])
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=drivers_{from_date}_{to_date}.csv"},
    )

# ============ MAP / POSITIONS ============

@api_router.get("/map/positions")
async def get_all_positions(request: Request):
    h, _ = await get_tenant_context(request)
    tk_data = await navixy.get_trackers(h)
    if not tk_data.get('success'):
        raise HTTPException(status_code=400, detail="Failed to fetch trackers")

    tid_list = [t['id'] for t in tk_data.get('list', [])]
    states = await navixy.get_tracker_states_batch(tid_list, h)

    positions = []
    for t in tk_data.get('list', []):
        state = states.get(t['id'], {})
        gps = state.get('gps', {})
        loc = gps.get('location', {})
        if loc and loc.get('lat') and loc.get('lng'):
            positions.append({
                "tracker_id": t['id'], "label": t['label'],
                "model": t.get('source', {}).get('model', 'Unknown'),
                "lat": loc.get('lat'), "lng": loc.get('lng'),
                "speed": gps.get('speed', 0), "heading": gps.get('heading', 0),
                "updated": gps.get('updated'),
                "connection_status": state.get('connection_status', 'unknown'),
                "movement_status": state.get('movement_status', 'unknown'),
            })

    return {"success": True, "positions": positions, "timestamp": datetime.now(timezone.utc).isoformat()}

@api_router.get("/map/position/{tracker_id}")
async def get_tracker_position(tracker_id: int, request: Request):
    h, _ = await get_tenant_context(request)
    data = await navixy.get_tracker_state(tracker_id, h)
    if not data.get('success'):
        raise HTTPException(status_code=400, detail="Failed to fetch tracker state")
    state = data.get('state', {})
    gps = state.get('gps', {})
    loc = gps.get('location', {})
    return {
        "success": True, "tracker_id": tracker_id,
        "lat": loc.get('lat', 0), "lng": loc.get('lng', 0),
        "speed": gps.get('speed', 0), "heading": gps.get('heading', 0),
        "updated": gps.get('updated'),
        "connection_status": state.get('connection_status', 'unknown'),
        "movement_status": state.get('movement_status', 'unknown'),
    }

# ============ CACHE / DEBUG ============

@api_router.get("/debug/cache-stats")
async def cache_stats(user: dict = Depends(require_role("SUPER_ADMIN"))):
    return {"success": True, "cache": cache.stats()}

# ============ AUDIT COMPARE ============

@api_router.get("/audit/compare")
async def audit_compare(
    request: Request,
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    user: dict = Depends(require_role("SUPER_ADMIN")),
):
    """Compare engine-computed values vs raw LOGITRAK for each vehicle."""
    h, tenant = await get_tenant_context(request)

    # 1. Get engine result (may be cached)
    engine_result = await engine.compute_fleet_stats(h, from_date, to_date, None, tenant)

    # 2. Get RAW LOGITRAK data directly (no engine processing)
    import asyncio as _aio
    raw_navixy = NavixyClient(NAVIXY_API_URL, h)
    raw_navixy.reset_logs()

    tk_raw = await raw_navixy.get_trackers(h)
    all_trackers = tk_raw.get('list', []) if tk_raw.get('success') else []
    tid_list = [t['id'] for t in all_trackers]

    states_raw, mileage_raw, odo_raw, eh_raw = await _aio.gather(
        raw_navixy.get_tracker_states_batch(tid_list, h),
        raw_navixy.get_mileage(tid_list, f"{from_date} 00:00:00", f"{to_date} 23:59:59", h),
        raw_navixy.get_counters(tid_list, "odometer", h),
        raw_navixy.get_counters(tid_list, "engine_hours", h),
    )

    # Parse raw mileage
    raw_period_mileage = {}
    if mileage_raw.get('success'):
        for ts, days in mileage_raw.get('result', {}).items():
            total = sum(
                (d.get('mileage', 0) if isinstance(d, dict) else 0)
                for d in days.values() if d is not None
            )
            raw_period_mileage[ts] = round(total, 1)

    raw_odo = odo_raw.get('value', {}) if odo_raw.get('success') else {}
    raw_eh = eh_raw.get('value', {}) if eh_raw.get('success') else {}

    # 3. Build comparison rows
    engine_vehicles = {v['tracker_id']: v for v in engine_result.get('vehicles', [])}
    comparison = []
    mismatches = 0

    for t in all_trackers:
        tid = t['id']
        ts = str(tid)
        ev = engine_vehicles.get(tid, {})
        state = states_raw.get(tid, {})

        raw_mileage_val = raw_period_mileage.get(ts, 0)
        raw_odo_val = raw_odo.get(ts) or 0
        raw_eh_val = raw_eh.get(ts) or 0

        eng_mileage = ev.get('mileage') or 0
        eng_odo = ev.get('total_odometer') or 0
        eng_eh = ev.get('engine_hours') or 0

        mileage_match = abs(raw_mileage_val - eng_mileage) < 0.5
        odo_match = abs(raw_odo_val - eng_odo) < 1
        eh_match = abs(raw_eh_val - eng_eh) < 0.1

        if not (mileage_match and odo_match and eh_match):
            mismatches += 1

        comparison.append({
            "tracker_id": tid,
            "label": t['label'],
            "navixy_raw": {
                "mileage": raw_mileage_val,
                "odometer": round(raw_odo_val, 1),
                "engine_hours": round(raw_eh_val, 1),
                "connection_status": state.get('connection_status', 'unknown'),
                "speed": state.get('gps', {}).get('speed', 0),
            },
            "engine_computed": {
                "mileage": eng_mileage,
                "odometer": round(eng_odo, 1),
                "engine_hours": round(eng_eh, 1),
                "connection_status": ev.get('connection_status', 'unknown'),
                "speed": ev.get('speed', 0),
            },
            "validation": {
                "mileage": mileage_match,
                "odometer": odo_match,
                "engine_hours": eh_match,
                "all_match": mileage_match and odo_match and eh_match,
            },
        })

    return {
        "success": True,
        "period": {"from": from_date, "to": to_date},
        "tenant": tenant,
        "total_vehicles": len(comparison),
        "mismatches": mismatches,
        "all_valid": mismatches == 0,
        "vehicles": comparison,
        "engine_audit": engine_result.get('_audit', {}),
        "raw_navixy_calls": raw_navixy.get_logs(),
    }

# ============ MOTEUR D'ÉCHÉANCES UNIQUE (source pour Vue générale, fiche véhicule et PDF) ============

@api_router.get("/vehicles/deadlines")
async def get_vehicles_deadlines(request: Request):
    """Échéances calculées par le moteur unique (deadline_engine) — aucun recalcul frontend."""
    h, tenant = await get_tenant_context(request)
    admin_docs = await db.vehicle_admin.find({"tenant": tenant}, {"_id": 0}).to_list(1000)
    admin_map = {str(d["tracker_id"]): d for d in admin_docs}
    vg = await navixy.get_vehicles(h)
    garage_ok = bool(vg.get("success"))
    garage_by_tid = {v["tracker_id"]: v for v in vg.get("list", []) if v.get("tracker_id")} if garage_ok else {}
    docs_by_tid = await load_documents_for_engine(db, tenant)
    return {"success": True,
            "engine_version": DEADLINE_ENGINE_VERSION,
            "thresholds": {"due_soon_days": DUE_SOON_DAYS},
            "garage_available": garage_ok,
            "computed_at": datetime.now(timezone.utc).isoformat(),
            "deadlines": compute_fleet_deadlines(admin_map, garage_by_tid, docs_by_tid)}

# ============ CONTRÔLE D'INTÉGRITÉ IDENTITÉ VÉHICULE (lecture seule, aucune fusion auto) ============

@api_router.get("/vehicles/integrity")
async def get_vehicles_integrity(request: Request):
    """Rapport d'intégrité identité véhicule. Stratégie canonique :
    navixy_vehicle_id = identité de référence quand présente ; tracker_id = relation
    technique (réaffectable) ; VIN = attribut de vérification, jamais une clé."""
    h, tenant = await get_tenant_context(request)
    tk = await navixy.get_trackers(h)
    trackers = tk.get("list", []) if tk.get("success") else []
    vg = await navixy.get_vehicles(h)
    garage = vg.get("list", []) if vg.get("success") else []
    admin_docs = await db.vehicle_admin.find({"tenant": tenant}, {"_id": 0, "tracker_id": 1}).to_list(1000)
    caps_doc = await db.vehicle_capabilities.find_one({"tenant": tenant}, {"_id": 0, "records": 1})

    tracker_ids = {t["id"] for t in trackers}
    linked = [v for v in garage if v.get("tracker_id")]
    unlinked = [v for v in garage if not v.get("tracker_id")]
    linked_tids = {v["tracker_id"] for v in linked}

    link_counts = Counter(v["tracker_id"] for v in linked)
    ambiguous = [{"tracker_id": tid,
                  "vehicles": [{"vehicle_id": v["id"], "label": v.get("label")}
                               for v in linked if v["tracker_id"] == tid]}
                 for tid, n in link_counts.items() if n > 1]

    plate_counts = Counter((v.get("reg_number") or "").strip().upper()
                           for v in garage if (v.get("reg_number") or "").strip())
    duplicate_plates = [{"reg_number": p,
                         "vehicles": [{"vehicle_id": v["id"], "label": v.get("label"),
                                       "tracker_id": v.get("tracker_id")}
                                      for v in garage if (v.get("reg_number") or "").strip().upper() == p]}
                        for p, n in plate_counts.items() if n > 1]

    vin_conflicts = []
    for tid_s, rec in ((caps_doc or {}).get("records") or {}).items():
        vin = rec.get("vin")
        if vin and vin.get("conflict"):
            vin_conflicts.append({"tracker_id": int(tid_s), "garage": vin.get("garage"), "obd": vin.get("obd")})

    docs_to_reconcile = await db.documents.find(
        {"tenant": tenant, "reconcile_status": "to_reconcile"},
        {"_id": 0, "id": 1, "title": 1, "category_id": 1, "navixy_vehicle_id": 1, "created_at": 1}).to_list(500)

    return {"success": True, "tenant": tenant, "no_auto_merge": True,
            "navixy_available": bool(tk.get("success")) and bool(vg.get("success")),
            "identity_strategy": {
                "canonical": "navixy_vehicle_id (garage) quand présent",
                "tracker_id": "relation technique télématique — réaffectable, jamais l'identité métier",
                "vin": "attribut de vérification (couverture incomplète) — pas une clé",
            },
            "trackers_total": len(trackers),
            "garage_total": len(garage),
            "garage_linked": len(linked),
            "garage_unlinked": [{"vehicle_id": v["id"], "label": v.get("label"),
                                 "reg_number": v.get("reg_number")} for v in unlinked],
            "trackers_without_garage": [{"tracker_id": t["id"], "label": t.get("label")}
                                        for t in trackers if t["id"] not in linked_tids],
            "stale_garage_links": [{"vehicle_id": v["id"], "label": v.get("label"),
                                    "tracker_id": v["tracker_id"]}
                                   for v in linked if v["tracker_id"] not in tracker_ids],
            "orphan_admin_records": [d["tracker_id"] for d in admin_docs
                                     if d["tracker_id"] not in tracker_ids],
            "ambiguous_tracker_links": ambiguous,
            "duplicate_plates": duplicate_plates,
            "vin_conflicts": vin_conflicts,
            "documents_to_reconcile": docs_to_reconcile}

# ============ PDF EXPORT ============

@api_router.get("/export/pdf")
async def export_pdf(
    request: Request,
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
):
    """Generate a branded PDF report of fleet stats."""
    h, tenant = await get_tenant_context(request)
    stats = await engine.compute_fleet_stats(h, from_date, to_date, None, tenant)
    comp = await engine.compute_vehicle_comparison(h, from_date, to_date, tenant)
    eco = await compute_driver_ecodriving(navixy, cache, h, from_date, to_date, tenant)
    garage_data = await navixy.get_vehicles(h)
    admin_docs = await db.vehicle_admin.find({"tenant": tenant}, {"_id": 0}).to_list(1000)
    admin_map = {d["tracker_id"]: d for d in admin_docs}
    garage_map = {v["tracker_id"]: v for v in garage_data.get("list", []) if v.get("tracker_id")}
    pdf_docs_by_tid = await load_documents_for_engine(db, tenant)

    # Photos garage (avatars) — telechargees en parallele, echecs ignores
    import httpx as _httpx

    async def _fetch_img(url):
        try:
            async with _httpx.AsyncClient(timeout=10) as c:
                r = await c.get(url)
                if r.status_code == 200 and r.headers.get("content-type", "").startswith("image"):
                    return r.content
        except Exception:
            pass
        return None

    photo_targets = {tid: f"{NAVIXY_API_URL}/static/vehicle/avatars/{v['avatar_file_name']}"
                     for tid, v in garage_map.items() if v.get("avatar_file_name")}
    photo_bytes = dict(zip(photo_targets.keys(),
                           await asyncio.gather(*[_fetch_img(u) for u in photo_targets.values()])))

    def _fmt_deadline(item):
        """Présentation PDF d'un item du moteur d'échéances unique (aucun recalcul métier)."""
        if not item:
            return ("—", None)
        dt = datetime.strptime(item["due_date"], "%Y-%m-%d").strftime("%d.%m.%Y")
        days = item["days_remaining"]
        if item["status"] == "EXPIRED":
            return (f"{dt}\nEchu depuis {-days} j", "red")
        if item["status"] == "DUE_SOON":
            return (f"{dt}\nDans {days} j", "orange")
        return (f"{dt}\nDans {days} j", "green")

    client_info = await get_client_from_subdomain(request)
    client_name = client_info.get('name', 'LOGITRAK') if client_info else 'LOGITRAK'

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors as rl_colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15*mm, rightMargin=15*mm, topMargin=20*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CustomTitle', parent=styles['Title'], fontSize=18, spaceAfter=6)
    sub_style = ParagraphStyle('Sub', parent=styles['Normal'], fontSize=9, textColor=rl_colors.gray)
    h2_style = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=12, spaceAfter=4, spaceBefore=12)

    elements = []

    # Title avec logo LOGITRAK
    _logo_path = "/app/backend/assets/logo-logitrak.png"
    _title_cells = [Paragraph(f"{client_name} — Rapport Flotte", title_style),
                    Paragraph(f"Periode: {from_date} au {to_date} | Genere le {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M')} UTC", sub_style)]
    if os.path.exists(_logo_path):
        _hdr = Table([[RLImage(_logo_path, width=14*mm, height=14*mm), _title_cells]],
                     colWidths=[18*mm, 152*mm])
        _hdr.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                                  ('LEFTPADDING', (0, 0), (0, 0), 0)]))
        elements.append(_hdr)
    else:
        elements.extend(_title_cells)
    elements.append(Spacer(1, 8*mm))

    # Summary KPIs
    summary = stats.get('summary', {})
    elements.append(Paragraph("Resume", h2_style))
    kpi_data = [
        ['Vehicules', 'Distance totale', 'Heures moteur'],
        [str(summary.get('total_vehicles', 0)),
         f"{summary.get('total_mileage', 0)} km",
         f"{summary.get('total_engine_hours', 0)} h"],
    ]
    kpi_t = Table(kpi_data, colWidths=[60*mm, 60*mm, 60*mm])
    kpi_t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), rl_colors.Color(0.07, 0.07, 0.07)),
        ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.Color(0.85, 0.85, 0.85)),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(kpi_t)
    elements.append(Spacer(1, 6*mm))

    # Vehicle table (avec photos garage)
    elements.append(Paragraph("Detail par vehicule", h2_style))
    header = ['', 'Vehicule', 'Km', 'Odometre', 'Moteur (h)', 'Etat', 'Utilisation']
    rows = [header]
    comp_map = {v['tracker_id']: v for v in comp.get('vehicles', [])}
    for v in stats.get('vehicles', []):
        cv = comp_map.get(v['tracker_id'], {})
        img = photo_bytes.get(v['tracker_id'])
        cell = RLImage(io.BytesIO(img), width=13*mm, height=9*mm) if img else ''
        gv = garage_map.get(v['tracker_id'], {})
        label = v['label'][:22]
        if gv.get('reg_number'):
            label = f"{label}\n{gv['reg_number']}"
        rows.append([
            cell,
            label,
            f"{v['mileage']}",
            f"{round(v['total_odometer'])}" if v.get('total_odometer') is not None else "—",
            f"{round(v['engine_hours'])}" if v.get('engine_hours') is not None else "—",
            v['connection_status'],
            f"{cv.get('utilization_score', 0)}%",
        ])

    col_w = [17*mm, 48*mm, 20*mm, 25*mm, 23*mm, 22*mm, 25*mm]
    tbl = Table(rows, colWidths=col_w, repeatRows=1)
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), rl_colors.Color(0.07, 0.07, 0.07)),
        ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
        ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.Color(0.85, 0.85, 0.85)),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, rl_colors.Color(0.97, 0.97, 0.97)]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    elements.append(tbl)

    # ---- Echeances administratives ----
    elements.append(Paragraph("Echeances administratives", h2_style))
    ech_rows = [['Vehicule', 'Leasing', 'Assurance', 'Prochain controle']]
    ech_styles = []
    color_map = {"red": rl_colors.Color(0.8, 0.1, 0.1), "orange": rl_colors.Color(0.85, 0.5, 0),
                 "green": rl_colors.Color(0.0, 0.55, 0.3)}
    for ridx, v in enumerate(stats.get('vehicles', []), start=1):
        tid = v['tracker_id']
        dl_items = compute_vehicle_deadlines(tid, admin_map.get(tid, {}), garage_map.get(tid),
                                             documents_v2=pdf_docs_by_tid.get(str(tid)))
        by_type = {}
        for it in dl_items:
            cur = by_type.get(it["deadline_type"])
            if cur is None or it["days_remaining"] < cur["days_remaining"]:
                by_type[it["deadline_type"]] = it
        leasing_txt, leasing_c = _fmt_deadline(by_type.get("leasing"))
        assur_txt, assur_c = _fmt_deadline(by_type.get("assurance"))
        ctrl = by_type.get("controle")
        ctrl_txt, ctrl_c = _fmt_deadline(ctrl)
        if ctrl:
            ctrl_txt = f"{ctrl['label'].replace('Contrôle : ', '')[:20]}\n{ctrl_txt.splitlines()[-1]}"
        ech_rows.append([v['label'][:24], leasing_txt, assur_txt, ctrl_txt])
        for cidx, c in ((1, leasing_c), (2, assur_c), (3, ctrl_c)):
            if c:
                ech_styles.append(('TEXTCOLOR', (cidx, ridx), (cidx, ridx), color_map[c]))
    ech_t = Table(ech_rows, colWidths=[55*mm, 41*mm, 42*mm, 42*mm], repeatRows=1)
    ech_t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), rl_colors.Color(0.07, 0.07, 0.07)),
        ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.Color(0.85, 0.85, 0.85)),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, rl_colors.Color(0.97, 0.97, 0.97)]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ] + ech_styles))
    elements.append(ech_t)
    elements.append(Paragraph("Echeances calculees par le moteur unique LOGITRAK (assurance: garage LOGITRAK puis saisie interne; leasing/controles: saisie). Rouge = echu, orange < 30 j.", sub_style))

    # ---- Eco-conduite (notation native) ----
    if eco.get('success'):
        elements.append(Paragraph("Eco-conduite — notation native", h2_style))
        eco_summary = eco.get('summary', {})
        avg = eco_summary.get('avg_score')
        elements.append(Paragraph(
            f"Score eco moyen : {avg if avg is not None else '—'}/100 | "
            f"Penalites /100 km : {eco_summary.get('penalties_per_100km', '—')} | "
            f"Distance attribuee : {round(eco_summary.get('total_distance_km', 0))} km", sub_style))
        eco_rows = [['Conducteur', 'Vehicule', 'Score', 'Etoiles', 'Distance', 'Trajets', 'Penalites /100 km']]
        for d in eco.get('drivers', []):
            if not d.get('score'):
                continue
            eco_rows.append([
                d['driver_name'][:20],
                (d.get('vehicle_label') or '—')[:20],
                f"{round(d['score']['raw'])}/100",
                f"{d['score']['stars']}/5",
                f"{round(d['distance_km'])} km",
                str(d['trips_count']),
                str(d.get('events_per_100km') if d.get('events_per_100km') is not None else '—'),
            ])
        if len(eco_rows) > 1:
            eco_t = Table(eco_rows, colWidths=[35*mm, 35*mm, 20*mm, 18*mm, 24*mm, 18*mm, 30*mm], repeatRows=1)
            eco_t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), rl_colors.Color(0.07, 0.07, 0.07)),
                ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
                ('FONTSIZE', (0, 0), (-1, 0), 8),
                ('FONTSIZE', (0, 1), (-1, -1), 7),
                ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.Color(0.85, 0.85, 0.85)),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, rl_colors.Color(0.97, 0.97, 0.97)]),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            elements.append(Spacer(1, 2*mm))
            elements.append(eco_t)
        else:
            elements.append(Paragraph("Aucune donnee eco-conduite attribuable sur la periode.", sub_style))
        elements.append(Paragraph("Notation native rapport Qualite de conduite (plugin 46), affichee sans conversion. Attribution stricte conducteur <-> vehicule assigne.", sub_style))

    # Footer
    elements.append(Spacer(1, 10*mm))
    elements.append(Paragraph("Donnees 100% LOGITRAK — Analytics Engine v1.0.0 — Aucune estimation", sub_style))

    doc.build(elements)
    buf.seek(0)

    filename = f"rapport_flotte_{client_name}_{from_date}_{to_date}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

# ============ MOUNT ============

api_router.include_router(create_vehicle_admin_router(db, navixy, get_tenant_context, NAVIXY_API_URL))
api_router.include_router(create_documents_router(db, get_tenant_context))
api_router.include_router(create_capabilities_router(db, navixy, cache, get_tenant_context))
api_router.include_router(create_super_admin_router(db, navixy, cache))
app.include_router(auth_router)
app.include_router(public_router)
app.include_router(api_router)

@app.on_event("startup")
async def startup_seed():
    await seed_and_migrate(db)
    migrated = await migrate_legacy_documents(db)
    if migrated:
        logger.info(f"Documents V2 : {migrated} document(s) legacy migré(s)")
    logger.info("Auth seed + migration multi-tenant OK")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    mongo_client.close()
