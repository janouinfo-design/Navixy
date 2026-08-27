"""
Simulateur DEMO EV — données FICTIVES, uniquement pour le tenant démo (hash = 'SIMULATION').
Jamais actif pour un client réel : le hook est le hash spécial, stocké chiffré sur le client démo.
Toutes les valeurs portent source='simulation'. Données déterministes (stables entre appels).
"""
import hashlib
from datetime import datetime, timedelta, timezone

VEHICLES = [
    {"tid": 900001, "label": "DEMO Tesla Model 3", "plate": "ZH 100001", "model": "Tesla Model 3", "fuel": "electric", "batt_kwh": 60, "range_max": 420, "odo0": 31200},
    {"tid": 900002, "label": "DEMO Renault Zoe", "plate": "BE 200002", "model": "Renault Zoe", "fuel": "electric", "batt_kwh": 52, "range_max": 340, "odo0": 48750},
    {"tid": 900003, "label": "DEMO VW ID.4", "plate": "VD 300003", "model": "Volkswagen ID.4", "fuel": "electric", "batt_kwh": 77, "range_max": 480, "odo0": 12400},
    {"tid": 900004, "label": "DEMO Volvo XC60 PHEV", "plate": "GE 400004", "model": "Volvo XC60 T8", "fuel": "phev", "batt_kwh": 18, "range_max": 70, "odo0": 66300},
    {"tid": 900005, "label": "DEMO VW Caddy Diesel", "plate": "FR 500005", "model": "Volkswagen Caddy", "fuel": "diesel", "batt_kwh": None, "range_max": None, "odo0": 88900},
]
_BY_TID = {v["tid"]: v for v in VEHICLES}


