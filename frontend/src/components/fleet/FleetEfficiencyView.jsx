import React, { useState, useEffect, useCallback } from "react";
import { API, api } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import {
  Truck, Download, RefreshCw, Clock, MapPin, Gauge, Activity,
  ChevronDown, ChevronUp, Navigation, Fuel, AlertTriangle, Zap,
  Search, Filter, WifiOff, Wifi, DollarSign, ShieldAlert,
  TrendingUp, TrendingDown, Award, XCircle, Eye
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

const FUEL_PRICE = 2.0;

// ============ KPI CARD ============
const KPI = ({ label, value, unit, icon: Icon, color, subtitle }) => (
  <div className="kpi-card bg-white rounded-xl p-5 min-h-[110px] flex flex-col justify-between">
    <div className="flex items-center gap-1.5">
      <Icon size={13} className="text-gray-400" />
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{label}</span>
    </div>
    <div>
      <div className={`text-2xl font-semibold tracking-tight ${color || 'text-gray-900'}`} style={{ fontFamily: 'Outfit, sans-serif' }}>
        {value}{unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
      </div>
      {subtitle && <div className="text-[10px] text-gray-400 mt-0.5">{subtitle}</div>}
    </div>
  </div>
);

// ============ VEHICLE CARD (Top/Worst) ============
const VehicleRankCard = ({ vehicle, rank, type }) => {
  const isTop = type === 'top';
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white ${
        isTop ? (rank === 1 ? 'bg-emerald-600' : 'bg-emerald-400') : (rank === 1 ? 'bg-red-500' : 'bg-red-400')
      }`}>{rank}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{vehicle.label}</div>
        <div className="text-[10px] text-gray-400">{vehicle.model || '-'} | {(vehicle.mileage || vehicle.total_distance_week || 0).toFixed(0)} km</div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-bold tabular-nums ${
          vehicle.efficiency_score >= 70 ? 'text-emerald-600' : vehicle.efficiency_score >= 40 ? 'text-amber-600' : 'text-red-500'
        }`}>{vehicle.efficiency_score}%</div>
        <div className="text-[10px] text-gray-400">{vehicle.fuel_efficiency || '-'} L/100</div>
      </div>
    </div>
  );
};

