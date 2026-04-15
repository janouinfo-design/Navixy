import { useState, useEffect, useCallback, useRef } from "react";
import "@/App.css";
import axios from "axios";
import { 
  Truck, Users, Activity, Download, Plus, Settings, 
  ChevronLeft, ChevronRight, Calendar, BarChart3, 
  Gauge, Clock, Zap, MapPin, RefreshCw, FileText,
  Play, Square, Circle, ArrowRight, Trash2, Save,
  Menu, X, Filter, Search, Map, TrendingUp, AlertTriangle,
  Fuel, Navigation, Target, GripVertical
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

// Dynamic API URL - use current host for multi-tenant
const getApiUrl = () => {
  // In production, use the same domain
  if (window.location.hostname.includes('logitrak.ch')) {
    return `https://${window.location.hostname}/api`;
  }
  // Fallback to env variable for development
  return process.env.REACT_APP_BACKEND_URL 
    ? `${process.env.REACT_APP_BACKEND_URL}/api`
    : '/api';
};

const API = getApiUrl();

// ============ CLIENT CONTEXT ============
const useClientInfo = () => {
  const [clientInfo, setClientInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClientInfo = async () => {
      try {
        const response = await axios.get(`${API}/client/info`);
        if (response.data.success) {
          setClientInfo(response.data.client);
        }
      } catch (error) {
        console.error("Error fetching client info:", error);
      }
      setLoading(false);
    };

    fetchClientInfo();
  }, []);

  return { clientInfo, loading };
};

