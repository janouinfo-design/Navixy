import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API, api } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import {
  Users, Truck, Download, RefreshCw, ChevronRight, ChevronDown,
  Phone, Award, AlertTriangle, Clock, Fuel, ShieldAlert,
  TrendingUp, MapPin, Gauge, DollarSign, Activity, Star, X, Info
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar
} from "recharts";

const FUEL_PRICE = 2.0;

// ============ DRIVER KPI WITH INFO POPUP ============
const DriverKPI = ({ label, value, icon: Icon, color, explanation }) => {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div className="relative">
      <div className="kpi-card bg-white rounded-xl p-5 min-h-[100px] flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon size={13} className="text-gray-400" />
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{label}</span>
          </div>
          {explanation && (
            <button onClick={() => setShowInfo(!showInfo)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors" data-testid={`info-${label.toLowerCase().replace(/\s+/g, '-')}`}>
              <Info size={13} className={showInfo ? 'text-[#111]' : 'text-gray-300 hover:text-gray-500'} />
            </button>
          )}
        </div>
        <div className={`text-2xl font-semibold tracking-tight ${color || 'text-gray-900'}`} style={{ fontFamily: 'Outfit, sans-serif' }}>
          {value}
        </div>
      </div>

      {showInfo && explanation && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white rounded-xl border border-gray-200 shadow-lg p-4" data-testid="kpi-info-popup">
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>{explanation.title}</h4>
            <button onClick={() => setShowInfo(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={14} className="text-gray-400" /></button>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{explanation.description}</p>
          {explanation.formula && (
            <div className="mt-2 p-2 bg-gray-50 rounded-lg">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Formule</div>
              <div className="text-xs font-mono text-gray-700">{explanation.formula}</div>
            </div>
          )}
          {explanation.breakdown && (
            <div className="mt-2 space-y-1.5">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Niveaux</div>
              {explanation.breakdown.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-gray-600">{item.label}</span>
                  </div>
                  <span className="font-medium text-gray-800">{item.value}</span>
                </div>
              ))}
            </div>
          )}
          {explanation.tip && (
            <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
              <div className="text-[10px] text-blue-700">{explanation.tip}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ DRIVER SCORE CALCULATION ============
const calcDriverScore = (driver, compVehicles) => {
  const assignedVehicle = compVehicles.find(v => v.tracker_id === driver.vehicles?.[0]?.tracker_id);
  if (!assignedVehicle) return { score: 0, efficiency: 0, idle: 0, violations: 0, consumption: 0 };

  const efficiency = assignedVehicle.efficiency_score || 0;
  const idle = assignedVehicle.idle_percentage || 0;
  const violations = assignedVehicle.violations_count || 0;
  const consumption = assignedVehicle.fuel_efficiency || 0;

  // Weighted score: efficiency (40%) + low idle (25%) + no violations (20%) + low consumption (15%)
  const idleScore = Math.max(0, 100 - idle * 3);
  const violationScore = Math.max(0, 100 - violations * 20);
  const consumptionScore = consumption > 0 ? Math.max(0, 100 - (consumption - 6) * 10) : 50;

  const score = Math.round(efficiency * 0.4 + idleScore * 0.25 + violationScore * 0.2 + consumptionScore * 0.15);
  return { score: Math.max(0, Math.min(100, score)), efficiency, idle, violations, consumption };
};

// ============ SCORE BADGE ============
const ScoreBadge = ({ score, size = 'md' }) => {
  const sizeClass = size === 'lg' ? 'w-12 h-12 text-lg' : size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  return (
    <div className={`${sizeClass} rounded-xl flex items-center justify-center font-bold text-white ${
      score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500'
    }`}>
      {score}
    </div>
  );
};

// ============ DRIVER DETAIL DRAWER ============
const DriverDetail = ({ driver, metrics, compVehicle, onClose }) => {
  const radarData = [
    { metric: 'Efficacite', value: metrics.efficiency, max: 100 },
    { metric: 'Anti-ralenti', value: Math.max(0, 100 - metrics.idle * 3), max: 100 },
    { metric: 'Securite', value: Math.max(0, 100 - metrics.violations * 20), max: 100 },
    { metric: 'Eco-conduite', value: metrics.consumption > 0 ? Math.max(0, 100 - (metrics.consumption - 6) * 10) : 50, max: 100 },
    { metric: 'Activite', value: driver.vehicles_count > 0 ? 80 : 20, max: 100 },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-white shadow-2xl z-50 overflow-y-auto" data-testid="driver-detail">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
        <h3 className="text-lg font-semibold" style={{ fontFamily: 'Outfit, sans-serif' }}>{driver.driver_name}</h3>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button>
      </div>

      <div className="p-6 space-y-6">
        {/* Score header */}
        <div className="flex items-center gap-4">
          <ScoreBadge score={metrics.score} size="lg" />
          <div>
            <div className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{metrics.score}%</div>
            <div className="text-xs text-gray-500">Score global conducteur</div>
          </div>
        </div>

        {/* Radar chart */}
        <div className="bg-gray-50 rounded-xl p-4">
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#5E5E62' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="value" stroke="#111" fill="#111" fillOpacity={0.15} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Efficacite', value: `${metrics.efficiency}%`, icon: Gauge, color: metrics.efficiency >= 50 ? 'text-emerald-600' : 'text-red-500' },
            { label: 'Ralenti', value: `${metrics.idle}%`, icon: Clock, color: metrics.idle > 25 ? 'text-amber-600' : 'text-gray-700' },
            { label: 'Violations', value: metrics.violations, icon: ShieldAlert, color: metrics.violations > 0 ? 'text-red-500' : 'text-gray-700' },
            { label: 'Consommation', value: `${metrics.consumption || '-'} L/100`, icon: Fuel, color: metrics.consumption > 10 ? 'text-amber-600' : 'text-gray-700' },
            { label: 'Distance', value: `${(driver.total_distance / 1000).toFixed(1)} km`, icon: MapPin, color: 'text-gray-700' },
            { label: 'Vehicules', value: driver.vehicles_count, icon: Truck, color: 'text-gray-700' },
          ].map((item, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <item.icon size={12} className="text-gray-400" />
                <span className="text-[9px] text-gray-400 uppercase tracking-wider">{item.label}</span>
              </div>
              <div className={`text-lg font-semibold ${item.color}`} style={{ fontFamily: 'Outfit, sans-serif' }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Contact */}
        {driver.phone && (
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
            <Phone size={14} className="text-gray-400" />
            <span className="text-sm text-gray-700">{driver.phone}</span>
          </div>
        )}

        {/* Assigned vehicles */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Vehicules assignes</h4>
          {driver.vehicles.length === 0 ? (
            <div className="text-xs text-gray-400 p-3 bg-gray-50 rounded-lg">Aucun vehicule assigne</div>
          ) : (
            <div className="space-y-2">
              {driver.vehicles.map((v, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Truck size={14} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-800">{v.vehicle_label}</span>
                  </div>
                  <span className="text-xs text-gray-500">{v.note || ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Insights */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Recommandations</h4>
          <div className="space-y-2">
            {metrics.idle > 25 && (
              <div className="flex gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <Clock size={14} className="text-amber-500 mt-0.5" />
                <div>
                  <div className="text-xs font-medium text-amber-800">Ralenti excessif ({metrics.idle}%)</div>
                  <div className="text-[10px] text-amber-600">Sensibiliser a couper le moteur lors des arrets</div>
                </div>
              </div>
            )}
            {metrics.violations > 2 && (
              <div className="flex gap-2 p-3 bg-red-50 rounded-lg border border-red-100">
                <ShieldAlert size={14} className="text-red-500 mt-0.5" />
                <div>
                  <div className="text-xs font-medium text-red-800">{metrics.violations} exces de vitesse</div>
                  <div className="text-[10px] text-red-600">Formation eco-conduite recommandee</div>
                </div>
              </div>
            )}
            {metrics.consumption > 10 && (
              <div className="flex gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <Fuel size={14} className="text-amber-500 mt-0.5" />
                <div>
                  <div className="text-xs font-medium text-amber-800">Surconsommation ({metrics.consumption} L/100)</div>
                  <div className="text-[10px] text-amber-600">Verifier style de conduite et etat du vehicule</div>
                </div>
              </div>
            )}
            {metrics.score >= 70 && (
              <div className="flex gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                <Star size={14} className="text-emerald-500 mt-0.5" />
                <div>
                  <div className="text-xs font-medium text-emerald-800">Excellent conducteur</div>
                  <div className="text-[10px] text-emerald-600">Utiliser comme reference pour la flotte</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ MAIN DRIVER VIEW ============
export const DriverReportView = ({ onMenuClick }) => {
  const [report, setReport] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');
  const [fromDate, setFromDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedDriver, setSelectedDriver] = useState(null);

  const fetchData = useCallback(async (from, to) => {
    setLoading(true);
    try {
      const [reportRes, compRes] = await Promise.all([
        api.get(`${API}/reports/driver`, { params: { from_date: from || fromDate, to_date: to || toDate } }),
        api.get(`${API}/analytics/vehicle-comparison`)
      ]);
      if (reportRes.data.success) setReport(reportRes.data);
      if (compRes.data.success) setComparison(compRes.data);
    } catch (error) { console.error("Driver fetch error:", error); }
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, []);
  const handlePeriodApply = (from, to) => fetchData(from, to);

  const exportReport = async (format) => {
    try {
      const response = await api.get(`${API}/export/driver-report`, {
        params: { from_date: fromDate, to_date: toDate, format }, responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `driver_report_${fromDate}_${toDate}.${format}`);
      document.body.appendChild(link); link.click(); link.remove();
    } catch (error) { console.error("Export error:", error); }
  };

  const compVehicles = comparison?.vehicles || [];

  // Enrich drivers with scores
  const drivers = useMemo(() => {
    return (report?.drivers || []).map(d => {
      const metrics = calcDriverScore(d, compVehicles);
      return { ...d, metrics };
    });
  }, [report, compVehicles]);

  // Filter & sort
  const filteredDrivers = drivers
    .filter(d => {
      if (search && !d.driver_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType === 'excellent' && d.metrics.score < 70) return false;
      if (filterType === 'risk' && d.metrics.score >= 40) return false;
      if (filterType === 'train' && (d.metrics.score >= 60 || d.metrics.score < 20)) return false;
      return true;
    })
    .sort((a, b) => b.metrics.score - a.metrics.score);

  // KPI calculations
  const totalDrivers = drivers.length;
  const avgScore = totalDrivers > 0 ? Math.round(drivers.reduce((s, d) => s + d.metrics.score, 0) / totalDrivers) : 0;
  const avgIdle = totalDrivers > 0 ? Math.round(drivers.reduce((s, d) => s + d.metrics.idle, 0) / totalDrivers) : 0;
  const totalViolations = drivers.reduce((s, d) => s + d.metrics.violations, 0);
  const driversAtRisk = drivers.filter(d => d.metrics.score < 40).length;
  const excellentDrivers = drivers.filter(d => d.metrics.score >= 70).length;

  // Comparison chart data (top 5)
  const chartData = drivers
    .filter(d => d.metrics.score > 0)
    .sort((a, b) => b.metrics.score - a.metrics.score)
    .slice(0, 6)
    .map(d => ({
      name: d.driver_name.length > 10 ? d.driver_name.substring(0, 10) + '...' : d.driver_name,
      score: d.metrics.score,
      idle: d.metrics.idle,
      violations: d.metrics.violations
    }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]" data-testid="loading">
        <RefreshCw className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  return (
    <div data-testid="driver-report-view">
      <Header title="Conducteurs" subtitle={`${totalDrivers} conducteurs enregistres`}
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Conducteurs', value: totalDrivers, icon: Users, explanation: {
              title: 'Nombre de Conducteurs',
              description: 'Nombre total de conducteurs enregistres dans le systeme Navixy pour cette flotte.',
              tip: 'Chaque conducteur est associe a un ou plusieurs vehicules via le systeme d\'identification (cle iButton, carte RFID, ou assignation manuelle).'
            }},
            { label: 'Score moyen', value: `${avgScore}%`, icon: Gauge, color: avgScore >= 50 ? 'text-emerald-600' : 'text-red-500', explanation: {
              title: 'Score Moyen Conducteurs',
              description: 'Moyenne des scores de performance de tous les conducteurs. Le score combine efficacite, ralenti, violations et consommation.',
              formula: 'Efficacite (40%) + Anti-ralenti (25%) + Securite (20%) + Eco-conduite (15%)',
              breakdown: [
                { label: 'Excellent', value: '> 70%', color: 'bg-emerald-500' },
                { label: 'Acceptable', value: '40-70%', color: 'bg-amber-500' },
                { label: 'A ameliorer', value: '< 40%', color: 'bg-red-500' },
              ],
              tip: 'Un score moyen < 50% indique un besoin de formation eco-conduite pour l\'ensemble de la flotte.'
            }},
            { label: 'Excellents', value: excellentDrivers, icon: Star, color: 'text-emerald-600', explanation: {
              title: 'Conducteurs Excellents',
              description: `Nombre de conducteurs avec un score superieur a 70%. Actuellement ${excellentDrivers} sur ${totalDrivers}.`,
              tip: 'Ces conducteurs sont vos references. Utilisez leurs pratiques comme modele pour former les autres.'
            }},
            { label: 'A risque', value: driversAtRisk, icon: AlertTriangle, color: driversAtRisk > 0 ? 'text-red-500' : 'text-gray-400', explanation: {
              title: 'Conducteurs a Risque',
              description: `Conducteurs avec un score inferieur a 40%. Ils cumulent souvent: exces de vitesse, ralenti excessif, et surconsommation.`,
              tip: driversAtRisk > 0 ? `Action urgente: ${driversAtRisk} conducteur${driversAtRisk > 1 ? 's' : ''} necessite${driversAtRisk > 1 ? 'nt' : ''} une formation ou un entretien individuel.` : 'Aucun conducteur a risque — tres bien!'
            }},
            { label: 'Ralenti moyen', value: `${avgIdle}%`, icon: Clock, color: avgIdle > 20 ? 'text-amber-600' : 'text-gray-700', explanation: {
              title: 'Ralenti Moyen',
              description: 'Pourcentage moyen du temps ou le moteur tourne alors que le vehicule est a l\'arret (vitesse < 5 km/h).',
              breakdown: [
                { label: 'Normal', value: '< 15%', color: 'bg-emerald-500' },
                { label: 'Eleve', value: '15-25%', color: 'bg-amber-500' },
                { label: 'Excessif', value: '> 25%', color: 'bg-red-500' },
              ],
              tip: 'Chaque heure de ralenti coute environ 3 CHF en carburant. Sensibilisez les conducteurs a couper le moteur lors des arrets de plus de 30 secondes.'
            }},
            { label: 'Violations totales', value: totalViolations, icon: ShieldAlert, color: totalViolations > 0 ? 'text-red-500' : 'text-gray-700', explanation: {
              title: 'Violations Totales',
              description: `Nombre total d'exces de vitesse detectes sur la periode pour l'ensemble des conducteurs: ${totalViolations} violations.`,
              tip: totalViolations > 10 ? 'Nombre eleve de violations. Envisagez une campagne de sensibilisation a la securite routiere et des formations eco-conduite.' : 'Niveau acceptable. Continuez a monitorer regulierement.'
            }},
          ].map((item, idx) => (
            <DriverKPI key={idx} {...item} />
          ))}
        </div>

        {/* Comparison chart */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Comparaison Conducteurs</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5E5E62' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#8A8A8E' }} axisLine={false} tickLine={false} width={30} domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 11 }} />
                <Bar dataKey="score" name="Score" fill="#111" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Rechercher conducteur..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 w-56" data-testid="driver-search" />
          </div>
          {['all', 'excellent', 'risk', 'train'].map(f => (
            <button key={f} onClick={() => setFilterType(f)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                filterType === f ? 'bg-[#111] text-white border-[#111]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`} data-testid={`filter-${f}`}>
              {f === 'all' ? 'Tous' : f === 'excellent' ? 'Excellents' : f === 'risk' ? 'A risque' : 'A former'}
            </button>
          ))}
        </div>

        {/* Driver cards */}
        <div className="space-y-3">
          {filteredDrivers.map(driver => {
            const m = driver.metrics;
            const compV = compVehicles.find(v => v.tracker_id === driver.vehicles?.[0]?.tracker_id);
            return (
              <div key={driver.employee_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-sm transition-shadow">
                <div className="px-6 py-4 flex items-center justify-between cursor-pointer"
                  onClick={() => setSelectedDriver({ driver, metrics: m, compVehicle: compV })}
                  data-testid={`driver-card-${driver.employee_id}`}>
                  <div className="flex items-center gap-4">
                    <ScoreBadge score={m.score} />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{driver.driver_name}</div>
                      <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-0.5">
                        {driver.phone && <span className="flex items-center gap-1"><Phone size={10} />{driver.phone}</span>}
                        <span>N. {driver.personnel_number || driver.employee_id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="hidden md:block text-center">
                      <div className="text-sm font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>{driver.vehicles_count}</div>
                      <div className="text-[9px] text-gray-400 uppercase tracking-wider">Vehic.</div>
                    </div>
                    <div className="hidden md:block text-center">
                      <div className={`text-sm font-semibold ${m.idle > 25 ? 'text-amber-600' : 'text-gray-900'}`} style={{ fontFamily: 'Outfit, sans-serif' }}>{m.idle}%</div>
                      <div className="text-[9px] text-gray-400 uppercase tracking-wider">Ralenti</div>
                    </div>
                    <div className="hidden lg:block text-center">
                      <div className={`text-sm font-semibold ${m.violations > 0 ? 'text-red-500' : 'text-gray-900'}`} style={{ fontFamily: 'Outfit, sans-serif' }}>{m.violations}</div>
                      <div className="text-[9px] text-gray-400 uppercase tracking-wider">Violations</div>
                    </div>
                    <div className="hidden lg:block text-center">
                      <div className="text-sm font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>{m.consumption || '-'}</div>
                      <div className="text-[9px] text-gray-400 uppercase tracking-wider">L/100</div>
                    </div>
                    <ChevronRight size={16} className="text-gray-400" />
                  </div>
                </div>

                {/* Assigned vehicle preview */}
                {driver.vehicles.length > 0 && (
                  <div className="px-6 pb-3 flex items-center gap-2 text-[10px] text-gray-400">
                    <Truck size={11} />
                    <span>{driver.vehicles.map(v => v.vehicle_label).join(', ')}</span>
                  </div>
                )}
              </div>
            );
          })}

          {filteredDrivers.length === 0 && (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Users className="mx-auto text-gray-300" size={40} />
              <p className="mt-3 text-sm text-gray-400">Aucun conducteur trouve</p>
            </div>
          )}
        </div>
      </div>

      {/* Driver Detail Drawer */}
      {selectedDriver && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedDriver(null)} />
          <DriverDetail
            driver={selectedDriver.driver}
            metrics={selectedDriver.metrics}
            compVehicle={selectedDriver.compVehicle}
            onClose={() => setSelectedDriver(null)}
          />
        </>
      )}
    </div>
  );
};
