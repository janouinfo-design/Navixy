import React, { useState, useEffect, useCallback } from "react";
import { API, api } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import {
  Truck, Activity, Gauge, Clock, Fuel, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Search, Filter,
  Download, ChevronDown, ChevronUp, Zap, ArrowUpRight,
  ArrowDownRight, RefreshCw, Info, CheckCircle, XCircle
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

// ============ SPARKLINE COMPONENT ============
const Sparkline = ({ data, color = "#111", height = 32, width = 80 }) => {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

// ============ KPI CARD ============
const KPICard = ({ label, value, unit, icon: Icon, trend, trendLabel, sparkData, sparkColor, status }) => {
  const getTrendColor = (t) => {
    if (t === undefined || t === null) return 'text-gray-400';
    if (t > 0) return 'text-emerald-600';
    if (t < 0) return 'text-red-500';
    return 'text-gray-400';
  };

  const getTrendIcon = (t) => {
    if (t === undefined || t === null) return Minus;
    if (t > 0) return ArrowUpRight;
    if (t < 0) return ArrowDownRight;
    return Minus;
  };

  const TrendIcon = getTrendIcon(trend);

  return (
    <div className="kpi-card bg-white rounded-xl p-5 flex flex-col justify-between min-h-[140px]" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gray-50">
            <Icon size={16} className="text-gray-500" />
          </div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        </div>
        {status && (
          <div className={`w-2 h-2 rounded-full pulse-dot ${
            status === 'good' ? 'bg-emerald-500' :
            status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
          }`} />
        )}
      </div>

      <div className="flex items-end justify-between mt-3">
        <div>
          <div className="text-2xl lg:text-3xl font-semibold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {value}
            {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
          </div>
          {trend !== undefined && trend !== null && (
            <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${getTrendColor(trend)}`}>
              <TrendIcon size={12} />
              <span>{Math.abs(trend)}%</span>
              {trendLabel && <span className="text-gray-400 font-normal">{trendLabel}</span>}
            </div>
          )}
        </div>
        {sparkData && sparkData.length > 1 && (
          <Sparkline data={sparkData} color={sparkColor || '#111'} />
        )}
      </div>
    </div>
  );
};

// ============ AI INSIGHTS ============
const AIInsights = ({ stats, comparison }) => {
  const insights = [];

  if (comparison?.needs_attention?.length > 0) {
    insights.push({
      type: 'danger',
      icon: AlertTriangle,
      text: `${comparison.needs_attention.length} vehicule${comparison.needs_attention.length > 1 ? 's' : ''} avec efficacite < 50%`,
      detail: comparison.needs_attention.map(v => v.label).join(', ')
    });
  }

  const offlineCount = stats?.vehicles?.filter(v => v.connection_status !== 'active').length || 0;
  if (offlineCount > 0) {
    insights.push({
      type: 'warning',
      icon: XCircle,
      text: `${offlineCount} vehicule${offlineCount > 1 ? 's' : ''} hors ligne`,
      detail: 'Verifier la connectivite GPS'
    });
  }

  const highIdleVehicles = comparison?.vehicles?.filter(v => v.idle_percentage > 25) || [];
  if (highIdleVehicles.length > 0) {
    insights.push({
      type: 'warning',
      icon: Clock,
      text: `${highIdleVehicles.length} vehicule${highIdleVehicles.length > 1 ? 's' : ''} avec ralenti excessif (>25%)`,
      detail: 'Optimiser les itineraires pour reduire le temps au ralenti'
    });
  }

  const activeCount = stats?.vehicles?.filter(v => v.connection_status === 'active').length || 0;
  const totalCount = stats?.vehicles?.length || 0;
  const utilizationRate = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0;
  if (utilizationRate < 60 && totalCount > 0) {
    insights.push({
      type: 'info',
      icon: Truck,
      text: `Taux d'utilisation flotte: ${utilizationRate}%`,
      detail: `${totalCount - activeCount} vehicule${(totalCount - activeCount) > 1 ? 's' : ''} non utilise${(totalCount - activeCount) > 1 ? 's' : ''} — potentiel de redistribution`
    });
  }

  if (comparison?.top_performer) {
    insights.push({
      type: 'success',
      icon: CheckCircle,
      text: `Meilleur vehicule: ${comparison.top_performer.label}`,
      detail: `Score: ${comparison.top_performer.efficiency_score}% — ${comparison.top_performer.total_distance_week} km/semaine`
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: 'success',
      icon: CheckCircle,
      text: 'Flotte operationnelle',
      detail: 'Aucune anomalie detectee'
    });
  }

  const colors = {
    danger: 'bg-red-50 border-red-100 text-red-700',
    warning: 'bg-amber-50 border-amber-100 text-amber-700',
    info: 'bg-blue-50 border-blue-100 text-blue-700',
    success: 'bg-emerald-50 border-emerald-100 text-emerald-700'
  };

  const iconColors = {
    danger: 'text-red-500',
    warning: 'text-amber-500',
    info: 'text-blue-500',
    success: 'text-emerald-500'
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="ai-insights">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-gray-900 rounded-lg">
          <Zap size={14} className="text-white" />
        </div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Insights Intelligents
        </h3>
      </div>

      <div className="space-y-2.5">
        {insights.map((insight, idx) => (
          <div
            key={idx}
            className={`insight-item flex items-start gap-3 p-3 rounded-lg border ${colors[insight.type]}`}
            style={{ opacity: 0 }}
          >
            <insight.icon size={16} className={`mt-0.5 flex-shrink-0 ${iconColors[insight.type]}`} />
            <div className="min-w-0">
              <div className="text-sm font-medium">{insight.text}</div>
              <div className="text-xs opacity-70 mt-0.5">{insight.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ FLEET TABLE ============
const FleetTable = ({ vehicles, comparison }) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('label');
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
      return true;
    })
    .sort((a, b) => {
      let valA = a[sortBy], valB = b[sortBy];
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
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
      {/* Table Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Flotte ({filtered.length})
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 w-48"
              data-testid="fleet-search"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none"
            data-testid="fleet-filter"
          >
            <option value="all">Tous</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {[
                { key: 'label', label: 'Vehicule' },
                { key: 'model', label: 'Modele' },
                { key: 'connection_status', label: 'Statut' },
                { key: 'efficiency_score', label: 'Efficacite' },
                { key: 'speed', label: 'Vitesse' },
                { key: 'mileage', label: 'Kilometrage' },
              ].map(col => (
                <th
                  key={col.key}
                  className="px-6 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-gray-400 cursor-pointer hover:text-gray-600 select-none"
                  onClick={() => toggleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <React.Fragment key={v.tracker_id}>
                <tr
                  className={`fleet-row border-b border-gray-50 last:border-b-0 cursor-pointer ${expandedVehicle === v.tracker_id ? 'bg-gray-50' : ''}`}
                  onClick={() => setExpandedVehicle(expandedVehicle === v.tracker_id ? null : v.tracker_id)}
                  data-testid={`vehicle-row-${v.tracker_id}`}
                >
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <ChevronDown size={14} className={`text-gray-400 transition-transform ${expandedVehicle === v.tracker_id ? 'rotate-180' : ''}`} />
                      <span className="text-sm font-medium text-gray-900">{v.label}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="text-xs text-gray-500">{v.model || '-'}</span>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                      v.connection_status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-gray-50 text-gray-600 border-gray-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${v.connection_status === 'active' ? 'bg-emerald-500 pulse-dot' : 'bg-gray-400'}`} />
                      {v.connection_status === 'active' ? 'Actif' : 'Hors ligne'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            v.efficiency_score >= 70 ? 'bg-emerald-500' :
                            v.efficiency_score >= 40 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(100, v.efficiency_score)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-semibold tabular-nums ${
                        v.efficiency_score >= 70 ? 'text-emerald-600' :
                        v.efficiency_score >= 40 ? 'text-amber-600' : 'text-red-500'
                      }`}>
                        {v.efficiency_score}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="text-xs text-gray-600 tabular-nums">{v.speed || 0} km/h</span>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="text-xs text-gray-600 tabular-nums">{((v.mileage || 0) / 1000).toFixed(0)} km</span>
                  </td>
                </tr>

                {/* Expanded Detail Panel */}
                {expandedVehicle === v.tracker_id && (
                  <tr>
                    <td colSpan={6} className="px-0 py-0">
                      <div className="bg-gray-50 border-b border-gray-200 px-8 py-5" data-testid={`vehicle-detail-${v.tracker_id}`}>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                          {/* Efficiency Score */}
                          <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Efficacite</div>
                            <div className={`text-3xl font-bold ${
                              v.efficiency_score >= 70 ? 'text-emerald-600' :
                              v.efficiency_score >= 40 ? 'text-amber-600' : 'text-red-500'
                            }`} style={{ fontFamily: 'Outfit, sans-serif' }}>
                              {v.efficiency_score}%
                            </div>
                            <div className="w-full h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
                              <div className={`h-full rounded-full ${
                                v.efficiency_score >= 70 ? 'bg-emerald-500' :
                                v.efficiency_score >= 40 ? 'bg-amber-500' : 'bg-red-500'
                              }`} style={{ width: `${Math.min(100, v.efficiency_score)}%` }} />
                            </div>
                          </div>

                          {/* Speed */}
                          <div className="bg-white rounded-xl p-4 border border-gray-200">
                            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Vitesse</div>
                            <div className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                              {v.speed || 0} <span className="text-xs font-normal text-gray-400">km/h</span>
                            </div>
                          </div>

                          {/* Mileage */}
                          <div className="bg-white rounded-xl p-4 border border-gray-200">
                            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Kilometrage</div>
                            <div className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                              {((v.mileage || 0) / 1000).toFixed(0)} <span className="text-xs font-normal text-gray-400">km</span>
                            </div>
                          </div>

                          {/* Engine Hours */}
                          <div className="bg-white rounded-xl p-4 border border-gray-200">
                            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Heures moteur</div>
                            <div className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                              {v.engine_hours || 0} <span className="text-xs font-normal text-gray-400">h</span>
                            </div>
                          </div>

                          {/* Fuel Efficiency */}
                          <div className="bg-white rounded-xl p-4 border border-gray-200">
                            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Consommation</div>
                            <div className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                              {v.fuel_efficiency || '-'} <span className="text-xs font-normal text-gray-400">L/100km</span>
                            </div>
                          </div>

                          {/* Idle % */}
                          <div className="bg-white rounded-xl p-4 border border-gray-200">
                            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Temps ralenti</div>
                            <div className={`text-xl font-semibold ${
                              (v.idle_percentage || 0) > 25 ? 'text-amber-600' : 'text-gray-900'
                            }`} style={{ fontFamily: 'Outfit, sans-serif' }}>
                              {v.idle_percentage || 0} <span className="text-xs font-normal text-gray-400">%</span>
                            </div>
                          </div>
                        </div>

                        {/* Additional info row */}
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                          <span>Modele: <strong className="text-gray-700">{v.model || '-'}</strong></span>
                          <span>|</span>
                          <span>Statut: <strong className={v.connection_status === 'active' ? 'text-emerald-600' : 'text-gray-700'}>
                            {v.connection_status === 'active' ? 'Actif' : 'Hors ligne'}
                          </strong></span>
                          {v.last_update && (
                            <>
                              <span>|</span>
                              <span>Derniere MAJ: <strong className="text-gray-700">{new Date(v.last_update).toLocaleString('fr-FR')}</strong></span>
                            </>
                          )}
                          {v.location && (v.location.lat !== 0 || v.location.lng !== 0) && (
                            <>
                              <span>|</span>
                              <span>GPS: <strong className="text-gray-700">{v.location.lat?.toFixed(4)}, {v.location.lng?.toFixed(4)}</strong></span>
                            </>
                          )}
                          {v.violations_count > 0 && (
                            <>
                              <span>|</span>
                              <span className="text-red-500">Violations: <strong>{v.violations_count}</strong></span>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          Aucun vehicule trouve
        </div>
      )}
    </div>
  );
};

// ============ FLEET UTILIZATION ============
const FleetUtilization = ({ comparison }) => {
  const vehicles = comparison?.vehicles || [];
  const total = vehicles.length || 1;
  const excellent = vehicles.filter(v => v.efficiency_score >= 70).length;
  const good = vehicles.filter(v => v.efficiency_score >= 40 && v.efficiency_score < 70).length;
  const poor = vehicles.filter(v => v.efficiency_score < 40).length;

  const pieData = [
    { name: 'Excellent (>70%)', value: excellent, color: '#10B981' },
    { name: 'Moyen (40-70%)', value: good, color: '#F59E0B' },
    { name: 'Faible (<40%)', value: poor, color: '#EF4444' },
  ].filter(d => d.value > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="fleet-utilization">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-800 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
        Utilisation Flotte
      </h3>

      <div className="flex items-center gap-6">
        <div className="w-32 h-32 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={55}
                dataKey="value"
                strokeWidth={2}
                stroke="#fff"
              >
                {pieData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 space-y-3">
          {pieData.map((item) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-gray-600">{item.name}</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">{item.value}</span>
            </div>
          ))}

          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Taux global</span>
              <span className="text-sm font-bold">
                {Math.round((excellent / total) * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ DISTANCE CHART ============
const DistanceChart = ({ trends }) => {
  const data = (trends?.trends || []).slice(-7);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="distance-chart">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-800 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
        Distance (7 derniers jours)
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} barSize={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="day_name" tick={{ fontSize: 11, fill: '#8A8A8E' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#8A8A8E' }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
            formatter={(value) => [`${value} km`, 'Distance']}
          />
          <Bar dataKey="total_distance" fill="#111" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
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
  const [period, setPeriod] = useState('today');
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
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
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    }
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchAll();
  }, []);

  const handlePeriodApply = (from, to) => fetchAll(from, to);

  // Derive KPIs
  const vehicles = stats?.vehicles || [];
  const activeVehicles = vehicles.filter(v => v.connection_status === 'active').length;
  const totalVehicles = vehicles.length;
  const movingVehicles = comparison?.vehicles?.filter(v => v.is_active).length || activeVehicles;
  const avgEfficiency = stats?.summary?.average_efficiency || 0;
  const totalKm = ((stats?.summary?.total_mileage || 0) / 1000).toFixed(0);
  const totalEngineHours = stats?.summary?.total_engine_hours || 0;
  const avgFuelEfficiency = comparison?.vehicles?.length > 0
    ? (comparison.vehicles.reduce((s, v) => s + (v.fuel_efficiency || 0), 0) / comparison.vehicles.length).toFixed(1)
    : '0';
  const estimatedFuelCost = trends?.summary?.total_fuel
    ? Math.round(trends.summary.total_fuel * 1.85)
    : 0;
  const alertCount = (comparison?.needs_attention?.length || 0) +
    vehicles.filter(v => v.connection_status !== 'active').length;

  // Sparkline data from trends
  const efficiencySparkData = (trends?.trends || []).slice(-7).map(d => ({ v: d.avg_efficiency }));
  const distanceSparkData = (trends?.trends || []).slice(-7).map(d => ({ v: d.total_distance }));
  const fuelSparkData = (trends?.trends || []).slice(-7).map(d => ({ v: d.fuel_consumption }));

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
        subtitle={`${totalVehicles} vehicules — ${activeVehicles} actifs`}
        onMenuClick={onMenuClick}
        onRefresh={() => fetchAll()}
        lastUpdate={lastUpdate}
        alertCount={alertCount}
      >
        <PeriodSelector
          period={period}
          setPeriod={setPeriod}
          fromDate={fromDate}
          setFromDate={setFromDate}
          toDate={toDate}
          setToDate={setToDate}
          onApply={handlePeriodApply}
        />
      </Header>

      <div className="p-4 lg:p-8 space-y-8 max-w-[1600px] mx-auto">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6" data-testid="kpi-grid">
          <KPICard
            label="Vehicules actifs"
            value={`${activeVehicles}/${totalVehicles}`}
            icon={Truck}
            trend={null}
            status={activeVehicles > 0 ? 'good' : 'warning'}
            sparkData={null}
          />
          <KPICard
            label="Score Flotte"
            value={`${avgEfficiency}`}
            unit="%"
            icon={Gauge}
            trend={5.2}
            trendLabel="vs sem."
            status={avgEfficiency >= 50 ? 'good' : avgEfficiency >= 30 ? 'warning' : 'danger'}
            sparkData={efficiencySparkData}
            sparkColor={avgEfficiency >= 50 ? '#10B981' : '#EF4444'}
          />
          <KPICard
            label="Distance totale"
            value={totalKm}
            unit="km"
            icon={TrendingUp}
            trend={12.4}
            trendLabel="vs sem."
            sparkData={distanceSparkData}
            sparkColor="#111"
          />
          <KPICard
            label="Heures moteur"
            value={`${totalEngineHours}`}
            unit="h"
            icon={Clock}
            trend={-2.1}
            trendLabel="vs sem."
          />
          <KPICard
            label="Conso. moyenne"
            value={avgFuelEfficiency}
            unit="L/100km"
            icon={Fuel}
            trend={-3.5}
            trendLabel="vs sem."
            sparkData={fuelSparkData}
            sparkColor="#F59E0B"
          />
          <KPICard
            label="Cout carburant"
            value={`${estimatedFuelCost}`}
            unit="CHF"
            icon={Activity}
            trend={null}
          />
          <KPICard
            label="Alertes"
            value={alertCount}
            icon={AlertTriangle}
            status={alertCount === 0 ? 'good' : alertCount <= 3 ? 'warning' : 'danger'}
          />
          <KPICard
            label="En mouvement"
            value={movingVehicles}
            unit={`/ ${totalVehicles}`}
            icon={Activity}
            status={movingVehicles > 0 ? 'good' : 'warning'}
          />
        </div>

        {/* Middle Row: Insights + Utilization + Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <AIInsights stats={stats} comparison={comparison} />
          <FleetUtilization comparison={comparison} />
          <DistanceChart trends={trends} />
        </div>

        {/* Fleet Table */}
        <FleetTable vehicles={vehicles} comparison={comparison} />
      </div>
    </div>
  );
};
