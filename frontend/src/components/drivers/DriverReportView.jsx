import { useState, useEffect, useCallback } from "react";
import { API, api } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import {
  Users, Truck, Download, RefreshCw, ChevronRight
} from "lucide-react";

export const DriverReportView = ({ onMenuClick }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');
  const [fromDate, setFromDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedDriver, setExpandedDriver] = useState(null);

  const fetchReport = useCallback(async (from, to) => {
    setLoading(true);
    try {
      const response = await api.get(`${API}/reports/driver`, {
        params: { from_date: from || fromDate, to_date: to || toDate }
      });
      if (response.data.success) setReport(response.data);
    } catch (error) {
      console.error("Error fetching driver report:", error);
    }
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => { fetchReport(); }, []);

  const handlePeriodApply = (from, to) => fetchReport(from, to);

  const exportReport = async (format) => {
    try {
      const response = await api.get(`${API}/export/driver-report`, {
        params: { from_date: fromDate, to_date: toDate, format },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `driver_report_${fromDate}_${toDate}.${format}`);
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
    <div data-testid="driver-report-view">
      <Header title="Rapport Conducteurs" subtitle="Vehicules utilises par chaque conducteur" onMenuClick={onMenuClick} onRefresh={() => fetchReport()}>
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

      <div className="p-4 lg:p-8 space-y-4 max-w-[1600px] mx-auto">
        {report?.drivers?.map((driver) => (
          <div key={driver.employee_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div
              className="px-6 py-4 flex items-center justify-between cursor-pointer fleet-row"
              onClick={() => setExpandedDriver(expandedDriver === driver.employee_id ? null : driver.employee_id)}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <Users className="text-gray-500" size={18} />
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900">{driver.driver_name}</div>
                  <div className="text-xs text-gray-500">
                    {driver.phone && <span className="mr-3">{driver.phone}</span>}
                    <span>N. {driver.personnel_number || driver.employee_id}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>{driver.vehicles_count}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Vehicules</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {(driver.total_distance / 1000).toFixed(1)} km
                  </div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Distance</div>
                </div>
                <ChevronRight
                  className={`text-gray-400 transition-transform ${expandedDriver === driver.employee_id ? 'rotate-90' : ''}`}
                  size={16}
                />
              </div>
            </div>

            {expandedDriver === driver.employee_id && (
              <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/50">
                <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Vehicules utilises</h5>
                {driver.vehicles.length === 0 ? (
                  <p className="text-xs text-gray-400">Aucun vehicule enregistre</p>
                ) : (
                  <div className="space-y-2">
                    {driver.vehicles.map((vehicle, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                        <div className="flex items-center gap-3">
                          <Truck className="text-gray-400" size={16} />
                          <div>
                            <div className="text-sm font-medium text-gray-800">{vehicle.vehicle_label}</div>
                            <div className="text-[10px] text-gray-400">{vehicle.start_time} - {vehicle.end_time}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-800">{(vehicle.distance / 1000).toFixed(1)} km</div>
                          {vehicle.note && <div className="text-[10px] text-blue-500">{vehicle.note}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {report?.drivers?.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Users className="mx-auto text-gray-300" size={40} />
            <p className="mt-3 text-sm text-gray-400">Aucun conducteur trouve</p>
          </div>
        )}
      </div>
    </div>
  );
};
