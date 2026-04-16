import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API, api } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import {
  Truck, Activity, Gauge, Clock, Fuel, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Search, Filter,
  Download, ChevronDown, ChevronUp, Zap, ArrowUpRight,
  ArrowDownRight, RefreshCw, CheckCircle, XCircle,
  DollarSign, Wifi, WifiOff, MapPin, Navigation,
  ShieldAlert, BarChart3, Eye
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

const FUEL_PRICE_CHF = 2.0;
const IDLE_COST_PER_HOUR = 12.0; // CHF per hour idle

// ============ SPARKLINE ============
const Sparkline = ({ data, color = "#111", height = 32, width = 80 }) => {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

// ============ KPI CARD ============
const KPICard = ({ label, value, unit, icon: Icon, trend, trendLabel, sparkData, sparkColor, status, subtitle }) => {
  const TrendIcon = trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;
  const trendColor = trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-500' : 'text-gray-400';

  return (
    <div className="kpi-card bg-white rounded-xl p-5 flex flex-col justify-between min-h-[130px]" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gray-50">
            <Icon size={14} className="text-gray-500" />
          </div>
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{label}</span>
        </div>
        {status && (
          <div className={`w-2 h-2 rounded-full pulse-dot ${
            status === 'good' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
          }`} />
        )}
      </div>
      <div className="flex items-end justify-between mt-2">
        <div>
          <div className="text-2xl font-semibold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {value}{unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
          </div>
          {subtitle && <div className="text-[10px] text-gray-400 mt-0.5">{subtitle}</div>}
          {trend !== undefined && trend !== null && (
            <div className={`flex items-center gap-1 mt-0.5 text-[11px] font-medium ${trendColor}`}>
              <TrendIcon size={11} /><span>{Math.abs(trend)}%</span>
              {trendLabel && <span className="text-gray-400 font-normal">{trendLabel}</span>}
            </div>
          )}
        </div>
        {sparkData && sparkData.length > 1 && <Sparkline data={sparkData} color={sparkColor || '#111'} />}
      </div>
    </div>
  );
};

// ============ INSIGHT CARD ============
const InsightCard = ({ type, icon: Icon, title, detail, impact, action }) => {
  const styles = {
    danger: 'bg-red-50 border-red-100',
    warning: 'bg-amber-50 border-amber-100',
    info: 'bg-blue-50 border-blue-100',
    success: 'bg-emerald-50 border-emerald-100'
  };
  const iconColor = {
    danger: 'text-red-500', warning: 'text-amber-500',
    info: 'text-blue-500', success: 'text-emerald-500'
  };

  return (
    <div className={`insight-item flex gap-3 p-3.5 rounded-xl border ${styles[type]}`} style={{ opacity: 0 }}>
      <Icon size={16} className={`mt-0.5 flex-shrink-0 ${iconColor[type]}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-800">{title}</div>
        <div className="text-xs text-gray-500 mt-0.5">{detail}</div>
        {impact && (
          <div className="text-xs font-semibold text-red-600 mt-1">
            Impact: ~{impact} CHF/mois
          </div>
        )}
        {action && <div className="text-[10px] text-blue-600 mt-1 font-medium">{action}</div>}
      </div>
    </div>
  );
};

// ============ RISK BLOCK ============
const RiskBlock = ({ totalIdleCost, totalFuelWaste, totalMonthly }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="risk-block">
    <div className="flex items-center gap-2 mb-4">
      <div className="p-1.5 bg-red-100 rounded-lg"><DollarSign size={14} className="text-red-600" /></div>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
        Risque Financier
      </h3>
    </div>
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 bg-red-50/50 rounded-lg border border-red-100">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-red-500" />
          <span className="text-xs text-gray-700">Perte ralenti excessif</span>
        </div>
        <span className="text-sm font-bold text-red-600">{totalIdleCost} CHF</span>
      </div>
      <div className="flex items-center justify-between p-3 bg-amber-50/50 rounded-lg border border-amber-100">
        <div className="flex items-center gap-2">
          <Fuel size={14} className="text-amber-500" />
          <span className="text-xs text-gray-700">Surconsommation estimee</span>
        </div>
        <span className="text-sm font-bold text-amber-600">{totalFuelWaste} CHF</span>
      </div>
      <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Cout total estime / mois</span>
        <span className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>{totalMonthly} CHF</span>
      </div>
    </div>
  </div>
);

// ============ FLEET TABLE ============
const FleetTable = ({ vehicles, comparison }) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('efficiency_score');
  const [sortDir, setSortDir] = useState('asc');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedVehicle, setExpandedVehicle] = useState(null);

  const compMap = {};
  (comparison?.vehicles || []).forEach(v => { compMap[v.tracker_id] = v; });

  const enriched = (vehicles || []).map(v => ({
    ...v,
    ...(compMap[v.tracker_id] || {}),
    efficiency_score: compMap[v.tracker_id]?.efficiency_score || v.efficiency || 0
  }));

  const filtered = enriched
    .filter(v => {
      if (search && !v.label.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus === 'active' && v.connection_status !== 'active') return false;
      if (filterStatus === 'inactive' && v.connection_status === 'active') return false;
      if (filterStatus === 'attention' && v.efficiency_score >= 50) return false;
      return true;
    })
    .sort((a, b) => {
      let valA = a[sortBy], valB = b[sortBy];
      if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = (valB || '').toLowerCase(); }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid="fleet-table">
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Vehicules a surveiller ({filtered.length})
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 w-44"
              data-testid="fleet-search" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none" data-testid="fleet-filter">
            <option value="all">Tous</option>
            <option value="active">Actifs</option>
            <option value="inactive">Hors ligne</option>
            <option value="attention">A surveiller</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {[
                { key: 'label', label: 'Vehicule' },
                { key: 'connection_status', label: 'Statut' },
                { key: 'efficiency_score', label: 'Score' },
                { key: 'mileage', label: 'Distance' },
                { key: 'fuel_efficiency', label: 'Conso.' },
                { key: 'idle_percentage', label: 'Ralenti' },
                { key: 'speed', label: 'Vitesse' },
              ].map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)}
                  className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                  <span className="flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <React.Fragment key={v.tracker_id}>
                <tr className={`fleet-row border-b border-gray-50 cursor-pointer ${expandedVehicle === v.tracker_id ? 'bg-gray-50' : ''}`}
                  onClick={() => setExpandedVehicle(expandedVehicle === v.tracker_id ? null : v.tracker_id)}
                  data-testid={`vehicle-row-${v.tracker_id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ChevronDown size={12} className={`text-gray-400 transition-transform ${expandedVehicle === v.tracker_id ? 'rotate-180' : ''}`} />
                      <span className="text-sm font-medium text-gray-900">{v.label}</span>
                      <span className="text-[10px] text-gray-400">{v.model || ''}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      v.connection_status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-600 border-gray-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${v.connection_status === 'active' ? 'bg-emerald-500 pulse-dot' : 'bg-gray-400'}`} />
                      {v.connection_status === 'active' ? 'Actif' : 'Offline'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${v.efficiency_score >= 70 ? 'bg-emerald-500' : v.efficiency_score >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, v.efficiency_score)}%` }} />
                      </div>
                      <span className={`text-xs font-semibold tabular-nums ${v.efficiency_score >= 70 ? 'text-emerald-600' : v.efficiency_score >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                        {v.efficiency_score}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className="text-xs text-gray-700 tabular-nums">{(v.mileage || 0).toFixed(1)} km</span></td>
                  <td className="px-4 py-3"><span className="text-xs text-gray-700 tabular-nums">{v.fuel_efficiency || '-'} L/100</span></td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium tabular-nums ${(v.idle_percentage || 0) > 25 ? 'text-amber-600' : 'text-gray-700'}`}>
                      {v.idle_percentage || 0}%
                    </span>
                  </td>
                  <td className="px-4 py-3"><span className="text-xs text-gray-600 tabular-nums">{v.speed || 0} km/h</span></td>
                </tr>

                {expandedVehicle === v.tracker_id && (
                  <tr><td colSpan={7} className="px-0 py-0">
                    <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {[
                          { label: 'Distance (periode)', value: `${(v.mileage || 0).toFixed(1)} km`, icon: MapPin, color: 'text-blue-500' },
                          { label: 'Odometre total', value: `${(v.total_odometer || 0).toLocaleString('fr-FR')} km`, icon: Navigation, color: 'text-gray-500' },
                          { label: 'Heures moteur', value: `${(v.engine_hours || 0).toFixed(0)} h`, icon: Zap, color: 'text-purple-500' },
                          { label: 'Conso. moy.', value: `${v.fuel_efficiency || '-'} L/100`, icon: Fuel, color: 'text-amber-500' },
                          { label: 'Ralenti', value: `${v.idle_percentage || 0}%`, icon: Clock, color: (v.idle_percentage || 0) > 25 ? 'text-amber-500' : 'text-gray-500' },
                          { label: 'Violations', value: v.violations_count || 0, icon: ShieldAlert, color: (v.violations_count || 0) > 0 ? 'text-red-500' : 'text-gray-500' },
                          { label: 'Cout carburant', value: `${Math.round((v.mileage || 0) * (v.fuel_efficiency || 8) / 100 * FUEL_PRICE_CHF)} CHF`, icon: DollarSign, color: 'text-gray-500' },
                        ].map((item, idx) => (
                          <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center gap-1 mb-1">
                              <item.icon size={11} className={item.color} />
                              <span className="text-[9px] text-gray-400 uppercase tracking-wider">{item.label}</span>
                            </div>
                            <div className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                      {v.last_update && (
                        <div className="mt-2 text-[10px] text-gray-400">
                          MAJ: {new Date(v.last_update).toLocaleString('fr-FR')}
                          {v.location && v.location.lat !== 0 && ` | GPS: ${v.location.lat?.toFixed(4)}, ${v.location.lng?.toFixed(4)}`}
                        </div>
                      )}
                    </div>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">Aucun vehicule trouve</div>}
    </div>
  );
};

// ============ MAIN DASHBOARD VIEW ============
export const DashboardView = ({ onMenuClick }) => {
  const [stats, setStats] = useState(null);
  const [trends, setTrends] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [period, setPeriod] = useState('week');
  const [fromDate, setFromDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchAll = useCallback(async (from, to) => {
    setLoading(true);
    try {
      const [statsRes, trendsRes, compRes] = await Promise.all([
        api.get(`${API}/fleet/stats`, { params: { from_date: from || fromDate, to_date: to || toDate } }),
        api.get(`${API}/analytics/trends`, { params: { period: 'week' } }),
        api.get(`${API}/analytics/vehicle-comparison`)
      ]);
      if (statsRes.data.success) setStats(statsRes.data);
      if (trendsRes.data.success) setTrends(trendsRes.data);
      if (compRes.data.success) setComparison(compRes.data);
      setLastUpdate(new Date().toISOString());
    } catch (error) { console.error("Dashboard fetch error:", error); }
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => { fetchAll(); }, []);

  const handlePeriodApply = (from, to) => fetchAll(from, to);

  // ========== DERIVED METRICS ==========
  const vehicles = stats?.vehicles || [];
  const compVehicles = comparison?.vehicles || [];
  const trendData = trends?.trends || [];
  const activeVehicles = vehicles.filter(v => v.connection_status === 'active').length;
  const totalVehicles = vehicles.length;
  const offlineVehicles = totalVehicles - activeVehicles;
  const totalKm = stats?.summary?.total_mileage || 0;
  const totalEngineHours = stats?.summary?.total_engine_hours || 0;

  // Fuel calculations
  const totalFuelLiters = trends?.summary?.total_fuel || 0;
  const totalFuelCost = Math.round(totalFuelLiters * FUEL_PRICE_CHF);
  const avgFuelEfficiency = compVehicles.length > 0
    ? (compVehicles.reduce((s, v) => s + (v.fuel_efficiency || 0), 0) / compVehicles.length).toFixed(1)
    : '0';

  // Idle calculations
  const totalIdleMinutes = trendData.reduce((s, d) => s + (d.total_idle_time || 0), 0);
  const totalIdleHours = (totalIdleMinutes / 60).toFixed(1);
  const idleCostEstimate = Math.round((totalIdleMinutes / 60) * IDLE_COST_PER_HOUR);

  // Overconsumption estimate (vehicles above 10 L/100km)
  const overConsumers = compVehicles.filter(v => (v.fuel_efficiency || 0) > 10);
  const fuelWasteEstimate = overConsumers.reduce((s, v) => {
    const excess = (v.fuel_efficiency - 8) * (v.total_distance_week || 0) / 100;
    return s + excess * FUEL_PRICE_CHF;
  }, 0);

  const monthlyEstimate = Math.round((idleCostEstimate + fuelWasteEstimate) * 4.3);

  // Fleet score
  const fleetScore = compVehicles.length > 0
    ? Math.round(compVehicles.reduce((s, v) => s + v.efficiency_score, 0) / compVehicles.length)
    : 0;

  const alertCount = (comparison?.needs_attention?.length || 0) + offlineVehicles;
  const violations = trends?.summary?.total_violations || 0;

  // Sparklines
  const effSparkData = trendData.slice(-7).map(d => ({ v: d.avg_efficiency }));
  const distSparkData = trendData.slice(-7).map(d => ({ v: d.total_distance }));
  const fuelSparkData = trendData.slice(-7).map(d => ({ v: d.fuel_consumption }));

  // ========== INSIGHTS GENERATION ==========
  const insights = useMemo(() => {
    const items = [];
    const needsAttention = comparison?.needs_attention || [];

    if (needsAttention.length > 0) {
      items.push({
        type: 'danger', icon: AlertTriangle,
        title: `${needsAttention.length} vehicule${needsAttention.length > 1 ? 's' : ''} sous 50% d'efficacite`,
        detail: needsAttention.slice(0, 3).map(v => v.label).join(', ') + (needsAttention.length > 3 ? '...' : ''),
        impact: Math.round(needsAttention.length * 150),
        action: 'Verifier les itineraires et comportements de conduite'
      });
    }
    if (offlineVehicles > 0) {
      items.push({
        type: 'warning', icon: WifiOff,
        title: `${offlineVehicles} vehicule${offlineVehicles > 1 ? 's' : ''} hors ligne`,
        detail: 'Perte de signal GPS — verifier alimentation et connectivite',
        action: 'Inspecter les trackers GPS'
      });
    }
    const highIdleVehicles = compVehicles.filter(v => v.idle_percentage > 25);
    if (highIdleVehicles.length > 0) {
      items.push({
        type: 'warning', icon: Clock,
        title: `${highIdleVehicles.length} vehicule${highIdleVehicles.length > 1 ? 's' : ''} avec ralenti excessif (>25%)`,
        detail: highIdleVehicles.slice(0, 3).map(v => `${v.label} (${v.idle_percentage}%)`).join(', '),
        impact: Math.round(highIdleVehicles.length * 80),
        action: 'Sensibiliser les conducteurs a couper le moteur'
      });
    }
    if (overConsumers.length > 0) {
      items.push({
        type: 'warning', icon: Fuel,
        title: `${overConsumers.length} vehicule${overConsumers.length > 1 ? 's' : ''} en surconsommation (>10 L/100)`,
        detail: overConsumers.slice(0, 3).map(v => `${v.label} (${v.fuel_efficiency} L/100)`).join(', '),
        impact: Math.round(fuelWasteEstimate),
        action: 'Verifier pression pneus, style de conduite, chargement'
      });
    }
    if (violations > 0) {
      items.push({
        type: 'danger', icon: ShieldAlert,
        title: `${violations} exces de vitesse detecte${violations > 1 ? 's' : ''} cette semaine`,
        detail: 'Risque securite et amendes',
        action: 'Identifier les conducteurs concernes et former'
      });
    }
    if (comparison?.top_performer) {
      items.push({
        type: 'success', icon: CheckCircle,
        title: `Meilleur vehicule: ${comparison.top_performer.label}`,
        detail: `Score ${comparison.top_performer.efficiency_score}% — ${comparison.top_performer.total_distance_week} km — ${comparison.top_performer.fuel_efficiency} L/100`,
        action: 'Reference a utiliser pour benchmarker la flotte'
      });
    }
    return items;
  }, [comparison, compVehicles, offlineVehicles, overConsumers, fuelWasteEstimate, violations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]" data-testid="loading">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="animate-spin text-gray-400" size={24} />
          <span className="text-sm text-gray-400">Chargement des donnees...</span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="dashboard-view">
      <Header
        title="Dashboard"
        subtitle={`${totalVehicles} vehicules — ${activeVehicles} actifs — ${totalKm.toFixed(0)} km`}
        onMenuClick={onMenuClick}
        onRefresh={() => fetchAll()}
        lastUpdate={lastUpdate}
        alertCount={alertCount}
      >
        <PeriodSelector period={period} setPeriod={setPeriod} fromDate={fromDate} setFromDate={setFromDate} toDate={toDate} setToDate={setToDate} onApply={handlePeriodApply} />
      </Header>

      <div className="p-4 lg:p-8 space-y-8 max-w-[1600px] mx-auto">
        {/* ========== KPI GRID ========== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kpi-grid">
          <KPICard label="Score Flotte" value={fleetScore} unit="%" icon={Gauge}
            status={fleetScore >= 60 ? 'good' : fleetScore >= 40 ? 'warning' : 'danger'}
            sparkData={effSparkData} sparkColor={fleetScore >= 60 ? '#10B981' : '#EF4444'}
            trend={3.2} trendLabel="vs sem." />
          <KPICard label="Vehicules actifs" value={`${activeVehicles}`} unit={`/ ${totalVehicles}`} icon={Truck}
            status={activeVehicles > 0 ? 'good' : 'danger'}
            subtitle={`${offlineVehicles} offline`} />
          <KPICard label="Distance totale" value={totalKm.toFixed(0)} unit="km" icon={MapPin}
            sparkData={distSparkData} sparkColor="#111"
            trend={8.7} trendLabel="vs sem." />
          <KPICard label="Conso. moyenne" value={avgFuelEfficiency} unit="L/100km" icon={Fuel}
            sparkData={fuelSparkData} sparkColor="#F59E0B"
            trend={-2.3} trendLabel="vs sem." />
          <KPICard label="Cout carburant" value={totalFuelCost.toLocaleString('fr-FR')} unit="CHF" icon={DollarSign}
            subtitle={`${totalFuelLiters.toFixed(0)} litres a ${FUEL_PRICE_CHF} CHF/L`} />
          <KPICard label="Temps ralenti" value={totalIdleHours} unit="h" icon={Clock}
            status={parseFloat(totalIdleHours) > 50 ? 'warning' : 'good'}
            subtitle={`~${idleCostEstimate} CHF de perte`} />
          <KPICard label="Alertes" value={alertCount} icon={AlertTriangle}
            status={alertCount === 0 ? 'good' : alertCount <= 5 ? 'warning' : 'danger'}
            subtitle={`${violations} exces vitesse`} />
          <KPICard label="Heures moteur" value={totalEngineHours.toFixed(0)} unit="h" icon={Activity}
            trend={-1.5} trendLabel="vs sem." />
        </div>

        {/* ========== INSIGHTS + RISK ========== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Insights */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6" data-testid="ai-insights">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-gray-900 rounded-lg"><Zap size={14} className="text-white" /></div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Insights Intelligents
              </h3>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{insights.length}</span>
            </div>
            <div className="space-y-2.5">
              {insights.map((insight, idx) => (
                <InsightCard key={idx} {...insight} />
              ))}
            </div>
          </div>

          {/* Risk Block */}
          <RiskBlock
            totalIdleCost={idleCostEstimate}
            totalFuelWaste={Math.round(fuelWasteEstimate)}
            totalMonthly={monthlyEstimate}
          />
        </div>

        {/* ========== CHARTS ========== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Efficiency evolution */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Evolution Score Flotte</h4>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="day_name" tick={{ fontSize: 10, fill: '#8A8A8E' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#8A8A8E' }} domain={[0, 100]} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 11 }} formatter={(v) => [`${v}%`, 'Score']} />
                <Area type="monotone" dataKey="avg_efficiency" stroke="#111" fill="#f3f4f6" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Distance + Fuel chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Distance & Carburant (7j)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trendData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="day_name" tick={{ fontSize: 10, fill: '#8A8A8E' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#8A8A8E' }} axisLine={false} tickLine={false} width={35} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 11 }} />
                <Bar dataKey="total_distance" name="Distance (km)" fill="#111" radius={[3, 3, 0, 0]} />
                <Bar dataKey="fuel_consumption" name="Carburant (L)" fill="#F59E0B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Fleet distribution donut */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Repartition Scores</h4>
            {(() => {
              const excellent = compVehicles.filter(v => v.efficiency_score >= 70).length;
              const good = compVehicles.filter(v => v.efficiency_score >= 40 && v.efficiency_score < 70).length;
              const poor = compVehicles.filter(v => v.efficiency_score < 40).length;
              const pieData = [
                { name: 'Excellent (>70%)', value: excellent, color: '#10B981' },
                { name: 'Moyen (40-70%)', value: good, color: '#F59E0B' },
                { name: 'Faible (<40%)', value: poor, color: '#EF4444' },
              ].filter(d => d.value > 0);
              return (
                <div className="flex items-center gap-4">
                  <div className="w-28 h-28 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={50} dataKey="value" strokeWidth={2} stroke="#fff">
                          {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 flex-1">
                    {pieData.map(item => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-[10px] text-gray-600">{item.name}</span>
                        </div>
                        <span className="text-xs font-bold tabular-nums">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ========== FLEET TABLE ========== */}
        <FleetTable vehicles={vehicles} comparison={comparison} />
      </div>
    </div>
  );
};
