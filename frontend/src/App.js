import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "@/App.css";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { LoginPage } from "@/components/auth/LoginPage";
import ChangePasswordPage from "@/components/auth/ChangePasswordPage";
import AccessPage from "@/components/auth/AccessPage";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { ImpersonationBanner } from "@/components/shared/ImpersonationBanner";
import { SuperAdminLayout } from "@/components/superadmin/SuperAdminLayout";
import SuperAdminDashboard from "@/components/superadmin/SuperAdminDashboard";
import ClientsPage from "@/components/superadmin/ClientsPage";
import ClientDetail from "@/components/superadmin/ClientDetail";
import { API, api } from "@/lib/api";
import { Toaster } from "@/components/ui/sonner";

const Spinner = () => (
  <div className="h-screen flex items-center justify-center bg-[#F7F7F8]">
    <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
  </div>
);

const useClientInfo = () => {
  const [clientInfo, setClientInfo] = useState(null);
  useEffect(() => {
    api.get(`${API}/client/info`)
      .then((r) => { if (r.data.success) setClientInfo(r.data.client); })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (clientInfo?.primary_color) {
      document.documentElement.style.setProperty("--primary-color", clientInfo.primary_color);
    }
  }, [clientInfo]);
  return clientInfo;
};

function DashboardGate() {
  const { user, actAs } = useAuth();
  const clientInfo = useClientInfo();

  if (user === null) return <Spinner />;
  if (user === false) return <LoginPage clientInfo={clientInfo} />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (user.role === "SUPER_ADMIN" && !actAs) return <Navigate to="/super-admin" replace />;

  return (
    <div className="h-screen flex flex-col bg-[#F7F7F8]" data-testid="app-container">
      <ImpersonationBanner />
      <main className="flex-1 overflow-auto">
        <DashboardLayout />
      </main>
    </div>
  );
}

function RequireSuperAdmin({ children }) {
  const { user } = useAuth();
  const clientInfo = useClientInfo();
  if (user === null) return <Spinner />;
  if (user === false) return <LoginPage clientInfo={clientInfo} />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (user.role !== "SUPER_ADMIN") return <Navigate to="/" replace />;
  return children;
}

function ChangePasswordGate() {
  const { user } = useAuth();
  const clientInfo = useClientInfo();
  if (user === null) return <Spinner />;
  if (user === false) return <LoginPage clientInfo={clientInfo} />;
  return <ChangePasswordPage />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/lien-invalide" element={<AccessPage />} />
          <Route path="/change-password" element={<ChangePasswordGate />} />
          <Route path="/super-admin" element={<RequireSuperAdmin><SuperAdminLayout /></RequireSuperAdmin>}>
            <Route index element={<SuperAdminDashboard />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="clients/:id" element={<ClientDetail />} />
          </Route>
          <Route path="/*" element={<DashboardGate />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
