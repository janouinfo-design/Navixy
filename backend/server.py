from fastapi import FastAPI, APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import json
import io
import csv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Navixy configuration
NAVIXY_HASH = os.environ.get('NAVIXY_HASH', '')
NAVIXY_API_URL = os.environ.get('NAVIXY_API_URL', 'https://api.navixy.com/v2')

# Create the main app
app = FastAPI(title="Navixy Fleet Dashboard")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============ MODELS ============

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class Tracker(BaseModel):
    id: int
    label: str
    group_id: Optional[int] = None
    model: Optional[str] = None
    device_id: Optional[str] = None
    status: Optional[str] = None

class Employee(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = ""
    tracker_id: Optional[int] = None
    phone: Optional[str] = ""
    hardware_key: Optional[str] = None

class FlowNode(BaseModel):
    id: str
    type: str
    label: str
    position: Dict[str, float]
    config: Optional[Dict[str, Any]] = {}

class FlowConnection(BaseModel):
    id: str
    source_id: str
    target_id: str

class Flow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    nodes: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FlowCreate(BaseModel):
    name: str
    nodes: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []

# ============ NAVIXY API HELPERS ============

async def navixy_request(endpoint: str, params: dict = None) -> dict:
    """Make a request to Navixy API"""
    if params is None:
        params = {}
    params['hash'] = NAVIXY_HASH
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{NAVIXY_API_URL}/{endpoint}",
                json=params
            )
            data = response.json()
            if not data.get('success', False):
                logger.error(f"Navixy API error: {data}")
            return data
        except Exception as e:
            logger.error(f"Navixy request failed: {e}")
            return {"success": False, "error": str(e)}

# ============ BASIC ROUTES ============

