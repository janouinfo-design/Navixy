"""
LOGITRAK — Moteur d'échéances UNIQUE (phase de sécurisation pré-Documents V2).

Toutes les échéances véhicule (assurance, leasing, contrôles, maintenance, expertise)
sont calculées ICI et uniquement ici. Consommateurs : Vue générale (via
GET /api/vehicles/deadlines), fiche véhicule (même endpoint) et export PDF (import direct).
Aucun consommateur ne recalcule la règle métier.

Précédence des sources (dual-read, conclusions AUDIT_CROISE_DOCUMENTS.md) :
  assurance   : DOCUMENT_V2 (futur) > NAVIXY_GARAGE.liability_insurance_valid_till > VEHICLE_LEGACY.assurance.date_fin
  leasing     : DOCUMENT_V2 (futur) > VEHICLE_LEGACY.leasing.date_fin
  controle    : VEHICLE_LEGACY.controles[].due_date (les contrôles avec done_date sont exclus)
  maintenance : VEHICLE_LEGACY.general.prochaine_maintenance
  expertise   : VEHICLE_LEGACY.general.prochaine_expertise

Règles de statut (héritées de l'existant, inchangées) :
  due_date absente ou invalide → AUCUNE échéance émise (null ≠ 0, jamais de date fabriquée)
  days < 0            → EXPIRED  (severity critical si assurance/contrôle — règle 2b, sinon warning)
  0 ≤ days < 30       → DUE_SOON (warning)
  days ≥ 30           → VALID    (info)

Hook Documents V2 : documents_v2 = liste de {document_id, deadline_type, expiry_date,
label?, critical?}. Pour assurance/leasing, le document en vigueur = expiry la plus
lointaine (renouvellement). Le type générique "document" émet chaque document
individuellement, criticité portée par le flag de sa catégorie.
"""
from datetime import datetime, timezone

ENGINE_VERSION = "1.1.0"
DUE_SOON_DAYS = 30

SOURCE_DOCUMENT_V2 = "DOCUMENT_V2"
SOURCE_NAVIXY_GARAGE = "NAVIXY_GARAGE"
SOURCE_VEHICLE_LEGACY = "VEHICLE_LEGACY"

STATUS_EXPIRED = "EXPIRED"
STATUS_DUE_SOON = "DUE_SOON"
STATUS_VALID = "VALID"

# Règle 2b existante : seuls assurance et contrôle échus sont critiques
CRITICAL_WHEN_OVERDUE = ("assurance", "controle")

TYPE_LABELS = {
    "assurance": "Fin d'assurance",
    "leasing": "Fin de leasing",
    "maintenance": "Prochaine maintenance",
    "expertise": "Prochaine expertise",
}


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _status(days: int) -> str:
    if days < 0:
        return STATUS_EXPIRED
    if days < DUE_SOON_DAYS:
        return STATUS_DUE_SOON
    return STATUS_VALID


def _severity(critical: bool, status: str) -> str:
    if status == STATUS_EXPIRED:
        return "critical" if critical else "warning"
    if status == STATUS_DUE_SOON:
        return "warning"
    return "info"


