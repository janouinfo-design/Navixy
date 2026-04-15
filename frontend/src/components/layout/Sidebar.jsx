import { useState } from "react";
import {
  LayoutDashboard, Truck, Users, TrendingUp, Zap, ChevronLeft, X
} from "lucide-react";

const menuItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "fleet", label: "Efficacite Flotte", icon: Truck },
  { id: "drivers", label: "Conducteurs", icon: Users },
  { id: "trends", label: "Tendances", icon: TrendingUp },
  { id: "iot-flow", label: "Logique IoT", icon: Zap },
];

export const Sidebar = ({ activeView, setActiveView, isOpen, setIsOpen, clientInfo }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        data-testid="sidebar"
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          ${collapsed ? 'w-[72px]' : 'w-64'} bg-[#F7F7F8] border-r border-gray-200
          transform transition-all duration-200 flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-200 flex-shrink-0">
          {!collapsed && (
            <h1 className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              <span className="text-[#111]">{clientInfo?.name || 'Logitrak'}</span>
            </h1>
          )}
          <button
            className="hidden lg:flex p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
            onClick={() => setCollapsed(!collapsed)}
            data-testid="sidebar-collapse"
          >
            <ChevronLeft size={18} className={`text-gray-500 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
          <button
            className="lg:hidden p-1.5 hover:bg-gray-200 rounded-lg"
            onClick={() => setIsOpen(false)}
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {!collapsed && (
            <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Navigation
            </div>
          )}
          {menuItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                data-testid={`nav-${item.id}`}
                onClick={() => {
                  setActiveView(item.id);
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-center ${collapsed ? 'justify-center' : ''} gap-3 
                  ${collapsed ? 'px-0 py-3' : 'px-3 py-2.5'} rounded-lg
                  transition-all duration-150 text-left group
                  ${isActive
                    ? 'bg-[#111] text-white'
                    : 'text-gray-600 hover:bg-gray-200/60'
                  }
                `}
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={18} className={isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-700'} />
                {!collapsed && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="p-4 border-t border-gray-200 flex-shrink-0">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Powered by</div>
            <div className="text-xs font-medium text-gray-600 mt-0.5">Navixy IoT Platform</div>
          </div>
        )}
      </aside>
    </>
  );
};