@api_router.get("/")
async def root():
    return {"message": "Navixy Fleet Dashboard API"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks

# ============ NAVIXY TRACKERS/VEHICLES ============

@api_router.get("/trackers")
async def get_trackers():
    """Get all trackers from Navixy"""
    data = await navixy_request("tracker/list")
    if data.get('success'):
        trackers = []
        for t in data.get('list', []):
            trackers.append({
                "id": t['id'],
                "label": t['label'],
                "group_id": t.get('group_id'),
                "model": t.get('source', {}).get('model'),
                "device_id": t.get('source', {}).get('device_id'),
                "tariff_end_date": t.get('source', {}).get('tariff_end_date'),
                "blocked": t.get('source', {}).get('blocked', False)
            })
        return {"success": True, "trackers": trackers}
    return {"success": False, "error": data.get('status', {}).get('description', 'Unknown error')}

@api_router.get("/tracker/{tracker_id}/state")
async def get_tracker_state(tracker_id: int):
    """Get current state of a tracker"""
    data = await navixy_request("tracker/get_state", {"tracker_id": tracker_id})
    return data

@api_router.get("/tracker/{tracker_id}/readings")
async def get_tracker_readings(tracker_id: int):
    """Get latest readings from a tracker"""
    data = await navixy_request("tracker/readings/list", {"tracker_id": tracker_id})
    return data

# ============ EMPLOYEES/DRIVERS ============

@api_router.get("/employees")
async def get_employees():
    """Get all employees/drivers from Navixy"""
    data = await navixy_request("employee/list")
    if data.get('success'):
        employees = []
        for e in data.get('list', []):
            employees.append({
                "id": e['id'],
                "first_name": e.get('first_name', ''),
                "last_name": e.get('last_name', ''),
                "tracker_id": e.get('tracker_id'),
                "phone": e.get('phone', ''),
                "hardware_key": e.get('hardware_key'),
                "personnel_number": e.get('personnel_number', '')
            })
        return {"success": True, "employees": employees}
    return {"success": False, "error": data.get('status', {}).get('description', 'Unknown error')}

# ============ FLEET STATISTICS ============

@api_router.get("/fleet/stats")
async def get_fleet_stats(
    from_date: str = Query(..., description="Start date YYYY-MM-DD"),
    to_date: str = Query(..., description="End date YYYY-MM-DD"),
    tracker_ids: Optional[str] = Query(None, description="Comma-separated tracker IDs")
):
    """Get fleet efficiency statistics"""
    # Get list of trackers
    trackers_data = await navixy_request("tracker/list")
    if not trackers_data.get('success'):
        raise HTTPException(status_code=400, detail="Failed to fetch trackers")
    
    all_trackers = trackers_data.get('list', [])
    
    # Filter by tracker_ids if provided
    if tracker_ids:
        ids = [int(x) for x in tracker_ids.split(',')]
        all_trackers = [t for t in all_trackers if t['id'] in ids]
    
    stats = []
    total_mileage = 0
    total_engine_hours = 0
    total_idle_time = 0
    
    for tracker in all_trackers:
        tracker_id = tracker['id']
        
        # Get counter values for mileage and engine hours
        counters_data = await navixy_request("tracker/counter/read", {
            "tracker_id": tracker_id
        })
        
        # Get state for additional info
        state_data = await navixy_request("tracker/get_state", {
            "tracker_id": tracker_id
        })
        
        mileage = 0
        engine_hours = 0
        
        if counters_data.get('success'):
            counters = counters_data.get('value', {})
            mileage = counters.get('odometer', 0) or 0
            engine_hours = counters.get('engine_hours', 0) or 0
        
        gps_state = state_data.get('state', {}).get('gps', {}) if state_data.get('success') else {}
        connection_status = state_data.get('state', {}).get('connection_status', 'unknown') if state_data.get('success') else 'unknown'
        
        # Calculate efficiency (simplified - based on connection status)
        efficiency = 100 if connection_status == 'active' else 0
        
        total_mileage += mileage
        total_engine_hours += engine_hours
        
        stats.append({
            "tracker_id": tracker_id,
            "label": tracker['label'],
            "model": tracker.get('source', {}).get('model', 'Unknown'),
            "mileage": mileage,
            "engine_hours": engine_hours,
            "efficiency": efficiency,
            "connection_status": connection_status,
            "last_update": gps_state.get('updated', None),
            "speed": gps_state.get('speed', 0),
            "location": {
                "lat": gps_state.get('location', {}).get('lat', 0) if gps_state.get('location') else 0,
                "lng": gps_state.get('location', {}).get('lng', 0) if gps_state.get('location') else 0
            }
        })
    
    # Calculate averages
    num_trackers = len(stats) or 1
    avg_efficiency = sum(s['efficiency'] for s in stats) / num_trackers
    
    return {
        "success": True,
        "period": {"from": from_date, "to": to_date},
        "summary": {
            "total_vehicles": len(stats),
            "total_mileage": total_mileage,
            "total_engine_hours": total_engine_hours,
            "average_efficiency": round(avg_efficiency, 1)
        },
        "vehicles": stats
    }

@api_router.get("/fleet/efficiency")
async def get_fleet_efficiency(
    date: str = Query(..., description="Date YYYY-MM-DD"),
    period: str = Query("day", description="day, week, or month")
):
    """Get fleet efficiency report similar to Navixy UI"""
    # Get all trackers
    trackers_data = await navixy_request("tracker/list")
    if not trackers_data.get('success'):
        raise HTTPException(status_code=400, detail="Failed to fetch trackers")
    
    vehicles = []
    total_driving_time = 0
    total_idle_time = 0
    total_stopped_time = 0
    
    for tracker in trackers_data.get('list', []):
        tracker_id = tracker['id']
        
        # Get state
        state_data = await navixy_request("tracker/get_state", {"tracker_id": tracker_id})
        
        state = state_data.get('state', {}) if state_data.get('success') else {}
        gps = state.get('gps', {})
        movement_status = state.get('movement_status', 'unknown')
        
        # Simulate time calculations (in real scenario, this would come from reports)
        driving_time = 0
        idle_time = 0
        stopped_time = 86400  # 24 hours in seconds
        
        if movement_status == 'moving':
            driving_time = 3600  # 1 hour example
            stopped_time -= driving_time
        elif movement_status == 'idle':
            idle_time = 1800  # 30 min example
            stopped_time -= idle_time
        
        efficiency = round((driving_time / 86400) * 100, 1) if driving_time > 0 else 0
        
        total_driving_time += driving_time
        total_idle_time += idle_time
        total_stopped_time += stopped_time
        
        vehicles.append({
            "tracker_id": tracker_id,
            "label": tracker['label'],
            "efficiency": efficiency,
            "driving_time": driving_time,
            "idle_time": idle_time,
            "stopped_time": stopped_time,
            "movement_status": movement_status,
            "speed": gps.get('speed', 0),
            "timeline": []  # Would be filled with hourly data
        })
    
    num_vehicles = len(vehicles) or 1
    avg_efficiency = round((total_driving_time / (num_vehicles * 86400)) * 100, 1)
    
    return {
        "success": True,
        "date": date,
        "period": period,
        "summary": {
            "average_efficiency": avg_efficiency,
            "avg_driving_time_per_day": total_driving_time // num_vehicles,
            "avg_idle_time_per_day": total_idle_time // num_vehicles,
            "avg_stopped_time_per_day": total_stopped_time // num_vehicles
        },
        "vehicles": vehicles
    }

# ============ DRIVER REPORT (INVERTED) ============

@api_router.get("/reports/driver")
async def get_driver_report(
    from_date: str = Query(..., description="Start date YYYY-MM-DD"),
    to_date: str = Query(..., description="End date YYYY-MM-DD"),
    employee_id: Optional[int] = Query(None, description="Specific employee ID")
):
    """Get driver-centric report: which vehicles did each driver use"""
    # Get employees
    employees_data = await navixy_request("employee/list")
    if not employees_data.get('success'):
        raise HTTPException(status_code=400, detail="Failed to fetch employees")
    
    # Get trackers for reference
    trackers_data = await navixy_request("tracker/list")
    trackers_map = {}
    if trackers_data.get('success'):
        for t in trackers_data.get('list', []):
            trackers_map[t['id']] = t['label']
    
    drivers_report = []
    
    for employee in employees_data.get('list', []):
        if employee_id and employee['id'] != employee_id:
            continue
        
        driver_name = f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip()
        
        # Get driver journal (vehicles driven by this driver)
        journal_data = await navixy_request("driver/journal/list", {
            "driver_id": employee['id'],
            "from": f"{from_date} 00:00:00",
            "to": f"{to_date} 23:59:59"
        })
        
        vehicles_used = []
        total_distance = 0
        total_duration = 0
        
        if journal_data.get('success'):
            for entry in journal_data.get('list', []):
                tracker_id = entry.get('tracker_id')
                vehicle_label = trackers_map.get(tracker_id, f"Vehicle {tracker_id}")
                
                vehicles_used.append({
                    "tracker_id": tracker_id,
                    "vehicle_label": vehicle_label,
                    "start_time": entry.get('start_date'),
                    "end_time": entry.get('end_date'),
                    "distance": entry.get('distance', 0),
                    "duration": entry.get('duration', 0)
                })
                total_distance += entry.get('distance', 0)
                total_duration += entry.get('duration', 0)
        else:
            # If journal not available, use current tracker assignment
            if employee.get('tracker_id'):
                tracker_id = employee['tracker_id']
                vehicles_used.append({
                    "tracker_id": tracker_id,
                    "vehicle_label": trackers_map.get(tracker_id, f"Vehicle {tracker_id}"),
                    "start_time": from_date,
                    "end_time": to_date,
                    "distance": 0,
                    "duration": 0,
                    "note": "Assignation actuelle"
                })
        
        drivers_report.append({
            "employee_id": employee['id'],
            "driver_name": driver_name or f"Conducteur {employee['id']}",
            "phone": employee.get('phone', ''),
            "personnel_number": employee.get('personnel_number', ''),
            "hardware_key": employee.get('hardware_key'),
            "total_distance": total_distance,
            "total_duration": total_duration,
            "vehicles_count": len(vehicles_used),
            "vehicles": vehicles_used
        })
    
    return {
        "success": True,
        "period": {"from": from_date, "to": to_date},
        "drivers": drivers_report
    }

# ============ IOT FLOW MANAGEMENT ============

@api_router.get("/flows")
async def get_flows():
    """Get all saved IoT flows"""
    flows = await db.flows.find({}, {"_id": 0}).to_list(100)
    for flow in flows:
        if isinstance(flow.get('created_at'), str):
            flow['created_at'] = datetime.fromisoformat(flow['created_at'])
        if isinstance(flow.get('updated_at'), str):
            flow['updated_at'] = datetime.fromisoformat(flow['updated_at'])
    return {"success": True, "flows": flows}

@api_router.post("/flows")
async def create_flow(flow_input: FlowCreate):
    """Create a new IoT flow"""
    flow = Flow(
        name=flow_input.name,
        nodes=flow_input.nodes,
        connections=flow_input.connections
    )
    doc = flow.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.flows.insert_one(doc)
    return {"success": True, "flow": flow.model_dump()}

@api_router.put("/flows/{flow_id}")
async def update_flow(flow_id: str, flow_input: FlowCreate):
    """Update an existing IoT flow"""
    update_data = {
        "name": flow_input.name,
        "nodes": flow_input.nodes,
        "connections": flow_input.connections,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.flows.update_one(
        {"id": flow_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Flow not found")
    
    return {"success": True, "message": "Flow updated"}

@api_router.delete("/flows/{flow_id}")
async def delete_flow(flow_id: str):
    """Delete an IoT flow"""
    result = await db.flows.delete_one({"id": flow_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Flow not found")
    return {"success": True, "message": "Flow deleted"}

@api_router.get("/flows/{flow_id}/export")
async def export_flow(flow_id: str):
    """Export flow as JSON"""
    flow = await db.flows.find_one({"id": flow_id}, {"_id": 0})
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    
    json_content = json.dumps(flow, indent=2, default=str)
    return StreamingResponse(
        io.BytesIO(json_content.encode()),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=flow_{flow_id}.json"}
    )

# ============ EXPORT REPORTS ============

@api_router.get("/export/fleet-stats")
async def export_fleet_stats(
    from_date: str = Query(...),
    to_date: str = Query(...),
    format: str = Query("csv", description="csv or json")
):
    """Export fleet statistics as CSV or JSON"""
    try:
        stats = await get_fleet_stats(from_date, to_date, None)
    except Exception as e:
        logger.error(f"Error getting fleet stats for export: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch fleet stats: {str(e)}")
    
    if format == "json":
        json_content = json.dumps(stats, indent=2, default=str)
        return StreamingResponse(
            io.BytesIO(json_content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=fleet_stats_{from_date}_{to_date}.json"}
        )
    
    # CSV export
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow(["Véhicule", "ID", "Modèle", "Kilométrage", "Heures moteur", "Efficacité %", "Statut"])
    
    # Data
    for v in stats.get('vehicles', []):
        writer.writerow([
            v['label'],
            v['tracker_id'],
            v['model'],
            v['mileage'],
            v['engine_hours'],
            v['efficiency'],
            v['connection_status']
        ])
    
    csv_content = output.getvalue()
    return StreamingResponse(
        io.BytesIO(csv_content.encode('utf-8-sig')),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=fleet_stats_{from_date}_{to_date}.csv"}
    )

@api_router.get("/export/driver-report")
async def export_driver_report(
    from_date: str = Query(...),
    to_date: str = Query(...),
    format: str = Query("csv")
):
    """Export driver report as CSV or JSON"""
    report = await get_driver_report(from_date, to_date)
    
    if format == "json":
        json_content = json.dumps(report, indent=2, default=str)
        return StreamingResponse(
            io.BytesIO(json_content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=driver_report_{from_date}_{to_date}.json"}
        )
    
    # CSV export
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow(["Conducteur", "ID", "Téléphone", "Véhicule", "Date début", "Date fin", "Distance (km)"])
    
    # Data
    for driver in report.get('drivers', []):
        for vehicle in driver.get('vehicles', []):
            writer.writerow([
                driver['driver_name'],
                driver['employee_id'],
                driver['phone'],
                vehicle['vehicle_label'],
                vehicle.get('start_time', ''),
                vehicle.get('end_time', ''),
                vehicle.get('distance', 0)
            ])
    
    csv_content = output.getvalue()
    return StreamingResponse(
        io.BytesIO(csv_content.encode('utf-8-sig')),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=driver_report_{from_date}_{to_date}.csv"}
    )

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
