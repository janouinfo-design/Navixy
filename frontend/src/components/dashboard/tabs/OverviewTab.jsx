import React, { useState, useEffect, useMemo } from "react";
import { API, api } from "@/lib/api";
import {
  AlertTriangle, WifiOff, Wifi, ChevronRight, X, Fuel, Leaf, HelpCircle,
  Car, CalendarX, Route, Gauge, Shield, CheckCircle2, Wrench,
  FileText, Phone, Shuffle, CalendarClock, Plug, PlugZap
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { MatWaterDrop, MatPower, MatBatteryFull, MatBatteryCharging, MatWifi } from "./EnergyIcons";

// ═══ Catégories d'AFFICHAGE (décision 1a) — seuils/calculs backend inchangés ═══
const DISPLAY_CATEGORIES = [
  { id: "inactif", match: ["inactif"], label: "Sans activité", color: "#9CA3AF", text: "text-gray-600", seuil: "0%" },
  { id: "sous_utilise", match: ["sous_utilise"], label: "Sous-utilisé", color: "#EF4444", text: "text-red-600", seuil: "< 30%" },
  { id: "normale", match: ["modere", "bonne"], label: "Utilisation normale", color: "#10B981", text: "text-emerald-600", seuil: "30–84%" },
  { id: "tres_utilise", match: ["tres_utilise"], label: "Forte utilisation", color: "#3B82F6", text: "text-blue-600", seuil: "≥ 85%" },
];
const displayCat = (backendCat) => DISPLAY_CATEGORIES.find(c => c.match.includes(backendCat)) || DISPLAY_CATEGORIES[0];

// ═══ Icônes — sémantique unique LOGITRAK (lucide outline, jamais d'emoji) ═══
const BADGE_TONES = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  orange: "bg-orange-50 text-orange-500",
  red: "bg-red-50 text-red-500",
  gray: "bg-gray-100 text-gray-500",
  teal: "bg-teal-50 text-teal-600",
};
const IconBadge = ({ icon: Icon, tone = "blue", size = 13, className = "" }) => (
  <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${BADGE_TONES[tone] || BADGE_TONES.gray} ${className}`}>
    <Icon size={size} strokeWidth={2} />
  </span>
);

// Couleurs du donut motorisation — alignées sur la maquette (thermique bleu, hybride orange, électrique vert)
const ENERGY_META = {
  thermique: { label: "Thermique", icon: Fuel, tone: "blue", color: "#3B82F6" },
  hybride: { label: "Hybride", icon: Leaf, tone: "orange", color: "#F59E0B" },
  electrique: { label: "Électrique", icon: Plug, tone: "green", color: "#10B981" },
  inconnu: { label: "Inconnu", icon: HelpCircle, tone: "gray", color: "#9CA3AF" },
};
const energyOf = (m) => {
  const n = m?.normalized;
  if (n === "diesel" || n === "petrol") return "thermique";
  if (n === "electric") return "electrique";
  if (n === "hybrid" || n === "phev") return "hybride";
  return "inconnu";
};

const KIND_ICONS = { leasing: FileText, assurance: Shield, controle: CheckCircle2, maintenance: Wrench, expertise: CheckCircle2 };

const OFFLINE_PROLONGED_HOURS = 48; // règle 2b : hors ligne prolongé = critique
const DAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const dayFR = (ds) => DAYS_FR[new Date(ds + "T00:00:00").getDay()];
const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Période précédente de longueur identique, immédiatement avant fromDate
const prevRange = (fromDate, toDate) => {
  const d1 = new Date(fromDate + "T00:00:00");
  const d2 = new Date(toDate + "T00:00:00");
  const days = Math.round((d2 - d1) / 86400000) + 1;
  const pTo = new Date(d1); pTo.setDate(pTo.getDate() - 1);
  const pFrom = new Date(d1); pFrom.setDate(pFrom.getDate() - days);
  return { from: fmtDate(pFrom), to: fmtDate(pTo) };
};

// Delta réel vs période précédente — « — » si comparaison indisponible (jamais de valeur inventée)
const Delta = ({ curr, prev, unit = "", goodWhenUp, prevPeriod, testId, state }) => {
  if (state === "loading") {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border text-[9px] font-semibold text-gray-300 bg-gray-50 border-gray-100 animate-pulse" data-testid={testId}>…</span>;
  }
  if (state === "none" || prev === null || prev === undefined) {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border text-[9px] font-semibold text-gray-300 bg-gray-50 border-gray-100"
      title="Comparaison avec la période précédente indisponible" data-testid={testId}>—</span>;
  }
  const diff = Math.round((curr - prev) * 10) / 10;
  let cls = "text-gray-400 bg-gray-50 border-gray-200";
  if (diff !== 0 && goodWhenUp !== undefined) {
    const good = goodWhenUp ? diff > 0 : diff < 0;
    cls = good ? "text-emerald-600 bg-emerald-50 border-emerald-100" : "text-red-500 bg-red-50 border-red-100";
  } else if (diff !== 0) {
    cls = "text-gray-600 bg-gray-50 border-gray-200";
  }
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "=";
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[9px] font-semibold ${cls}`}
      title={`Période précédente (${prevPeriod.from} au ${prevPeriod.to}) : ${prev}${unit}`} data-testid={testId}>
      {arrow} {diff > 0 ? "+" : ""}{diff}{unit}
    </span>
  );
};

// Mini delta par DATES (échéances) — calcul déterministe sur les fiches actuelles, hausse = défavorable
const DateDelta = ({ curr, prev, testId }) => {
  const diff = curr - prev;
  if (diff === 0) return <span className="text-[9px] text-gray-400" data-testid={testId}>= vs il y a 7 j</span>;
  const bad = diff > 0;
  return (
    <span className={`text-[9px] font-semibold ${bad ? "text-red-500" : "text-emerald-600"}`}
      title="Comparaison par dates d'échéance, à fiches véhicules constantes" data-testid={testId}>
      {bad ? "▲" : "▼"} {diff > 0 ? "+" : ""}{diff} vs il y a 7 j
    </span>
  );
};