def _rand(*keys) -> float:
    h = hashlib.md5("|".join(str(k) for k in keys).encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def _now():
    return datetime.now(timezone.utc)


def _ts(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _soc(tid: int, dt: datetime) -> float:
    """SoC déterministe : décharge en journée (8-19h), recharge la nuit (21-6h)."""
    v = _BY_TID[tid]
    if v["fuel"] == "diesel":
        return None
    hf = dt.hour + dt.minute / 60.0
    day_seed = _rand(tid, dt.strftime("%Y-%m-%d"))
    start = 88 + day_seed * 8  # 88-96 % au matin
    if hf < 6:
        soc = 55 + (hf / 6) * (start - 55)
    elif hf < 8:
        soc = start
    elif hf < 19:
        drain = (28 + day_seed * 22) * ((hf - 8) / 11)  # -28 à -50 % sur la journée
        soc = start - drain
    elif hf < 21:
        soc = start - (28 + day_seed * 22)
    else:
        low = start - (28 + day_seed * 22)
        soc = low + ((hf - 21) / 9) * (55 - low + 10)
    if tid == 900002 and dt.date() == _now().date():
        soc = min(soc, 16.0)  # Zoe démo en batterie faible aujourd'hui
    return round(max(5.0, min(100.0, soc)), 1)


def _charging(tid: int, dt: datetime) -> str:
    if _BY_TID[tid]["fuel"] == "diesel":
        return None
    h = dt.hour
    if tid == 900001 and 6 <= h < 18:
        return "charging"  # Tesla démo : borne dépôt en journée (toujours 1 véhicule en charge visible)
    if tid == 900003 and 8 <= h < 18:
        return "plugged_not_charging"  # ID.4 démo : branché sans charge (illustre l'état)
    if 21 <= h or h < 6:
        return "charging"
    if 19 <= h < 21:
        return "plugged_not_charging"
    return "disconnected"


def _day_km(tid: int, d) -> float:
    if d.weekday() == 6:
        return 0.0
    if tid == 900004 and d.weekday() >= 4:
        return 0.0  # PHEV sous-utilisé
    if tid == 900005:
        # Caddy diesel : roulage utilitaire soutenu, silencieux depuis 2 jours (cohérent avec son statut hors ligne)
        if (datetime.now().date() - d).days < 2:
            return 0.0
        return round(35 + _rand(tid, "km", d.isoformat()) * 90, 1)
    return round(18 + _rand(tid, "km", d.isoformat()) * 70, 1)


def _kwh100(tid: int) -> float:
    return round(14 + _rand(tid, "eff") * 6, 1)


def _sensors(tid: int):
    v = _BY_TID[tid]
    out = []
    if v["fuel"] in ("electric", "phev"):
        out += [
            {"id": tid * 10 + 1, "name": "Batterie de traction (SoC)", "input_name": "ev_battery_level", "type": "metering", "units": "%"},
            {"id": tid * 10 + 2, "name": "Autonomie restante EV", "input_name": "ev_range", "type": "metering", "units": "km"},
            {"id": tid * 10 + 3, "name": "État de recharge", "input_name": "ev_charging_state", "type": "metering", "units": ""},
            {"id": tid * 10 + 5, "name": "Consommation moyenne", "input_name": "ev_kwh_per_100", "type": "metering", "units": "kWh/100km"},
            {"id": tid * 10 + 6, "name": "Énergie consommée (total)", "input_name": "ev_energy_consumed", "type": "metering", "units": "kWh"},
            {"id": tid * 10 + 7, "name": "Capacité batterie", "input_name": "ev_battery_capacity", "type": "metering", "units": "kWh"},
            {"id": tid * 10 + 8, "name": "Puissance de charge", "input_name": "ev_charging_power", "type": "metering", "units": "kW"},
            {"id": tid * 10 + 9, "name": "Température batterie", "input_name": "ev_battery_temp", "type": "metering", "units": "°C"},
            {"id": tid * 10, "name": "Énergie dernière recharge", "input_name": "ev_energy_charged", "type": "metering", "units": "kWh"},
        ]
    if v["fuel"] in ("diesel", "phev"):
        out.append({"id": tid * 10 + 4, "name": "OBD : carburant", "input_name": "obd_fuel", "type": "metering", "units": "%"})
    return out


def _readings(tid: int):
    v = _BY_TID[tid]
    now = _now()
    inputs = []
    odo = v["odo0"] + sum(_day_km(tid, (now - timedelta(days=i)).date()) for i in range(30))
    for s in _sensors(tid):
        inp = s["input_name"]
        if inp == "ev_battery_level":
            val = _soc(tid, now)
        elif inp == "ev_range":
            soc = _soc(tid, now)
            val = round(soc / 100 * v["range_max"], 0) if soc is not None else None
        elif inp == "ev_charging_state":
            val = _charging(tid, now)
        elif inp == "ev_kwh_per_100":
            val = _kwh100(tid)
        elif inp == "ev_energy_consumed":
            val = round(odo * _kwh100(tid) / 100, 1)
        elif inp == "ev_battery_capacity":
            val = v["batt_kwh"]
        elif inp == "ev_charging_power":
            val = (11.0 if v["batt_kwh"] and v["batt_kwh"] >= 60 else 7.4) if _charging(tid, now) == "charging" else None
        elif inp == "ev_battery_temp":
            val = round(18 + (now.hour / 24) * 10 + _rand(tid, "temp", now.strftime("%Y-%m-%d")) * 4, 1)
        elif inp == "ev_energy_charged":
            val = round(v["batt_kwh"] * (0.45 + _rand(tid, "chg", now.strftime("%Y-%m-%d")) * 0.3), 1)
        elif inp == "obd_fuel":
            val = round(30 + _rand(tid, "fuel", now.strftime("%Y-%m-%d")) * 60, 1)
        else:
            val = None
        inputs.append({"label": s["name"], "type": "sensor", "value": val,
                       "units": s["units"], "update_time": _ts(now), "sensor_id": s["id"]})
    return {"success": True, "inputs": inputs, "states": [], "virtual_sensors": [],
            "counters": [
                {"type": "odometer", "value": round(odo, 1), "update_time": _ts(now)},
                {"type": "engine_hours", "value": round(odo / 38, 1), "update_time": _ts(now)},
            ]}


def _history(tid: int, sensor_id: int, from_s: str, to_s: str):
    kind = sensor_id % 10
    v = _BY_TID[tid]
    try:
        start = datetime.strptime(from_s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        end = datetime.strptime(to_s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return {"success": False, "status": {"code": 4, "description": "SIMULATION: dates invalides"}}
    end = min(end, _now())
    pts, cur = [], start
    while cur <= end:
        if kind == 1:
            val = _soc(tid, cur)
        elif kind == 2:
            soc = _soc(tid, cur)
            val = round(soc / 100 * v["range_max"], 0) if soc is not None else None
        elif kind == 4:
            val = round(30 + _rand(tid, "fuel", cur.strftime("%Y-%m-%d")) * 60, 1)
        elif kind == 5:
            val = _kwh100(tid)
        elif kind == 9:
            val = round(18 + (cur.hour / 24) * 10 + _rand(tid, "temp", cur.strftime("%Y-%m-%d")) * 4, 1)
        else:
            val = None
        if val is not None:
            pts.append({"value": val, "get_time": _ts(cur)})
        cur += timedelta(minutes=30)
    return {"success": True, "list": pts}


# Overrides garage démo (vehicle/update simulé) — en mémoire process, tenant SIMULATION uniquement
_GARAGE_OVERRIDES = {}


def _garage_vehicle(v: dict) -> dict:
    base = {"id": v["tid"] + 5000, "tracker_id": v["tid"], "label": v["label"], "model": v["model"],
            "reg_number": v["plate"], "fuel_type": v["fuel"], "manufacture_year": 2024,
            "vin": f"SIMVIN{v['tid']}00000000"[:17], "type": "vehicle"}
    base.update(_GARAGE_OVERRIDES.get(base["id"], {}))
    base["id"] = v["tid"] + 5000
    return base


def simulate(endpoint: str, params: dict) -> dict:
    now = _now()
    if endpoint == "tracker/list":
        return {"success": True, "list": [
            {"id": v["tid"], "label": v["label"], "group_id": 0,
             "source": {"model": "simulator", "device_id": f"SIM{v['tid']}"}} for v in VEHICLES]}
    if endpoint == "vehicle/list":
        return {"success": True, "list": [_garage_vehicle(v) for v in VEHICLES]}
    if endpoint == "vehicle/read":
        vid = params.get("vehicle_id")
        v = next((x for x in VEHICLES if x["tid"] + 5000 == vid), None)
        if v is None:
            return {"success": False, "status": {"code": 204, "description": "not found"}}
        return {"success": True, "value": _garage_vehicle(v)}
    if endpoint == "vehicle/update":
        veh = params.get("vehicle") or {}
        vid = veh.get("id")
        if not any(x["tid"] + 5000 == vid for x in VEHICLES):
            return {"success": False, "status": {"code": 204, "description": "not found"}}
        _GARAGE_OVERRIDES[vid] = {k: val for k, val in veh.items() if k != "id"}
        return {"success": True}
    if endpoint == "tracker/get_state":
        tid = params.get("tracker_id")
        if tid not in _BY_TID:
            return {"success": False, "status": {"code": 204, "description": "not found"}}
        offline = tid == 900005
        return {"success": True, "state": {
            "gps": {"updated": _ts(now), "location": {"lat": 46.95 + (tid % 10) * 0.01, "lng": 7.44}, "speed": 0},
            "connection_status": "offline" if offline else "active",
            "movement_status": "parked" if offline else ("moving" if now.hour in (9, 14) else "parked"),
            "last_update": _ts(now - timedelta(days=3)) if offline else _ts(now),
            "battery_level": 100, "ignition": not offline}}
    if endpoint == "tracker/stats/mileage/read":
        try:
            d0 = datetime.strptime(str(params.get("from"))[:10], "%Y-%m-%d").date()
            d1 = datetime.strptime(str(params.get("to"))[:10], "%Y-%m-%d").date()
        except ValueError:
            return {"success": False, "status": {"code": 4, "description": "bad dates"}}
        result = {}
        for tid in params.get("trackers", []):
            if tid in _BY_TID:
                days, d = {}, d0
                while d <= min(d1, now.date()):
                    days[d.isoformat()] = {"mileage": _day_km(tid, d)}
                    d += timedelta(days=1)
                result[str(tid)] = days
        return {"success": True, "result": result}
    if endpoint == "tracker/counter/value/list":
        ctype = params.get("type")
        value = {}
        for tid in params.get("trackers", []):
            if tid in _BY_TID:
                odo = _BY_TID[tid]["odo0"] + sum(_day_km(tid, (now - timedelta(days=i)).date()) for i in range(30))
                value[str(tid)] = round(odo, 1) if ctype == "odometer" else round(odo / 38, 1)
        return {"success": True, "value": value}
    if endpoint == "tracker/sensor/list":
        return {"success": True, "list": _sensors(params.get("tracker_id"))} if params.get("tracker_id") in _BY_TID \
            else {"success": False, "status": {"code": 204, "description": "not found"}}
    if endpoint == "tracker/readings/list":
        return _readings(params.get("tracker_id")) if params.get("tracker_id") in _BY_TID \
            else {"success": False, "status": {"code": 204, "description": "not found"}}
    if endpoint == "tracker/sensor/data/read":
        return _history(params.get("tracker_id"), params.get("sensor_id"), str(params.get("from")), str(params.get("to")))
    if endpoint == "tracker/group/list":
        return {"success": True, "list": []}
    if endpoint == "user/get_info":
        return {"success": True, "user_info": {"title": "DEMO EV (simulation)"}}
    return {"success": False, "status": {"code": 0, "description": f"SIMULATION: endpoint non simulé ({endpoint})"}}
