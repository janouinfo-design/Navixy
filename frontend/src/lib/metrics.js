// ============ FLEET METRICS ENGINE ============
// All derived calculations from raw Navixy data
// No API modification — frontend only

const FUEL_PRICE_CHF = 2.0;
const IDLE_FUEL_RATE_LH = 1.5; // liters/hour idle consumption
const IDLE_COST_PER_HOUR = IDLE_FUEL_RATE_LH * FUEL_PRICE_CHF; // CHF per hour idle
const AVG_FUEL_RATE = 8.5; // L/100km fleet average baseline
const WORKING_HOURS_DAY = 8;

// ---- Idle calculations ----
export const calcIdleTime = (vehicle) => {
  // From efficiency data: idle_time in seconds
  if (vehicle.idle_time) return vehicle.idle_time;
  // From comparison data: idle_percentage of assumed 8h day
  if (vehicle.idle_percentage) return (vehicle.idle_percentage / 100) * WORKING_HOURS_DAY * 3600;
  return 0;
};

export const calcIdleRate = (vehicle) => {
  if (vehicle.idle_percentage) return vehicle.idle_percentage;
  const idle = calcIdleTime(vehicle);
  const engine = (vehicle.engine_hours || 0) * 3600 || (vehicle.driving_time || 0) + idle + (vehicle.stopped_time || 0);
  if (engine <= 0) return 0;
  return Math.round((idle / engine) * 100);
};

export const calcIdleCost = (vehicle, days = 7) => {
  const idleHours = calcIdleTime(vehicle) / 3600;
  return Math.round(idleHours * IDLE_COST_PER_HOUR * 10) / 10;
};

// ---- Fuel calculations ----
export const calcFuelConsumption = (vehicle) => {
  // Use provided fuel_efficiency if available
  if (vehicle.fuel_efficiency && vehicle.fuel_efficiency > 0) return vehicle.fuel_efficiency;
  // Estimate from distance and engine hours
  const distance = vehicle.mileage || vehicle.total_distance_week || 0;
  if (distance <= 0) return 0;
  const engineH = vehicle.engine_hours || 0;
  if (engineH > 0) {
    const estimatedFuel = engineH * AVG_FUEL_RATE / 10;
    return Math.round((estimatedFuel / distance) * 1000) / 10;
  }
  return AVG_FUEL_RATE;
};

export const calcFuelUsed = (vehicle) => {
  const distance = vehicle.mileage || vehicle.total_distance_week || 0;
  const consumption = calcFuelConsumption(vehicle);
  return Math.round(distance * consumption / 100 * 10) / 10;
};

export const calcFuelCost = (vehicle) => {
  return Math.round(calcFuelUsed(vehicle) * FUEL_PRICE_CHF * 10) / 10;
};

// ---- Overconsumption ----
export const calcOverconsumption = (vehicle) => {
  const consumption = calcFuelConsumption(vehicle);
  if (consumption <= AVG_FUEL_RATE) return 0;
  const distance = vehicle.mileage || vehicle.total_distance_week || 0;
  const excessLiters = (consumption - AVG_FUEL_RATE) * distance / 100;
  return Math.round(excessLiters * FUEL_PRICE_CHF * 10) / 10;
};

// ---- Score calculation ----
export const calcVehicleScore = (vehicle) => {
  if (vehicle.efficiency_score) return vehicle.efficiency_score;

  const efficiency = vehicle.efficiency || 0;
  const idleRate = calcIdleRate(vehicle);
  const violations = vehicle.violations_count || 0;
  const consumption = calcFuelConsumption(vehicle);

  const idleScore = Math.max(0, 100 - idleRate * 2.5);
  const violationScore = Math.max(0, 100 - violations * 15);
  const consumptionScore = consumption > 0 ? Math.max(0, 100 - (consumption - 5) * 8) : 50;
  const activityScore = (vehicle.mileage || vehicle.total_distance_week || 0) > 10 ? 80 : 20;

  return Math.max(0, Math.min(100, Math.round(
    efficiency * 0.3 + idleScore * 0.25 + violationScore * 0.2 + consumptionScore * 0.15 + activityScore * 0.1
  )));
};