// ============ SIDEBAR COMPONENT ============
const Sidebar = ({ activeView, setActiveView, isOpen, setIsOpen, clientInfo }) => {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "fleet", label: "Efficacité Flotte", icon: Truck },
    { id: "drivers", label: "Rapport Conducteurs", icon: Users },
    { id: "trends", label: "Tendances", icon: TrendingUp },
    { id: "iot-flow", label: "Logique IoT", icon: Zap },
  ];

  const primaryColor = clientInfo?.primary_color || "#e53935";

  return (
    <>
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
            {clientInfo?.logo_url ? (
              <img src={clientInfo.logo_url} alt={clientInfo.name} className="h-8" />
            ) : (
              <h1 className="text-xl font-bold text-gray-800">
                <span style={{ color: primaryColor }}>{clientInfo?.name || 'Logitrak'}</span>
              </h1>
            )}
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
const StatCard = ({ label, value, icon: Icon, color = "gray", trend }) => {
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
      {trend && (
        <div className={`text-sm mt-1 ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% vs semaine dernière
        </div>
      )}
    </div>
  );
};

// ============ PERIOD SELECTOR COMPONENT ============
const PeriodSelector = ({ period, setPeriod, fromDate, setFromDate, toDate, setToDate, onApply }) => {
  const [showCustom, setShowCustom] = useState(false);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    const today = new Date();
    let from, to;
    
    switch(newPeriod) {
      case 'today':
        from = to = today.toISOString().split('T')[0];
        break;
      case 'week':
        from = new Date(today.setDate(today.getDate() - 7)).toISOString().split('T')[0];
        to = new Date().toISOString().split('T')[0];
        break;
      case 'month':
        from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        to = new Date().toISOString().split('T')[0];
        break;
      case 'custom':
        setShowCustom(true);
        return;
      default:
        from = to = today.toISOString().split('T')[0];
    }
    
    setFromDate(from);
    setToDate(to);
    setShowCustom(false);
    if (onApply) onApply(from, to);
  };

  const applyCustom = () => {
    setShowCustom(false);
    if (onApply) onApply(fromDate, toDate);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
        {[
          { id: 'today', label: "Aujourd'hui" },
          { id: 'week', label: 'Semaine' },
          { id: 'month', label: 'Mois' },
          { id: 'custom', label: 'Personnalisé' }
        ].map((p) => (
          <button
            key={p.id}
            data-testid={`period-${p.id}`}
            onClick={() => handlePeriodChange(p.id)}
            className={`px-3 lg:px-4 py-2 text-sm font-medium transition-colors border-r border-gray-200 last:border-r-0 ${
              period === p.id 
                ? 'bg-red-500 text-white' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {(showCustom || period === 'custom') && (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-2">
          <Calendar size={16} className="text-gray-400" />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="text-sm border-none focus:outline-none w-32"
            data-testid="from-date"
          />
          <span className="text-gray-400">→</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="text-sm border-none focus:outline-none w-32"
            data-testid="to-date"
          />
          <button
            onClick={applyCustom}
            className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            data-testid="apply-custom"
          >
            OK
          </button>
        </div>
      )}

      {period !== 'custom' && (
        <div className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
          {fromDate === toDate 
            ? new Date(fromDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
            : `${new Date(fromDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${new Date(toDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
          }
        </div>
      )}
    </div>
  );
};

// ============ DATE PICKER COMPONENT (Legacy) ============
const DatePicker = ({ date, setDate, period, setPeriod }) => {
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
          />
        </div>
        
        <button 
          onClick={() => navigateDate(1)}
          className="p-1.5 hover:bg-gray-100 rounded"
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
  const [period, setPeriod] = useState('today');
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchStats = useCallback(async (from, to) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/fleet/stats`, {
        params: { from_date: from || fromDate, to_date: to || toDate }
      });
      if (response.data.success) {
        setStats(response.data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePeriodApply = (from, to) => {
    fetchStats(from, to);
  };

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
          <p className="text-sm text-gray-500">Statistiques de votre flotte</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodSelector 
            period={period}
            setPeriod={setPeriod}
            fromDate={fromDate}
            setFromDate={setFromDate}
            toDate={toDate}
            setToDate={setToDate}
            onApply={handlePeriodApply}
          />
          <button 
            onClick={() => fetchStats()}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            data-testid="refresh-btn"
          >
            <RefreshCw size={18} />
            Actualiser
          </button>
        </div>
      </div>

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
          value={`${((stats?.summary?.total_mileage || 0) / 1000).toFixed(0)} km`} 
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
  const [period, setPeriod] = useState('today');
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchEfficiency = useCallback(async (from, to) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/fleet/efficiency`, {
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

  useEffect(() => {
    fetchEfficiency();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePeriodApply = (from, to) => {
    fetchEfficiency(from, to);
  };

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
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-red-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="fleet-efficiency-view">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-800">Efficacité de la flotte</h3>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector 
            period={period}
            setPeriod={setPeriod}
            fromDate={fromDate}
            setFromDate={setFromDate}
            toDate={toDate}
            setToDate={setToDate}
            onApply={handlePeriodApply}
          />
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => exportReport('csv')}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
            >
              <Download size={16} />
              CSV
            </button>
            <button 
              onClick={() => exportReport('json')}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
            >
              <Download size={16} />
              JSON
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
        <div className="text-lg font-medium text-gray-700 mb-4">{new Date(fromDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
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
            <div className="text-sm text-gray-500 mb-2">Temps moyen de conduite</div>
            <div className="text-2xl font-semibold text-gray-800">
              {formatTime(efficiency?.summary?.avg_driving_time_per_day)}
            </div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500 mb-2">Temps moyen au ralenti</div>
            <div className="text-2xl font-semibold text-gray-800">
              {formatTime(efficiency?.summary?.avg_idle_time_per_day)}
            </div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500 mb-2">Temps contact coupé</div>
            <div className="text-2xl font-semibold text-gray-800">
              {formatTime(efficiency?.summary?.avg_stopped_time_per_day)}
            </div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500 mb-2">Contact enclenché</div>
            <div className="text-2xl font-semibold text-gray-800">-</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 lg:px-6 py-3 border-b border-gray-200 flex items-center">
          <div className="w-24 lg:w-32 font-medium text-gray-700">Efficacité</div>
          <div className="flex-1 flex justify-between text-xs text-gray-400 px-2">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i}>{String(i * 3).padStart(2, '0')}:00</span>
            ))}
          </div>
        </div>

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
  const [period, setPeriod] = useState('week');
  const [fromDate, setFromDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedDriver, setExpandedDriver] = useState(null);

  const fetchReport = useCallback(async (from, to) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/reports/driver`, {
        params: { from_date: from || fromDate, to_date: to || toDate }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePeriodApply = (from, to) => {
    fetchReport(from, to);
  };

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Rapport Conducteurs</h3>
          <p className="text-sm text-gray-500">Voir quels véhicules chaque conducteur a utilisés</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <PeriodSelector 
            period={period}
            setPeriod={setPeriod}
            fromDate={fromDate}
            setFromDate={setFromDate}
            toDate={toDate}
            setToDate={setToDate}
            onApply={handlePeriodApply}
          />
          
          <button 
            onClick={() => exportReport('csv')}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            <Download size={16} />
            CSV
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {report?.drivers?.map((driver) => (
          <div 
            key={driver.employee_id} 
            className="bg-white rounded-lg border border-gray-200 overflow-hidden"
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
                  <p className="text-sm text-gray-500">Aucun véhicule enregistré</p>
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

// ============ REAL-TIME MAP VIEW ============
const MapView = () => {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const mapRef = useRef(null);

  const fetchPositions = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/map/positions`);
      if (response.data.success) {
        setPositions(response.data.positions);
      }
    } catch (error) {
      console.error("Error fetching positions:", error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPositions();
    
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchPositions, 30000); // Refresh every 30 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchPositions, autoRefresh]);

  // Calculate map center
  const getMapCenter = () => {
    if (positions.length === 0) return { lat: 46.8, lng: 7.1 }; // Default: Switzerland
    
    const validPositions = positions.filter(p => p.lat && p.lng);
    if (validPositions.length === 0) return { lat: 46.8, lng: 7.1 };
    
    const avgLat = validPositions.reduce((sum, p) => sum + p.lat, 0) / validPositions.length;
    const avgLng = validPositions.reduce((sum, p) => sum + p.lng, 0) / validPositions.length;
    
    return { lat: avgLat, lng: avgLng };
  };

  const center = getMapCenter();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-red-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="map-view">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Carte Temps Réel</h3>
          <p className="text-sm text-gray-500">
            {positions.length} véhicules avec position GPS
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded text-red-500"
            />
            Auto-refresh (30s)
          </label>
          <button 
            onClick={fetchPositions}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            data-testid="refresh-map-btn"
          >
            <RefreshCw size={18} />
            Actualiser
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Map Container */}
        <div className="lg:col-span-3 bg-white rounded-lg border border-gray-200 overflow-hidden" style={{ height: '500px' }}>
          <div 
            ref={mapRef}
            className="w-full h-full bg-gray-100 relative"
            style={{
              backgroundImage: `url('https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${center.lng},${center.lat},10,0/800x500?access_token=pk.placeholder')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            {/* Simple CSS-based map visualization */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 to-green-50/80">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-full h-full">
                  {positions.map((pos, idx) => {
                    // Normalize positions to viewport
                    const x = ((pos.lng - center.lng + 0.5) / 1) * 100;
                    const y = ((center.lat - pos.lat + 0.3) / 0.6) * 100;
                    
                    return (
                      <div
                        key={pos.tracker_id}
                        className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all
                          ${selectedVehicle === pos.tracker_id ? 'z-20 scale-125' : 'z-10'}
                        `}
                        style={{ left: `${Math.min(95, Math.max(5, x))}%`, top: `${Math.min(95, Math.max(5, y))}%` }}
                        onClick={() => setSelectedVehicle(
                          selectedVehicle === pos.tracker_id ? null : pos.tracker_id
                        )}
                      >
                        <div className={`
                          w-10 h-10 rounded-full flex items-center justify-center shadow-lg
                          ${pos.connection_status === 'active' 
                            ? pos.movement_status === 'moving' ? 'bg-green-500' : 'bg-blue-500'
                            : 'bg-gray-400'
                          }
                        `}>
                          <Truck size={18} className="text-white" />
                        </div>
                        {selectedVehicle === pos.tracker_id && (
                          <div className="absolute top-12 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-xl p-3 min-w-[200px] z-30">
                            <div className="font-semibold text-gray-800">{pos.label}</div>
                            <div className="text-xs text-gray-500 mt-1">{pos.model}</div>
                            <div className="mt-2 space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-gray-500">Vitesse:</span>
                                <span className="font-medium">{pos.speed} km/h</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Statut:</span>
                                <span className={`font-medium ${
                                  pos.connection_status === 'active' ? 'text-green-600' : 'text-gray-600'
                                }`}>
                                  {pos.connection_status === 'active' ? 'Actif' : 'Inactif'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Mouvement:</span>
                                <span className="font-medium">{pos.movement_status}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Legend */}
              <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow p-3">
                <div className="text-xs font-medium text-gray-700 mb-2">Légende</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span>En mouvement</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span>Stationnaire</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                    <span>Hors ligne</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle List */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h4 className="font-medium text-gray-700">Véhicules ({positions.length})</h4>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '450px' }}>
            {positions.map((pos) => (
              <div
                key={pos.tracker_id}
                className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors
                  ${selectedVehicle === pos.tracker_id ? 'bg-red-50' : ''}
                `}
                onClick={() => setSelectedVehicle(
                  selectedVehicle === pos.tracker_id ? null : pos.tracker_id
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      pos.connection_status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                    }`}></div>
                    <span className="font-medium text-sm text-gray-800 truncate" style={{ maxWidth: '120px' }}>
                      {pos.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">{pos.speed} km/h</span>
                </div>
                <div className="text-xs text-gray-400 mt-1 truncate">
                  {pos.lat?.toFixed(4)}, {pos.lng?.toFixed(4)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ TRENDS VIEW ============
const TrendsView = () => {
  const [trends, setTrends] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');

  const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1'];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [trendsRes, compRes] = await Promise.all([
        axios.get(`${API}/analytics/trends`, { params: { period } }),
        axios.get(`${API}/analytics/vehicle-comparison`)
      ]);
      
      if (trendsRes.data.success) setTrends(trendsRes.data);
      if (compRes.data.success) setComparison(compRes.data);
    } catch (error) {
      console.error("Error fetching trends:", error);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-red-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="trends-view">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Tendances & Analyse</h3>
          <p className="text-sm text-gray-500">Analyse des performances sur la période</p>
        </div>
        
        <div className="flex items-center gap-2">
          {['week', 'month'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p 
                  ? 'bg-red-500 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              data-testid={`trend-period-${p}`}
            >
              {p === 'week' ? 'Semaine' : 'Mois'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard 
          label="Distance Totale" 
          value={`${trends?.summary?.total_distance || 0} km`} 
          icon={MapPin} 
          color="blue" 
        />
        <StatCard 
          label="Efficacité Moy." 
          value={`${trends?.summary?.avg_efficiency || 0}%`} 
          icon={Gauge} 
          color="green" 
        />
        <StatCard 
          label="Carburant Total" 
          value={`${trends?.summary?.total_fuel || 0} L`} 
          icon={Fuel} 
          color="yellow" 
        />
        <StatCard 
          label="Violations" 
          value={trends?.summary?.total_violations || 0} 
          icon={AlertTriangle} 
          color="red" 
        />
        <StatCard 
          label="Meilleur Jour" 
          value={trends?.summary?.best_day?.split('-').slice(1).join('/')} 
          icon={Target} 
          color="green" 
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Efficiency Trend Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="font-semibold text-gray-800 mb-4">Évolution de l'efficacité</h4>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trends?.trends || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day_name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #e0e0e0' }}
                formatter={(value) => [`${value}%`, 'Efficacité']}
              />
              <Area 
                type="monotone" 
                dataKey="avg_efficiency" 
                stroke="#e53935" 
                fill="#ffebee" 
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Distance Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="font-semibold text-gray-800 mb-4">Distance parcourue (km)</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trends?.trends || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day_name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #e0e0e0' }}
                formatter={(value) => [`${value} km`, 'Distance']}
              />
              <Bar dataKey="total_distance" fill="#1e88e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Vehicle Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performers */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="font-semibold text-gray-800 mb-4">Top Performers</h4>
          <div className="space-y-3">
            {comparison?.vehicles?.slice(0, 5).map((vehicle, idx) => (
              <div key={vehicle.tracker_id} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                  idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-400' : 'bg-gray-300'
                }`}>
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm">{vehicle.label}</div>
                  <div className="text-xs text-gray-500">{vehicle.total_distance_week} km/semaine</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${
                    vehicle.efficiency_score >= 70 ? 'text-green-600' : 
                    vehicle.efficiency_score >= 50 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {vehicle.efficiency_score}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Efficiency Distribution Pie */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="font-semibold text-gray-800 mb-4">Répartition par efficacité</h4>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Excellent (>70%)', value: comparison?.vehicles?.filter(v => v.efficiency_score >= 70).length || 0 },
                  { name: 'Bon (50-70%)', value: comparison?.vehicles?.filter(v => v.efficiency_score >= 50 && v.efficiency_score < 70).length || 0 },
                  { name: 'À améliorer (<50%)', value: comparison?.vehicles?.filter(v => v.efficiency_score < 50).length || 0 },
                ]}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                <Cell fill="#43a047" />
                <Cell fill="#fb8c00" />
                <Cell fill="#e53935" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Needs Attention */}
      {comparison?.needs_attention?.length > 0 && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="text-red-500" size={20} />
            <h4 className="font-semibold text-red-800">Véhicules nécessitant attention</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {comparison.needs_attention.map((vehicle) => (
              <div key={vehicle.tracker_id} className="bg-white rounded-lg p-3 border border-red-200">
                <div className="font-medium text-gray-800">{vehicle.label}</div>
                <div className="flex justify-between mt-2 text-sm">
                  <span className="text-gray-500">Efficacité:</span>
                  <span className="text-red-600 font-bold">{vehicle.efficiency_score}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Temps ralenti:</span>
                  <span className="text-gray-700">{vehicle.idle_percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============ IMPROVED IOT FLOW EDITOR VIEW ============
const IoTFlowView = () => {
  const [flows, setFlows] = useState([]);
  const [currentFlow, setCurrentFlow] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [flowName, setFlowName] = useState("Default Flow");
  const [loading, setLoading] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState(null);
  
  const canvasRef = useRef(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggingNode, setDraggingNode] = useState(null);

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
    setNodes([
      { id: "input-1", type: "data_source", label: "Default Input", position: { x: 100, y: 150 } },
      { id: "output-1", type: "output", label: "Default Output", position: { x: 500, y: 150 } }
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
      { id: `input-${Date.now()}`, type: "data_source", label: "Default Input", position: { x: 100, y: 150 } },
      { id: `output-${Date.now()}`, type: "output", label: "Default Output", position: { x: 500, y: 150 } }
    ]);
    setConnections([]);
  };

  const addNodeAtPosition = (nodeType, x, y) => {
    const typeConfig = nodeTypes.find(t => t.type === nodeType);
    const newNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: nodeType,
      label: typeConfig?.label || "New Node",
      position: { x, y }
    };
    setNodes([...nodes, newNode]);
  };

  const deleteNode = (nodeId) => {
    setNodes(nodes.filter(n => n.id !== nodeId));
    setConnections(connections.filter(c => c.source_id !== nodeId && c.target_id !== nodeId));
    setSelectedNode(null);
  };

  const handleCanvasMouseDown = (e) => {
    if (e.target === canvasRef.current) {
      setSelectedNode(null);
      setConnectingFrom(null);
    }
  };

  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const rect = canvasRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left - node.position.x,
      y: e.clientY - rect.top - node.position.y
    });
    setIsDragging(true);
    setDraggingNode(nodeId);
    setSelectedNode(nodeId);
  };

  const handleCanvasMouseMove = (e) => {
    if (!isDragging || !draggingNode) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width - 180, e.clientX - rect.left - dragOffset.x));
    const y = Math.max(0, Math.min(rect.height - 80, e.clientY - rect.top - dragOffset.y));

    setNodes(nodes.map(n => 
      n.id === draggingNode 
        ? { ...n, position: { x, y } }
        : n
    ));
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    setDraggingNode(null);
  };

  const handleConnectorClick = (nodeId, isOutput) => {
    if (isOutput) {
      setConnectingFrom(nodeId);
    } else if (connectingFrom && connectingFrom !== nodeId) {
      // Create connection
      const newConn = {
        id: `conn-${Date.now()}`,
        source_id: connectingFrom,
        target_id: nodeId
      };
      // Check if connection already exists
      const exists = connections.some(c => 
        c.source_id === connectingFrom && c.target_id === nodeId
      );
      if (!exists) {
        setConnections([...connections, newConn]);
      }
      setConnectingFrom(null);
    }
  };

  const deleteConnection = (connId) => {
    setConnections(connections.filter(c => c.id !== connId));
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
    return typeConfig?.icon || Circle;
  };

  const getNodeColor = (type) => {
    const colors = {
      data_source: "border-l-blue-500 bg-blue-50",
      output: "border-l-green-500 bg-green-50",
      attribute: "border-l-purple-500 bg-purple-50",
      logic: "border-l-yellow-500 bg-yellow-50",
      device_action: "border-l-orange-500 bg-orange-50",
      webhook: "border-l-red-500 bg-red-50"
    };
    return colors[type] || "border-l-gray-500 bg-gray-50";
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
          />
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={createNewFlow}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
          >
            <Plus size={16} />
            Nouveau Flux
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            <BarChart3 size={16} />
            Analyseur
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Node Types */}
        <div className="w-56 bg-white border-r border-gray-200 p-4 overflow-y-auto flex-shrink-0">
          <h4 className="font-semibold text-gray-700 mb-4 text-sm uppercase tracking-wide">Nœuds</h4>
          <div className="space-y-2">
            {nodeTypes.map((nodeType) => (
              <div
                key={nodeType.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('nodeType', nodeType.type);
                }}
                className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-grab active:cursor-grabbing text-sm transition-colors"
              >
                <GripVertical size={14} className="text-gray-400" />
                <nodeType.icon size={16} className="text-gray-600" />
                <span className="text-gray-700">{nodeType.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-2">
            <button
              onClick={saveFlow}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 text-sm font-medium"
            >
              <Save size={16} />
              {loading ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              onClick={exportFlow}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
            >
              <Download size={16} />
              Exporter JSON
            </button>
          </div>

          {connectingFrom && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              Mode connexion actif. Cliquez sur l'entrée d'un autre nœud pour connecter.
              <button 
                onClick={() => setConnectingFrom(null)}
                className="block mt-2 text-blue-600 hover:underline"
              >
                Annuler
              </button>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div 
          ref={canvasRef}
          className="flex-1 bg-gray-100 relative overflow-hidden select-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const nodeType = e.dataTransfer.getData('nodeType');
            if (nodeType) {
              const rect = canvasRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left - 90;
              const y = e.clientY - rect.top - 40;
              addNodeAtPosition(nodeType, Math.max(0, x), Math.max(0, y));
            }
          }}
        >
          {/* SVG for connections */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
              </marker>
            </defs>
            
            {connections.map((conn) => {
              const source = nodes.find(n => n.id === conn.source_id);
              const target = nodes.find(n => n.id === conn.target_id);
              if (!source || !target) return null;
              
              const sx = source.position.x + 180;
              const sy = source.position.y + 40;
              const tx = target.position.x;
              const ty = target.position.y + 40;
              
              // Bezier curve control points
              const mx = (sx + tx) / 2;
              
              return (
                <g key={conn.id} className="pointer-events-auto cursor-pointer" onClick={() => deleteConnection(conn.id)}>
                  <path
                    d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`}
                    stroke="#9ca3af"
                    strokeWidth="2"
                    fill="none"
                    markerEnd="url(#arrowhead)"
                    className="hover:stroke-red-500 transition-colors"
                  />
                  {/* Delete button on hover */}
                  <circle cx={mx} cy={(sy + ty) / 2} r="8" fill="white" stroke="#e5e7eb" strokeWidth="1" className="hover:stroke-red-500" />
                  <text x={mx} y={(sy + ty) / 2 + 4} textAnchor="middle" fontSize="10" fill="#9ca3af" className="hover:fill-red-500">×</text>
                </g>
              );
            })}

            {/* Connection preview line */}
            {connectingFrom && (
              <line
                x1={nodes.find(n => n.id === connectingFrom)?.position.x + 180}
                y1={nodes.find(n => n.id === connectingFrom)?.position.y + 40}
                x2={nodes.find(n => n.id === connectingFrom)?.position.x + 220}
                y2={nodes.find(n => n.id === connectingFrom)?.position.y + 40}
                stroke="#3b82f6"
                strokeWidth="2"
                strokeDasharray="5,5"
              />
            )}
          </svg>

          {/* Nodes */}
          {nodes.map((node) => {
            const Icon = getNodeIcon(node.type);
            return (
              <div
                key={node.id}
                className={`absolute bg-white rounded-lg border-2 border-l-4 shadow-sm cursor-move select-none transition-shadow
                  ${getNodeColor(node.type)}
                  ${selectedNode === node.id ? 'ring-2 ring-red-500 shadow-lg' : 'hover:shadow-md'}
                  ${draggingNode === node.id ? 'shadow-xl z-50' : ''}
                `}
                style={{
                  left: node.position.x,
                  top: node.position.y,
                  width: 180,
                  minHeight: 80,
                  zIndex: draggingNode === node.id ? 50 : 10
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={() => setSelectedNode(node.id)}
              >
                {/* Input connector */}
                <div 
                  className={`absolute -left-3 top-1/2 transform -translate-y-1/2 w-6 h-6 rounded-full border-2 
                    ${connectingFrom ? 'bg-blue-500 border-blue-600 cursor-pointer animate-pulse' : 'bg-white border-gray-300'}
                    flex items-center justify-center hover:bg-blue-100 transition-colors
                  `}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConnectorClick(node.id, false);
                  }}
                >
                  <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                </div>

                {/* Node content */}
                <div className="p-3 flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100">
                    <Icon size={18} className="text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={node.label}
                      onChange={(e) => {
                        setNodes(nodes.map(n => 
                          n.id === node.id ? { ...n, label: e.target.value } : n
                        ));
                      }}
                      className="text-sm font-medium text-gray-800 bg-transparent border-none focus:outline-none w-full truncate"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <div className="text-xs text-gray-400 capitalize">{node.type.replace('_', ' ')}</div>
                  </div>
                </div>

                {/* Output connector */}
                <div 
                  className={`absolute -right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 rounded-full border-2 
                    ${connectingFrom === node.id ? 'bg-blue-500 border-blue-600' : 'bg-white border-gray-300'}
                    flex items-center justify-center cursor-pointer hover:bg-green-100 transition-colors
                  `}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConnectorClick(node.id, true);
                  }}
                >
                  <ArrowRight size={12} className="text-gray-400" />
                </div>

                {/* Delete button */}
                {selectedNode === node.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode(node.id);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full hover:bg-red-600 flex items-center justify-center shadow-md"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Empty state hint */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Zap size={48} className="mx-auto mb-2 opacity-50" />
                <p>Glissez-déposez des nœuds ici</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ MAIN APP ============
function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { clientInfo, loading: clientLoading } = useClientInfo();

  const getTitle = () => {
    const titles = {
      dashboard: "Dashboard",
      fleet: "Efficacité de la flotte",
      drivers: "Rapport Conducteurs",
      trends: "Tendances & Analyse",
      "iot-flow": "Logique IoT"
    };
    return titles[activeView] || "Dashboard";
  };

  // Apply client theme
  useEffect(() => {
    if (clientInfo?.primary_color) {
      document.documentElement.style.setProperty('--primary-color', clientInfo.primary_color);
    }
  }, [clientInfo]);

  if (clientLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="animate-spin text-red-500" size={40} />
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-50" data-testid="app-container">
      <Sidebar 
        activeView={activeView} 
        setActiveView={setActiveView}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        clientInfo={clientInfo}
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={getTitle()} onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="flex-1 overflow-auto">
          {activeView === "dashboard" && <DashboardView />}
          {activeView === "fleet" && <FleetEfficiencyView />}
          {activeView === "drivers" && <DriverReportView />}
          {activeView === "trends" && <TrendsView />}
          {activeView === "iot-flow" && <IoTFlowView />}
        </main>
      </div>
    </div>
  );
}

export default App;
