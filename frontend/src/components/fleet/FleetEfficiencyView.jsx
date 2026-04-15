import { useState, useEffect, useCallback } from "react";
import { API, api } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import {
  Truck, Download, RefreshCw, Clock
} from "lucide-react";

export const FleetEfficiencyView = ({ onMenuClick }) => {
  const [efficiency, setEfficiency] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchEfficiency = useCallback(async (from, to) => {
    setLoading(true);
    try {
      const response = await api.get(`${API}/fleet/efficiency`, {
        params: { date: from || fromDate, period: period === 'today' ? 'day' : period }
      });
      if (response.data.success) {
        setEfficiency(response.data);
      }
    } catch (error) {
      console.error("Error fetching efficiency:", error);
    }
    setLoading(false);
  }, [fromDate, period]);

  useEffect(() => { fetchEfficiency(); }, []);

  const handlePeriodApply = (from, to) => fetchEfficiency(from, to);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]" data-testid="loading">
        <RefreshCw className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  return (
    <div data-testid="fleet-efficiency-view">
      <Header title="Efficacite de la flotte" onMenuClick={onMenuClick} onRefresh={() => fetchEfficiency()}>
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
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Efficacite moy.', value: `${efficiency?.summary?.average_efficiency || 0}%`, color: (efficiency?.summary?.average_efficiency || 0) >= 50 ? 'text-emerald-600' : 'text-red-500' },
              { label: 'Temps conduite moy.', value: formatTime(efficiency?.summary?.avg_driving_time_per_day) },
              { label: 'Temps au ralenti moy.', value: formatTime(efficiency?.summary?.avg_idle_time_per_day) },
              { label: 'Contact coupe moy.', value: formatTime(efficiency?.summary?.avg_stopped_time_per_day) },
              { label: 'Total vehicules', value: efficiency?.vehicles?.length || 0 },
            ].map((item, idx) => (
              <div key={idx} className="text-center p-4 bg-gray-50 rounded-xl">
                <div className="text-xs text-gray-500 mb-2">{item.label}</div>
                <div className={`text-2xl font-semibold ${item.color || 'text-gray-800'}`} style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Vehicle Timeline */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100 flex items-center">
            <div className="w-28 lg:w-36 text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicule</div>
            <div className="flex-1 flex justify-between text-[10px] text-gray-400 px-2">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i}>{String(i * 3).padStart(2, '0')}:00</span>
              ))}
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {efficiency?.vehicles?.map((vehicle) => (
              <div key={vehicle.tracker_id} className="px-6 py-3 flex items-center fleet-row">
                <div className="w-28 lg:w-36 flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-bold text-white ${
                    vehicle.efficiency >= 50 ? 'bg-emerald-500' : vehicle.efficiency >= 20 ? 'bg-amber-500' : 'bg-red-500'
                  }`}>
                    {vehicle.efficiency}%
                  </span>
                  <div className="flex items-center gap-1 text-xs text-gray-600 truncate">
                    <Truck size={12} className="text-gray-400 flex-shrink-0" />
                    <span className="truncate" title={vehicle.label}>{vehicle.label}</span>
                  </div>
                </div>
                <div className="flex-1 h-7 bg-gray-100 rounded-lg relative overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-lg ${
                      vehicle.movement_status === 'moving' ? 'bg-emerald-400' :
                      vehicle.movement_status === 'idle' ? 'bg-amber-400' : 'bg-gray-300'
                    }`}
                    style={{ width: `${Math.max(2, vehicle.efficiency)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
