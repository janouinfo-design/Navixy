import { useState, useEffect } from "react";
import {
  Menu, RefreshCw, Bell, Clock, Calendar
} from "lucide-react";

export const Header = ({ title, subtitle, onMenuClick, onRefresh, lastUpdate, alertCount = 0, children }) => {
  const [timeAgo, setTimeAgo] = useState('');

  useEffect(() => {
    if (!lastUpdate) return;
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(lastUpdate).getTime()) / 1000);
      if (diff < 60) setTimeAgo(`il y a ${diff}s`);
      else if (diff < 3600) setTimeAgo(`il y a ${Math.floor(diff / 60)}min`);
      else setTimeAgo(`il y a ${Math.floor(diff / 3600)}h`);
    };
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  return (
    <header className="glass-header sticky top-0 z-30 h-16 flex items-center justify-between px-4 lg:px-8" data-testid="app-header">
      <div className="flex items-center gap-4">
        <button
          className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
          onClick={onMenuClick}
          data-testid="menu-toggle"
        >
          <Menu size={20} className="text-gray-600" />
        </button>
        <div>
          <h2 className="text-xl font-medium tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {title}
          </h2>
          {subtitle && <p className="text-xs text-gray-500 -mt-0.5">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Period selector slot */}
        {children}

        {/* Last update indicator */}
        {lastUpdate && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-1.5" data-testid="last-update">
            <Clock size={12} />
            <span>MAJ {timeAgo}</span>
          </div>
        )}

        {/* Alert bell */}
        <button
          className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
          data-testid="alerts-bell"
        >
          <Bell size={18} className="text-gray-500" />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </button>

        {/* Refresh button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="bg-[#111] text-white hover:bg-gray-800 rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
            data-testid="refresh-btn"
          >
            <RefreshCw size={14} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        )}
      </div>
    </header>
  );
};
