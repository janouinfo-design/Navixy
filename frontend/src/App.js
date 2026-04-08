import { useState, useEffect, useCallback } from "react";
import "@/App.css";
import axios from "axios";
import { 
  Truck, Users, Activity, Download, Plus, Settings, 
  ChevronLeft, ChevronRight, Calendar, BarChart3, 
  Gauge, Clock, Zap, MapPin, RefreshCw, FileText,
  Play, Square, Circle, ArrowRight, Trash2, Save,
  Menu, X, Filter, Search
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ============ SIDEBAR COMPONENT ============
const Sidebar = ({ activeView, setActiveView, isOpen, setIsOpen }) => {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "fleet", label: "Efficacité Flotte", icon: Truck },
    { id: "drivers", label: "Rapport Conducteurs", icon: Users },
    { id: "iot-flow", label: "Logique IoT", icon: Zap },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white border-r border-gray-200
        transform transition-transform duration-200
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">
              <span className="text-red-500">Navixy</span> Dashboard
            </h1>
            <button 
              className="lg:hidden p-2 hover:bg-gray-100 rounded"
              onClick={() => setIsOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
        </div>
        
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              onClick={() => {
                setActiveView(item.id);
                setIsOpen(false);
              }}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-lg
                transition-all duration-200 text-left
                ${activeView === item.id 
                  ? 'bg-red-50 text-red-600 border-l-4 border-red-500' 
                  : 'text-gray-600 hover:bg-gray-100'}
              `}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
};

// ============ HEADER COMPONENT ============
const Header = ({ title, onMenuClick }) => (
  <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button 
          className="lg:hidden p-2 hover:bg-gray-100 rounded"
          onClick={onMenuClick}
          data-testid="menu-toggle"
        >
          <Menu size={24} />
        </button>
        <h2 className="text-xl lg:text-2xl font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        <button 
          className="p-2 hover:bg-gray-100 rounded-full"
          data-testid="settings-btn"
        >
          <Settings size={20} className="text-gray-500" />
        </button>
      </div>
    </div>
  </header>
);

// ============ STAT CARD COMPONENT ============
const StatCard = ({ label, value, icon: Icon, color = "gray" }) => {
  const colorClasses = {
    red: "bg-red-50 text-red-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    gray: "bg-gray-50 text-gray-600"
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon size={20} />
        </div>
      </div>
      <div className="text-2xl lg:text-3xl font-bold text-gray-800">{value}</div>
    </div>
  );
};

// ============ DATE PICKER COMPONENT ============
const DatePicker = ({ date, setDate, period, setPeriod }) => {
  const formatDate = (d) => {
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    return new Date(d).toLocaleDateString('fr-FR', options);
  };

  const navigateDate = (direction) => {
    const d = new Date(date);
    const multiplier = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    d.setDate(d.getDate() + (direction * multiplier));
    setDate(d.toISOString().split('T')[0]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 lg:gap-4 bg-white rounded-lg border border-gray-200 p-2 lg:p-3">
      <div className="flex items-center gap-1">
        {['day', 'week', 'month'].map((p) => (
          <button
            key={p}
            data-testid={`period-${p}`}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              period === p 
                ? 'bg-red-500 text-white' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {p === 'day' ? 'Jour' : p === 'week' ? 'Semaine' : 'Mois'}
          </button>
        ))}
      </div>
      
      <div className="flex items-center gap-2">
        <button 
          onClick={() => navigateDate(-1)}
          className="p-1.5 hover:bg-gray-100 rounded"
          data-testid="prev-date"
        >
          <ChevronLeft size={20} />
        </button>
        
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded">
          <Calendar size={16} className="text-gray-400" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent border-none text-sm font-medium text-gray-700 focus:outline-none"
            data-testid="date-input"
          />
        </div>
        
        <button 
          onClick={() => navigateDate(1)}
          className="p-1.5 hover:bg-gray-100 rounded"
          data-testid="next-date"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};

// ============ DASHBOARD VIEW ============
const DashboardView = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/fleet/stats`, {
        params: { from_date: date, to_date: date }
      });
      if (response.data.success) {
        setStats(response.data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
    setLoading(false);
  }, [date]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading">
        <RefreshCw className="animate-spin text-red-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="dashboard-view">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Vue d'ensemble</h3>
          <p className="text-sm text-gray-500">Statistiques en temps réel de votre flotte</p>
        </div>
        <button 
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          data-testid="refresh-btn"
        >
          <RefreshCw size={18} />
          Actualiser
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Véhicules Total" 
          value={stats?.summary?.total_vehicles || 0} 
          icon={Truck} 
          color="blue" 
        />
        <StatCard 
          label="Efficacité Moyenne" 
          value={`${stats?.summary?.average_efficiency || 0}%`} 
          icon={Gauge} 
          color="green" 
        />
        <StatCard 
          label="Kilométrage Total" 
          value={`${(stats?.summary?.total_mileage / 1000).toFixed(0)} km`} 
          icon={MapPin} 
          color="red" 
        />
        <StatCard 
          label="Heures Moteur" 
          value={`${stats?.summary?.total_engine_hours || 0}h`} 
          icon={Clock} 
          color="yellow" 
        />
      </div>

      {/* Vehicles List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
          <h4 className="font-semibold text-gray-800">État des véhicules</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="vehicles-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Véhicule</th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Modèle</th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Efficacité</th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kilométrage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stats?.vehicles?.map((vehicle) => (
                <tr key={vehicle.tracker_id} className="hover:bg-gray-50">
                  <td className="px-4 lg:px-6 py-4 text-sm font-medium text-gray-900">{vehicle.label}</td>
                  <td className="px-4 lg:px-6 py-4 text-sm text-gray-500">{vehicle.model}</td>
                  <td className="px-4 lg:px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      vehicle.connection_status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {vehicle.connection_status === 'active' ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 lg:px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            vehicle.efficiency >= 70 ? 'bg-green-500' : 
                            vehicle.efficiency >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${vehicle.efficiency}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{vehicle.efficiency}%</span>
                    </div>
                  </td>
                  <td className="px-4 lg:px-6 py-4 text-sm text-gray-500">
                    {(vehicle.mileage / 1000).toFixed(0)} km
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============ FLEET EFFICIENCY VIEW ============
const FleetEfficiencyView = () => {
  const [efficiency, setEfficiency] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState('day');

  const fetchEfficiency = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/fleet/efficiency`, {
        params: { date, period }
      });
      if (response.data.success) {
        setEfficiency(response.data);
      }
    } catch (error) {
      console.error("Error fetching efficiency:", error);
    }
    setLoading(false);
  }, [date, period]);

  useEffect(() => {
    fetchEfficiency();
  }, [fetchEfficiency]);

  const formatTime = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const exportReport = async (format) => {
    try {
      const response = await axios.get(`${API}/export/fleet-stats`, {
        params: { from_date: date, to_date: date, format },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fleet_stats_${date}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Export error:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-red-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="fleet-efficiency-view">
      {/* Header with controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-800">Efficacité de la flotte</h3>
          <button className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <FileText size={16} />
            Instructions
          </button>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker date={date} setDate={setDate} period={period} setPeriod={setPeriod} />
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => exportReport('csv')}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              data-testid="export-csv-btn"
            >
              <Download size={16} />
              CSV
            </button>
            <button 
              onClick={() => exportReport('json')}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              data-testid="export-json-btn"
            >
              <Download size={16} />
              JSON
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
        <div className="text-lg font-medium text-gray-700 mb-4">{date}</div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500 mb-2">Efficacité moyenne</div>
            <div className={`text-3xl font-bold ${
              efficiency?.summary?.average_efficiency >= 50 ? 'text-green-500' : 'text-red-500'
            }`}>
              {efficiency?.summary?.average_efficiency || 0}%
            </div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500 mb-2">Temps moyen de conduite par jour</div>
            <div className="text-2xl font-semibold text-gray-800">
              {formatTime(efficiency?.summary?.avg_driving_time_per_day)}
            </div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500 mb-2">Temps moyen au ralenti par jour</div>
            <div className="text-2xl font-semibold text-gray-800">
              {formatTime(efficiency?.summary?.avg_idle_time_per_day)}
            </div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500 mb-2">Temps moyen contact coupé</div>
            <div className="text-2xl font-semibold text-gray-800">
              {formatTime(efficiency?.summary?.avg_stopped_time_per_day)}
            </div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500 mb-2">Temps moyen contact enclenché</div>
            <div className="text-2xl font-semibold text-gray-800">-</div>
          </div>
        </div>
      </div>

      {/* Timeline Header */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 lg:px-6 py-3 border-b border-gray-200 flex items-center">
          <div className="w-24 lg:w-32 font-medium text-gray-700">Efficacité</div>
          <div className="flex-1 flex justify-between text-xs text-gray-400 px-2">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i}>{String(i * 3).padStart(2, '0')}:00</span>
            ))}
          </div>
        </div>

        {/* Vehicle Rows */}
        <div className="divide-y divide-gray-100">
          <div className="px-4 lg:px-6 py-2 text-sm font-medium text-gray-600 bg-gray-50">
            Véhicules
          </div>
          {efficiency?.vehicles?.map((vehicle) => (
            <div key={vehicle.tracker_id} className="px-4 lg:px-6 py-3 flex items-center hover:bg-gray-50">
              <div className="w-24 lg:w-32 flex items-center gap-2">
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded text-xs font-bold text-white ${
                  vehicle.efficiency >= 50 ? 'bg-green-500' : 'bg-red-500'
                }`}>
                  {vehicle.efficiency}%
                </span>
                <div className="flex items-center gap-1 text-sm text-gray-600 truncate">
                  <Truck size={14} />
                  <span className="truncate" title={vehicle.label}>{vehicle.label}</span>
                </div>
              </div>
              <div className="flex-1 h-8 bg-gray-100 rounded relative overflow-hidden">
                {/* This would show activity timeline - simplified for now */}
                <div 
                  className={`absolute left-0 top-0 h-full ${
                    vehicle.movement_status === 'moving' ? 'bg-green-400' : 
                    vehicle.movement_status === 'idle' ? 'bg-yellow-400' : 'bg-gray-300'
                  }`}
                  style={{ width: `${vehicle.efficiency}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============ DRIVER REPORT VIEW ============
const DriverReportView = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedDriver, setExpandedDriver] = useState(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/reports/driver`, {
        params: { from_date: fromDate, to_date: toDate }
      });
      if (response.data.success) {
        setReport(response.data);
      }
    } catch (error) {
      console.error("Error fetching driver report:", error);
    }
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const exportReport = async (format) => {
    try {
      const response = await axios.get(`${API}/export/driver-report`, {
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
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-red-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="driver-report-view">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Rapport Conducteurs</h3>
          <p className="text-sm text-gray-500">Voir quels véhicules chaque conducteur a utilisés</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-2">
            <Calendar size={16} className="text-gray-400" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="text-sm border-none focus:outline-none"
              data-testid="from-date"
            />
            <span className="text-gray-400">→</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="text-sm border-none focus:outline-none"
              data-testid="to-date"
            />
          </div>
          
          <button 
            onClick={fetchReport}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            data-testid="apply-filter-btn"
          >
            <Filter size={16} />
            Appliquer
          </button>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => exportReport('csv')}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              data-testid="export-driver-csv"
            >
              <Download size={16} />
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* Drivers List */}
      <div className="space-y-4">
        {report?.drivers?.map((driver) => (
          <div 
            key={driver.employee_id} 
            className="bg-white rounded-lg border border-gray-200 overflow-hidden"
            data-testid={`driver-card-${driver.employee_id}`}
          >
            <div 
              className="px-4 lg:px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
              onClick={() => setExpandedDriver(
                expandedDriver === driver.employee_id ? null : driver.employee_id
              )}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <Users className="text-red-500" size={24} />
                </div>
                <div>
                  <div className="font-semibold text-gray-800">{driver.driver_name}</div>
                  <div className="text-sm text-gray-500">
                    {driver.phone && <span className="mr-3">{driver.phone}</span>}
                    <span>N° {driver.personnel_number || driver.employee_id}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-800">{driver.vehicles_count}</div>
                  <div className="text-xs text-gray-500">Véhicules</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {(driver.total_distance / 1000).toFixed(1)} km
                  </div>
                  <div className="text-xs text-gray-500">Distance</div>
                </div>
                <ChevronRight 
                  className={`text-gray-400 transition-transform ${
                    expandedDriver === driver.employee_id ? 'rotate-90' : ''
                  }`}
                  size={20}
                />
              </div>
            </div>
            
            {expandedDriver === driver.employee_id && (
              <div className="border-t border-gray-200 px-4 lg:px-6 py-4 bg-gray-50">
                <h5 className="font-medium text-gray-700 mb-3">Véhicules utilisés</h5>
                {driver.vehicles.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucun véhicule enregistré pour cette période</p>
                ) : (
                  <div className="space-y-2">
                    {driver.vehicles.map((vehicle, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                      >
                        <div className="flex items-center gap-3">
                          <Truck className="text-gray-400" size={20} />
                          <div>
                            <div className="font-medium text-gray-800">{vehicle.vehicle_label}</div>
                            <div className="text-xs text-gray-500">
                              {vehicle.start_time} → {vehicle.end_time}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-gray-800">
                            {(vehicle.distance / 1000).toFixed(1)} km
                          </div>
                          {vehicle.note && (
                            <div className="text-xs text-blue-500">{vehicle.note}</div>
                          )}
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
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <Users className="mx-auto text-gray-300" size={48} />
            <p className="mt-4 text-gray-500">Aucun conducteur trouvé</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ IOT FLOW EDITOR VIEW ============
const IoTFlowView = () => {
  const [flows, setFlows] = useState([]);
  const [currentFlow, setCurrentFlow] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [flowName, setFlowName] = useState("Default Flow");
  const [loading, setLoading] = useState(false);
  const [draggedNodeType, setDraggedNodeType] = useState(null);

  const nodeTypes = [
    { type: "data_source", label: "Source de données", icon: Activity, color: "blue" },
    { type: "output", label: "Point de sortie", icon: Square, color: "green" },
    { type: "attribute", label: "Initialiser un Attribut", icon: Settings, color: "purple" },
    { type: "logic", label: "Logique", icon: Zap, color: "yellow" },
    { type: "device_action", label: "Device action", icon: Play, color: "orange" },
    { type: "webhook", label: "Webhook", icon: ArrowRight, color: "red" },
  ];

  useEffect(() => {
    fetchFlows();
    // Initialize with default nodes
    setNodes([
      { id: "input-1", type: "data_source", label: "Default Input", position: { x: 100, y: 200 } },
      { id: "output-1", type: "output", label: "Default Output Endpoint", position: { x: 500, y: 200 } }
    ]);
    setConnections([
      { id: "conn-1", source_id: "input-1", target_id: "output-1" }
    ]);
  }, []);

  const fetchFlows = async () => {
    try {
      const response = await axios.get(`${API}/flows`);
      if (response.data.success) {
        setFlows(response.data.flows);
      }
    } catch (error) {
      console.error("Error fetching flows:", error);
    }
  };

  const saveFlow = async () => {
    setLoading(true);
    try {
      const flowData = { name: flowName, nodes, connections };
      
      if (currentFlow) {
        await axios.put(`${API}/flows/${currentFlow.id}`, flowData);
      } else {
        const response = await axios.post(`${API}/flows`, flowData);
        setCurrentFlow(response.data.flow);
      }
      fetchFlows();
      alert("Flux enregistré avec succès!");
    } catch (error) {
      console.error("Error saving flow:", error);
      alert("Erreur lors de l'enregistrement");
    }
    setLoading(false);
  };

  const loadFlow = (flow) => {
    setCurrentFlow(flow);
    setFlowName(flow.name);
    setNodes(flow.nodes || []);
    setConnections(flow.connections || []);
  };

  const createNewFlow = () => {
    setCurrentFlow(null);
    setFlowName("Nouveau Flux");
    setNodes([
      { id: `input-${Date.now()}`, type: "data_source", label: "Default Input", position: { x: 100, y: 200 } },
      { id: `output-${Date.now()}`, type: "output", label: "Default Output", position: { x: 500, y: 200 } }
    ]);
    setConnections([]);
  };

  const addNode = (nodeType) => {
    const typeConfig = nodeTypes.find(t => t.type === nodeType);
    const newNode = {
      id: `node-${Date.now()}`,
      type: nodeType,
      label: typeConfig?.label || "New Node",
      position: { x: 300, y: 100 + nodes.length * 80 }
    };
    setNodes([...nodes, newNode]);
  };

  const deleteNode = (nodeId) => {
    setNodes(nodes.filter(n => n.id !== nodeId));
    setConnections(connections.filter(c => c.source_id !== nodeId && c.target_id !== nodeId));
    setSelectedNode(null);
  };

  const exportFlow = () => {
    const flowData = { name: flowName, nodes, connections };
    const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${flowName.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const getNodeIcon = (type) => {
    const typeConfig = nodeTypes.find(t => t.type === type);
    const Icon = typeConfig?.icon || Circle;
    return Icon;
  };

  const getNodeColor = (type) => {
    const colors = {
      data_source: "border-blue-400 bg-blue-50",
      output: "border-green-400 bg-green-50",
      attribute: "border-purple-400 bg-purple-50",
      logic: "border-yellow-400 bg-yellow-50",
      device_action: "border-orange-400 bg-orange-50",
      webhook: "border-red-400 bg-red-50"
    };
    return colors[type] || "border-gray-400 bg-gray-50";
  };

  return (
    <div className="h-full flex flex-col" data-testid="iot-flow-view">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Flux de données</span>
          <select
            value={currentFlow?.id || ""}
            onChange={(e) => {
              const flow = flows.find(f => f.id === e.target.value);
              if (flow) loadFlow(flow);
            }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            data-testid="flow-select"
          >
            <option value="">Default Flow</option>
            {flows.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <input
            type="text"
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="Nom du flux"
            data-testid="flow-name-input"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={createNewFlow}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
            data-testid="new-flow-btn"
          >
            <Plus size={16} />
            Nouveau Flux
          </button>
          <button
            onClick={() => {}}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
            data-testid="upload-flow-btn"
          >
            <Plus size={16} />
            Télécharger
          </button>
          <button
            onClick={() => {}}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
            data-testid="data-analyzer-btn"
          >
            <BarChart3 size={16} />
            Analyseur de données
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Node Types */}
        <div className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto">
          <h4 className="font-semibold text-gray-700 mb-4">NŒUDS</h4>
          <div className="space-y-2">
            {nodeTypes.map((nodeType) => (
              <button
                key={nodeType.type}
                onClick={() => addNode(nodeType.type)}
                draggable
                onDragStart={() => setDraggedNodeType(nodeType.type)}
                onDragEnd={() => setDraggedNodeType(null)}
                className="w-full flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-left text-sm transition-colors"
                data-testid={`node-type-${nodeType.type}`}
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-dashed border-gray-300 rounded" />
                </div>
                {nodeType.label}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-2">
            <button
              onClick={saveFlow}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              data-testid="save-flow-btn"
            >
              <Save size={16} />
              {loading ? "Enregistrement..." : "Enregistrer le flux"}
            </button>
            <button
              onClick={exportFlow}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
              data-testid="download-flow-btn"
            >
              <Download size={16} />
              Download Flow
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div 
          className="flex-1 bg-gray-100 relative overflow-auto"
          style={{
            backgroundImage: 'radial-gradient(circle, #ddd 1px, transparent 1px)',
            backgroundSize: '20px 20px'
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            if (draggedNodeType) {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const typeConfig = nodeTypes.find(t => t.type === draggedNodeType);
              const newNode = {
                id: `node-${Date.now()}`,
                type: draggedNodeType,
                label: typeConfig?.label || "New Node",
                position: { x, y }
              };
              setNodes([...nodes, newNode]);
            }
          }}
          data-testid="flow-canvas"
        >
          {/* SVG for connections */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {connections.map((conn) => {
              const source = nodes.find(n => n.id === conn.source_id);
              const target = nodes.find(n => n.id === conn.target_id);
              if (!source || !target) return null;
              
              const sx = source.position.x + 150;
              const sy = source.position.y + 40;
              const tx = target.position.x;
              const ty = target.position.y + 40;
              
              return (
                <g key={conn.id}>
                  <line
                    x1={sx} y1={sy}
                    x2={tx} y2={ty}
                    stroke="#94a3b8"
                    strokeWidth="2"
                    markerEnd="url(#arrowhead)"
                  />
                  <circle cx={(sx + tx) / 2} cy={(sy + ty) / 2} r="12" fill="#fff" stroke="#94a3b8" strokeWidth="2" />
                  <text x={(sx + tx) / 2} y={(sy + ty) / 2 + 4} textAnchor="middle" fontSize="14" fill="#94a3b8">+</text>
                </g>
              );
            })}
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
              </marker>
            </defs>
          </svg>

          {/* Nodes */}
          {nodes.map((node) => {
            const Icon = getNodeIcon(node.type);
            return (
              <div
                key={node.id}
                className={`absolute bg-white rounded-lg border-2 shadow-sm cursor-move select-none ${getNodeColor(node.type)} ${
                  selectedNode === node.id ? 'ring-2 ring-red-500' : ''
                }`}
                style={{
                  left: node.position.x,
                  top: node.position.y,
                  width: 180,
                  minHeight: 80
                }}
                onClick={() => setSelectedNode(node.id)}
                data-testid={`node-${node.id}`}
              >
                <div className="p-3 flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Icon size={20} className="text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{node.label}</div>
                  </div>
                </div>
                
                {selectedNode === node.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode(node.id);
                    }}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    data-testid={`delete-node-${node.id}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============ MAIN APP ============
function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const getTitle = () => {
    const titles = {
      dashboard: "Dashboard",
      fleet: "Efficacité de la flotte",
      drivers: "Rapport Conducteurs",
      "iot-flow": "Logique IoT"
    };
    return titles[activeView] || "Dashboard";
  };

  return (
    <div className="h-screen flex bg-gray-50" data-testid="app-container">
      <Sidebar 
        activeView={activeView} 
        setActiveView={setActiveView}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={getTitle()} onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="flex-1 overflow-auto">
          {activeView === "dashboard" && <DashboardView />}
          {activeView === "fleet" && <FleetEfficiencyView />}
          {activeView === "drivers" && <DriverReportView />}
          {activeView === "iot-flow" && <IoTFlowView />}
        </main>
      </div>
    </div>
  );
}

export default App;
