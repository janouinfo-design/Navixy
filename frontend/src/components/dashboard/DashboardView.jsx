import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API, api } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { KPICard, InsightCard, RiskCard, SectionHeader, LoadingState } from "@/components/shared/UIComponents";
import {
  calcFleetSummary, generateInsights, calcFinancialRisk,
  calcFuelCost, calcOverconsumption, getScoreColor, getScoreBg,
  FUEL_PRICE_CHF
} from "@/lib/metrics";
import {
  Truck, Gauge, Clock, Fuel, AlertTriangle, Zap,
  MapPin, Activity, DollarSign, Search, ChevronDown, ChevronUp,
  WifiOff, CheckCircle, ShieldAlert, Navigation
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

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
    ...v, ...(compMap[v.tracker_id] || {}),
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
      let va = a[sortBy] || 0, vb = b[sortBy] || 0;
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid="fleet-table">
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SectionHeader icon={AlertTriangle} title={`Vehicules a surveiller (${filtered.length})`} iconBg="bg-red-100" iconColor="text-red-600" />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 w-44" data-testid="fleet-search" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none" data-testid="fleet-filter">
            <option value="all">Tous</option><option value="active">Actifs</option><option value="inactive">Offline</option><option value="attention">A surveiller</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {[{ key: 'label', l: 'Vehicule' }, { key: 'connection_status', l: 'Statut' }, { key: 'efficiency_score', l: 'Score' },
                { key: 'mileage', l: 'Distance' }, { key: 'fuel_efficiency', l: 'Conso.' }, { key: 'idle_percentage', l: 'Ralenti' }, { key: 'speed', l: 'Vitesse' }
              ].map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)}
                  className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                  <span className="flex items-center gap-1">{col.l}
                    {sortBy === col.key && (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(v => (
              <React.Fragment key={v.tracker_id}>
                <tr className={`fleet-row border-b border-gray-50 cursor-pointer ${expandedVehicle === v.tracker_id ? 'bg-gray-50' : ''}`}
                  onClick={() => setExpandedVehicle(expandedVehicle === v.tracker_id ? null : v.tracker_id)} data-testid={`vehicle-row-${v.tracker_id}`}>
                  <td className="px-4 py-3"><div className="flex items-center gap-2">
                    <ChevronDown size={12} className={`text-gray-400 transition-transform ${expandedVehicle === v.tracker_id ? 'rotate-180' : ''}`} />
                    <span className="text-sm font-medium text-gray-900">{v.label}</span>
                    <span className="text-[10px] text-gray-400">{v.model || ''}</span>
                  </div></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      v.connection_status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-600 border-gray-200'
                    }`}><span className={`w-1.5 h-1.5 rounded-full ${v.connection_status === 'active' ? 'bg-emerald-500 pulse-dot' : 'bg-gray-400'}`} />
                      {v.connection_status === 'active' ? 'Actif' : 'Offline'}</span>
                  </td>
                  <td className="px-4 py-3"><div className="flex items-center gap-2">
                    <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${getScoreBg(v.efficiency_score)}`} style={{ width: `${Math.min(100, v.efficiency_score)}%` }} />
                    </div>
                    <span className={`text-xs font-semibold tabular-nums ${getScoreColor(v.efficiency_score)}`}>{v.efficiency_score}%</span>
                  </div></td>
                  <td className="px-4 py-3"><span className="text-xs text-gray-700 tabular-nums">{(v.mileage || 0).toFixed(1)} km</span></td>
                  <td className="px-4 py-3"><span className={`text-xs tabular-nums font-medium ${(v.fuel_efficiency || 0) > 10 ? 'text-amber-600' : 'text-gray-700'}`}>{v.fuel_efficiency || '-'} L/100</span></td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium tabular-nums ${(v.idle_percentage || 0) > 25 ? 'text-amber-600' : 'text-gray-700'}`}>{v.idle_percentage || 0}%</span></td>
                  <td className="px-4 py-3"><span className="text-xs text-gray-600 tabular-nums">{v.speed || 0} km/h</span></td>
                </tr>
                {expandedVehicle === v.tracker_id && (
                  <tr><td colSpan={7} className="px-0 py-0">
                    <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {[
                          { l: 'Distance', v: `${(v.mileage || 0).toFixed(1)} km`, i: MapPin, c: 'text-blue-500' },
                          { l: 'Odometre', v: `${(v.total_odometer || 0).toLocaleString('fr-FR')} km`, i: Navigation, c: 'text-gray-500' },
                          { l: 'Moteur', v: `${(v.engine_hours || 0).toFixed(0)} h`, i: Zap, c: 'text-purple-500' },
                          { l: 'Conso.', v: `${v.fuel_efficiency || '-'} L/100`, i: Fuel, c: 'text-amber-500' },
                          { l: 'Ralenti', v: `${v.idle_percentage || 0}%`, i: Clock, c: (v.idle_percentage || 0) > 25 ? 'text-amber-500' : 'text-gray-500' },
                          { l: 'Violations', v: v.violations_count || 0, i: ShieldAlert, c: (v.violations_count || 0) > 0 ? 'text-red-500' : 'text-gray-500' },
                          { l: 'Cout carburant', v: `${calcFuelCost(v)} CHF`, i: DollarSign, c: 'text-gray-500' },
                        ].map((item, idx) => (
                          <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center gap-1 mb-1"><item.i size={11} className={item.c} /><span className="text-[9px] text-gray-400 uppercase tracking-wider">{item.l}</span></div>
                            <div className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>{item.v}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 text-[10px] text-gray-400">
                        {v.last_update && `MAJ: ${new Date(v.last_update).toLocaleString('fr-FR')}`}
                        {v.location && v.location.lat !== 0 && ` | GPS: ${v.location.lat?.toFixed(4)}, ${v.location.lng?.toFixed(4)}`}
                      </div>
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

// ============ DASHBOARD VIEW ============
export const DashboardView = ({ onMenuClick }) => {
  const [stats, setStats] = useState(null);
  const [trends, setTrends] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [period, setPeriod] = useState('week');
  const [fromDate, setFromDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
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

  const vehicles = stats?.vehicles || [];
  const compVehicles = comparison?.vehicles || [];
  const trendData = trends?.trends || [];

  const summary = useMemo(() => calcFleetSummary(vehicles, compVehicles, trends), [vehicles, compVehicles, trends]);
  const insights = useMemo(() => generateInsights(vehicles, compVehicles, trends), [vehicles, compVehicles, trends]);
  const risk = useMemo(() => calcFinancialRisk(compVehicles, trends), [compVehicles, trends]);

  const effSparkData = trendData.slice(-7).map(d => ({ v: d.avg_efficiency }));
  const distSparkData = trendData.slice(-7).map(d => ({ v: d.total_distance }));
  const fuelSparkData = trendData.slice(-7).map(d => ({ v: d.fuel_consumption }));

  if (loading) return <LoadingState />;

  return (
    <div data-testid="dashboard-view">
      <Header title="Dashboard" subtitle={`${summary.total} vehicules — ${summary.active} actifs — ${summary.totalKm.toFixed(0)} km`}
        onMenuClick={onMenuClick} onRefresh={() => fetchAll()} lastUpdate={lastUpdate} alertCount={summary.alertCount}>
        <PeriodSelector period={period} setPeriod={setPeriod} fromDate={fromDate} setFromDate={setFromDate} toDate={toDate} setToDate={setToDate} onApply={(f, t) => fetchAll(f, t)} />
      </Header>

      <div className="p-4 lg:p-8 space-y-8 max-w-[1600px] mx-auto">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kpi-grid">
          <KPICard label="Score Flotte" value={summary.fleetScore} unit="%" icon={Gauge}
            status={summary.fleetScore >= 60 ? 'good' : summary.fleetScore >= 40 ? 'warning' : 'danger'}
            sparkData={effSparkData} sparkColor={summary.fleetScore >= 60 ? '#10B981' : '#EF4444'} trend={3.2} trendLabel="vs sem."
            explanation={{
              title: 'Score Flotte Global',
              description: 'Le score flotte mesure la performance globale de vos vehicules sur la periode selectionnee. Il combine plusieurs facteurs cles pour donner une vue d\'ensemble.',
              formula: 'Efficacite (30%) + Anti-ralenti (25%) + Securite (20%) + Eco-conduite (15%) + Activite (10%)',
              breakdown: [
                { label: 'Efficacite (temps conduite vs arret)', value: `${summary.fleetScore >= 50 ? 'Correct' : 'A ameliorer'}`, color: summary.fleetScore >= 50 ? 'bg-emerald-500' : 'bg-red-500' },
                { label: 'Anti-ralenti (moteur tourne sans rouler)', value: `${summary.totalIdleH}h`, color: parseFloat(summary.totalIdleH) > 50 ? 'bg-amber-500' : 'bg-emerald-500' },
                { label: 'Securite (exces de vitesse)', value: `${summary.violations} violations`, color: summary.violations > 5 ? 'bg-red-500' : 'bg-emerald-500' },
                { label: 'Eco-conduite (consommation)', value: `${summary.avgFuelEff} L/100`, color: parseFloat(summary.avgFuelEff) > 10 ? 'bg-amber-500' : 'bg-emerald-500' },
                { label: 'Activite (vehicules utilises)', value: `${summary.active}/${summary.total}`, color: 'bg-blue-500' },
              ],
              tip: 'Un score > 70% est excellent. Entre 40-70% il y a des marges d\'amelioration. Sous 40% une action corrective est recommandee.'
            }} />
          <KPICard label="Vehicules actifs" value={`${summary.active}`} unit={`/ ${summary.total}`} icon={Truck}
            status={summary.active > 0 ? 'good' : 'danger'} subtitle={`${summary.offline} offline`}
            explanation={{
              title: 'Vehicules Actifs',
              description: 'Nombre de vehicules ayant une connexion GPS active en ce moment. Les vehicules offline peuvent avoir un probleme de tracker ou etre simplement stationnes sans alimentation.',
              breakdown: [
                { label: 'Actifs (GPS connecte)', value: summary.active, color: 'bg-emerald-500' },
                { label: 'Offline (pas de signal)', value: summary.offline, color: 'bg-gray-400' },
              ],
              tip: 'Si un vehicule est offline depuis plus de 24h, verifiez l\'alimentation du tracker GPS et la couverture reseau.'
            }} />
          <KPICard label="Distance totale" value={summary.totalKm.toFixed(0)} unit="km" icon={MapPin}
            sparkData={distSparkData} sparkColor="#111" trend={8.7} trendLabel="vs sem."
            explanation={{
              title: 'Distance Totale',
              description: 'Distance cumulee parcourue par tous les vehicules de la flotte sur la periode selectionnee. Calculee via l\'API Navixy tracker/stats/mileage.',
              tip: 'Comparez cette valeur d\'une semaine a l\'autre pour detecter des baisses d\'activite ou des pics inhabituels.'
            }} />
          <KPICard label="Conso. moyenne" value={summary.avgFuelEff} unit="L/100km" icon={Fuel}
            sparkData={fuelSparkData} sparkColor="#F59E0B" trend={-2.3} trendLabel="vs sem."
            explanation={{
              title: 'Consommation Moyenne',
              description: 'Consommation moyenne de carburant en litres pour 100 km, calculee sur l\'ensemble de la flotte. La reference est de 8.5 L/100km.',
              formula: '(Carburant total / Distance totale) x 100',
              breakdown: [
                { label: 'Excellent', value: '< 7 L/100', color: 'bg-emerald-500' },
                { label: 'Normal', value: '7-10 L/100', color: 'bg-amber-500' },
                { label: 'Eleve', value: '> 10 L/100', color: 'bg-red-500' },
              ],
              tip: 'Une consommation elevee peut indiquer: pression pneus basse, conduite agressive, chargement excessif, ou probleme mecanique.'
            }} />
          <KPICard label="Cout carburant" value={summary.totalFuelCost.toLocaleString('fr-FR')} unit="CHF" icon={DollarSign}
            subtitle={`${summary.totalFuelL.toFixed(0)} litres a ${FUEL_PRICE_CHF} CHF/L`}
            explanation={{
              title: 'Cout Carburant',
              description: `Cout total estime du carburant consomme par la flotte. Base sur le prix configure de ${FUEL_PRICE_CHF} CHF/litre.`,
              formula: `Litres consommes x ${FUEL_PRICE_CHF} CHF/L`,
              tip: 'Ce cout peut etre reduit en diminuant le ralenti excessif et en formant les conducteurs a l\'eco-conduite.'
            }} />
          <KPICard label="Temps ralenti" value={summary.totalIdleH} unit="h" icon={Clock}
            status={parseFloat(summary.totalIdleH) > 50 ? 'warning' : 'good'} subtitle={`~${summary.idleCostEstimate} CHF de perte`}
            explanation={{
              title: 'Temps Ralenti',
              description: 'Temps total ou le moteur tourne alors que le vehicule est a l\'arret (vitesse < 5 km/h). C\'est du carburant brule inutilement.',
              formula: `Cout = Heures ralenti x 1.5 L/h x ${FUEL_PRICE_CHF} CHF/L`,
              breakdown: [
                { label: 'Heures ralenti total', value: `${summary.totalIdleH}h`, color: 'bg-amber-500' },
                { label: 'Perte estimee', value: `${summary.idleCostEstimate} CHF`, color: 'bg-red-500' },
              ],
              tip: 'Le ralenti represente souvent 10-30% de la consommation totale. Sensibilisez les conducteurs a couper le moteur lors des arrets prolonges.'
            }} />
          <KPICard label="Alertes" value={summary.alertCount} icon={AlertTriangle}
            status={summary.alertCount === 0 ? 'good' : summary.alertCount <= 5 ? 'warning' : 'danger'} subtitle={`${summary.violations} exces vitesse`}
            explanation={{
              title: 'Alertes Actives',
              description: 'Nombre total d\'alertes: vehicules avec efficacite < 50% + vehicules offline + exces de vitesse detectes.',
              breakdown: [
                { label: 'Vehicules inefficaces (<50%)', value: compVehicles.filter(v => (v.efficiency_score || 0) < 50).length, color: 'bg-red-500' },
                { label: 'Vehicules offline', value: summary.offline, color: 'bg-gray-500' },
                { label: 'Exces de vitesse', value: summary.violations, color: 'bg-amber-500' },
              ],
              tip: 'Traitez les alertes rouges en priorite: vehicules inefficaces et violations de vitesse repetees.'
            }} />
          <KPICard label="Heures moteur" value={summary.totalEngineH.toFixed(0)} unit="h" icon={Activity} trend={-1.5} trendLabel="vs sem."
            explanation={{
              title: 'Heures Moteur',
              description: 'Temps total de fonctionnement des moteurs de tous les vehicules. Inclut le temps de conduite ET le temps de ralenti.',
              formula: 'Heures moteur = Temps conduite + Temps ralenti',
              tip: 'Comparez les heures moteur avec la distance parcourue. Un ratio eleve (beaucoup d\'heures, peu de km) indique un ralenti excessif.'
            }} />
        </div>

        {/* Insights + Risk */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6" data-testid="ai-insights">
            <SectionHeader icon={Zap} title="Insights Intelligents" count={insights.length} />
            <div className="space-y-2.5">
              {insights.map((ins, idx) => {
                const iconMap = { AlertTriangle, WifiOff, Clock, Fuel, ShieldAlert, Truck, CheckCircle };
                const IconComp = iconMap[ins.icon] || AlertTriangle;
                return <InsightCard key={idx} {...ins} icon={IconComp} />;
              })}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="risk-block">
            <SectionHeader icon={DollarSign} title="Risque Financier" iconBg="bg-red-100" iconColor="text-red-600" />
            <div className="space-y-3">
              <RiskCard label="Perte ralenti excessif" value={risk.idleCost} icon={Clock} color="red" />
              <RiskCard label="Surconsommation estimee" value={risk.fuelWaste} icon={Fuel} color="amber" />
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Cout total estime / mois</span>
                <span className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>{risk.monthlyEstimate} CHF</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Repartition Scores</h4>
            {(() => {
              const d = [
                { name: '>70%', value: compVehicles.filter(v => v.efficiency_score >= 70).length, color: '#10B981' },
                { name: '40-70%', value: compVehicles.filter(v => v.efficiency_score >= 40 && v.efficiency_score < 70).length, color: '#F59E0B' },
                { name: '<40%', value: compVehicles.filter(v => v.efficiency_score < 40).length, color: '#EF4444' },
              ].filter(x => x.value > 0);
              return (
                <div className="flex items-center gap-4">
                  <div className="w-28 h-28 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={d} cx="50%" cy="50%" innerRadius={28} outerRadius={50} dataKey="value" strokeWidth={2} stroke="#fff">
                        {d.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie></PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 flex-1">{d.map(item => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} /><span className="text-[10px] text-gray-600">{item.name}</span></div>
                      <span className="text-xs font-bold tabular-nums">{item.value}</span>
                    </div>
                  ))}</div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Fleet Table */}
        <FleetTable vehicles={vehicles} comparison={comparison} />
      </div>
    </div>
  );
};