export const calcDriverScore = (driver, compVehicles) => {
  const assignedVehicle = compVehicles.find(v => v.tracker_id === driver.vehicles?.[0]?.tracker_id);
  if (!assignedVehicle) return { score: 0, efficiency: 0, idle: 0, violations: 0, consumption: 0, fuelCost: 0 };

  const efficiency = assignedVehicle.efficiency_score || 0;
  const idle = assignedVehicle.idle_percentage || 0;
  const violations = assignedVehicle.violations_count || 0;
  const consumption = assignedVehicle.fuel_efficiency || 0;

  const idleScore = Math.max(0, 100 - idle * 3);
  const violationScore = Math.max(0, 100 - violations * 20);
  const consumptionScore = consumption > 0 ? Math.max(0, 100 - (consumption - 6) * 10) : 50;

  const score = Math.round(efficiency * 0.4 + idleScore * 0.25 + violationScore * 0.2 + consumptionScore * 0.15);
  const fuelCost = calcFuelCost(assignedVehicle);

  return {
    score: Math.max(0, Math.min(100, score)),
    efficiency, idle, violations, consumption, fuelCost
  };
};

// ---- Insights generation ----
export const generateInsights = (vehicles, compVehicles, trends) => {
  const insights = [];

  // Low efficiency vehicles
  const lowEff = compVehicles.filter(v => (v.efficiency_score || 0) < 50);
  if (lowEff.length > 0) {
    insights.push({
      type: 'danger', icon: 'AlertTriangle',
      title: `${lowEff.length} vehicule${lowEff.length > 1 ? 's' : ''} sous 50% d'efficacite`,
      detail: lowEff.slice(0, 3).map(v => v.label).join(', ') + (lowEff.length > 3 ? '...' : ''),
      impact: Math.round(lowEff.length * 150),
      action: 'Verifier itineraires et comportements de conduite'
    });
  }

  // Offline vehicles
  const offline = vehicles.filter(v => v.connection_status !== 'active' && v.connection_status !== 'idle');
  if (offline.length > 0) {
    insights.push({
      type: 'warning', icon: 'WifiOff',
      title: `${offline.length} vehicule${offline.length > 1 ? 's' : ''} hors ligne`,
      detail: 'Perte de signal GPS — verifier alimentation et connectivite',
      action: 'Inspecter les trackers GPS'
    });
  }

  // High idle
  const highIdle = compVehicles.filter(v => (v.idle_percentage || 0) > 25);
  if (highIdle.length > 0) {
    const idleCostTotal = highIdle.reduce((s, v) => s + calcIdleCost(v), 0);
    insights.push({
      type: 'warning', icon: 'Clock',
      title: `${highIdle.length} vehicule${highIdle.length > 1 ? 's' : ''} avec ralenti excessif (>25%)`,
      detail: highIdle.slice(0, 3).map(v => `${v.label} (${v.idle_percentage}%)`).join(', '),
      impact: Math.round(idleCostTotal),
      action: 'Sensibiliser les conducteurs a couper le moteur'
    });
  }

  // Overconsumption
  const overConsumers = compVehicles.filter(v => (v.fuel_efficiency || 0) > 10);
  if (overConsumers.length > 0) {
    const wasteCost = overConsumers.reduce((s, v) => s + calcOverconsumption(v), 0);
    insights.push({
      type: 'warning', icon: 'Fuel',
      title: `${overConsumers.length} vehicule${overConsumers.length > 1 ? 's' : ''} en surconsommation (>10 L/100)`,
      detail: overConsumers.slice(0, 3).map(v => `${v.label} (${v.fuel_efficiency} L/100)`).join(', '),
      impact: Math.round(wasteCost),
      action: 'Verifier pression pneus, style de conduite, chargement'
    });
  }

  // Speed violations
  const totalViolations = trends?.summary?.total_violations || 0;
  if (totalViolations > 0) {
    insights.push({
      type: 'danger', icon: 'ShieldAlert',
      title: `${totalViolations} exces de vitesse cette semaine`,
      detail: 'Risque securite et amendes',
      action: 'Identifier les conducteurs et former'
    });
  }

  // Under-utilized
  const underUsed = vehicles.filter(v => (v.mileage || 0) < 10 && v.connection_status !== 'active');
  if (underUsed.length > 2) {
    insights.push({
      type: 'info', icon: 'Truck',
      title: `${underUsed.length} vehicules sous-utilises (<10 km)`,
      detail: 'Potentiel de redistribution ou reduction de flotte',
      action: 'Analyser le besoin reel et optimiser les affectations'
    });
  }

  // Best performer
  const sorted = [...compVehicles].sort((a, b) => (b.efficiency_score || 0) - (a.efficiency_score || 0));
  if (sorted.length > 0 && sorted[0].efficiency_score > 60) {
    insights.push({
      type: 'success', icon: 'CheckCircle',
      title: `Meilleur vehicule: ${sorted[0].label}`,
      detail: `Score ${sorted[0].efficiency_score}% — ${sorted[0].total_distance_week} km — ${sorted[0].fuel_efficiency} L/100`,
      action: 'Reference pour benchmarker la flotte'
    });
  }

  return insights;
};