// ============ MAIN FLEET VIEW ============
export const FleetEfficiencyView = ({ onMenuClick }) => {
  const [stats, setStats] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [efficiency, setEfficiency] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');
  const [fromDate, setFromDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedVehicle, setExpandedVehicle] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('mileage');
  const [sortDir, setSortDir] = useState('desc');

  const fetchData = useCallback(async (from, to) => {
    setLoading(true);
    try {
      const [statsRes, compRes, effRes] = await Promise.all([
        api.get(`${API}/fleet/stats`, { params: { from_date: from || fromDate, to_date: to || toDate } }),
        api.get(`${API}/analytics/vehicle-comparison`),
        api.get(`${API}/fleet/efficiency`, { params: { date: from || fromDate, period: period === 'today' ? 'day' : period } })
      ]);
      if (statsRes.data.success) setStats(statsRes.data);
      if (compRes.data.success) setComparison(compRes.data);
      if (effRes.data.success) setEfficiency(effRes.data);
    } catch (error) { console.error("Fleet fetch error:", error); }
    setLoading(false);
  }, [fromDate, toDate, period]);

  useEffect(() => { fetchData(); }, []);
  const handlePeriodApply = (from, to) => fetchData(from, to);

  const formatTime = (seconds) => {
    if (!seconds) return '-';
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const exportReport = async (format) => {
    try {
      const response = await api.get(`${API}/export/fleet-stats`, {
        params: { from_date: fromDate, to_date: toDate, format }, responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fleet_stats_${fromDate}_${toDate}.${format}`);
      document.body.appendChild(link); link.click(); link.remove();
    } catch (error) { console.error("Export error:", error); }
  };

  // Enrich vehicles with comparison data
  const compMap = {};
  (comparison?.vehicles || []).forEach(v => { compMap[v.tracker_id] = v; });

  const vehicles = (stats?.vehicles || []).map(v => ({
    ...v, ...(compMap[v.tracker_id] || {}),
    efficiency_score: compMap[v.tracker_id]?.efficiency_score || v.efficiency || 0
  }));

  const effMap = {};
  (efficiency?.vehicles || []).forEach(v => { effMap[v.tracker_id] = v; });

  // Filtered & sorted
  const filtered = vehicles
    .filter(v => {
      if (search && !v.label.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus === 'active' && v.connection_status !== 'active') return false;
      if (filterStatus === 'offline' && v.connection_status === 'active') return false;
      if (filterStatus === 'attention' && v.efficiency_score >= 50) return false;
      return true;
    })
    .sort((a, b) => {
      let va = a[sortBy] || 0, vb = b[sortBy] || 0;
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  // Top and worst performers
  const sortedByScore = [...(comparison?.vehicles || [])].sort((a, b) => b.efficiency_score - a.efficiency_score);
  const topPerformers = sortedByScore.slice(0, 3);
  const worstPerformers = sortedByScore.slice(-3).reverse();

  // Derived KPIs
  const totalVehicles = vehicles.length;
  const activeCount = vehicles.filter(v => v.connection_status === 'active').length;
  const offlineCount = totalVehicles - activeCount;
  const totalKm = stats?.summary?.total_mileage || 0;
  const totalEngineH = stats?.summary?.total_engine_hours || 0;
  const totalFuelCost = Math.round(totalKm * 8.5 / 100 * FUEL_PRICE);
  const underUsed = vehicles.filter(v => v.mileage < 10 && v.connection_status !== 'active').length;

  // Consumption chart data
  const consumptionData = (comparison?.vehicles || [])
    .filter(v => v.fuel_efficiency > 0)
    .sort((a, b) => b.fuel_efficiency - a.fuel_efficiency)
    .slice(0, 8)
    .map(v => ({ name: v.label.length > 12 ? v.label.substring(0, 12) + '...' : v.label, conso: v.fuel_efficiency }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]" data-testid="loading">
        <RefreshCw className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  return (
    <div data-testid="fleet-efficiency-view">
      <Header title="Fleet / Vehicules" subtitle={`${totalVehicles} vehicules — ${activeCount} actifs`}
        onMenuClick={onMenuClick} onRefresh={() => fetchData()}>
        <PeriodSelector period={period} setPeriod={setPeriod} fromDate={fromDate} setFromDate={setFromDate}
          toDate={toDate} setToDate={setToDate} onApply={handlePeriodApply} />
        <button onClick={() => exportReport('csv')}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-xs font-medium text-gray-600">
          <Download size={13} /> CSV
        </button>
      </Header>

      <div className="p-4 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <KPI label="Total vehicules" value={totalVehicles} icon={Truck} />
          <KPI label="Actifs" value={activeCount} icon={Wifi} color="text-emerald-600" />
          <KPI label="Hors ligne" value={offlineCount} icon={WifiOff} color={offlineCount > 0 ? 'text-red-500' : 'text-gray-400'} />
          <KPI label="Sous-utilises" value={underUsed} icon={XCircle} color={underUsed > 0 ? 'text-amber-600' : 'text-gray-400'} subtitle="< 10 km sur la periode" />
          <KPI label="Distance totale" value={totalKm.toFixed(0)} unit="km" icon={MapPin} />
          <KPI label="Heures moteur" value={totalEngineH.toFixed(0)} unit="h" icon={Activity} />
          <KPI label="Cout carburant" value={totalFuelCost.toLocaleString('fr-FR')} unit="CHF" icon={DollarSign} subtitle={`~8.5 L/100 x ${FUEL_PRICE} CHF/L`} />
        </div>

        {/* Top/Worst + Consumption chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Award size={14} className="text-emerald-500" />
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Top Performers</h4>
            </div>
            <div className="space-y-2">
              {topPerformers.map((v, i) => <VehicleRankCard key={v.tracker_id} vehicle={v} rank={i + 1} type="top" />)}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-red-500" />
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Worst Performers</h4>
            </div>
            <div className="space-y-2">
              {worstPerformers.map((v, i) => <VehicleRankCard key={v.tracker_id} vehicle={v} rank={i + 1} type="worst" />)}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Consommation par vehicule</h4>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={consumptionData} layout="vertical" barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#8A8A8E' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#5E5E62' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 11 }} formatter={(v) => [`${v} L/100km`, 'Conso']} />
                <Bar dataKey="conso" fill="#F59E0B" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Main Fleet Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Tous les vehicules ({filtered.length})
            </h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 w-44" data-testid="fleet-search" />
              </div>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none" data-testid="fleet-filter">
                <option value="all">Tous</option>
                <option value="active">Actifs</option>
                <option value="offline">Hors ligne</option>
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
                    { key: 'total_odometer', label: 'Odometre' },
                    { key: 'engine_hours', label: 'Moteur' },
                    { key: 'fuel_efficiency', label: 'Conso.' },
                    { key: 'idle_percentage', label: 'Ralenti' },
                    { key: 'last_update', label: 'Dern. comm.' },
                  ].map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-gray-400 cursor-pointer hover:text-gray-600 select-none whitespace-nowrap">
                      <span className="flex items-center gap-1">{col.label}
                        {sortBy === col.key && (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => {
                  const eff = effMap[v.tracker_id] || {};
                  const isExpanded = expandedVehicle === v.tracker_id;
                  return (
                    <React.Fragment key={v.tracker_id}>
                      <tr className={`fleet-row border-b border-gray-50 cursor-pointer ${isExpanded ? 'bg-gray-50' : ''}`}
                        onClick={() => setExpandedVehicle(isExpanded ? null : v.tracker_id)} data-testid={`fleet-row-${v.tracker_id}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ChevronDown size={12} className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                            <div>
                              <div className="text-sm font-medium text-gray-900">{v.label}</div>
                              <div className="text-[10px] text-gray-400">{v.model || '-'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                            v.connection_status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : v.connection_status === 'idle' ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-gray-50 text-gray-600 border-gray-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              v.connection_status === 'active' ? 'bg-emerald-500 pulse-dot'
                              : v.connection_status === 'idle' ? 'bg-amber-500' : 'bg-gray-400'
                            }`} />
                            {v.connection_status === 'active' ? 'Actif' : v.connection_status === 'idle' ? 'Ralenti' : 'Offline'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${v.efficiency_score >= 70 ? 'bg-emerald-500' : v.efficiency_score >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(100, v.efficiency_score)}%` }} />
                            </div>
                            <span className={`text-xs font-semibold tabular-nums ${v.efficiency_score >= 70 ? 'text-emerald-600' : v.efficiency_score >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                              {v.efficiency_score}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className="text-xs text-gray-700 tabular-nums font-medium">{(v.mileage || 0).toFixed(1)} km</span></td>
                        <td className="px-4 py-3"><span className="text-[10px] text-gray-500 tabular-nums">{((v.total_odometer || 0)).toLocaleString('fr-FR')} km</span></td>
                        <td className="px-4 py-3"><span className="text-xs text-gray-600 tabular-nums">{(v.engine_hours || 0).toFixed(0)}h</span></td>
                        <td className="px-4 py-3"><span className={`text-xs tabular-nums font-medium ${(v.fuel_efficiency || 0) > 10 ? 'text-amber-600' : 'text-gray-700'}`}>{v.fuel_efficiency || '-'}</span></td>
                        <td className="px-4 py-3"><span className={`text-xs tabular-nums font-medium ${(v.idle_percentage || 0) > 25 ? 'text-amber-600' : 'text-gray-700'}`}>{v.idle_percentage || 0}%</span></td>
                        <td className="px-4 py-3"><span className="text-[10px] text-gray-400">{v.last_update ? new Date(v.last_update).toLocaleDateString('fr-FR') : '-'}</span></td>
                      </tr>

                      {isExpanded && (
                        <tr><td colSpan={9} className="px-0 py-0">
                          <div className="bg-gray-50 border-b border-gray-200 px-6 py-5">
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                              {[
                                { label: 'Distance (periode)', value: `${(v.mileage || 0).toFixed(1)} km`, icon: MapPin, ic: 'text-blue-500' },
                                { label: 'Odometre total', value: `${((v.total_odometer || 0)).toLocaleString('fr-FR')} km`, icon: Navigation, ic: 'text-gray-500' },
                                { label: 'Heures moteur', value: `${(v.engine_hours || 0).toFixed(0)} h`, icon: Zap, ic: 'text-purple-500' },
                                { label: 'Vitesse actuelle', value: `${v.speed || 0} km/h`, icon: Gauge, ic: 'text-blue-500' },
                                { label: 'Consommation', value: `${v.fuel_efficiency || '-'} L/100`, icon: Fuel, ic: 'text-amber-500' },
                                { label: 'Ralenti', value: `${v.idle_percentage || 0}%`, icon: Clock, ic: (v.idle_percentage || 0) > 25 ? 'text-amber-500' : 'text-gray-500' },
                                { label: 'Cout carburant', value: `${Math.round((v.mileage || 0) * (v.fuel_efficiency || 8) / 100 * FUEL_PRICE)} CHF`, icon: DollarSign, ic: 'text-gray-500' },
                              ].map((item, idx) => (
                                <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                                  <div className="flex items-center gap-1 mb-1">
                                    <item.icon size={11} className={item.ic} />
                                    <span className="text-[9px] text-gray-400 uppercase tracking-wider">{item.label}</span>
                                  </div>
                                  <div className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>{item.value}</div>
                                </div>
                              ))}
                            </div>
                            {/* Efficiency breakdown */}
                            {eff.driving_time !== undefined && (
                              <div className="mt-3 bg-white rounded-lg border border-gray-200 p-3">
                                <div className="flex items-center gap-4 text-xs">
                                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-400" /><span className="text-gray-600">Conduite: {formatTime(eff.driving_time)}</span></div>
                                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-400" /><span className="text-gray-600">Ralenti: {formatTime(eff.idle_time)}</span></div>
                                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-gray-300" /><span className="text-gray-600">Arrete: {formatTime(eff.stopped_time)}</span></div>
                                </div>
                                <div className="mt-2 w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                                  <div className="h-full bg-emerald-400" style={{ width: `${(eff.driving_time / 864) || 0}%` }} />
                                  <div className="h-full bg-amber-400" style={{ width: `${(eff.idle_time / 864) || 0}%` }} />
                                  <div className="h-full bg-gray-300 flex-1" />
                                </div>
                              </div>
                            )}
                            <div className="mt-2 text-[10px] text-gray-400">
                              {v.last_update && `MAJ: ${new Date(v.last_update).toLocaleString('fr-FR')}`}
                              {v.location && v.location.lat !== 0 && ` | GPS: ${v.location.lat?.toFixed(4)}, ${v.location.lng?.toFixed(4)}`}
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">Aucun vehicule trouve</div>}
        </div>
      </div>
    </div>
  );
};
