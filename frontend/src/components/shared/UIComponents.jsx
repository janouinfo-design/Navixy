import {
  ArrowUpRight, ArrowDownRight, Minus
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { getScoreBg } from "@/lib/metrics";

// ============ SPARKLINE ============
export const Sparkline = ({ data, color = "#111", height = 32, width = 80 }) => {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

// ============ KPI CARD ============
export const KPICard = ({ label, value, unit, icon: Icon, trend, trendLabel, sparkData, sparkColor, status, subtitle }) => {
  const TrendIcon = trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;
  const trendColor = trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-500' : 'text-gray-400';

  return (
    <div className="kpi-card bg-white rounded-xl p-5 flex flex-col justify-between min-h-[130px]" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gray-50"><Icon size={14} className="text-gray-500" /></div>
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{label}</span>
        </div>
        {status && (
          <div className={`w-2 h-2 rounded-full pulse-dot ${
            status === 'good' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
          }`} />
        )}
      </div>
      <div className="flex items-end justify-between mt-2">
        <div>
          <div className="text-2xl font-semibold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {value}{unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
          </div>
          {subtitle && <div className="text-[10px] text-gray-400 mt-0.5">{subtitle}</div>}
          {trend !== undefined && trend !== null && (
            <div className={`flex items-center gap-1 mt-0.5 text-[11px] font-medium ${trendColor}`}>
              <TrendIcon size={11} /><span>{Math.abs(trend)}%</span>
              {trendLabel && <span className="text-gray-400 font-normal">{trendLabel}</span>}
            </div>
          )}
        </div>
        {sparkData && sparkData.length > 1 && <Sparkline data={sparkData} color={sparkColor || '#111'} />}
      </div>
    </div>
  );
};

// ============ MINI KPI (no sparkline) ============
export const MiniKPI = ({ label, value, unit, icon: Icon, color, subtitle }) => (
  <div className="kpi-card bg-white rounded-xl p-5 min-h-[110px] flex flex-col justify-between">
    <div className="flex items-center gap-1.5">
      <Icon size={13} className="text-gray-400" />
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{label}</span>
    </div>
    <div>
      <div className={`text-2xl font-semibold tracking-tight ${color || 'text-gray-900'}`} style={{ fontFamily: 'Outfit, sans-serif' }}>
        {value}{unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
      </div>
      {subtitle && <div className="text-[10px] text-gray-400 mt-0.5">{subtitle}</div>}
    </div>
  </div>
);

// ============ SCORE BADGE ============
export const ScoreBadge = ({ score, size = 'md' }) => {
  const s = size === 'lg' ? 'w-12 h-12 text-lg' : size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  return (
    <div className={`${s} rounded-xl flex items-center justify-center font-bold text-white ${getScoreBg(score)}`}>
      {score}
    </div>
  );
};

// ============ STATUS BADGE ============
export const StatusBadge = ({ status }) => {
  const styles = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    idle: 'bg-amber-50 text-amber-700 border-amber-200',
    offline: 'bg-gray-50 text-gray-600 border-gray-200'
  };
  const dots = { active: 'bg-emerald-500 pulse-dot', idle: 'bg-amber-500', offline: 'bg-gray-400' };
  const labels = { active: 'Actif', idle: 'Ralenti', offline: 'Offline' };
  const key = status === 'active' ? 'active' : status === 'idle' ? 'idle' : 'offline';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${styles[key]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[key]}`} />
      {labels[key]}
    </span>
  );
};

// ============ INSIGHT CARD ============
export const InsightCard = ({ type, icon: Icon, title, detail, impact, action }) => {
  const styles = {
    danger: 'bg-red-50 border-red-100', warning: 'bg-amber-50 border-amber-100',
    info: 'bg-blue-50 border-blue-100', success: 'bg-emerald-50 border-emerald-100'
  };
  const ic = {
    danger: 'text-red-500', warning: 'text-amber-500',
    info: 'text-blue-500', success: 'text-emerald-500'
  };

  return (
    <div className={`insight-item flex gap-3 p-3.5 rounded-xl border ${styles[type]}`} style={{ opacity: 0 }}>
      <Icon size={16} className={`mt-0.5 flex-shrink-0 ${ic[type]}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-800">{title}</div>
        <div className="text-xs text-gray-500 mt-0.5">{detail}</div>
        {impact && <div className="text-xs font-semibold text-red-600 mt-1">Impact: ~{impact} CHF/mois</div>}
        {action && <div className="text-[10px] text-blue-600 mt-1 font-medium">{action}</div>}
      </div>
    </div>
  );
};

// ============ RISK CARD ============
export const RiskCard = ({ label, value, icon: Icon, color }) => (
  <div className={`flex items-center justify-between p-3 rounded-lg border ${
    color === 'red' ? 'bg-red-50/50 border-red-100' : 'bg-amber-50/50 border-amber-100'
  }`}>
    <div className="flex items-center gap-2">
      <Icon size={14} className={color === 'red' ? 'text-red-500' : 'text-amber-500'} />
      <span className="text-xs text-gray-700">{label}</span>
    </div>
    <span className={`text-sm font-bold ${color === 'red' ? 'text-red-600' : 'text-amber-600'}`}>{value} CHF</span>
  </div>
);

// ============ SECTION HEADER ============
export const SectionHeader = ({ icon: Icon, title, count, iconBg = 'bg-gray-900', iconColor = 'text-white' }) => (
  <div className="flex items-center gap-2 mb-4">
    <div className={`p-1.5 ${iconBg} rounded-lg`}><Icon size={14} className={iconColor} /></div>
    <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h3>
    {count !== undefined && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{count}</span>}
  </div>
);

// ============ EMPTY STATE ============
export const EmptyState = ({ icon: Icon, message }) => (
  <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
    <Icon className="mx-auto text-gray-300" size={40} />
    <p className="mt-3 text-sm text-gray-400">{message}</p>
  </div>
);

// ============ LOADING STATE ============
export const LoadingState = () => (
  <div className="flex items-center justify-center h-[calc(100vh-64px)]" data-testid="loading">
    <div className="flex flex-col items-center gap-3">
      <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
      <span className="text-sm text-gray-400">Chargement des donnees...</span>
    </div>
  </div>
);
