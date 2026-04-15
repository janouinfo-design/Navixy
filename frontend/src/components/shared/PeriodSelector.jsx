import { useState } from "react";
import { Calendar } from "lucide-react";

export const PeriodSelector = ({ period, setPeriod, fromDate, setFromDate, toDate, setToDate, onApply }) => {
  const [showCustom, setShowCustom] = useState(false);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    const today = new Date();
    let from, to;

    switch (newPeriod) {
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

  const periods = [
    { id: 'today', label: "Aujourd'hui" },
    { id: 'week', label: '7 jours' },
    { id: 'month', label: '30 jours' },
    { id: 'custom', label: 'Custom' }
  ];

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="period-selector">
      <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
        {periods.map((p) => (
          <button
            key={p.id}
            data-testid={`period-${p.id}`}
            onClick={() => handlePeriodChange(p.id)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-200 last:border-r-0 ${
              period === p.id
                ? 'bg-[#111] text-white'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {(showCustom || period === 'custom') && (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
          <Calendar size={14} className="text-gray-400" />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="text-xs border-none focus:outline-none w-28"
            data-testid="from-date"
          />
          <span className="text-gray-300">-</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="text-xs border-none focus:outline-none w-28"
            data-testid="to-date"
          />
          <button
            onClick={() => { setShowCustom(false); if (onApply) onApply(fromDate, toDate); }}
            className="bg-[#111] text-white rounded px-2 py-0.5 text-xs hover:bg-gray-800"
            data-testid="apply-custom"
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
};
