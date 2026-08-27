import React, { useState, useEffect, useMemo, useCallback } from "react";
import { API, api } from "@/lib/api";
import { toast } from "sonner";
import {
  Search, ChevronRight, X, Pencil, Check, Plus, Trash2,
  FileText, Download, Upload, Hash, Gauge, Radio, ShieldCheck,
  CreditCard, ClipboardList, FolderOpen, Car, Loader2, Camera, RefreshCw, PlugZap, Plug, Battery, Eye
} from "lucide-react";

// ─── Échéances : statuts fournis par le moteur backend unique — aucun recalcul frontend ───
const dlPresentation = (item) => {
  if (!item) return { label: "—", cls: "bg-gray-50 text-gray-400 border-gray-200", dot: null };
  const days = item.days_remaining;
  if (item.status === "EXPIRED") return { label: `Échu depuis ${-days} j`, cls: "bg-red-50 text-red-600 border-red-200", dot: "bg-red-500" };
  if (item.status === "DUE_SOON") return { label: `Dans ${days} j`, cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" };
  return { label: `Dans ${days} j`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" };
};

const Badge = ({ item, testId }) => {
  const b = dlPresentation(item);
  return <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-medium whitespace-nowrap ${b.cls}`} data-testid={testId}>
    {b.dot && <span className={`w-1.5 h-1.5 rounded-full ${b.dot}`} />}{b.label}
  </span>;
};

const fmtKm = (v) => v || v === 0 ? `${Math.round(v).toLocaleString("fr-FR")} km` : "—";
const fmtSize = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`;
const fmtDate = (s) => s ? new Date(s).toLocaleDateString("fr-FR") : "—";
// White-label: masque le nom du fournisseur dans les modèles de traceurs
const cleanDeviceLabel = (s) => (s || "").replace(/navixy/gi, "").replace(/__+/g, "_").replace(/^_+|_+$/g, "");

const MOTOR_META = {
  diesel: { label: "Diesel", cls: "bg-gray-100 text-gray-700 border-gray-200" },
  petrol: { label: "Essence", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  hybrid: { label: "Hybride", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  phev: { label: "Hybride rech.", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  electric: { label: "Électrique", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};
const MotorBadge = ({ motor, testId }) => {
  const m = MOTOR_META[motor?.normalized];
  if (!m) return null;
  return <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wide ${m.cls}`} data-testid={testId}>{m.label}</span>;
};

const FuelLevel = ({ cap, testId }) => {
  const soc = cap?.capabilities?.ev_soc;
  if (soc?.available && typeof soc.value === "number") {
    const low = soc.value < 20;
    const stale = soc.status === "STALE";
    const range = cap?.capabilities?.ev_range;
    const charging = cap?.capabilities?.ev_charging_state?.value;
    return (
      <div data-testid={testId}>
        <span className={`inline-flex items-center gap-1 tabular-nums font-medium ${low ? "text-red-600" : stale ? "text-amber-600" : "text-emerald-600"}`}
          title={`Batterie de traction · Source: ${soc.source} · MAJ ${soc.update_time || "?"}`}>
          <Battery size={12} strokeWidth={2} /> {Math.round(soc.value)} %
          {range?.available && range.value != null && (
            <span className="text-gray-500 font-normal"> · {Math.round(range.value)} km</span>
          )}
          {stale && <span className="ml-1 text-[9px] uppercase">ancien</span>}
        </span>
        {charging === "charging" && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold animate-pulse" data-testid={`${testId}-charging`}><PlugZap size={11} strokeWidth={2} />En charge</div>
        )}
        {charging === "plugged_not_charging" && (
          <div className="flex items-center gap-1 text-[10px] text-gray-500" data-testid={`${testId}-charging`}><Plug size={11} strokeWidth={2} />Branché</div>
        )}
      </div>
    );
  }
  const fl = cap?.capabilities?.fuel_level;
  if (!fl?.available || fl.value === null || fl.value === undefined)
    return <span className="text-gray-300" data-testid={testId}>—</span>;
  const stale = fl.status === "STALE";
  return (
    <span className={`tabular-nums font-medium ${stale ? "text-amber-600" : "text-gray-700"}`} data-testid={testId}
      title={`Source: ${fl.source} · MAJ ${fl.update_time || "?"}${stale ? " · donnée ancienne (dernière valeur connue)" : ""}`}>
      {Math.round(fl.value)} %{stale && <span className="ml-1 text-[9px] uppercase">ancien</span>}
    </span>
  );
};

const CAP_ROWS = [
  ["gps", "GPS / utilisation"],
  ["odometer", "Odomètre"],
  ["engine_hours", "Heures moteur (total)"],
  ["fuel_level", "Niveau carburant réel"],
  ["fuel_consumption_obd", "Consommation OBD"],
  ["vin_obd", "VIN OBD"],
  ["dtc", "Codes défaut (DTC)"],
];
const CapabilitiesPanel = ({ cap }) => {
  if (!cap) return null;
  const caps = cap.capabilities || {};
  const evDetected = ["ev_soc", "ev_range", "ev_charging_state"].some(k => caps[k]?.available);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid="capabilities-panel">
      <h4 className="text-sm font-semibold text-gray-900 mb-1">Capacités télématiques détectées</h4>
      <p className="text-[10px] text-gray-400 mb-3">Détection réelle par véhicule (sensors + readings) — pas déduite de la motorisation</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {CAP_ROWS.map(([k, label]) => {
          const c = caps[k];
          const ok = c?.available;
          const stale = c?.status === "STALE";
          return (
            <div key={k} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-gray-50/60" data-testid={`cap-${k}`}>
              <span className="text-gray-600">{label}{k === "fuel_consumption_obd" && ok && <span className="text-[9px] text-amber-600 ml-1">(unité non vérifiée)</span>}</span>
              <span className={`font-medium ${ok ? (stale ? "text-amber-600" : "text-emerald-600") : "text-gray-300"}`}>
                {ok ? (stale ? "Ancien" : "✓") : "—"}
              </span>
            </div>
          );
        })}
        <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-gray-50/60" data-testid="cap-ev">
          <span className="text-gray-600">Télématique EV (SoC, kWh, recharge)</span>
          <span className={`font-medium ${evDetected ? "text-emerald-600" : "text-gray-300"}`}>{evDetected ? "✓" : "Non détectée"}</span>
        </div>
      </div>
      {evDetected && (
        <div className="mt-3 grid grid-cols-3 gap-2" data-testid="ev-values">
          {[["ev_soc", "Batterie traction"], ["ev_range", "Autonomie"], ["ev_charging_state", "Recharge"],
            ["ev_kwh_per_100km", "Conso moyenne"], ["ev_energy_consumed", "Énergie consommée"], ["ev_battery_capacity", "Capacité batterie"],
            ["ev_charging_power", "Puissance charge"], ["ev_energy_charged", "Dernière recharge"], ["ev_battery_temp", "Temp. batterie"]]
            .filter(([k]) => caps[k]?.available).map(([k, lbl]) => {
            const c = caps[k];
            const CHARGE_LABELS = { charging: "En charge", plugged_not_charging: "Branché", disconnected: "Débranché" };
            const val = c.value == null ? "—"
              : k === "ev_charging_state" ? (CHARGE_LABELS[c.value] || c.value)
              : `${k === "ev_kwh_per_100km" || k === "ev_battery_temp" ? Number(c.value).toFixed(1) : Math.round(c.value).toLocaleString("fr-CH")} ${c.unit || ""}`;
            return (
              <div key={k} className="rounded-lg bg-emerald-50/50 border border-emerald-100 px-2.5 py-2" data-testid={`ev-${k}`}>
                <div className="text-[9px] uppercase tracking-wide text-emerald-700/70">{lbl}</div>
                <div className="text-sm font-semibold text-emerald-800">{val}</div>
                {c?.source?.startsWith("simulation") && <div className="text-[8px] text-purple-500 uppercase font-semibold">Simulation</div>}
              </div>
            );
          })}
        </div>
      )}

      {cap.vin?.conflict && (
        <div className="mt-3 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2" data-testid="vin-conflict">
          Conflit VIN — OBD : {cap.vin.obd} · Garage : {cap.vin.garage}. Aucune correction automatique, vérifiez la fiche.
        </div>
      )}
      {cap.dtc?.codes?.length > 0 && (
        <div className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2" data-testid="dtc-codes">
          Codes défaut OBD : <strong>{cap.dtc.codes.join(", ")}</strong>
          <span className="text-amber-500 ml-2">MAJ {cap.dtc.update_time || "?"}{cap.dtc.status === "STALE" ? " (donnée ancienne)" : ""}</span>
        </div>
      )}
      {(cap.unverified_sensors || []).length > 0 && (
        <div className="mt-3 text-[10px] text-gray-400" data-testid="unverified-sensors">
          Sensors non vérifiés (ignorés volontairement) : {cap.unverified_sensors.map(s => s.name).join(", ")}
        </div>
      )}
    </div>
  );
};

// ─── Section éditable générique ───
const EditableSection = ({ title, subtitle, fields, values, readonlyFields = [], onSave, testId }) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const startEdit = () => { setForm({ ...values }); setEditing(true); };
  const save = async () => {
    setSaving(true);
    try {
      await onSave(form);
      setEditing(false);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Échec de l'enregistrement — vérifiez les valeurs et réessayez");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid={testId}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          {subtitle && <p className="text-[10px] text-gray-400">{subtitle}</p>}
        </div>
        {!editing ? (
          <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50" data-testid={`${testId}-edit`}>
            <Pencil size={12} />Modifier
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Annuler</button>
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#111] text-white rounded-lg hover:bg-black" data-testid={`${testId}-save`}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Enregistrer
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {fields.map(f => (
          <div key={f.key} className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
              {f.icon && <f.icon size={10} />}{f.label}
            </div>
            {editing && !f.readonly ? (
              f.type === "select" ? (
                <select value={form[f.key] ?? ""} onChange={(e) => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full text-xs bg-white border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-gray-400"
                  data-testid={`${testId}-input-${f.key}`}>
                  {(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
              <input type={f.type || "text"} value={form[f.key] ?? ""}
                onChange={(e) => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full text-xs bg-white border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-gray-400"
                data-testid={`${testId}-input-${f.key}`} />
              )
            ) : (
              <div className="text-sm text-gray-800 font-medium min-h-[20px]" data-testid={`${testId}-value-${f.key}`}>
                {f.readonly ? (f.value ?? "—") : (f.type === "date" ? fmtDate(values[f.key]) : (f.type === "select" ? ((f.options || []).find(o => o.value === values[f.key])?.label || "—") : (values[f.key] || "—")))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Onglet Contrôles ───
const ControlesTab = ({ tid, record, refresh }) => {
  const [form, setForm] = useState({ label: "", due_date: "", notes: "" });
  const add = async () => {
    if (!form.label || !form.due_date) return;
    await api.post(`${API}/vehicles/admin/${tid}/controles`, form);
    setForm({ label: "", due_date: "", notes: "" });
    refresh();
  };
  const markDone = async (cid) => {
    await api.put(`${API}/vehicles/admin/${tid}/controles/${cid}`, { done_date: new Date().toISOString().split("T")[0] });
    refresh();
  };
  const del = async (cid) => { await api.delete(`${API}/vehicles/admin/${tid}/controles/${cid}`); refresh(); };
  const items = [...(record.controles || [])].sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

  return (
    <div className="space-y-3" data-testid="tab-content-controles">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Ajouter un contrôle</div>
        <div className="flex flex-wrap gap-2">
          <input placeholder="Libellé (ex : Contrôle technique)" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
            className="flex-1 min-w-[160px] text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" data-testid="controle-label-input" />
          <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" data-testid="controle-date-input" />
          <input placeholder="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            className="flex-1 min-w-[120px] text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" />
          <button onClick={add} className="flex items-center gap-1 px-3 py-2 text-xs font-medium bg-[#111] text-white rounded-lg" data-testid="controle-add-btn"><Plus size={12} />Ajouter</button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="text-center text-xs text-gray-400 py-8">Aucun contrôle enregistré</div>
      ) : items.map(c => (
        <div key={c.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-3.5" data-testid={`controle-item-${c.id}`}>
          <div>
            <div className="text-xs font-medium text-gray-900">{c.label}</div>
            <div className="text-[10px] text-gray-400">Échéance : {fmtDate(c.due_date)}{c.done_date ? ` — effectué le ${fmtDate(c.done_date)}` : ""}{c.notes ? ` · ${c.notes}` : ""}</div>
          </div>
          <div className="flex items-center gap-2">
            {c.done_date ? <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-1">Effectué</span> : <Badge date={c.due_date} />}
            {!c.done_date && <button onClick={() => markDone(c.id)} className="text-[10px] px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50" data-testid={`controle-done-${c.id}`}>Marquer effectué</button>}
            <button onClick={() => del(c.id)} className="p-1.5 text-gray-300 hover:text-red-500" data-testid={`controle-del-${c.id}`}><Trash2 size={13} /></button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Onglet État des lieux ───
const EtatTab = ({ tid, record, refresh }) => {
  const [form, setForm] = useState({ date: "", km: "", etat: "Bon", notes: "" });
  const add = async () => {
    if (!form.date) return;
    await api.post(`${API}/vehicles/admin/${tid}/etat-des-lieux`, form);
    setForm({ date: "", km: "", etat: "Bon", notes: "" });
    refresh();
  };
  const del = async (eid) => { await api.delete(`${API}/vehicles/admin/${tid}/etat-des-lieux/${eid}`); refresh(); };
  const items = [...(record.etat_des_lieux || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div className="space-y-3" data-testid="tab-content-etat">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Nouvel état des lieux</div>
        <div className="flex flex-wrap gap-2">
          <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" data-testid="etat-date-input" />
          <input type="number" placeholder="Km relevé" value={form.km} onChange={e => setForm(p => ({ ...p, km: e.target.value }))}
            className="w-28 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" />
          <select value={form.etat} onChange={e => setForm(p => ({ ...p, etat: e.target.value }))}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none bg-white">
            {["Bon", "Correct", "Usure normale", "Endommagé"].map(o => <option key={o}>{o}</option>)}
          </select>
          <input placeholder="Notes (rayures, pneus...)" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            className="flex-1 min-w-[140px] text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" />
          <button onClick={add} className="flex items-center gap-1 px-3 py-2 text-xs font-medium bg-[#111] text-white rounded-lg" data-testid="etat-add-btn"><Plus size={12} />Ajouter</button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="text-center text-xs text-gray-400 py-8">Aucun état des lieux enregistré</div>
      ) : items.map(e => (
        <div key={e.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-3.5" data-testid={`etat-item-${e.id}`}>
          <div>
            <div className="text-xs font-medium text-gray-900">{fmtDate(e.date)} — {e.etat}{e.km ? ` · ${Number(e.km).toLocaleString("fr-FR")} km relevés` : ""}</div>
            {e.notes && <div className="text-[10px] text-gray-400">{e.notes}</div>}
          </div>
          <button onClick={() => del(e.id)} className="p-1.5 text-gray-300 hover:text-red-500" data-testid={`etat-del-${e.id}`}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
};

// Fichier chargé via l'API authentifiée (les <img>/<a> directs ne portent pas le header d'impersonation)
const AuthedFile = ({ url, render }) => {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let obj = null, cancelled = false;
    api.get(url, { responseType: "blob" })
      .then(r => { if (!cancelled) { obj = URL.createObjectURL(r.data); setSrc(obj); } })
      .catch(() => {});
    return () => { cancelled = true; if (obj) URL.revokeObjectURL(obj); };
  }, [url]);
  return render(src);
};

// ─── Onglet Documents ───
const DocumentsTab = ({ tid, record, refresh }) => {
  const [category, setCategory] = useState("Carte grise");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true); setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    try {
      await api.post(`${API}/vehicles/admin/${tid}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 120000 });
      refresh();
    } catch (e) {
      setError(e.response?.status === 413 ? "Fichier trop volumineux (max 25 Mo)" : "Échec de l'envoi du fichier");
    }
    setUploading(false);
  };
  const del = async (docId) => { await api.delete(`${API}/vehicles/admin/${tid}/documents/${docId}`); refresh(); };
  const items = [...(record.documents || [])].sort((a, b) => (b.uploaded_at || "").localeCompare(a.uploaded_at || ""));
  const [preview, setPreview] = useState(null);
  const fileUrl = (d, inline) => `${API}/vehicles/admin/${tid}/documents/${d.id}${inline ? "?inline=1" : ""}`;
  const isImage = (d) => (d.content_type || "").startsWith("image/");
  const isPdf = (d) => (d.content_type || "") === "application/pdf";
  const download = async (d) => {
    const r = await api.get(fileUrl(d, false), { responseType: "blob" });
    const u = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = u; a.download = d.filename; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 5000);
  };

  return (
    <div className="space-y-3" data-testid="tab-content-documents">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Ajouter un document (max 25 Mo)</div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none bg-white" data-testid="doc-category-select">
            {["Carte grise", "Leasing", "Assurance", "Contrôle", "Facture", "Autre"].map(o => <option key={o}>{o}</option>)}
          </select>
          <label className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg cursor-pointer ${uploading ? "bg-gray-100 text-gray-400" : "bg-[#111] text-white hover:bg-black"}`}>
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? "Envoi en cours…" : "Choisir un fichier"}
            <input type="file" className="hidden" disabled={uploading} onChange={e => upload(e.target.files[0])} data-testid="doc-file-input" />
          </label>
          {error && <span className="text-[10px] text-red-500" data-testid="doc-error">{error}</span>}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="text-center text-xs text-gray-400 py-8">Aucun document</div>
      ) : items.map(d => (
        <div key={d.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-3.5" data-testid={`doc-item-${d.id}`}>
          <div className="flex items-center gap-3 min-w-0">
            {isImage(d) ? (
              <button onClick={() => setPreview(d)} className="w-12 h-12 rounded-lg border border-gray-200 overflow-hidden shrink-0 hover:opacity-80 transition-opacity bg-gray-50" title="Aperçu" data-testid={`doc-thumb-${d.id}`}>
                <AuthedFile url={fileUrl(d, true)} render={(src) => src
                  ? <img src={src} alt={d.filename} className="w-full h-full object-cover" />
                  : <FileText size={17} className="text-gray-300 m-auto" />} />
              </button>
            ) : (
              <div className={`w-12 h-12 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 ${isPdf(d) ? "cursor-pointer hover:bg-gray-100" : ""}`}
                onClick={isPdf(d) ? () => setPreview(d) : undefined} title={isPdf(d) ? "Aperçu" : undefined}>
                <FileText size={17} className={isPdf(d) ? "text-red-400" : "text-gray-400"} />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-900 truncate">{d.filename}</div>
              <div className="text-[10px] text-gray-400">{d.category} · {fmtSize(d.size)} · {fmtDate(d.uploaded_at)}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(isImage(d) || isPdf(d)) && (
              <button onClick={() => setPreview(d)} className="p-1.5 text-gray-400 hover:text-gray-700" title="Aperçu" data-testid={`doc-preview-${d.id}`}><Eye size={14} /></button>
            )}
            <button onClick={() => download(d)}
              className="p-1.5 text-gray-400 hover:text-gray-700" title="Télécharger" data-testid={`doc-download-${d.id}`}><Download size={14} /></button>
            <button onClick={() => del(d.id)} className="p-1.5 text-gray-300 hover:text-red-500" data-testid={`doc-del-${d.id}`}><Trash2 size={13} /></button>
          </div>
        </div>
      ))}

      {preview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPreview(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden" data-testid="doc-preview-modal">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-gray-900 truncate">{preview.filename}</div>
                <div className="text-[10px] text-gray-400">{preview.category} · {fmtSize(preview.size)}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => download(preview)} className="p-2 text-gray-400 hover:text-gray-700" title="Télécharger" data-testid="doc-preview-download"><Download size={15} /></button>
                <button onClick={() => setPreview(null)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" data-testid="doc-preview-close"><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 overflow-auto flex items-center justify-center">
              <AuthedFile url={fileUrl(preview, true)} render={(src) => !src
                ? <Loader2 size={22} className="animate-spin text-gray-400" />
                : isImage(preview)
                  ? <img src={src} alt={preview.filename} className="max-w-full max-h-full object-contain" />
                  : <iframe title={preview.filename} src={src} className="w-full h-full border-0" />} />
            </div>
            {isPdf(preview) && (
              <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 shrink-0">
                Si l'aperçu PDF ne s'affiche pas dans votre navigateur, utilisez le bouton de téléchargement ci-dessus.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Fiche véhicule (drawer) ───
const VehicleSheet = ({ vehicle, record, garageVehicle, unlinkedGarage, groupName, capability, deadlines = {}, onClose, onSaved, onGarageSaved, onLinkChanged }) => {
  const [tab, setTab] = useState("general");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [linkChoice, setLinkChoice] = useState("");
  const [linking, setLinking] = useState(false);
  const tid = vehicle.tracker_id;
  const gv = garageVehicle;

  const doLink = async (vehicleId, trackerId) => {
    setLinking(true);
    try {
      await api.post(`${API}/vehicles/admin/navixy-garage/${vehicleId}/link`, { tracker_id: trackerId });
      await onLinkChanged();
    } catch (e) { /* surfaced via state refresh */ }
    setLinking(false);
    setLinkChoice("");
  };

  const saveSection = async (section, data) => {
    const res = await api.put(`${API}/vehicles/admin/${tid}`, { section, data });
    if (res.data.success) onSaved(tid, res.data.record);
  };
  const saveGarage = async (data) => {
    const res = await api.put(`${API}/vehicles/admin/navixy-garage/${gv.vehicle_id}`, { data });
    if (res.data.success) onGarageSaved(tid, res.data.vehicle);
  };
  const uploadPhoto = async (file) => {
    if (!file || !gv) return;
    setPhotoUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post(`${API}/vehicles/admin/navixy-garage/${gv.vehicle_id}/photo`, fd,
        { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 });
      if (res.data.success) onGarageSaved(tid, { ...gv, avatar_file_name: res.data.avatar_file_name, avatar_url: `${res.data.avatar_url}?t=${Date.now()}` });
    } catch (e) { /* surface via console */ }
    setPhotoUploading(false);
  };
  const refresh = async () => {
    const res = await api.get(`${API}/vehicles/admin`);
    if (res.data.success) onSaved(tid, res.data.records[String(tid)] || record);
  };

  const TABS = [
    { id: "general", label: "Général", icon: Car },
    { id: "leasing", label: "Leasing", icon: CreditCard },
    { id: "assurance", label: "Assurance", icon: ShieldCheck },
    { id: "carte_grise", label: "Carte grise", icon: FileText },
    { id: "etat", label: "État des lieux", icon: ClipboardList },
    { id: "controles", label: "Contrôles", icon: Check },
    { id: "documents", label: "Documents", icon: FolderOpen },
  ];

  const g = record.general || {};

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-full lg:w-[880px] xl:w-[980px] bg-gray-50 shadow-2xl z-[70] overflow-y-auto" data-testid="vehicle-sheet">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 pt-4 z-10">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Photo synchronisée garage */}
            <div className="relative group shrink-0">
              {gv?.avatar_url ? (
                <img src={gv.avatar_url} alt={vehicle.label} className="w-24 h-16 object-cover rounded-lg border border-gray-200" data-testid="sheet-photo" />
              ) : (
                <div className="w-24 h-16 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center"><Car size={22} className="text-gray-300" /></div>
              )}
              {gv && (
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 rounded-lg cursor-pointer transition-opacity" title="Changer la photo (synchronisée garage)">
                  {photoUploading ? <Loader2 size={16} className="text-white animate-spin" /> : <Camera size={16} className="text-white" />}
                  <input type="file" accept="image/*" className="hidden" disabled={photoUploading} onChange={e => uploadPhoto(e.target.files[0])} data-testid="sheet-photo-input" />
                </label>
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold" style={{ fontFamily: "Outfit, sans-serif" }}>{vehicle.label}</h3>
              <div className="flex flex-wrap items-center gap-2 mt-1.5 mb-3">
                <MotorBadge motor={capability?.motorisation} testId="sheet-motor-badge" />
                {gv?.reg_number && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#111] text-white text-[10px] font-semibold" data-testid="sheet-plate">{gv.reg_number}</span>}
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-[10px] text-gray-500"><Hash size={10} />VIN {gv?.vin || g.vin || "—"}</span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-[10px] text-gray-500"><Gauge size={10} />{fmtKm(vehicle.total_odometer)}</span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-[10px] text-gray-500"><Radio size={10} />Tracker {tid}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" data-testid="sheet-close"><X size={18} className="text-gray-500" /></button>
        </div>
        <div className="flex gap-0 overflow-x-auto -mb-px">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`sheet-tab-${t.id}`}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-[#111] text-[#111]" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
              <t.icon size={12} />{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {tab === "general" && (
          <div className="space-y-4">
            {gv ? (
              <div>
                <EditableSection title="Identité véhicule — synchronisée avec le garage LOGITRAK" subtitle={`Modifications propagées dans les 2 sens (véhicule garage #${gv.vehicle_id})`} testId="section-garage"
                  values={gv} onSave={saveGarage}
                  fields={[
                    { key: "label", label: "Nom" },
                    { key: "model", label: "Modèle" },
                    { key: "reg_number", label: "Plaque d'immatriculation" },
                    { key: "vin", label: "VIN" },
                    { key: "manufacture_year", label: "Année", type: "number" },
                    { key: "color", label: "Couleur" },
                    { key: "_garage", label: "Garage", readonly: true, value: gv.garage || "—" },
                    { key: "_fuel", label: "Carburant", readonly: true, value: [gv.fuel_type, gv.fuel_grade].filter(Boolean).join(" · ") || "—" },
                  ]} />
                <button onClick={() => doLink(gv.vehicle_id, null)} disabled={linking}
                  className="mt-2 text-[10px] text-gray-400 hover:text-red-500 underline" data-testid="garage-unlink-btn">
                  {linking ? "Déliaison…" : "Délier ce véhicule du garage (retire la liaison traceur)"}
                </button>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl" data-testid="no-garage-note">
                <div className="text-xs text-amber-700 mb-3">
                  Aucun véhicule du garage LOGITRAK n'est lié à ce traceur. Liez-en un pour activer la synchronisation photo/fiche dans les 2 sens :
                </div>
                {unlinkedGarage.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={linkChoice} onChange={e => setLinkChoice(e.target.value)}
                      className="text-xs border border-amber-200 rounded-lg px-3 py-2 bg-white focus:outline-none min-w-[220px]"
                      data-testid="garage-link-select">
                      <option value="">— Choisir un véhicule du garage —</option>
                      {unlinkedGarage.map(u => (
                        <option key={u.vehicle_id} value={u.vehicle_id}>
                          {[u.label, u.reg_number, u.model].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ")}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => linkChoice && doLink(Number(linkChoice), tid)} disabled={!linkChoice || linking}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#111] text-white rounded-lg disabled:opacity-40"
                      data-testid="garage-link-btn">
                      {linking ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Lier ce véhicule
                    </button>
                  </div>
                ) : (
                  <div className="text-[10px] text-amber-600">Aucun véhicule du garage disponible — créez-le d'abord dans le garage de la plateforme GPS.</div>
                )}
              </div>
            )}
            <EditableSection title="Gestion interne" subtitle="Champs propres à LOGITRAK Dashboard" testId="section-general"
              values={g} onSave={(data) => saveSection("general", data)}
              fields={[
                ...(gv ? [] : [
                  { key: "marque", label: "Marque" },
                  { key: "modele", label: "Modèle" },
                  { key: "annee", label: "Année" },
                  { key: "vin", label: "VIN" },
                ]),
                { key: "motorisation", label: "Motorisation (correction LOGITRAK)", type: "select", options: [
                  { value: "", label: "— Selon garage —" },
                  { value: "diesel", label: "Diesel" },
                  { value: "petrol", label: "Essence" },
                  { value: "hybrid", label: "Hybride" },
                  { value: "phev", label: "Hybride rechargeable" },
                  { value: "electric", label: "Électrique" },
                ] },
                { key: "_km", label: "Kilométrage (GPS)", readonly: true, value: fmtKm(vehicle.total_odometer) },
                { key: "_groupe", label: "Groupe", readonly: true, value: groupName || "—" },
                { key: "base", label: "Base / Site" },
                { key: "responsable", label: "Responsable" },
                { key: "_tracker", label: "Tracker GPS", readonly: true, value: String(tid) },
                { key: "prochaine_maintenance", label: "Prochaine maintenance", type: "date" },
                { key: "prochaine_expertise", label: "Prochaine expertise", type: "date" },
              ]} />
            <CapabilitiesPanel cap={capability} />
          </div>
        )}
        {tab === "leasing" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2"><span className="text-[10px] text-gray-400 uppercase font-semibold">Échéance :</span><Badge item={deadlines[`${tid}:leasing`]} testId="leasing-badge" /></div>
            <EditableSection title="Contrat de leasing" testId="section-leasing"
              values={record.leasing || {}} onSave={(data) => saveSection("leasing", data)}
              fields={[
                { key: "societe", label: "Société de leasing" },
                { key: "contrat_no", label: "N° de contrat" },
                { key: "date_debut", label: "Début", type: "date" },
                { key: "date_fin", label: "Fin", type: "date" },
                { key: "loyer_mensuel", label: "Loyer mensuel (CHF)", type: "number" },
                { key: "km_inclus", label: "Km inclus / an", type: "number" },
                { key: "notes", label: "Notes" },
              ]} />
          </div>
        )}
        {tab === "assurance" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2"><span className="text-[10px] text-gray-400 uppercase font-semibold">Échéance :</span><Badge item={deadlines[`${tid}:assurance`]} testId="assurance-badge" /></div>
            {gv && (
              <EditableSection title="Police RC — synchronisée avec le garage LOGITRAK" subtitle="N° de police et validité propagés dans les 2 sens" testId="section-garage-assurance"
                values={gv} onSave={saveGarage}
                fields={[
                  { key: "liability_insurance_policy_number", label: "N° de police (RC)" },
                  { key: "liability_insurance_valid_till", label: "Valide jusqu'au", type: "date" },
                ]} />
            )}
            <EditableSection title="Assurance — détails internes" testId="section-assurance"
              values={record.assurance || {}} onSave={(data) => saveSection("assurance", data)}
              fields={[
                { key: "compagnie", label: "Compagnie" },
                { key: "police_no", label: gv ? "N° de police (saisie interne)" : "N° de police" },
                { key: "date_fin", label: gv ? "Fin (interne — utilisée seulement si la RC garage est vide)" : "Fin", type: "date" },
                { key: "date_debut", label: "Début", type: "date" },
                { key: "couverture", label: "Type de couverture" },
                { key: "franchise", label: "Franchise (CHF)", type: "number" },
                { key: "notes", label: "Notes" },
              ]} />
          </div>
        )}
        {tab === "carte_grise" && (
          <EditableSection title="Carte grise" subtitle="Permis de circulation" testId="section-carte_grise"
            values={record.carte_grise || {}} onSave={(data) => saveSection("carte_grise", data)}
            fields={[
              { key: "numero", label: "Numéro" },
              { key: "titulaire", label: "Titulaire" },
              { key: "date_emission", label: "Date d'émission", type: "date" },
              { key: "canton", label: "Canton" },
              { key: "notes", label: "Notes" },
            ]} />
        )}
        {tab === "etat" && <EtatTab tid={tid} record={record} refresh={refresh} />}
        {tab === "controles" && <ControlesTab tid={tid} record={record} refresh={refresh} />}
        {tab === "documents" && <DocumentsTab tid={tid} record={record} refresh={refresh} />}
      </div>
    </div>
  );
};

// ═══════════════ MAIN ═══════════════
export const VehiclesTab = ({ data, initialSelected, onConsumedInitial }) => {
  const { stats, efficiency } = data;
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (initialSelected) { setSelected(initialSelected); onConsumedInitial?.(); }
  }, [initialSelected]); // eslint-disable-line react-hooks/exhaustive-deps
  const [groups, setGroups] = useState([]);
  const [garage, setGarage] = useState({ linked: {}, unlinked: [], ok: false });
  const [syncing, setSyncing] = useState(false);
  const [caps, setCaps] = useState({});
  const [dlMap, setDlMap] = useState({});

  const fetchDeadlines = useCallback(async () => {
    try {
      const r = await api.get(`${API}/vehicles/deadlines`);
      if (r.data.success) {
        const m = {};
        (r.data.deadlines || []).forEach(it => {
          const key = `${it.tracker_id}:${it.deadline_type}`;
          if (!m[key] || it.days_remaining < m[key].days_remaining) m[key] = it;
        });
        setDlMap(m);
      }
    } catch { /* moteur indisponible → badges "—" (aucun recalcul local) */ }
  }, []);

  const fetchGarage = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await api.get(`${API}/vehicles/admin/navixy-garage`);
      if (res.data.success) setGarage({ linked: res.data.linked || {}, unlinked: res.data.unlinked || [], ok: true });
      else setGarage(g => ({ ...g, ok: false }));
    } catch { setGarage(g => ({ ...g, ok: false })); }
    setSyncing(false);
  }, []);

  const vehicles = stats?.vehicles || [];
  const groupIdByTid = useMemo(() => {
    const m = {};
    (efficiency?.vehicles || []).forEach(v => { m[v.tracker_id] = v.group_id || 0; });
    return m;
  }, [efficiency]);
  const groupTitle = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g.title])), [groups]);

  useEffect(() => {
    api.get(`${API}/vehicles/admin`).then(res => { if (res.data.success) setRecords(res.data.records || {}); })
      .catch(() => {}).finally(() => setLoading(false));
    api.get(`${API}/groups`).then(res => { if (res.data.success) setGroups(res.data.groups || []); }).catch(() => {});
    api.get(`${API}/vehicles/capabilities`).then(res => { if (res.data.success) setCaps(res.data.records || {}); }).catch(() => {});
    fetchGarage();
    fetchDeadlines();
  }, [fetchGarage, fetchDeadlines]);

  const onSaved = useCallback((tid, record) => {
    setRecords(prev => ({ ...prev, [String(tid)]: record }));
    fetchDeadlines();
  }, [fetchDeadlines]);

  const onGarageSaved = useCallback((tid, vehicle) => {
    setGarage(prev => ({ ...prev, linked: { ...prev.linked, [String(tid)]: vehicle } }));
    fetchDeadlines();
  }, [fetchDeadlines]);

  const rows = useMemo(() => {
    return vehicles
      .filter(v => {
        if (!search) return true;
        const q = search.toLowerCase();
        const gv = garage.linked[String(v.tracker_id)];
        return v.label.toLowerCase().includes(q)
          || (gv?.reg_number || "").toLowerCase().includes(q)
          || (gv?.model || "").toLowerCase().includes(q);
      })
      .map(v => {
        const rec = records[String(v.tracker_id)] || { general: {}, leasing: {}, assurance: {}, controles: [], etat_des_lieux: [], documents: [] };
        return { ...v, rec };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [vehicles, records, search, garage.linked]);

  const emptyRec = { general: {}, leasing: {}, assurance: {}, carte_grise: {}, controles: [], etat_des_lieux: [], documents: [] };

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-[1600px] mx-auto" data-testid="vehicles-tab">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>Véhicules</h2>
          <p className="text-xs text-gray-400 mt-0.5">{vehicles.length} véhicules · cliquez sur une ligne pour ouvrir la fiche administrative</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none w-56" data-testid="vehicles-search" />
        </div>
      </div>

      {/* Bannière synchro garage */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#111] rounded-xl text-white" data-testid="garage-sync-banner">
        <div className={`w-2 h-2 rounded-full ${garage.ok ? "bg-emerald-400" : "bg-red-400"}`} />
        <div className="text-xs">
          <span className="font-semibold">Garage LOGITRAK</span>
          <span className="text-white/60 ml-2">
            {garage.ok
              ? `${Object.keys(garage.linked).length}/${vehicles.length} véhicules liés · photos & fiches synchronisées dans les 2 sens`
              : "connexion au garage indisponible"}
          </span>
        </div>
        <button onClick={fetchGarage} disabled={syncing}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          data-testid="garage-sync-btn">
          <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />Synchroniser
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto" data-testid="vehicles-admin-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="px-4 py-3 text-left">Véhicule</th>
              <th className="px-4 py-3 text-left">Kilométrage</th>
              <th className="px-4 py-3 text-left">Énergie</th>
              <th className="px-4 py-3 text-left">Responsable</th>
              <th className="px-4 py-3 text-left">Leasing</th>
              <th className="px-4 py-3 text-left">Assurance</th>
              <th className="px-4 py-3 text-left">Contrôle</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-gray-400"><Loader2 size={16} className="animate-spin inline mr-2" />Chargement des fiches…</td></tr>
            ) : rows.map(v => {
              const g = v.rec.general || {};
              const gv = garage.linked[String(v.tracker_id)];
              const subline = gv ? [gv.reg_number, gv.model].filter(Boolean).join(" · ") : ([g.marque, g.modele].filter(Boolean).join(" ") || cleanDeviceLabel(v.model));
              return (
                <tr key={v.tracker_id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelected(v.tracker_id)} data-testid={`vehicle-admin-row-${v.tracker_id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {gv?.avatar_url ? (
                        <img src={gv.avatar_url} alt={v.label} className="w-14 h-10 object-cover rounded-lg border border-gray-200 shrink-0" data-testid={`vehicle-photo-${v.tracker_id}`} />
                      ) : (
                        <div className="w-14 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0"><Car size={15} className="text-gray-400" /></div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900 flex items-center gap-2">{v.label}
                          {caps[String(v.tracker_id)]?.capabilities?.ev_charging_state?.value === "charging" && (
                            <span title="Recharge en cours" data-testid={`charging-icon-${v.tracker_id}`}>
                              <PlugZap size={14} className="text-emerald-500 animate-pulse" />
                            </span>
                          )}
                          <MotorBadge motor={caps[String(v.tracker_id)]?.motorisation} testId={`motor-badge-${v.tracker_id}`} /></div>
                        <div className="text-[10px] text-gray-400">{subline}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 tabular-nums">{fmtKm(v.total_odometer)}</td>
                  <td className="px-4 py-3 text-xs"><FuelLevel cap={caps[String(v.tracker_id)]} testId={`fuel-level-${v.tracker_id}`} /></td>
                  <td className="px-4 py-3 text-xs text-gray-600">{g.responsable || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3"><Badge item={dlMap[`${v.tracker_id}:leasing`]} testId={`badge-leasing-${v.tracker_id}`} /></td>
                  <td className="px-4 py-3"><Badge item={dlMap[`${v.tracker_id}:assurance`]} testId={`badge-assurance-${v.tracker_id}`} /></td>
                  <td className="px-4 py-3"><Badge item={dlMap[`${v.tracker_id}:controle`]} testId={`badge-controle-${v.tracker_id}`} /></td>
                  <td className="px-2 py-3"><ChevronRight size={14} className="text-gray-300" /></td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-gray-400">Aucun véhicule ne correspond à la recherche</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-xl border border-gray-200">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-[10px] text-gray-500">Kilométrage et tracker = données GPS réelles. Identité véhicule, plaque, VIN, assurance RC et photo = garage LOGITRAK, synchronisés dans les 2 sens à chaque chargement. Leasing, contrôles, état des lieux, documents = saisie LOGITRAK Dashboard. Échéances : statuts calculés par le moteur backend unique (assurance = garage puis saisie interne) — rouge = échu · orange &lt; 30 j · vert sinon.</span>
      </div>

      {selected && (() => {
        const v = vehicles.find(x => x.tracker_id === selected);
        if (!v) return null;
        return (
          <>
            <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelected(null)} />
            <VehicleSheet vehicle={v} record={records[String(selected)] || emptyRec}
              garageVehicle={garage.linked[String(selected)] || null}
              unlinkedGarage={garage.unlinked}
              groupName={groupTitle[groupIdByTid[selected]]}
              capability={caps[String(selected)] || null}
              deadlines={dlMap}
              onClose={() => setSelected(null)} onSaved={onSaved} onGarageSaved={onGarageSaved}
              onLinkChanged={() => { fetchGarage(); fetchDeadlines(); }} />
          </>
        );
      })()}
    </div>
  );
};
