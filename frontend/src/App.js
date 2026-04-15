import { useState, useEffect, useCallback } from "react";
import "@/App.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { FleetEfficiencyView } from "@/components/fleet/FleetEfficiencyView";
import { DriverReportView } from "@/components/drivers/DriverReportView";
import { TrendsView } from "@/components/trends/TrendsView";
import { IoTFlowView } from "@/components/iot/IoTFlowView";
import { API, api } from "@/lib/api";
import { RefreshCw } from "lucide-react";

// ============ CLIENT CONTEXT ============
const useClientInfo = () => {
  const [clientInfo, setClientInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClientInfo = async () => {
      try {
        const response = await api.get(`${API}/client/info`);
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

// ============ MAIN APP ============
function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { clientInfo, loading: clientLoading } = useClientInfo();

  useEffect(() => {
    if (clientInfo?.primary_color) {
      document.documentElement.style.setProperty('--primary-color', clientInfo.primary_color);
    }
  }, [clientInfo]);

  if (clientLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F7F7F8]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="animate-spin text-gray-400" size={24} />
          <span className="text-sm text-gray-400">Chargement...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-[#F7F7F8]" data-testid="app-container">
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        clientInfo={clientInfo}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-auto">
          {activeView === "dashboard" && (
            <DashboardView onMenuClick={() => setSidebarOpen(true)} />
          )}
          {activeView === "fleet" && (
            <FleetEfficiencyView onMenuClick={() => setSidebarOpen(true)} />
          )}
          {activeView === "drivers" && (
            <DriverReportView onMenuClick={() => setSidebarOpen(true)} />
          )}
          {activeView === "trends" && (
            <TrendsView onMenuClick={() => setSidebarOpen(true)} />
          )}
          {activeView === "iot-flow" && (
            <IoTFlowView onMenuClick={() => setSidebarOpen(true)} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