// ---- Risk financial calculations ----
export const calcFinancialRisk = (compVehicles, trends) => {
  const totalIdleMinutes = (trends?.trends || []).reduce((s, d) => s + (d.total_idle_time || 0), 0);
  const idleCost = Math.round((totalIdleMinutes / 60) * IDLE_COST_PER_HOUR);

  const fuelWaste = compVehicles
    .filter(v => (v.fuel_efficiency || 0) > 10)
    .reduce((s, v) => {
      const excess = (v.fuel_efficiency - AVG_FUEL_RATE) * (v.total_distance_week || 0) / 100;
      return s + excess * FUEL_PRICE_CHF;
    }, 0);

  const monthlyEstimate = Math.round((idleCost + fuelWaste) * 4.3);

  return { idleCost, fuelWaste: Math.round(fuelWaste), monthlyEstimate };
};

// ---- Fleet summary ----
export const calcFleetSummary = (vehicles, compVehicles, trends) => {
  const total = vehicles.length;
  const active = vehicles.filter(v => v.connection_status === 'active').length;
  const idle = vehicles.filter(v => v.connection_status === 'idle').length;
  const offline = total - active - idle;
  const totalKm = vehicles.reduce((s, v) => s + (v.mileage || 0), 0);
  const totalEngineH = vehicles.reduce((s, v) => s + (v.engine_hours || 0), 0);

  const avgFuelEff = compVehicles.length > 0
    ? compVehicles.reduce((s, v) => s + (v.fuel_efficiency || 0), 0) / compVehicles.length : 0;

  const totalFuelL = (trends?.summary?.total_fuel || 0);
  const totalFuelCost = Math.round(totalFuelL * FUEL_PRICE_CHF);

  const totalIdleMin = (trends?.trends || []).reduce((s, d) => s + (d.total_idle_time || 0), 0);
  const totalIdleH = totalIdleMin / 60;

  const fleetScore = compVehicles.length > 0
    ? Math.round(compVehicles.reduce((s, v) => s + (v.efficiency_score || 0), 0) / compVehicles.length) : 0;

  const alertCount = compVehicles.filter(v => (v.efficiency_score || 0) < 50).length + offline;
  const violations = trends?.summary?.total_violations || 0;

  return {
    total, active, idle, offline, totalKm, totalEngineH,
    avgFuelEff: avgFuelEff.toFixed(1),
    totalFuelL, totalFuelCost, totalIdleH: totalIdleH.toFixed(1),
    idleCostEstimate: Math.round(totalIdleH * IDLE_COST_PER_HOUR),
    fleetScore, alertCount, violations
  };
};

// ---- Formatting helpers ----
export const formatTime = (seconds) => {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const formatCHF = (value) => {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${value}`;
};

export const getScoreColor = (score) => {
  if (score >= 70) return 'text-emerald-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-500';
};

export const getScoreBg = (score) => {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
};

export const getStatusColor = (status) => {
  if (status === 'active') return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' };
  if (status === 'idle') return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' };
  return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' };
};

export const getStatusLabel = (status) => {
  if (status === 'active') return 'Actif';
  if (status === 'idle') return 'Ralenti';
  return 'Offline';
};

export { FUEL_PRICE_CHF, IDLE_COST_PER_HOUR, AVG_FUEL_RATE };
