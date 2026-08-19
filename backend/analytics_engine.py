"""
Analytics Engine v1.0.0
Strict KPI computation with full LOGITRAK traceability.

RULES
1. Every value MUST originate from a LOGITRAK endpoint.
2. If data is unavailable → None  (frontend: "Donnée indisponible").
3. Computed values declare formula + source fields in _audit.
4. ZERO random numbers, ZERO hard-coded estimations.
5. Fuel costs use configurable prices from MongoDB (tenant_config).
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from navixy_client import NavixyClient
from cache_manager import TenantCacheManager

logger = logging.getLogger(__name__)

ENGINE_VERSION = "1.0.0"

# ──────────────────────────────────────────────────────
# Audit builder
# ──────────────────────────────────────────────────────

class AuditBuilder:
    def __init__(self, tenant: str):
        self.tenant = tenant
        self.started_at = datetime.now(timezone.utc)
        self.navixy_fields: list[dict] = []
        self.computed_fields: list[dict] = []
        self.unavailable_fields: list[dict] = []
        self.warnings: list[str] = []

    def real(self, field: str, endpoint: str):
        self.navixy_fields.append({"field": field, "source": endpoint})

    def computed(self, field: str, formula: str, params: dict = None):
        self.computed_fields.append({"field": field, "formula": formula, "params": params or {}})

    def unavailable(self, field: str, reason: str):
        self.unavailable_fields.append({"field": field, "reason": reason})
        self.warnings.append(f"{field}: {reason}")

    def build(self, navixy_logs: list, cache_hit: bool, cache_age: float) -> dict:
        return {
            "engine_version": ENGINE_VERSION,
            "computed_at": self.started_at.isoformat(),
            "cache": {"hit": cache_hit, "age_seconds": cache_age},
            "tenant": self.tenant,
            "navixy_calls": navixy_logs,
            "data_quality": {
                "navixy_direct": self.navixy_fields,
                "computed": self.computed_fields,
                "unavailable": self.unavailable_fields,
            },
            "warnings": self.warnings,
        }


# ──────────────────────────────────────────────────────
# Default fuel config
# ──────────────────────────────────────────────────────

DEFAULT_FUEL_CONFIG = {
    "default_fuel_price": 2.00,
    "currency": "CHF",
    "default_consumption_rate": None,
    "fuel_types": {"diesel": 2.00, "essence": 2.10, "electric_kwh": 0.25},
}


# ──────────────────────────────────────────────────────
# Engine
# ──────────────────────────────────────────────────────

class AnalyticsEngine:

    def __init__(self, navixy: NavixyClient, cache: TenantCacheManager, db):
        self.navixy = navixy
        self.cache = cache
        self.db = db

    # ---- Fuel config helpers ----

    async def get_fuel_config(self, tenant: str) -> dict:
        doc = await self.db.tenant_config.find_one({"tenant": tenant}, {"_id": 0})
        if doc and doc.get("fuel_config"):
            return doc["fuel_config"]
        return dict(DEFAULT_FUEL_CONFIG)

    async def set_fuel_config(self, tenant: str, config: dict):
        await self.db.tenant_config.update_one(
            {"tenant": tenant},
            {"$set": {"fuel_config": config, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )

    # ──────────────────────────────────────────────────
    # 1. FLEET STATS  (replaces /fleet/stats)
    # ──────────────────────────────────────────────────

    async def compute_fleet_stats(
        self, navixy_hash: str, from_date: str, to_date: str,
        tracker_ids_csv: Optional[str], tenant: str,
    ) -> dict:
        cache_key = f"fleet_stats:{from_date}:{to_date}:{tracker_ids_csv}"
        cached, hit, age = self.cache.get(tenant, cache_key)
        if cached:
            cached["_audit"]["cache"] = {"hit": True, "age_seconds": age}
            return cached

        audit = AuditBuilder(tenant)
        self.navixy.reset_logs()

        # Tracker list
        tk_data = await self.navixy.get_trackers(navixy_hash)
        if not tk_data.get('success'):
            return {"success": False, "error": "Échec récupération trackers",
                    "_audit": audit.build(self.navixy.get_logs(), False, 0)}

        all_trackers = tk_data.get('list', [])
        audit.real("tracker_list", "tracker/list")

        if tracker_ids_csv:
            ids_filter = set(int(x) for x in tracker_ids_csv.split(','))
            all_trackers = [t for t in all_trackers if t['id'] in ids_filter]

        tid_list = [t['id'] for t in all_trackers]
        if not tid_list:
            empty = {"success": True, "period": {"from": from_date, "to": to_date},
                     "vehicles": [], "summary": {"total_vehicles": 0, "total_mileage": 0, "total_engine_hours": 0},
                     "_audit": audit.build(self.navixy.get_logs(), False, 0)}
            return empty

        # Parallel: states, mileage, odometer, engine_hours
        states_t = self.navixy.get_tracker_states_batch(tid_list, navixy_hash)
        mileage_t = self.navixy.get_mileage(tid_list, f"{from_date} 00:00:00", f"{to_date} 23:59:59", navixy_hash)
        odo_t = self.navixy.get_counters(tid_list, "odometer", navixy_hash)
        eh_t = self.navixy.get_counters(tid_list, "engine_hours", navixy_hash)

        states_map, mileage_raw, odo_raw, eh_raw = await asyncio.gather(states_t, mileage_t, odo_t, eh_t)

        audit.real("vehicle_states", "tracker/get_state (batch)")
        audit.real("period_mileage", "tracker/stats/mileage/read")
        audit.real("odometer", "tracker/counter/value/list[odometer]")
        audit.real("engine_hours", "tracker/counter/value/list[engine_hours]")

        # Parse mileage
        period_mileage: Dict[str, float] = {}
        if mileage_raw.get('success'):
            for tid_s, days in mileage_raw.get('result', {}).items():
                total = sum(
                    (d.get('mileage', 0) if isinstance(d, dict) else 0)
                    for d in days.values() if d is not None
                )
                period_mileage[tid_s] = round(total, 1)

        odo_vals = odo_raw.get('value', {}) if odo_raw.get('success') else {}
        eh_vals = eh_raw.get('value', {}) if eh_raw.get('success') else {}

        # Fuel config + motorisation garage (un EV ne reçoit jamais de litres estimés)
        fuel_cfg = await self.get_fuel_config(tenant)
        rate = fuel_cfg.get('default_consumption_rate') or (7.5 if navixy_hash == "SIMULATION" else None)
        price = fuel_cfg.get('default_fuel_price') or 2.0

        fuel_type_by_tid = {}
        vg = await self.navixy.get_vehicles(navixy_hash)
        if vg.get('success'):
            audit.real("vehicle_fuel_type", "vehicle/list")
            for gv in vg.get('list', []):
                if gv.get('tracker_id'):
                    fuel_type_by_tid[gv['tracker_id']] = gv.get('fuel_type')

        if rate:
            audit.computed("fuel_cost", "(mileage/100) × rate × price", {"rate": rate, "price": price})
        else:
            audit.unavailable("fuel_consumption", "Aucun taux de consommation configuré — configurable via /api/config/fuel")

        def _flag(raw):
            if not raw.get('success'):
                return "error"
            return "partial" if raw.get('partial') else "ok"
        data_status = {"mileage": _flag(mileage_raw), "odometer": _flag(odo_raw), "engine_hours": _flag(eh_raw)}

        vehicles = []
        total_mileage = 0.0
        total_eh = 0.0

        for tracker in all_trackers:
            tid = tracker['id']
            ts = str(tid)
            state = states_map.get(tid, {})
            gps = state.get('gps', {})
            loc = gps.get('location') or {}

            mkm = period_mileage.get(ts, 0)
            odo = odo_vals.get(ts)          # None = donnée absente, jamais 0 silencieux
            eh = eh_vals.get(ts)
            total_mileage += mkm
            if eh is not None:
                total_eh += eh

            ftype = fuel_type_by_tid.get(tid)
            is_electric = (ftype or "").strip().lower() == "electric"
            fuel_used = round(mkm * rate / 100, 1) if rate and mkm > 0 and not is_electric else None
            fuel_cost = round(fuel_used * price, 1) if fuel_used is not None else None

            vehicles.append({
                "tracker_id": tid,
                "label": tracker['label'],
                "model": tracker.get('source', {}).get('model', 'Unknown'),
                "fuel_type": ftype,
                "mileage": mkm,
                "total_odometer": odo,
                "engine_hours": eh,
                "connection_status": state.get('connection_status', 'unknown'),
                "movement_status": state.get('movement_status', 'unknown'),
                "last_update": gps.get('updated'),
                "speed": gps.get('speed', 0),
                "location": {"lat": loc.get('lat', 0), "lng": loc.get('lng', 0)},
                "fuel_used_liters": fuel_used,
                "fuel_cost_chf": fuel_cost,
            })

        result = {
            "success": True,
            "period": {"from": from_date, "to": to_date},
            "data_status": data_status,
            "summary": {
                "total_vehicles": len(vehicles),
                "total_mileage": round(total_mileage, 1),
                "total_engine_hours": round(total_eh, 1),
            },
            "vehicles": vehicles,
            "_audit": audit.build(self.navixy.get_logs(), False, 0),
        }
        self.cache.set(tenant, cache_key, result)
        return result

    # ──────────────────────────────────────────────────
    # 2. FLEET EFFICIENCY  (replaces /fleet/efficiency)
    # ──────────────────────────────────────────────────

    ACTIVE_DAY_THRESHOLD_KM = 1.0  # Minimum km to count a day as "active"

    UTIL_CATEGORIES = [
        (0, 0, "inactif"),
        (0.01, 30, "sous_utilise"),
        (30, 60, "modere"),
        (60, 85, "bonne"),
        (85, 101, "tres_utilise"),
    ]

    @staticmethod
    def _classify(util_pct: float) -> str:
        if util_pct == 0:
            return "inactif"
        if util_pct < 30:
            return "sous_utilise"
        if util_pct < 60:
            return "modere"
        if util_pct < 85:
            return "bonne"
        return "tres_utilise"

    async def compute_fleet_efficiency(
        self, navixy_hash: str, from_date: str, to_date: str, tenant: str,
    ) -> dict:
        cache_key = f"fleet_eff:{from_date}:{to_date}"
        cached, hit, age = self.cache.get(tenant, cache_key)
        if cached:
            cached["_audit"]["cache"] = {"hit": True, "age_seconds": age}
            return cached

        audit = AuditBuilder(tenant)
        self.navixy.reset_logs()

        tk_data = await self.navixy.get_trackers(navixy_hash)
        if not tk_data.get('success'):
            return {"success": False, "error": "Échec récupération trackers",
                    "_audit": audit.build(self.navixy.get_logs(), False, 0)}

        tracker_list = tk_data.get('list', [])
        tid_list = [t['id'] for t in tracker_list]
        audit.real("tracker_list", "tracker/list")

        d_from = datetime.strptime(from_date, '%Y-%m-%d')
        d_to = datetime.strptime(to_date, '%Y-%m-%d')
        days_count = max((d_to - d_from).days + 1, 1)

        # Generate all date strings for the period
        period_dates = [(d_from + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(days_count)]

        states_t = self.navixy.get_tracker_states_batch(tid_list, navixy_hash)
        mileage_t = self.navixy.get_mileage(tid_list, f"{from_date} 00:00:00", f"{to_date} 23:59:59", navixy_hash)
        eh_t = self.navixy.get_counters(tid_list, "engine_hours", navixy_hash)
        states_map, mileage_raw, eh_raw = await asyncio.gather(states_t, mileage_t, eh_t)

        audit.real("vehicle_states", "tracker/get_state (batch)")
        audit.real("period_mileage", "tracker/stats/mileage/read")
        audit.real("engine_hours", "tracker/counter/value/list[engine_hours]")
        audit.unavailable("driving_time", "Historique non disponible via snapshot API")
        audit.unavailable("idle_time_historical", "Historique ralenti non disponible via snapshot API")
        audit.unavailable("trips", "Nombre de trajets non disponible via cette API")

        # Parse mileage per vehicle per day
        tracker_daily: Dict[str, Dict[str, float]] = {}
        if mileage_raw.get('success'):
            for ts, days_data in mileage_raw.get('result', {}).items():
                tracker_daily[ts] = {}
                for d_str, info in days_data.items():
                    if info and isinstance(info, dict):
                        tracker_daily[ts][d_str] = info.get('mileage', 0)

        eh_vals = eh_raw.get('value', {}) if eh_raw.get('success') else {}
        threshold = self.ACTIVE_DAY_THRESHOLD_KM

        def _flag(raw):
            if not raw.get('success'):
                return "error"
            return "partial" if raw.get('partial') else "ok"
        data_status = {"mileage": _flag(mileage_raw), "engine_hours": _flag(eh_raw)}

        vehicles = []
        for tracker in tracker_list:
            tid = tracker['id']
            ts = str(tid)
            state = states_map.get(tid, {})
            gps = state.get('gps', {})
            movement = state.get('movement_status', 'unknown')
            connection = state.get('connection_status', 'unknown')
            engine_h = eh_vals.get(ts) or 0

            daily = tracker_daily.get(ts, {})
            # Build daily breakdown for activity calendar
            daily_breakdown = []
            active_days = 0
            total_km = 0.0
            for ds in period_dates:
                km = daily.get(ds, 0)
                is_active = km >= threshold
                if is_active:
                    active_days += 1
                total_km += km
                daily_breakdown.append({"date": ds, "km": round(km, 1), "active": is_active})

            total_km = round(total_km, 1)
            utilization_pct = round((active_days / days_count) * 100, 1) if days_count > 0 else 0
            km_per_active_day = round(total_km / active_days, 1) if active_days > 0 else 0
            category = self._classify(utilization_pct)

            vehicles.append({
                "tracker_id": tid,
                "label": tracker['label'],
                "model": tracker.get('source', {}).get('model', 'Unknown'),
                "group_id": tracker.get('group_id', 0),
                "utilization_pct": utilization_pct,
                "category": category,
                "active_days": active_days,
                "total_days": days_count,
                "period_mileage": total_km,
                "km_per_active_day": km_per_active_day,
                "engine_hours": round(engine_h, 1),
                "daily_breakdown": daily_breakdown,
                "movement_status": movement,
                "connection_status": connection,
                "speed": gps.get('speed', 0),
                "last_update": gps.get('updated'),
                "idle_time": None,
                "driving_time": None,
                "stopped_time": None,
            })

        n = len(vehicles) or 1
        avg_util = round(sum(v['utilization_pct'] for v in vehicles) / n, 1)
        total_fleet_km = round(sum(v['period_mileage'] for v in vehicles), 1)
        total_fleet_eh = round(sum(v['engine_hours'] for v in vehicles), 1)
        used_vehicles = sum(1 for v in vehicles if v['active_days'] > 0)
        inactive_vehicles = n - used_vehicles

        # Category counts
        cat_counts = {}
        for v in vehicles:
            cat_counts[v['category']] = cat_counts.get(v['category'], 0) + 1

        result = {
            "success": True,
            "period": {"from": from_date, "to": to_date, "days": days_count},
            "active_day_threshold_km": threshold,
            "data_status": data_status,
            "summary": {
                "average_utilization_pct": avg_util,
                "total_vehicles": len(vehicles),
                "used_vehicles": used_vehicles,
                "inactive_vehicles": inactive_vehicles,
                "total_mileage": total_fleet_km,
                "avg_mileage_per_vehicle": round(total_fleet_km / n, 1),
                "total_engine_hours": total_fleet_eh,
                "avg_engine_hours_per_vehicle": round(total_fleet_eh / n, 1),
                "currently_moving": sum(1 for v in vehicles if v['movement_status'] == 'moving'),
                "currently_idle": sum(1 for v in vehicles if v['movement_status'] == 'idle'),
                "currently_stopped": sum(1 for v in vehicles if v['movement_status'] in ('stopped', 'parked', 'unknown')),
                "categories": cat_counts,
            },
            "vehicles": vehicles,
            "_audit": audit.build(self.navixy.get_logs(), False, 0),
        }
        self.cache.set(tenant, cache_key, result)
        return result

    # ──────────────────────────────────────────────────
    # 3. TRENDS  (replaces /analytics/trends — NO RANDOM)
    # ──────────────────────────────────────────────────

    async def compute_trends(
        self, navixy_hash: str, from_date: str, to_date: str, tracker_id: Optional[int], tenant: str,
    ) -> dict:
        cache_key = f"trends:{from_date}:{to_date}:{tracker_id}"
        cached, hit, age = self.cache.get(tenant, cache_key)
        if cached:
            cached["_audit"]["cache"] = {"hit": True, "age_seconds": age}
            return cached

        audit = AuditBuilder(tenant)
        self.navixy.reset_logs()

        d_from = datetime.strptime(from_date, '%Y-%m-%d')
        d_to = datetime.strptime(to_date, '%Y-%m-%d')
        days = max((d_to - d_from).days + 1, 1)

        tk_data = await self.navixy.get_trackers(navixy_hash)
        if not tk_data.get('success'):
            return {"success": False, "error": "Échec récupération trackers",
                    "_audit": audit.build(self.navixy.get_logs(), False, 0)}

        tracker_list = tk_data.get('list', [])
        if tracker_id:
            tracker_list = [t for t in tracker_list if t['id'] == tracker_id]
        tid_list = [t['id'] for t in tracker_list]
        audit.real("tracker_list", "tracker/list")

        mileage_raw = await self.navixy.get_mileage(tid_list, f"{from_date} 00:00:00", f"{to_date} 23:59:59", navixy_hash)
        audit.real("daily_mileage", "tracker/stats/mileage/read")
        audit.unavailable("avg_efficiency", "Pas de données historiques d'efficacité via cette API")
        audit.unavailable("driving_time", "Pas de données historiques via l'API snapshot")
        audit.unavailable("idle_time", "Pas de données historiques via l'API snapshot")
        audit.unavailable("speed_violations", "Pas de données d'infractions via cette API")

        # Init daily buckets
        daily: Dict[str, dict] = {}
        for i in range(days):
            d = d_from + timedelta(days=i)
            ds = d.strftime('%Y-%m-%d')
            daily[ds] = {"total_distance": 0.0, "active_vehicles": 0}

        if mileage_raw.get('success'):
            for ts, day_map in mileage_raw.get('result', {}).items():
                for ds, info in day_map.items():
                    if ds in daily and info and isinstance(info, dict):
                        km = info.get('mileage', 0)
                        daily[ds]["total_distance"] += km
                        if km > 0:
                            daily[ds]["active_vehicles"] += 1

        # Fuel config
        fuel_cfg = await self.get_fuel_config(tenant)
        rate = fuel_cfg.get('default_consumption_rate') or (7.5 if navixy_hash == "SIMULATION" else None)
        price = fuel_cfg.get('default_fuel_price') or 2.0
        if rate:
            audit.computed("fuel_consumption", "(distance/100) × rate", {"rate": rate})
        else:
            audit.unavailable("fuel_consumption", "Aucun taux configuré")

        trend_data = []
        for ds in sorted(daily.keys()):
            d = datetime.strptime(ds, '%Y-%m-%d')
            bucket = daily[ds]
            dist = round(bucket["total_distance"], 1)
            fuel = round(dist * rate / 100, 1) if rate and dist > 0 else None

            trend_data.append({
                "date": ds,
                "day_name": d.strftime('%a'),
                "total_distance": dist,
                "active_vehicles": bucket["active_vehicles"],
                "fuel_consumption": fuel,
                "avg_efficiency": None,
                "total_driving_time": None,
                "total_idle_time": None,
                "speed_violations": None,
            })

        total_dist = round(sum(t["total_distance"] for t in trend_data), 1)
        total_fuel = round(total_dist * rate / 100, 1) if rate else None
        best = max(trend_data, key=lambda x: x["total_distance"])["date"] if trend_data else None
        worst = min(trend_data, key=lambda x: x["total_distance"])["date"] if trend_data else None

        result = {
            "success": True,
            "period": {"from": from_date, "to": to_date},
            "days": days,
            "summary": {
                "total_distance": total_dist,
                "avg_efficiency": None,
                "total_fuel": total_fuel,
                "total_violations": None,
                "best_day": best,
                "worst_day": worst,
            },
            "trends": trend_data,
            "_audit": audit.build(self.navixy.get_logs(), False, 0),
        }
        self.cache.set(tenant, cache_key, result)
        return result

    # ──────────────────────────────────────────────────
    # 4. VEHICLE COMPARISON  (replaces /analytics/vehicle-comparison — NO RANDOM)
    # ──────────────────────────────────────────────────

    async def compute_vehicle_comparison(self, navixy_hash: str, from_date: str, to_date: str, tenant: str) -> dict:
        cache_key = f"vehicle_comp:{from_date}:{to_date}"
        cached, hit, age = self.cache.get(tenant, cache_key)
        if cached:
            cached["_audit"]["cache"] = {"hit": True, "age_seconds": age}
            return cached

        audit = AuditBuilder(tenant)
        self.navixy.reset_logs()

        tk_data = await self.navixy.get_trackers(navixy_hash)
        if not tk_data.get('success'):
            return {"success": False, "error": "Échec récupération trackers",
                    "_audit": audit.build(self.navixy.get_logs(), False, 0)}

        tracker_list = tk_data.get('list', [])
        tid_list = [t['id'] for t in tracker_list]
        audit.real("tracker_list", "tracker/list")

        d_from = datetime.strptime(from_date, '%Y-%m-%d')
        d_to = datetime.strptime(to_date, '%Y-%m-%d')
        days_count = max((d_to - d_from).days + 1, 1)

        states_t = self.navixy.get_tracker_states_batch(tid_list, navixy_hash)
        mileage_t = self.navixy.get_mileage(tid_list, f"{from_date} 00:00:00", f"{to_date} 23:59:59", navixy_hash)
        states_map, mileage_raw = await asyncio.gather(states_t, mileage_t)

        audit.real("vehicle_states", "tracker/get_state (batch)")
        audit.real("period_mileage", f"tracker/stats/mileage/read ({days_count}j)")
        audit.computed("utilization_score", f"(jours_actifs / {days_count}) × 100")
        audit.unavailable("fuel_efficiency", "Pas de capteur carburant via cette API")
        audit.unavailable("idle_percentage", "Données historiques non disponibles via snapshot")
        audit.unavailable("violations_count", "Pas de données d'infractions via cette API")

        # Parse weekly mileage
        weekly_km: Dict[str, float] = {}
        weekly_active_days: Dict[str, int] = {}
        if mileage_raw.get('success'):
            for ts, day_map in mileage_raw.get('result', {}).items():
                total = 0.0
                act_days = 0
                for ds, info in day_map.items():
                    if info and isinstance(info, dict):
                        km = info.get('mileage', 0)
                        total += km
                        if km > 0:
                            act_days += 1
                weekly_km[ts] = round(total, 1)
                weekly_active_days[ts] = act_days

        comparison = []
        for tracker in tracker_list:
            tid = tracker['id']
            ts = str(tid)
            state = states_map.get(tid, {})
            gps = state.get('gps', {})
            is_active = state.get('connection_status') == 'active'
            dist = weekly_km.get(ts, 0)
            act_days = weekly_active_days.get(ts, 0)
            score = round((act_days / days_count) * 100)

            comparison.append({
                "tracker_id": tid,
                "label": tracker['label'],
                "model": tracker.get('source', {}).get('model', 'Unknown'),
                "is_active": is_active,
                "connection_status": state.get('connection_status', 'unknown'),
                "utilization_score": score,
                "active_days": act_days,
                "total_days": days_count,
                "total_distance_week": dist,
                "current_speed": gps.get('speed', 0),
                "fuel_efficiency": None,
                "idle_percentage": None,
                "violations_count": None,
            })

        comparison.sort(key=lambda x: x["total_distance_week"], reverse=True)

        result = {
            "success": True,
            "vehicles": comparison,
            "top_performer": comparison[0] if comparison else None,
            "needs_attention": [v for v in comparison if v["utilization_score"] < 30],
            "_audit": audit.build(self.navixy.get_logs(), False, 0),
        }
        self.cache.set(tenant, cache_key, result)
        return result

    # ──────────────────────────────────────────────────
    # 5. IDLE BY GROUP  (already real data, add audit)
    # ──────────────────────────────────────────────────

    async def compute_idle_by_group(self, navixy_hash: str, tenant: str) -> dict:
        cache_key = "idle_group"
        cached, hit, age = self.cache.get(tenant, cache_key)
        if cached:
            cached["_audit"]["cache"] = {"hit": True, "age_seconds": age}
            return cached

        audit = AuditBuilder(tenant)
        self.navixy.reset_logs()

        groups_data = await self.navixy.get_groups(navixy_hash)
        audit.real("tracker_groups", "tracker/group/list")
        if not groups_data.get('success'):
            return {"success": True, "groups": [], "message": "Aucun groupe trouvé",
                    "_audit": audit.build(self.navixy.get_logs(), False, 0)}

        engin_group_map: Dict[int, str] = {}
        for g in groups_data.get('list', []):
            upper = g['title'].upper()
            if 'CHARGEUSE' in upper:
                engin_group_map[g['id']] = 'CHARGEUSE'
            elif 'DUMPER' in upper:
                engin_group_map[g['id']] = 'Dumpers'
            elif 'PELLE' in upper:
                engin_group_map[g['id']] = 'Pelles'

        if not engin_group_map:
            return {"success": True, "groups": [], "message": "Aucun groupe d'engins trouvé",
                    "_audit": audit.build(self.navixy.get_logs(), False, 0)}

        tk_data = await self.navixy.get_trackers(navixy_hash)
        audit.real("tracker_list", "tracker/list")
        if not tk_data.get('success'):
            return {"success": True, "groups": [], "message": "Échec récupération trackers",
                    "_audit": audit.build(self.navixy.get_logs(), False, 0)}

        grouped: Dict[str, list] = {}
        for tracker in tk_data.get('list', []):
            gid = tracker.get('group_id')
            if gid in engin_group_map:
                gname = engin_group_map[gid]
                grouped.setdefault(gname, []).append(tracker)

        all_ids = [t['id'] for trackers in grouped.values() for t in trackers]
        states_map = await self.navixy.get_tracker_states_batch(all_ids, navixy_hash)
        audit.real("vehicle_states", "tracker/get_state (batch, instantané)")

        group_results = []
        total_idle = 0
        total_engins = 0

        for gname, trackers in grouped.items():
            idle_c = 0
            active_c = 0
            n = len(trackers)
            details = []

            for t in trackers:
                state = states_map.get(t['id'], {})
                movement = state.get('movement_status', 'unknown')
                conn = state.get('connection_status', 'unknown')
                speed = state.get('gps', {}).get('speed', 0)

                is_idle = conn == 'active' and (movement == 'idle' or speed < 5)
                is_active = conn == 'active' and movement == 'moving' and speed >= 5

                if is_idle:
                    idle_c += 1
                if is_active:
                    active_c += 1

                details.append({
                    "tracker_id": t['id'], "label": t['label'],
                    "status": "idle" if is_idle else ("active" if is_active else "offline"),
                    "speed": speed, "movement": movement, "connection": conn,
                })

            idle_pct = round((idle_c / n) * 100) if n > 0 else 0
            total_idle += idle_c
            total_engins += n

            group_results.append({
                "name": gname, "total": n, "active": active_c, "idle": idle_c,
                "offline": n - active_c - idle_c, "idle_percentage": idle_pct,
                "vehicles": details,
            })

        result = {
            "success": True,
            "total_engins": total_engins,
            "total_idle": total_idle,
            "total_idle_percentage": round((total_idle / total_engins) * 100) if total_engins else 0,
            "groups": group_results,
            "_audit": audit.build(self.navixy.get_logs(), False, 0),
        }
        self.cache.set(tenant, cache_key, result)
        return result

    # ──────────────────────────────────────────────────
    # 6. DRIVER REPORT  (fixed: driver/journal doesn't exist → use employee+tracker assignment)
    # ──────────────────────────────────────────────────

    async def compute_driver_report(
        self, navixy_hash: str, from_date: str, to_date: str,
        employee_id: Optional[int], tenant: str,
    ) -> dict:
        cache_key = f"driver_report:{from_date}:{to_date}:{employee_id}"
        cached, hit, age = self.cache.get(tenant, cache_key)
        if cached:
            cached["_audit"]["cache"] = {"hit": True, "age_seconds": age}
            return cached

        audit = AuditBuilder(tenant)
        self.navixy.reset_logs()

        emp_data = await self.navixy.get_employees(navixy_hash)
        audit.real("employee_list", "employee/list")
        if not emp_data.get('success'):
            return {"success": False, "error": "Échec récupération employés",
                    "_audit": audit.build(self.navixy.get_logs(), False, 0)}

        tk_data = await self.navixy.get_trackers(navixy_hash)
        audit.real("tracker_list", "tracker/list")
        trackers_map: Dict[int, str] = {}
        tid_list = []
        if tk_data.get('success'):
            for t in tk_data.get('list', []):
                trackers_map[t['id']] = t['label']
                tid_list.append(t['id'])

        # Get mileage for assigned trackers
        mileage_raw = await self.navixy.get_mileage(
            tid_list, f"{from_date} 00:00:00", f"{to_date} 23:59:59", navixy_hash
        ) if tid_list else {"success": False}
        audit.real("mileage", "tracker/stats/mileage/read")

        period_mileage: Dict[str, float] = {}
        if mileage_raw.get('success'):
            for ts, days in mileage_raw.get('result', {}).items():
                total = sum(
                    (d.get('mileage', 0) if isinstance(d, dict) else 0)
                    for d in days.values() if d is not None
                )
                period_mileage[ts] = round(total, 1)

        drivers_report = []
        for emp in emp_data.get('list', []):
            if employee_id and emp['id'] != employee_id:
                continue

            name = f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip()
            tid = emp.get('tracker_id')
            vehicles_used = []
            total_distance = 0

            if tid:
                label = trackers_map.get(tid, f"Véhicule {tid}")
                dist = period_mileage.get(str(tid), 0)
                total_distance = dist
                vehicles_used.append({
                    "tracker_id": tid,
                    "vehicle_label": label,
                    "distance": dist,
                    "start_time": from_date,
                    "end_time": to_date,
                    "note": "Assignation actuelle (employee/list)",
                })

            drivers_report.append({
                "employee_id": emp['id'],
                "driver_name": name or f"Conducteur {emp['id']}",
                "phone": emp.get('phone', ''),
                "personnel_number": emp.get('personnel_number', ''),
                "hardware_key": emp.get('hardware_key'),
                "total_distance": total_distance,
                "vehicles_count": len(vehicles_used),
                "vehicles": vehicles_used,
            })

        result = {
            "success": True,
            "period": {"from": from_date, "to": to_date},
            "drivers": drivers_report,
            "_audit": audit.build(self.navixy.get_logs(), False, 0),
        }
        self.cache.set(tenant, cache_key, result)
        return result
