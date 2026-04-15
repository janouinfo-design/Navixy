import { useState, useEffect, useCallback } from "react";
import { API, api } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import {
  MapPin, Gauge, Fuel, AlertTriangle, Target, RefreshCw
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

export const TrendsView = ({ onMenuClick }) => {
  const [trends, setTrends] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [trendsRes, compRes] = await Promise.all([
        api.get(`${API}/analytics/trends`, { params: { period } }),
        api.get(`${API}/analytics/vehicle-comparison`)
      ]);
      if (trendsRes.data.success) setTrends(trendsRes.data);
      if (compRes.data.success) setComparison(compRes.data);
    } catch (error) {
      console.error("Error fetching trends:", error);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]" data-testid="loading">
        <RefreshCw className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  return (
    <div data-testid="trends-view">
      <Header title="Tendances & Analyse" subtitle="Performances sur la periode" onMenuClick={onMenuClick} onRefresh={fetchData}>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
          {['week', 'month'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p ? 'bg-[#111] text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              data-testid={`trend-period-${p}`}
            >
              {p === 'week' ? 'Semaine' : 'Mois'}
            </button>
          ))}
        </div>
      </Header>

      <div className="p-4 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Distance Totale', value: `${trends?.summary?.total_distance || 0} km`, icon: MapPin, color: 'text-gray-900' },
            { label: 'Efficacite Moy.', value: `${trends?.summary?.avg_efficiency || 0}%`, icon: Gauge, color: 'text-emerald-600' },
            { label: 'Carburant Total', value: `${trends?.summary?.total_fuel || 0} L`, icon: Fuel, color: 'text-amber-600' },
            { label: 'Violations', value: trends?.summary?.total_violations || 0, icon: AlertTriangle, color: 'text-red-500' },
            { label: 'Meilleur Jour', value: trends?.summary?.best_day?.split('-').slice(1).join('/'), icon: Target, color: 'text-emerald-600' },
          ].map((item, idx) => (
            <div key={idx} className="kpi-card bg-white rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <item.icon size={14} className="text-gray-400" />
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{item.label}</span>
              </div>
              <div className={`text-xl font-semibold ${item.color}`} style={{ fontFamily: 'Outfit, sans-serif' }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-800 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Evolution de l'efficacite</h4>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trends?.trends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="day_name" tick={{ fontSize: 11, fill: '#8A8A8E' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8A8A8E' }} domain={[0, 100]} axisLine={false} tickLine={false} width={35} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} formatter={(v) => [`${v}%`, 'Efficacite']} />
                <Area type="monotone" dataKey="avg_efficiency" stroke="#111" fill="#f3f4f6" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-800 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Distance parcourue (km)</h4>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trends?.trends || []} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="day_name" tick={{ fontSize: 11, fill: '#8A8A8E' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8A8A8E' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} formatter={(v) => [`${v} km`, 'Distance']} />
                <Bar dataKey="total_distance" fill="#111" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Vehicle Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-800 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Top Performers</h4>
            <div className="space-y-3">
              {comparison?.vehicles?.slice(0, 5).map((vehicle, idx) => (
                <div key={vehicle.tracker_id} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs ${
                    idx === 0 ? 'bg-gray-900' : idx === 1 ? 'bg-gray-600' : idx === 2 ? 'bg-gray-400' : 'bg-gray-300'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{vehicle.label}</div>
                    <div className="text-[10px] text-gray-400">{vehicle.total_distance_week} km/sem.</div>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${
                    vehicle.efficiency_score >= 70 ? 'text-emerald-600' :
                    vehicle.efficiency_score >= 50 ? 'text-amber-600' : 'text-red-500'
                  }`}>
                    {vehicle.efficiency_score}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-800 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Repartition par efficacite</h4>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Excellent (>70%)', value: comparison?.vehicles?.filter(v => v.efficiency_score >= 70).length || 0 },
                    { name: 'Bon (50-70%)', value: comparison?.vehicles?.filter(v => v.efficiency_score >= 50 && v.efficiency_score < 70).length || 0 },
                    { name: 'A ameliorer (<50%)', value: comparison?.vehicles?.filter(v => v.efficiency_score < 50).length || 0 },
                  ]}
                  cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" strokeWidth={2} stroke="#fff"
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}
                >
                  <Cell fill="#10B981" />
                  <Cell fill="#F59E0B" />
                  <Cell fill="#EF4444" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Needs Attention */}
        {comparison?.needs_attention?.length > 0 && (
          <div className="bg-red-50/50 rounded-xl border border-red-100 p-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="text-red-500" size={16} />
              <h4 className="text-sm font-semibold text-red-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Vehicules necessitant attention</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {comparison.needs_attention.map((vehicle) => (
                <div key={vehicle.tracker_id} className="bg-white rounded-lg p-3 border border-red-100">
                  <div className="text-sm font-medium text-gray-800">{vehicle.label}</div>
                  <div className="flex justify-between mt-2 text-xs">
                    <span className="text-gray-500">Efficacite:</span>
                    <span className="text-red-600 font-bold">{vehicle.efficiency_score}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Ralenti:</span>
                    <span className="text-gray-700">{vehicle.idle_percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