def compute_vehicle_deadlines(tracker_id, admin_rec=None, garage_vehicle=None,
                              documents_v2=None, today=None):
    """Échéances d'UN véhicule. Retourne une liste d'items normalisés traçables."""
    if today is None:
        today = datetime.now(timezone.utc).date()
    rec = admin_rec or {}
    gv = garage_vehicle or {}
    items = []

    def emit(dtype, due_value, source, source_field, source_id=None, label=None, critical=None):
        d = _parse_date(due_value)
        if d is None:
            return  # null ≠ 0 — aucune échéance fabriquée
        crit = (dtype in CRITICAL_WHEN_OVERDUE) if critical is None else bool(critical)
        days = (d - today).days
        st = _status(days)
        items.append({
            "tracker_id": tracker_id,
            "deadline_type": dtype,
            "label": label or TYPE_LABELS.get(dtype, dtype),
            "due_date": d.isoformat(),
            "days_remaining": days,
            "status": st,
            "severity": _severity(crit, st),
            "critical_when_overdue": crit,
            "source": source,
            "source_field": source_field,
            "source_id": source_id,
        })

    docs = {}
    generic_docs = []
    for doc in (documents_v2 or []):
        dtype = doc.get("deadline_type")
        if not dtype or not _parse_date(doc.get("expiry_date")):
            continue
        if dtype == "document":
            generic_docs.append(doc)
            continue
        cur = docs.get(dtype)
        # Renouvellement : le document en vigueur = expiry la plus lointaine
        if cur is None or _parse_date(doc["expiry_date"]) > _parse_date(cur["expiry_date"]):
            docs[dtype] = doc

    # Assurance RC — DOCUMENT_V2 > NAVIXY_GARAGE > VEHICLE_LEGACY (correction bug C1)
    if "assurance" in docs:
        emit("assurance", docs["assurance"]["expiry_date"], SOURCE_DOCUMENT_V2,
             "expiry_date", docs["assurance"].get("document_id"))
    elif _parse_date(gv.get("liability_insurance_valid_till")):
        emit("assurance", gv.get("liability_insurance_valid_till"),
             SOURCE_NAVIXY_GARAGE, "liability_insurance_valid_till")
    else:
        emit("assurance", (rec.get("assurance") or {}).get("date_fin"),
             SOURCE_VEHICLE_LEGACY, "assurance.date_fin")

    # Leasing — DOCUMENT_V2 > VEHICLE_LEGACY
    if "leasing" in docs:
        emit("leasing", docs["leasing"]["expiry_date"], SOURCE_DOCUMENT_V2,
             "expiry_date", docs["leasing"].get("document_id"))
    else:
        emit("leasing", (rec.get("leasing") or {}).get("date_fin"),
             SOURCE_VEHICLE_LEGACY, "leasing.date_fin")

    # Contrôles ouverts (done_date exclut)
    for c in (rec.get("controles") or []):
        if c.get("due_date") and not c.get("done_date"):
            emit("controle", c["due_date"], SOURCE_VEHICLE_LEGACY,
                 "controles.due_date", c.get("id"),
                 label=f"Contrôle : {c.get('label') or 'Contrôle'}")

    # Documents génériques à échéance (chaque document émis individuellement)
    for doc in generic_docs:
        emit("document", doc["expiry_date"], SOURCE_DOCUMENT_V2, "expiry_date",
             doc.get("document_id"), label=doc.get("label") or "Document",
             critical=doc.get("critical", False))

    # Maintenance / expertise
    g = rec.get("general") or {}
    emit("maintenance", g.get("prochaine_maintenance"),
         SOURCE_VEHICLE_LEGACY, "general.prochaine_maintenance")
    emit("expertise", g.get("prochaine_expertise"),
         SOURCE_VEHICLE_LEGACY, "general.prochaine_expertise")

    return items


def compute_fleet_deadlines(admin_records, garage_by_tid, documents_by_tid=None, today=None):
    """Échéances de toute la flotte.
    admin_records    : dict {tracker_id str -> fiche vehicle_admin}
    garage_by_tid    : dict {tracker_id int -> véhicule garage Navixy}
    documents_by_tid : dict {tracker_id str -> [items Documents V2]} (optionnel)
    """
    documents_by_tid = documents_by_tid or {}
    out = []
    tids = {str(k) for k in admin_records} | {str(k) for k in garage_by_tid} | {str(k) for k in documents_by_tid}
    for tid_s in sorted(tids, key=lambda x: int(x) if x.isdigit() else 0):
        tid = int(tid_s)
        out.extend(compute_vehicle_deadlines(
            tid, admin_records.get(tid_s),
            garage_by_tid.get(tid) or garage_by_tid.get(tid_s),
            documents_v2=documents_by_tid.get(tid_s), today=today))
    return out
