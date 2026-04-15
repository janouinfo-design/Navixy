import { useState, useEffect, useCallback } from "react";
import { API, api } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import {
  Truck, Download, RefreshCw, Clock, MapPin, Gauge,
  Activity, ChevronDown, Navigation, Fuel, AlertTriangle, Zap
} from "lucide-react";

export const FleetEfficiencyView = ({ onMenuClick }) => {
  const [efficiency, setEfficiency] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');
  const [fromDate, setFromDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedVehicle, setExpandedVehicle] = useState(null);

  const fetchData = useCallback(async (from, to) => {
    setLoading(true);
    try {
      const [effRes, statsRes] = await Promise.all([
        api.get(`${API}/fleet/efficiency`, {
          params: { date: from || fromDate, period: period === 'today' ? 'day' : period }
        }),
        api.get(`${API}/fleet/stats`, {
          params: { from_date: from || fromDate, to_date: to || toDate }
        })
      ]);
      if (effRes.data.success) setEfficiency(effRes.data);
      if (statsRes.data.success) setStats(statsRes.data);
    } catch (error) {
      console.error("Error fetching fleet data:", error);
    }
    setLoading(false);
  }, [fromDate, toDate, period]);

  useEffect(() => { fetchData(); }, []);

  const handlePeriodApply = (from, to) => fetchData(from, to);

  const formatTime = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const exportReport = async (format) => {
    try {
      const response = await api.get(`${API}/export/fleet-stats`, {
        params: { from_date: fromDate, to_date: toDate, format },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fleet_stats_${fromDate}_${toDate}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Export error:", error);
    }
  };

  // Build a map of stats data by tracker_id for enrichment
  const statsMap = {};
  (stats?.vehicles || []).forEach(v => { statsMap[v.tracker_id] = v; });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]" data-testid="loading">
        <RefreshCw className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  const totalDistance = stats?.summary?.total_mileage || 0;
  const totalEngineHours = stats?.summary?.total_engine_hours || 0;
  const activeCount = (stats?.vehicles || []).filter(v => v.connection_status === 'active').length;

  return (
    <div data-testid="fleet-efficiency-view">
      <Header title="Efficacite de la flotte" onMenuClick={onMenuClick} onRefresh={() => fetchData()}>
        <PeriodSelector
          period={period} setPeriod={setPeriod}
          fromDate={fromDate} setFromDate={setFromDate}
          toDate={toDate} setToDate={setToDate}
          onApply={handlePeriodApply}
        />
        <button onClick={() => exportReport('csv')} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-xs font-medium text-gray-600">
          <Download size={13} /> CSV
        </button>
      </Header>

      <div className="p-4 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
        {/* Summary cards */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-500 mb-4">
            {new Date(fromDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            {fromDate !== toDate && ` - ${new Date(toDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              { label: 'Efficacite moy.', value: `${efficiency?.summary?.average_efficiency || 0}%`, color: (efficiency?.summary?.average_efficiency || 0) >= 50 ? 'text-emerald-600' : 'text-red-500' },
              { label: 'Distance totale', value: `${totalDistance.toFixed(0)} km`, color: 'text-gray-900' },
              { label: 'Temps conduite moy.', value: formatTime(efficiency?.summary?.avg_driving_time_per_day) },
              { label: 'Temps au ralenti moy.', value: formatTime(efficiency?.summary?.avg_idle_time_per_day) },
              { label: 'Vehicules actifs', value: `${activeCount} / ${stats?.summary?.total_vehicles || 0}`, color: 'text-gray-900' },
              { label: 'Heures moteur', value: `${totalEngineHours.toFixed(0)} h`, color: 'text-gray-900' },
            ].map((item, idx) => (
              <div key={idx} className="text-center p-4 bg-gray-50 rounded-xl">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">{item.label}</div>
                <div className={`text-xl font-semibold ${item.color || 'text-gray-800'}`} style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Vehicle Timeline with expandable details */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100 flex items-center">
            <div className="w-32 lg:w-44 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Vehicule</div>
            <div className="flex-1 flex justify-between text-[10px] text-gray-400 px-2">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i}>{String(i * 3).padStart(2, '0')}:00</span>
              ))}
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {efficiency?.vehicles?.map((vehicle) => {
              const vStats = statsMap[vehicle.tracker_id] || {};
              const isExpanded = expandedVehicle === vehicle.tracker_id;

              return (
                <div key={vehicle.tracker_id}>
                  {/* Vehicle row */}
                  <div
                    className={`px-6 py-3 flex items-center cursor-pointer transition-colors ${isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50/50'}`}
                    onClick={() => setExpandedVehicle(isExpanded ? null : vehicle.tracker_id)}
                    data-testid={`eff-vehicle-${vehicle.tracker_id}`}
                  >
                    <div className="w-32 lg:w-44 flex items-center gap-2">
                      <ChevronDown size={12} className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                      <span className={`inline-flex items-center justify-center w-9 h-7 rounded-lg text-[10px] font-bold text-white flex-shrink-0 ${
                        vehicle.efficiency >= 50 ? 'bg-emerald-500' : vehicle.efficiency >= 20 ? 'bg-amber-500' : 'bg-red-500'
                      }`}>
                        {vehicle.efficiency}%
                      </span>
                      <div className="flex items-center gap-1 text-xs text-gray-700 truncate min-w-0">
                        <Truck size={12} className="text-gray-400 flex-shrink-0" />
                        <span className="truncate font-medium" title={vehicle.label}>{vehicle.label}</span>
                      </div>
                    </div>
                    <div className="flex-1 h-7 bg-gray-100 rounded-lg relative overflow-hidden">
                      {/* Driving time bar */}
                      <div
                        className="absolute left-0 top-0 h-full rounded-lg bg-emerald-400"
                        style={{ width: `${Math.min(100, Math.max(1, (vehicle.driving_time / 864) || vehicle.efficiency))}%` }}
                        title="Conduite"
                      />
                      {/* Idle time bar */}
                      <div
                        className="absolute top-0 h-full bg-amber-400"
                        style={{
                          left: `${Math.min(100, Math.max(1, (vehicle.driving_time / 864) || vehicle.efficiency))}%`,
                          width: `${Math.min(50, (vehicle.idle_time / 864) || 0)}%`
                        }}
                        title="Ralenti"
                      />
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-t border-gray-100 px-6 py-5" data-testid={`eff-detail-${vehicle.tracker_id}`}>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {/* Distance */}
                        <div className="bg-white rounded-xl p-4 border border-gray-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <MapPin size={12} className="text-blue-500" />
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Distance (periode)</span>
                          </div>
                          <div className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                            {(vStats.mileage || 0).toFixed(1)}
                            <span className="text-xs font-normal text-gray-400 ml-1">km</span>
                          </div>
                        </div>

                        {/* Total Odometer */}
                        <div className="bg-white rounded-xl p-4 border border-gray-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Navigation size={12} className="text-gray-500" />
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Odometre total</span>
                          </div>
                          <div className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                            {((vStats.total_odometer || 0)).toLocaleString('fr-FR')}
                            <span className="text-xs font-normal text-gray-400 ml-1">km</span>
                          </div>
                        </div>

                        {/* Driving time */}
                        <div className="bg-white rounded-xl p-4 border border-gray-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Activity size={12} className="text-emerald-500" />
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Temps conduite</span>
                          </div>
                          <div className="text-xl font-semibold text-emerald-600" style={{ fontFamily: 'Outfit, sans-serif' }}>
                            {formatTime(vehicle.driving_time)}
                          </div>
                        </div>

                        {/* Idle time */}
                        <div className="bg-white rounded-xl p-4 border border-gray-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Clock size={12} className="text-amber-500" />
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Temps ralenti</span>
                          </div>
                          <div className="text-xl font-semibold text-amber-600" style={{ fontFamily: 'Outfit, sans-serif' }}>
                            {formatTime(vehicle.idle_time)}
                          </div>
                        </div>

                        {/* Speed */}
                        <div className="bg-white rounded-xl p-4 border border-gray-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Gauge size={12} className="text-blue-500" />
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Vitesse actuelle</span>
                          </div>
                          <div className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                            {vStats.speed || vehicle.speed || 0}
                            <span className="text-xs font-normal text-gray-400 ml-1">km/h</span>
                          </div>
                        </div>

                        {/* Engine hours */}
                        <div className="bg-white rounded-xl p-4 border border-gray-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Zap size={12} className="text-purple-500" />
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Heures moteur</span>
                          </div>
                          <div className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                            {(vStats.engine_hours || 0).toFixed(0)}
                            <span className="text-xs font-normal text-gray-400 ml-1">h</span>
                          </div>
                        </div>
                      </div>

                      {/* Additional info */}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${
                          (vStats.connection_status || vehicle.movement_status) === 'active' || vehicle.movement_status === 'moving'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : vehicle.movement_status === 'idle'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            vehicle.movement_status === 'moving' ? 'bg-emerald-500' :
                            vehicle.movement_status === 'idle' ? 'bg-amber-500' : 'bg-gray-400'
                          }`} />
                          {vehicle.movement_status === 'moving' ? 'En mouvement' :
                           vehicle.movement_status === 'idle' ? 'Au ralenti' : 'Arrete'}
                        </span>
                        <span>Modele: <strong className="text-gray-700">{vStats.model || '-'}</strong></span>
                        {vStats.last_update && (
                          <span>MAJ: <strong className="text-gray-700">{new Date(vStats.last_update).toLocaleString('fr-FR')}</strong></span>
                        )}
                        {vStats.location && (vStats.location.lat !== 0 || vStats.location.lng !== 0) && (
                          <span>GPS: <strong className="text-gray-700">{vStats.location.lat?.toFixed(4)}, {vStats.location.lng?.toFixed(4)}</strong></span>
                        )}
                      </div>

                      {/* Efficiency bar detail */}
                      <div className="mt-3 bg-white rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-emerald-400" />
                            <span className="text-gray-600">Conduite: {formatTime(vehicle.driving_time)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-amber-400" />
                            <span className="text-gray-600">Ralenti: {formatTime(vehicle.idle_time)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-gray-300" />
                            <span className="text-gray-600">Arrete: {formatTime(vehicle.stopped_time)}</span>
                          </div>
                        </div>
                        <div className="mt-2 w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                          <div className="h-full bg-emerald-400" style={{ width: `${(vehicle.driving_time / 864) || 0}%` }} />
                          <div className="h-full bg-amber-400" style={{ width: `${(vehicle.idle_time / 864) || 0}%` }} />
                          <div className="h-full bg-gray-300 flex-1" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