// ═══ Drawer liste véhicules (drill-down — clic = fiche véhicule) ═══
const Drawer = ({ title, items, icon, tone, onClose, onOpenVehicle }) => (
  <>
    <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white shadow-2xl z-[70] overflow-y-auto" data-testid="kpi-drawer">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon && <IconBadge icon={icon} tone={tone || "gray"} />}
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
            <p className="text-[10px] text-gray-400">{items.length} élément{items.length > 1 ? "s" : ""} — cliquez pour ouvrir la fiche</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" data-testid="kpi-drawer-close"><X size={16} className="text-gray-500" /></button>
      </div>
      <div className="p-3">
        {items.map((it, idx) => (
          <button key={`${it.tid}-${idx}`} onClick={() => onOpenVehicle?.(it.tid)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left transition-colors"
            data-testid={`drawer-vehicle-${it.tid}`}>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-gray-900 truncate">{it.label}</div>
              {it.sub && <div className="text-[10px] text-gray-400 truncate">{it.sub}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0 max-w-[55%]">
              {it.chips ? (
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {it.chips.map((ch, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums ${ch.cls}`}>
                      {ch.icon && <ch.icon size={11} />}{ch.text}
                    </span>
                  ))}
                </div>
              ) : it.value != null && <span className={`text-xs font-semibold tabular-nums ${it.valueCls || "text-gray-700"}`}>{it.value}</span>}
              <ChevronRight size={13} className="text-gray-300" />
            </div>
          </button>
        ))}
        {items.length === 0 && <div className="text-xs text-gray-400 text-center py-8">Aucun véhicule</div>}
      </div>
    </div>
  </>
);

const Panel = ({ title, children, action, testId, className = "" }) => (
  <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 ${className}`} data-testid={testId}>
    <div className="flex items-center justify-between mb-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{title}</h4>
      {action}
    </div>
    {children}
  </div>
);

// Carte KPI énergie (style maquette : icône nue à droite — sauf badge carré rouge pour EV faible)
const EnergyCard = ({ icon: Icon, iconCls = "text-gray-400", iconWrap, label, unit, value, sub, onClick, testId, valueCls = "text-gray-900" }) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`rounded-lg border border-gray-100 p-3 text-left ${onClick ? "hover:bg-gray-50 cursor-pointer transition-colors" : ""}`} data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold text-gray-600">{label}</div>
          {unit && <div className="text-[9px] text-gray-400">{unit}</div>}
        </div>
        {iconWrap === "red-square"
          ? <span className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center shrink-0"><Icon size={16} strokeWidth={2} /></span>
          : <Icon size={18} strokeWidth={1.8} className={`${iconCls} shrink-0`} />}
      </div>
      <div className={`text-xl font-semibold mt-1 ${valueCls}`} style={{ fontFamily: "Outfit, sans-serif" }}>{value}</div>
      {sub && <div className="text-[9px] text-gray-400 mt-0.5">{sub}</div>}
    </Tag>
  );
};

export const OverviewTab = ({ data, fromDate, toDate, onNavigate, onOpenVehicle }) => {
  const { stats, efficiency } = data;
  const vehicles = stats?.vehicles || [];
  const effVehicles = efficiency?.vehicles || [];
  const effSummary = efficiency?.summary || {};
  const [drawer, setDrawer] = useState(null);
  const open = (title, items, icon, tone) => setDrawer({ title, items, icon, tone });

  // ---- Capabilities + échéances (moteur backend UNIQUE — mêmes statuts que fiche véhicule et PDF) ----
  const [caps, setCaps] = useState(null);
  const [dl, setDl] = useState(null);
  useEffect(() => {
    api.get(`${API}/vehicles/capabilities`).then(r => setCaps(r.data.success ? r.data : { success: false })).catch(() => setCaps({ success: false }));
    api.get(`${API}/vehicles/deadlines`).then(r => { if (r.data.success) setDl(r.data); }).catch(() => {});
  }, []);

  // ---- Éco-conduite (lazy — partage le cache backend avec l'onglet Conducteurs) ----
  const [eco, setEco] = useState({ loading: true, data: null });
  useEffect(() => {
    let cancelled = false;
    setEco({ loading: true, data: null });
    api.get(`${API}/drivers/ecodriving`, { params: { from_date: fromDate, to_date: toDate }, timeout: 120000 })
      .then(res => { if (!cancelled) setEco({ loading: false, data: res.data.success ? res.data : null }); })
      .catch(() => { if (!cancelled) setEco({ loading: false, data: null }); });
    return () => { cancelled = true; };
  }, [fromDate, toDate]);

  // ---- Période précédente (données réelles /fleet/efficiency — aucune valeur inventée) ----
  const prevPeriod = useMemo(() => prevRange(fromDate, toDate), [fromDate, toDate]);
  const [prevEff, setPrevEff] = useState({ state: "loading", data: null });
  useEffect(() => {
    let cancelled = false;
    setPrevEff({ state: "loading", data: null });
    api.get(`${API}/fleet/efficiency`, { params: { from_date: prevPeriod.from, to_date: prevPeriod.to } })
      .then(res => { if (!cancelled) setPrevEff(res.data.success ? { state: "ok", data: res.data } : { state: "none", data: null }); })
      .catch(() => { if (!cancelled) setPrevEff({ state: "none", data: null }); });
    return () => { cancelled = true; };
  }, [prevPeriod]);

  const pm = useMemo(() => {
    if (prevEff.state !== "ok") return null;
    const pv = prevEff.data.vehicles || [];
    return {
      used: pv.filter(v => v.active_days > 0).length,
      inactive: pv.filter(v => v.active_days === 0).length,
      avgUtil: prevEff.data.summary?.average_utilization_pct ?? null,
      totalKm: Math.round(prevEff.data.summary?.total_mileage || 0),
    };
  }, [prevEff]);

  const threshold = caps?.fuel_low_threshold_pct ?? 20;
  const capsRecs = caps?.records || {};
  const plateOf = (tid) => capsRecs[String(tid)]?.reg_number || null;

  // ═══ Cœur des calculs — population = /fleet/efficiency (identique à Analyse flotte) ═══
  const m = useMemo(() => {
    const total = effVehicles.length;
    const used = effVehicles.filter(v => v.active_days > 0);
    const inactive = effVehicles.filter(v => v.active_days === 0);
    const catCounts = {};
    const catItems = {};
    DISPLAY_CATEGORIES.forEach(c => {
      const list = effVehicles.filter(v => c.match.includes(v.category));
      catCounts[c.id] = list.length;
      catItems[c.id] = list.map(v => ({
        tid: v.tracker_id, label: v.label, value: `${v.utilization_pct} %`,
        sub: `${plateOf(v.tracker_id) ? plateOf(v.tracker_id) + " · " : ""}${v.active_days}/${v.total_days} jours actifs · ${v.period_mileage} km`,
      }));
    });
    const totalKm = Math.round((effSummary.total_mileage || 0) * 10) / 10;
    const avgUtil = effSummary.average_utilization_pct ?? null;

    // Hors ligne — instantané (règle 2b : prolongé > 48 h ou jamais connecté = critique)
    const now = Date.now();
    const offline = vehicles.filter(v => v.connection_status !== "active");
    const offlineProlonged = offline.filter(v => !v.last_update || (now - new Date(v.last_update).getTime()) > OFFLINE_PROLONGED_HOURS * 3600000);
    const offlineRecent = offline.filter(v => !offlineProlonged.includes(v));
    const offItem = (v) => ({
      tid: v.tracker_id, label: v.label,
      sub: `${plateOf(v.tracker_id) ? plateOf(v.tracker_id) + " · " : ""}${v.last_update ? `Dernier signal : ${v.last_update}` : "Jamais connecté"}`,
    });

    // Activité quotidienne (agrégation hebdo au-delà de 31 jours)
    const dmap = {};
    effVehicles.forEach(v => (v.daily_breakdown || []).forEach(db => {
      if (!dmap[db.date]) dmap[db.date] = { date: db.date, km: 0, actifs: 0 };
      dmap[db.date].km = Math.round((dmap[db.date].km + db.km) * 10) / 10;
      if (db.active) dmap[db.date].actifs += 1;
    }));
    const daily = Object.values(dmap).sort((a, b) => a.date.localeCompare(b.date));
    let chart = daily, granularity = "day";
    if (daily.length > 31) {
      granularity = "week";
      const weeks = {};
      daily.forEach(d => {
        const dt = new Date(d.date + "T00:00:00");
        const monday = new Date(dt); monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
        const wk = fmtDate(monday);
        if (!weeks[wk]) weeks[wk] = { date: wk, km: 0, actifsSum: 0, n: 0 };
        weeks[wk].km += d.km; weeks[wk].actifsSum += d.actifs; weeks[wk].n += 1;
      });
      chart = Object.values(weeks).sort((a, b) => a.date.localeCompare(b.date))
        .map(w => ({ date: w.date, km: Math.round(w.km * 10) / 10, actifs: Math.round((w.actifsSum / w.n) * 10) / 10 }));
    }

    return { total, used, inactive, catCounts, catItems, totalKm, avgUtil, offline, offlineProlonged, offlineRecent, offItem, chart, granularity };
  }, [effVehicles, effSummary, vehicles, capsRecs]);

  // ═══ Énergie & consommation (capabilities réelles — jamais de 0 fabriqué) ═══
  const energy = useMemo(() => {
    const mix = { thermique: [], electrique: [], hybride: [], inconnu: [] };
    const fuelLow = [], battLow = [], telemetry = [], battItems = [], chargingItems = [];
    let chargingCapCount = 0;
    const socs = [], kwhs = [];
    for (const v of vehicles) {
      const c = capsRecs[String(v.tracker_id)];
      const plate = c?.reg_number ? `${c.reg_number} · ` : "";
      const item = { tid: v.tracker_id, label: v.label, sub: c?.reg_number || undefined };
      const fl = c?.capabilities?.fuel_level;
      const soc = c?.capabilities?.ev_soc;
      const rng = c?.capabilities?.ev_range;
      const hasFuel = fl?.available && typeof fl.value === "number";
      const hasSoc = soc?.available && typeof soc.value === "number";
      const rangeTxt = (rng?.available && typeof rng.value === "number") ? ` · ${Math.round(rng.value)} km` : "";
      const chipFuel = hasFuel ? { icon: MatWaterDrop, text: `${Math.round(fl.value)} %`, cls: fl.value < threshold ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-700" } : null;
      const chipBatt = hasSoc ? { icon: MatBatteryFull, text: `${Math.round(soc.value)} %`, cls: soc.value < threshold ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700" } : null;
      const chipRange = (rng?.available && typeof rng.value === "number") ? { icon: Route, text: `${Math.round(rng.value)} km`, cls: "bg-gray-100 text-gray-600" } : null;
      const allChips = [chipFuel, chipBatt, chipRange].filter(Boolean);
      mix[energyOf(c?.motorisation)].push({ ...item, chips: allChips.length ? allChips : undefined });
      if (hasFuel || hasSoc) {
        // 1 véhicule = 1 entrée télémétrie (jamais compté deux fois même avec carburant ET batterie)
        const parts = [];
        if (hasFuel) parts.push(`carb. ${Math.round(fl.value)} %`);
        if (hasSoc) parts.push(`batt. ${Math.round(soc.value)} %${rangeTxt}`);
        const descr = [hasFuel ? `Niveau carburant${fl.status === "STALE" ? ` · donnée ancienne (${fl.update_time})` : ""}` : null,
                       hasSoc ? "Batterie de traction" : null].filter(Boolean).join(" · ");
        telemetry.push({ ...item, value: parts.join(" · "), chips: [chipFuel, chipBatt, chipRange].filter(Boolean), sub: `${plate}${descr}` });
      }
      if (hasFuel) {
        if (fl.value < threshold)
          fuelLow.push({ ...item, value: `${Math.round(fl.value)} %`, chips: [chipFuel], valueCls: "text-red-600", sub: `${plate}${fl.status === "STALE" ? `Donnée ancienne (${fl.update_time})` : `MAJ ${fl.update_time}`}` });
      }
      if (hasSoc) {
        socs.push(soc.value);
        battItems.push({ ...item, chips: [chipBatt, chipRange].filter(Boolean), sub: `${plate}Batterie de traction · MAJ ${soc.update_time}` });
        // Règle 2b : alerte EV uniquement sur donnée réelle ET récente (status AVAILABLE) — jamais critique
        if (soc.status === "AVAILABLE" && soc.value < threshold)
          battLow.push({ ...item, value: `batt. ${Math.round(soc.value)} %${rangeTxt}`, chips: [chipBatt, chipRange].filter(Boolean), valueCls: "text-red-600", sub: `${plate}Batterie de traction · MAJ ${soc.update_time}` });
      }
      const kwh = c?.capabilities?.ev_kwh_per_100km;
      if (kwh?.available && typeof kwh.value === "number") kwhs.push(kwh.value);
      const cst = c?.capabilities?.ev_charging_state;
      if (cst?.available) {
        chargingCapCount += 1;
        if (cst.value === "charging") chargingItems.push({ ...item, chips: [chipBatt, chipRange].filter(Boolean), sub: `${plate}Recharge en cours` });
      }
    }
    // Consommation ESTIMÉE (décision 3a) : taux configuré × km — obd_consumption exclu (unité non confirmée)
    const fuelEstVehicles = vehicles.filter(v => v.fuel_used_liters !== null && v.fuel_used_liters !== undefined);
    const estLiters = Math.round(fuelEstVehicles.reduce((s, v) => s + v.fuel_used_liters, 0) * 10) / 10;
    const estKm = fuelEstVehicles.reduce((s, v) => s + (v.mileage || 0), 0);
    const estL100 = estKm > 0 ? Math.round((estLiters / estKm) * 1000) / 10 : null;
    const evKnownNoTelemetry = (mix.electrique.length + mix.hybride.length) > 0 && socs.length === 0;
    return { mix, fuelLow, battLow, telemetry, battItems, chargingItems, chargingCapCount, socs, kwhs, fuelEstVehicles, estLiters, estL100, evKnownNoTelemetry };
  }, [vehicles, capsRecs, threshold]);

  // ═══ Maintenance & conformité — statuts du moteur d'échéances backend unique (C1 corrigé : assurance = garage puis saisie) ═══
  const maint = useMemo(() => {
    const all = (dl?.deadlines || [])
      .filter(x => x.days_remaining <= 30)
      .map(x => {
        const label = vehicles.find(v => v.tracker_id === x.tracker_id)?.label || `Véhicule ${x.tracker_id}`;
        const plate = plateOf(x.tracker_id);
        const d = x.days_remaining;
        return {
          tid: x.tracker_id, label, kind: x.deadline_type, criticalWhenOverdue: x.critical_when_overdue,
          d, date: x.due_date, what: x.label, source: x.source,
          sub: `${plate ? plate + " · " : ""}${x.label} · ${x.due_date}`,
          value: d < 0 ? `échu (${Math.abs(d)} j)` : d === 0 ? "aujourd'hui" : `J-${d}`,
          valueCls: d < 0 ? "text-red-600" : "text-amber-600",
        };
      })
      .sort((a, b) => a.d - b.d);
    const overdue = all.filter(x => x.d < 0);
    const upcoming = all.filter(x => x.d >= 0);
    // Règle 2b (appliquée par le moteur) : CRITIQUE = assurance/contrôle DÉJÀ échu uniquement
    const overdueCritical = overdue.filter(x => x.criticalWhenOverdue);
    const overdueWatch = overdue.filter(x => !x.criticalWhenOverdue);
    const assurances = all.filter(x => x.kind === "assurance");
    const controles = all.filter(x => x.kind === "controle");
    // Comparaison par DATES à fiches constantes : état qu'auraient eu ces compteurs il y a 7 jours
    const prev = {
      upcoming: all.filter(x => x.d >= -7 && x.d <= 23).length,
      overdue: all.filter(x => x.d < -7).length,
      controles: all.filter(x => x.kind === "controle" && x.d >= -7 && x.d <= 23).length,
    };
    return { all, overdue, upcoming, overdueCritical, overdueWatch, assurances, controles, prev };
  }, [dl, vehicles, capsRecs]);

  // ═══ Alertes critiques (règle 2b) — assurance/contrôle échu + hors ligne prolongé/jamais connecté ═══
  const critical = useMemo(() => {
    const items = [
      ...maint.overdueCritical.map(x => ({ tid: x.tid, label: x.label, sub: x.sub, value: x.value, valueCls: "text-red-600" })),
      ...m.offlineProlonged.map(v => ({ ...m.offItem(v), value: v.last_update ? `> ${OFFLINE_PROLONGED_HOURS} h` : "jamais connecté", valueCls: "text-red-600" })),
    ];
    return items;
  }, [maint.overdueCritical, m]);

  // ═══ Priorités du jour (rouge = critique, orange = à surveiller) — max 7 ═══
  const priorities = useMemo(() => {
    const list = [];
    if (maint.overdueCritical.length) list.push({
      id: "overdue", sev: "red", count: maint.overdueCritical.length,
      title: `Assurance / contrôle échu${maint.overdueCritical.length > 1 ? "s" : ""}`,
      onClick: () => open("Assurances & contrôles échus", maint.overdueCritical, AlertTriangle, "red"),
    });
    if (m.offlineProlonged.length) list.push({
      id: "offline-long", sev: "red", count: m.offlineProlonged.length,
      title: `Trackers hors ligne > ${OFFLINE_PROLONGED_HOURS} h`,
      onClick: () => open(`Hors ligne prolongé (> ${OFFLINE_PROLONGED_HOURS} h)`, m.offlineProlonged.map(v => ({ ...m.offItem(v), value: v.last_update ? `> ${OFFLINE_PROLONGED_HOURS} h` : "jamais connecté", valueCls: "text-red-600" })), WifiOff, "red"),
    });
    if (m.offlineRecent.length) list.push({
      id: "offline-recent", sev: "amber", count: m.offlineRecent.length,
      title: "Trackers hors ligne (récent)",
      onClick: () => open("Hors ligne récent (< 48 h)", m.offlineRecent.map(m.offItem), WifiOff, "orange"),
    });
    if (energy.fuelLow.length) list.push({
      id: "fuel-low", sev: "amber", count: energy.fuelLow.length,
      title: `Carburant faible (< ${threshold} %)`,
      onClick: () => open(`Carburant faible (< ${threshold} %)`, energy.fuelLow, Fuel, "orange"),
    });
    if (energy.battLow.length) list.push({
      id: "batt-low", sev: "amber", count: energy.battLow.length,
      title: "Batteries faibles (EV)",
      onClick: () => open(`Batterie EV faible (< ${threshold} %)`, energy.battLow, MatBatteryCharging, "orange"),
    });
    const upcomingAndWatch = [...maint.upcoming, ...maint.overdueWatch];
    if (upcomingAndWatch.length) list.push({
      id: "deadlines", sev: "amber", count: upcomingAndWatch.length,
      title: "Entretiens à planifier < 30 jours",
      onClick: () => open("Échéances ≤ 30 jours", upcomingAndWatch, Wrench, "orange"),
    });
    if (m.catCounts.sous_utilise) list.push({
      id: "underused", sev: "amber", count: m.catCounts.sous_utilise,
      title: "Véhicules sous-utilisés",
      onClick: () => open("Véhicules sous-utilisés (< 30 %)", m.catItems.sous_utilise, Gauge, "orange"),
    });
    if (m.catCounts.tres_utilise) list.push({
      id: "highuse", sev: "amber", count: m.catCounts.tres_utilise,
      title: "Forte utilisation (≥ 85 %)",
      onClick: () => open("Forte utilisation (≥ 85 %)", m.catItems.tres_utilise, Gauge, "blue"),
    });
    return [...list.filter(x => x.sev === "red"), ...list.filter(x => x.sev === "amber")].slice(0, 7);
  }, [maint, m, energy, threshold]);

  // Actions recommandées déterministes (style maquette — icône + verbe, max 4, dérivées des priorités réelles)
  const actions = useMemo(() => {
    const list = [];
    if (maint.overdueCritical.length) list.push({ icon: AlertTriangle, t: "Régulariser les assurances et contrôles échus", f: () => open("Assurances & contrôles échus", maint.overdueCritical, AlertTriangle, "red") });
    if (m.offline.length) list.push({ icon: Phone, t: "Contacter les conducteurs des véhicules hors ligne", f: () => open("Véhicules hors ligne", m.offline.map(m.offItem), WifiOff, "orange") });
    if (m.catCounts.sous_utilise) list.push({ icon: Shuffle, t: "Réaffecter les véhicules sous-utilisés", f: () => open("Véhicules sous-utilisés (< 30 %)", m.catItems.sous_utilise, Gauge, "orange") });
    if (maint.upcoming.length) list.push({ icon: CalendarClock, t: "Planifier les entretiens prioritaires", f: () => open("Échéances ≤ 30 jours", [...maint.upcoming, ...maint.overdueWatch], Wrench, "orange") });
    if (energy.battLow.length) list.push({ icon: MatBatteryCharging, t: "Revoir les véhicules avec batterie faible", f: () => open(`Batterie EV faible (< ${threshold} %)`, energy.battLow, MatBatteryCharging, "orange") });
    if (m.inactive.length && list.length < 4) list.push({ icon: Shuffle, t: `Évaluer la réaffectation des ${m.inactive.length} véhicules sans activité`, f: () => open("Sans activité sur la période", m.catItems.inactif, CalendarX, "gray") });
    if (!list.length) list.push({ icon: CheckCircle2, t: "Aucune action requise — flotte conforme aux seuils", f: null });
    return list.slice(0, 4);
  }, [maint, m, energy, threshold]);

  // ═══ Véhicules à surveiller (1 véhicule = son alerte principale) — 5 affichés, liste complète via « Voir tout » ═══
  const watch = useMemo(() => {
    const byTid = {};
    const add = (tid, label, prio, alert, alertCls, dot) => {
      if (!byTid[tid] || byTid[tid].prio < prio) byTid[tid] = { tid, label, prio, alert, alertCls, dot };
    };
    maint.overdueCritical.forEach(x => add(x.tid, x.label, 100, `${x.what} — ${x.value}`, "text-red-600", "bg-red-500"));
    m.offlineProlonged.forEach(v => add(v.tracker_id, v.label, 90, v.last_update ? `Hors ligne > ${OFFLINE_PROLONGED_HOURS} h` : "Jamais connecté", "text-red-600", "bg-red-500"));
    m.offlineRecent.forEach(v => add(v.tracker_id, v.label, 70, "Tracker hors ligne", "text-amber-600", "bg-amber-500"));
    energy.fuelLow.forEach(x => add(x.tid, x.label, 60, `Carburant ${x.value}`, "text-amber-600", "bg-amber-500"));
    energy.battLow.forEach(x => add(x.tid, x.label, 60, x.value.replace("batt.", "Batterie faible"), "text-amber-600", "bg-amber-500"));
    maint.overdueWatch.forEach(x => add(x.tid, x.label, 55, `${x.what} — ${x.value}`, "text-amber-600", "bg-amber-500"));
    (effVehicles || []).filter(v => v.category === "sous_utilise").forEach(v => add(v.tracker_id, v.label, 40, `Sous-utilisé (${v.utilization_pct} %)`, "text-amber-600", "bg-amber-500"));
    (effVehicles || []).filter(v => v.category === "tres_utilise").forEach(v => add(v.tracker_id, v.label, 30, `Forte utilisation (${v.utilization_pct} %)`, "text-blue-600", "bg-blue-500"));
    const full = Object.values(byTid).sort((a, b) => b.prio - a.prio);
    return { top: full.slice(0, 5), full };
  }, [maint, m, energy, effVehicles]);

  // Éco-conduite compacte
  const ecoLine = useMemo(() => {
    if (eco.loading) return { loading: true };
    const scored = (eco.data?.drivers || []).filter(d => d.score);
    if (!scored.length) return { none: true };
    const avg = Math.round(scored.reduce((s, d) => s + d.score.raw, 0) / scored.length);
    const toWatch = scored.filter(d => d.score.stars <= 2);
    return { avg, n: scored.length, toWatch };
  }, [eco]);

  const usedPct = m.total > 0 ? Math.round((m.used.length / m.total) * 1000) / 10 : 0;
  const inactivePct = m.total > 0 ? Math.round((m.inactive.length / m.total) * 1000) / 10 : 0;
  const totalEnergy = Object.values(energy.mix).reduce((s, a) => s + a.length, 0);
  const avgSoc = energy.socs.length ? Math.round(energy.socs.reduce((s, x) => s + x, 0) / energy.socs.length) : null;
  const avgKwh = energy.kwhs.length ? (energy.kwhs.reduce((s, x) => s + x, 0) / energy.kwhs.length).toFixed(1) : null;
  const telemetryPct = m.total > 0 ? Math.round((energy.telemetry.length / m.total) * 100) : 0;
  const donutData = Object.entries(ENERGY_META).map(([k, meta]) => ({ key: k, name: meta.label, value: energy.mix[k].length, color: meta.color })).filter(d => d.value > 0);

  const usedItems = m.used.map(v => ({ tid: v.tracker_id, label: v.label, value: `${v.utilization_pct} %`, sub: `${plateOf(v.tracker_id) ? plateOf(v.tracker_id) + " · " : ""}${v.active_days}/${v.total_days} jours actifs · ${v.period_mileage} km` }));
  const watchItems = (list) => list.map(x => ({ tid: x.tid, label: x.label, sub: `${plateOf(x.tid) ? plateOf(x.tid) + " · " : ""}${x.alert}` }));

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-[1600px] mx-auto" data-testid="overview-tab">

      {/* ═══ LIGNE 1 — 6 KPI ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <button onClick={() => m.used.length && open("Véhicules actifs sur la période", usedItems, Car, "green")}
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-left hover:shadow-md transition-shadow" data-testid="kpi-active">
          <div className="flex items-center gap-2">
            <IconBadge icon={Car} tone="green" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Véhicules actifs</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-2xl font-semibold" style={{ fontFamily: "Outfit, sans-serif" }}>{m.used.length}<span className="text-sm text-gray-400 font-normal">/{m.total}</span></span>
            <Delta curr={m.used.length} prev={pm?.used} goodWhenUp={true} prevPeriod={prevPeriod} testId="delta-active" state={prevEff.state} />
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{usedPct}% du parc · sur la période</div>
        </button>

        <button onClick={() => m.offline.length && open("Véhicules hors ligne", m.offline.map(m.offItem), WifiOff, "orange")}
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-left hover:shadow-md transition-shadow" data-testid="kpi-offline">
          <div className="flex items-center gap-2">
            <IconBadge icon={WifiOff} tone="orange" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Hors ligne</span>
          </div>
          <div className={`text-2xl font-semibold mt-2 ${m.offline.length ? "text-gray-900" : "text-gray-300"}`} style={{ fontFamily: "Outfit, sans-serif" }}>{m.offline.length}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">instantané{m.offlineProlonged.length ? <span className="text-red-500 font-medium"> · dont {m.offlineProlonged.length} &gt; {OFFLINE_PROLONGED_HOURS} h</span> : ""}</div>
        </button>

        <button onClick={() => m.inactive.length && open("Sans activité sur la période", m.catItems.inactif, CalendarX, "gray")}
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-left hover:shadow-md transition-shadow" data-testid="kpi-inactive">
          <div className="flex items-center gap-2">
            <IconBadge icon={CalendarX} tone="gray" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Sans activité</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`text-2xl font-semibold ${m.inactive.length ? "text-gray-900" : "text-gray-300"}`} style={{ fontFamily: "Outfit, sans-serif" }}>{m.inactive.length}</span>
            <Delta curr={m.inactive.length} prev={pm?.inactive} goodWhenUp={false} prevPeriod={prevPeriod} testId="delta-inactive" state={prevEff.state} />
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{inactivePct}% du parc · 0 km sur la période</div>
        </button>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" data-testid="kpi-utilization">
          <div className="flex items-center gap-2">
            <IconBadge icon={Gauge} tone="blue" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Utilisation flotte</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-2xl font-semibold" style={{ fontFamily: "Outfit, sans-serif" }}>{m.avgUtil !== null ? `${m.avgUtil}%` : "—"}</span>
            <Delta curr={m.avgUtil ?? 0} prev={pm?.avgUtil} unit=" pts" goodWhenUp={true} prevPeriod={prevPeriod} testId="delta-utilization" state={prevEff.state} />
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">moyenne jours actifs / jours période</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" data-testid="kpi-distance">
          <div className="flex items-center gap-2">
            <IconBadge icon={Route} tone="blue" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Distance totale</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-2xl font-semibold" style={{ fontFamily: "Outfit, sans-serif" }}>{Math.round(m.totalKm).toLocaleString("fr-FR")}<span className="text-sm text-gray-400 font-normal"> km</span></span>
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">sur la période <Delta curr={Math.round(m.totalKm)} prev={pm?.totalKm} unit=" km" prevPeriod={prevPeriod} testId="delta-distance" state={prevEff.state} /></div>
        </div>

        <button onClick={() => critical.length && open("Alertes critiques", critical, AlertTriangle, "red")}
          className={`rounded-xl border shadow-sm p-4 text-left transition-shadow ${critical.length ? "bg-red-50 border-red-200 hover:shadow-md" : "bg-white border-gray-200"}`} data-testid="kpi-critical">
          <div className="flex items-center gap-2">
            <IconBadge icon={AlertTriangle} tone="red" className={critical.length ? "bg-red-100" : ""} />
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${critical.length ? "text-red-600" : "text-gray-400"}`}>Alertes critiques</span>
          </div>
          <div className={`text-2xl font-semibold mt-2 ${critical.length ? "text-red-600" : "text-gray-300"}`} style={{ fontFamily: "Outfit, sans-serif" }}>{critical.length}</div>
          <div className={`text-[10px] mt-0.5 ${critical.length ? "text-red-500" : "text-gray-400"}`}>échéances échues · hors ligne prolongé</div>
        </button>
      </div>

      {/* ═══ LIGNE 2 — Utilisation flotte (4 catégories) | Activité quotidienne ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Utilisation de la flotte" testId="panel-utilization">
          <div className="w-full h-5 rounded-full overflow-hidden flex mb-4 bg-gray-100">
            {DISPLAY_CATEGORIES.map(c => {
              const count = m.catCounts[c.id] || 0;
              if (count === 0) return null;
              return <div key={c.id} onClick={() => open(`${c.label} (${c.seuil})`, m.catItems[c.id], Gauge, "blue")}
                style={{ width: `${(count / Math.max(1, m.total)) * 100}%`, background: c.color }}
                className="h-full cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center text-white text-[10px] font-bold"
                title={`${c.label} : ${count}`} data-testid={`util-bar-${c.id}`}>{count}</div>;
            })}
          </div>
          <div className="space-y-1.5">
            {DISPLAY_CATEGORIES.map(c => {
              const n = m.catCounts[c.id] || 0;
              const pct = m.total > 0 ? Math.round((n / m.total) * 100) : 0;
              return (
                <button key={c.id} onClick={() => n > 0 && open(`${c.label} (${c.seuil})`, m.catItems[c.id], Gauge, "blue")}
                  className={`w-full flex items-center justify-between text-[11px] px-2 py-1.5 rounded-lg transition-colors ${n > 0 ? "hover:bg-gray-50 cursor-pointer" : "opacity-40 cursor-default"}`}
                  data-testid={`util-cat-${c.id}`}>
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />
                    <span className="text-gray-600">{c.label}</span>
                    <span className="text-gray-300">{c.seuil}</span>
                  </span>
                  <span className="font-semibold tabular-nums" style={{ fontFamily: "Outfit, sans-serif" }}>{n} ({pct}%)</span>
                </button>
              );
            })}
          </div>
          <div className="text-[9px] text-gray-400 mt-3">Somme des 4 catégories = {m.total} véhicules · seuils backend inchangés (utilisation normale = modéré 30–59% + bonne 60–84%) · clic = liste des véhicules</div>
        </Panel>

        <Panel title={`Activité ${m.granularity === "week" ? "hebdomadaire" : "quotidienne"}`} testId="panel-daily-activity">
          {m.chart.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart data={m.chart} barSize={m.granularity === "week" ? 28 : 22}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => m.granularity === "week" ? `${new Date(v + "T00:00:00").getDate()}/${new Date(v + "T00:00:00").getMonth() + 1}` : dayFR(v)} tick={{ fontSize: 10, fill: "#5E5E62" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="a" tick={{ fontSize: 10, fill: "#8A8A8E" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                  <YAxis yAxisId="k" orientation="right" tick={{ fontSize: 10, fill: "#8A8A8E" }} axisLine={false} tickLine={false} width={45} unit=" km" />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 11 }}
                    formatter={(val, name) => name === "Véhicules actifs" ? [`${val} véhicule${val > 1 ? "s" : ""}`, name] : [`${Math.round(val)} km`, name]}
                    labelFormatter={(v) => m.granularity === "week" ? `Semaine du ${new Date(v + "T00:00:00").toLocaleDateString("fr-FR")}` : `${dayFR(v)} ${new Date(v + "T00:00:00").toLocaleDateString("fr-FR")}`} />
                  <Bar yAxisId="a" dataKey="actifs" name="Véhicules actifs" fill="#10B981" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
                  <Line yAxisId="k" type="monotone" dataKey="km" name="Distance (km)" stroke="#111" strokeWidth={2} dot={{ r: 2.5 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="text-[9px] text-gray-400 mt-1">
                Barres : véhicules actifs (≥ {efficiency?.active_day_threshold_km || 1} km/jour) · Courbe : distance — Source : tracker/stats/mileage/read{m.granularity === "week" ? " · agrégé par semaine (moyenne véhicules actifs/jour, somme km)" : ""}
              </div>
            </>
          ) : (
            <div className="h-[230px] flex items-center justify-center text-xs text-gray-400">Aucune donnée quotidienne sur la période</div>
          )}
        </Panel>
      </div>

      {/* ═══ LIGNE 3 — Énergie & consommation | Priorités du jour ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Panel title="Énergie & consommation" testId="panel-energy" className="lg:col-span-8">
          {!caps ? <div className="text-xs text-gray-400 py-6">Chargement des capacités…</div> :
           caps.success === false ? <div className="text-xs text-gray-400 py-6">Capacités indisponibles pour le moment.</div> : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                {/* Répartition par motorisation — donut */}
                <div className="xl:col-span-5 rounded-lg border border-gray-100 p-3" data-testid="energy-donut">
                  <div className="text-[10px] font-semibold text-gray-600 mb-1">Répartition par motorisation</div>
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <PieChart width={150} height={150}>
                        <Pie data={donutData.length ? donutData : [{ name: "Aucune donnée", value: 1, color: "#f3f4f6" }]}
                          dataKey="value" innerRadius={48} outerRadius={68} paddingAngle={2} startAngle={90} endAngle={-270}>
                          {(donutData.length ? donutData : [{ color: "#f3f4f6" }]).map((d, i) => <Cell key={i} fill={d.color} stroke="none" cursor={d.key ? "pointer" : "default"}
                            onClick={() => d.key && open(`Énergie : ${d.name}`, energy.mix[d.key], ENERGY_META[d.key].icon, ENERGY_META[d.key].tone)} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 11 }} />
                      </PieChart>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-xl font-semibold" style={{ fontFamily: "Outfit, sans-serif" }}>{totalEnergy}</span>
                        <span className="text-[9px] text-gray-400">véhicules</span>
                      </div>
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      {Object.entries(ENERGY_META).map(([k, meta]) => {
                        const n = energy.mix[k].length;
                        if (n === 0) return null;
                        const pct = totalEnergy > 0 ? Math.round((n / totalEnergy) * 1000) / 10 : 0;
                        return (
                          <button key={k} onClick={() => open(`Énergie : ${meta.label}`, energy.mix[k], meta.icon, meta.tone)}
                            className="flex items-center gap-2 text-[11px] hover:bg-gray-50 rounded-md px-1.5 py-0.5 transition-colors w-full text-left"
                            data-testid={`energy-mix-${k}`}>
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: meta.color }} />
                            <span className="text-gray-600">{meta.label}</span>
                            <span className="font-semibold tabular-nums ml-auto" style={{ fontFamily: "Outfit, sans-serif" }}>{n} <span className="font-normal text-gray-400">({pct}%)</span></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Cartes KPI énergie (EV masqué en production sans télémétrie — 5a) */}
                <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
                  <EnergyCard icon={MatWaterDrop} iconCls="text-gray-400" label="Conso thermique estimée" unit="(L/100 km)"
                    value={energy.estL100 !== null ? energy.estL100.toLocaleString("fr-FR") : "—"}
                    sub={energy.fuelEstVehicles.length > 0
                      ? `Estimation : taux configuré × km · ${energy.fuelEstVehicles.length}/${m.total} véhicules · ${energy.estLiters} L sur la période`
                      : "Aucun taux de consommation configuré — aucune estimation affichée"}
                    testId="energy-estimated-consumption" />
                  {avgKwh && (
                    <EnergyCard icon={MatPower} iconCls="text-gray-500" label="Conso électrique moyenne" unit="(kWh/100 km)"
                      value={avgKwh} sub={`${energy.kwhs.length} EV avec télémétrie`} testId="energy-ev-kwh" />
                  )}
                  {avgSoc !== null && (
                    <EnergyCard icon={MatBatteryFull} iconCls="text-emerald-500" label="SOC moyen EV" unit="(Électriques)"
                      value={`${avgSoc}%`} sub={`${energy.socs.length} EV avec télémétrie batterie`}
                      onClick={() => open("SOC batterie EV", energy.battItems, MatBatteryFull, "green")} testId="energy-ev-soc" />
                  )}
                  {avgSoc !== null && (
                    <EnergyCard icon={MatBatteryCharging} iconWrap="red-square" label="EV batterie faible" unit={`(< ${threshold} %)`}
                      value={energy.battLow.length} valueCls={energy.battLow.length ? "text-red-600" : "text-gray-300"}
                      sub={`véhicule${energy.battLow.length > 1 ? "s" : ""} — donnée réelle et récente uniquement`}
                      onClick={energy.battLow.length ? () => open(`Batterie EV faible (< ${threshold} %)`, energy.battLow, MatBatteryCharging, "orange") : undefined}
                      testId="energy-ev-low" />
                  )}
                  {energy.chargingCapCount > 0 && (
                    <EnergyCard icon={PlugZap} iconCls={energy.chargingItems.length ? "text-emerald-500" : "text-gray-300"} label="En charge" unit="(recharge en cours)"
                      value={energy.chargingItems.length} valueCls={energy.chargingItems.length ? "text-emerald-600" : "text-gray-300"}
                      sub={energy.chargingItems.length ? `véhicule${energy.chargingItems.length > 1 ? "s" : ""} branché${energy.chargingItems.length > 1 ? "s" : ""} en charge · dernier scan télémétrie` : "aucun véhicule en charge · dernier scan télémétrie"}
                      onClick={energy.chargingItems.length ? () => open("Véhicules en charge", energy.chargingItems, PlugZap, "green") : undefined}
                      testId="energy-charging" />
                  )}
                  <EnergyCard icon={MatWifi} iconCls="text-gray-400" label="Couverture télémétrie énergie" unit=""
                    value={`${telemetryPct}%`} sub={`${energy.telemetry.length}/${m.total} véhicules avec niveau carburant ou batterie réellement mesuré`}
                    onClick={energy.telemetry.length ? () => open("Télémétrie énergie disponible", energy.telemetry, MatWifi, "green") : undefined}
                    testId="energy-telemetry-coverage" />
                </div>
              </div>

              {energy.evKnownNoTelemetry && (
                <div className="text-[10px] text-gray-400" data-testid="ev-no-telemetry-note">
                  Données batterie non disponibles sur les véhicules électriques/hybrides suivis.
                </div>
              )}
              <p className="text-[9px] text-gray-400">Motorisation : garage + correction LOGITRAK — aucune classification automatique par nom. Donnée absente ≠ niveau faible, jamais de 0 fabriqué. obd_consumption exclu (unité non confirmée). Valeurs instantanées (SoC, couverture) sans comparaison : aucun historique stocké.</p>
            </div>
          )}
        </Panel>

        <div className="lg:col-span-4 space-y-4">
          <Panel title="Priorités du jour" testId="panel-priorities">
            {priorities.length === 0 ? (
              <div className="text-xs text-gray-400 py-4 text-center" data-testid="priorities-empty">Aucune priorité — flotte conforme aux seuils</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {priorities.map(p => (
                  <button key={p.id} onClick={p.onClick}
                    className="w-full flex items-center gap-2.5 px-1.5 py-2.5 hover:bg-gray-50 rounded-lg transition-colors text-left"
                    data-testid={`priority-${p.id}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${p.sev === "red" ? "bg-red-500" : "bg-orange-400"}`} />
                    <span className="text-xs text-gray-700 flex-1">{p.title}</span>
                    <span className={`text-xs font-bold tabular-nums ${p.sev === "red" ? "text-red-600" : "text-orange-500"}`} style={{ fontFamily: "Outfit, sans-serif" }}>{p.count}</span>
                    <ChevronRight size={13} className="text-gray-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Actions recommandées</div>
              <div className="space-y-0.5">
                {actions.map((a, i) => (
                  <button key={i} onClick={a.f || undefined} disabled={!a.f}
                    className="w-full flex items-center gap-2.5 px-1.5 py-2 hover:bg-gray-50 rounded-lg transition-colors text-left disabled:hover:bg-transparent"
                    data-testid={`action-${i}`}>
                    <a.icon size={13} className="text-gray-400 shrink-0" strokeWidth={2} />
                    <span className="text-[11px] text-gray-700 flex-1">{a.t}</span>
                    {a.f && <ChevronRight size={13} className="text-gray-300 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-[9px] text-gray-400 mt-2">Règles déterministes documentées — rouge = critique (règle 2b), orange = à surveiller</div>
          </Panel>
        </div>
      </div>

      {/* ═══ LIGNE 4 — Maintenance & conformité | Véhicules à surveiller ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Panel title="Maintenance & conformité" testId="panel-maintenance" className="lg:col-span-8">
          {maint.all.length === 0 ? (
            <div className="text-xs text-gray-400 py-4" data-testid="maintenance-empty">Aucune échéance à moins de 30 jours dans les fiches véhicules (leasing, assurance, contrôles, maintenance, expertise).</div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { id: "upcoming", icon: Wrench, tone: "blue", label: "Échéances < 30 jours", n: maint.upcoming.length, sub: `échéance${maint.upcoming.length > 1 ? "s" : ""} à venir`, delta: <DateDelta curr={maint.upcoming.length} prev={maint.prev.upcoming} testId="maint-delta-upcoming" />, btn: "Voir les échéances", items: maint.upcoming, dIcon: Wrench, dTone: "blue" },
                { id: "assurances", icon: Shield, tone: "orange", label: "Assurances", n: maint.assurances.length, sub: "à renouveler", delta: maint.assurances.some(x => x.d < 0) ? <span className="text-[9px] font-semibold text-red-500">dont {maint.assurances.filter(x => x.d < 0).length} échue{maint.assurances.filter(x => x.d < 0).length > 1 ? "s" : ""}</span> : <span className="text-[9px] text-gray-400">aucune échue</span>, btn: "Voir les assurances", items: maint.assurances, dIcon: Shield, dTone: "orange" },
                { id: "controles", icon: CheckCircle2, tone: "green", label: "Contrôles", n: maint.controles.length, sub: "à réaliser", delta: <DateDelta curr={maint.controles.length} prev={maint.prev.controles} testId="maint-delta-controles" />, btn: "Voir les contrôles", items: maint.controles, dIcon: CheckCircle2, dTone: "green" },
                { id: "overdue", icon: AlertTriangle, tone: "red", label: "Échues", n: maint.overdue.length, sub: `échéance${maint.overdue.length > 1 ? "s" : ""} dépassée${maint.overdue.length > 1 ? "s" : ""}`, delta: <DateDelta curr={maint.overdue.length} prev={maint.prev.overdue} testId="maint-delta-overdue" />, btn: "Voir les échues", items: maint.overdue, dIcon: AlertTriangle, dTone: "red", danger: true },
              ].map(t => (
                <div key={t.id} className={`rounded-lg border p-3 flex flex-col ${t.danger && t.n > 0 ? "border-red-100 bg-red-50/40" : "border-gray-100"}`} data-testid={`maint-${t.id}`}>
                  <div className="flex items-start gap-2">
                    <IconBadge icon={t.icon} tone={t.tone} size={13} />
                    <span className="text-[10px] font-semibold text-gray-600 leading-tight pt-1">{t.label}</span>
                  </div>
                  <div className={`text-2xl font-semibold mt-1.5 ${t.danger && t.n > 0 ? "text-red-600" : t.n > 0 ? "text-gray-900" : "text-gray-300"}`} style={{ fontFamily: "Outfit, sans-serif" }}>{t.n}</div>
                  <div className="text-[10px] text-gray-400">{t.sub}</div>
                  <div className="mt-1 min-h-[14px]">{t.delta}</div>
                  <button onClick={() => t.items.length && open(`Maintenance & conformité : ${t.label}`, t.items, t.dIcon, t.dTone)} disabled={!t.items.length}
                    className={`mt-2 w-full text-[10px] font-medium border rounded-lg px-2 py-1.5 transition-colors ${t.items.length ? "border-gray-200 text-gray-700 hover:bg-gray-50 cursor-pointer" : "border-gray-100 text-gray-300 cursor-default"}`}
                    data-testid={`maint-${t.id}-btn`}>{t.btn}</button>
                </div>
              ))}
            </div>
          )}
          <div className="text-[9px] text-gray-400 mt-3">Source : fiches véhicules LOGITRAK (dates saisies) — comparaison « vs il y a 7 j » calculée par dates, à fiches constantes. Documents manquants omis (aucune règle configurée — décision 4a).</div>
        </Panel>

        <Panel title="Véhicules à surveiller" testId="panel-watch" className="lg:col-span-4"
          action={watch.full.length > 5 ? (
            <button onClick={() => open("Véhicules à surveiller (liste complète)", watchItems(watch.full), Car, "orange")}
              className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5" data-testid="watch-see-all">Voir tout ({watch.full.length})<ChevronRight size={11} /></button>
          ) : undefined}>
          {watch.top.length === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center" data-testid="watch-empty">Aucun véhicule à surveiller</div>
          ) : (
            <div>
              <div className="grid grid-cols-[1fr_auto] gap-2 px-1.5 pb-1.5 border-b border-gray-100">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Véhicule</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Alerte</span>
              </div>
              <div className="divide-y divide-gray-50">
                {watch.top.map(x => (
                  <button key={x.tid} onClick={() => onOpenVehicle?.(x.tid)}
                    className="w-full flex items-center gap-2.5 px-1.5 py-2.5 hover:bg-gray-50 rounded-lg text-left transition-colors"
                    data-testid={`watch-vehicle-${x.tid}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-gray-900 truncate">{x.label}{plateOf(x.tid) ? <span className="text-gray-400 font-normal"> – {plateOf(x.tid)}</span> : ""}</div>
                    </div>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${x.dot}`} />
                    <span className={`text-[10px] ${x.alertCls} shrink-0 max-w-[45%] truncate text-right`}>{x.alert}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="text-[9px] text-gray-400 mt-3">Alerte principale par véhicule · clic = fiche véhicule</div>
        </Panel>
      </div>

      {/* ═══ Éco-conduite — ligne compacte ═══ */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200" data-testid="eco-line">
        <IconBadge icon={Leaf} tone="green" size={12} className="w-6 h-6" />
        {ecoLine.loading ? (
          <span className="text-[11px] text-gray-400">Éco-conduite : calcul du rapport LOGITRAK en cours…</span>
        ) : ecoLine.none ? (
          <span className="text-[11px] text-gray-400">Éco-conduite : aucune donnée attribuable sur la période (rapport « Qualité de conduite »)</span>
        ) : (
          <span className="text-[11px] text-gray-700">
            Éco-conduite : score moyen <strong>{ecoLine.avg}/100</strong> sur {ecoLine.n} conducteur{ecoLine.n > 1 ? "s" : ""}
            {ecoLine.toWatch.length > 0 ? <> · <span className="text-red-600 font-medium">{ecoLine.toWatch.length} à surveiller (≤ 2 étoiles)</span> : {ecoLine.toWatch.map(d => d.driver_name).join(", ")}</> : " · aucun conducteur en alerte"}
          </span>
        )}
        <button onClick={() => onNavigate?.("drivers")} className="ml-auto text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 shrink-0" data-testid="eco-line-link">Détail<ChevronRight size={11} /></button>
      </div>

      {/* ═══ Pied de source ═══ */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-xl border border-gray-200" data-testid="overview-footer">
        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        <span className="text-[10px] text-gray-500">
          Données 100% LOGITRAK — jour actif = ≥ {efficiency?.active_day_threshold_km || 1} km. Catégories affichées : sans activité 0% · sous-utilisé &lt;30% · utilisation normale 30–84% · forte ≥85% (seuils backend inchangés). Critique = assurance/contrôle échu ou hors ligne &gt; {OFFLINE_PROLONGED_HOURS} h.{pm ? ` Comparaison : période précédente ${prevPeriod.from} au ${prevPeriod.to}.` : " Comparaison période précédente indisponible."}
        </span>
        <span className="text-[10px] text-gray-400 ml-auto shrink-0">{fromDate} au {toDate}</span>
      </div>

      {drawer && <Drawer title={drawer.title} items={drawer.items} icon={drawer.icon} tone={drawer.tone} onClose={() => setDrawer(null)} onOpenVehicle={(tid) => { setDrawer(null); onOpenVehicle?.(tid); }} />}
    </div>
  );
};
