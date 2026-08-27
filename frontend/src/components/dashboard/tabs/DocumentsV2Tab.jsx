import { useState, useEffect, useCallback } from "react";
import { Upload, Loader2, FileText, Trash2, Download, Eye, X, Pencil } from "lucide-react";
import { api, API } from "@/lib/api";
import { toast } from "sonner";

const fmtD = (d) => (d && d.length >= 10) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "—";
const fmtSize = (b) => !b ? "—" : b > 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`;

// Statut fourni par le moteur d'échéances backend — aucun recalcul frontend
const DlBadge = ({ item, testId }) => {
  if (!item) return null;
  const days = item.days_remaining;
  const cfg = item.status === "EXPIRED"
    ? { label: `Échu depuis ${-days} j`, cls: "bg-red-50 text-red-600 border-red-200", dot: "bg-red-500" }
    : item.status === "DUE_SOON"
      ? { label: `Expire dans ${days} j`, cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" }
      : { label: `Valide (${days} j)`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" };
  return <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-medium whitespace-nowrap ${cfg.cls}`} data-testid={testId}>
    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
  </span>;
};

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

const inputCls = "text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400";
const EMPTY = { category_id: "carte_grise", title: "", document_number: "", issued_at: "", valid_from: "", expiry_date: "" };

const MetaFields = ({ form, setForm, cats, prefix }) => (
  <div className="flex flex-wrap gap-2">
    <select value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
      className={`${inputCls} bg-white`} data-testid={`${prefix}-category-select`}>
      {cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
    <input placeholder="Titre" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
      className={`${inputCls} flex-1 min-w-[120px]`} data-testid={`${prefix}-title-input`} />
    <input placeholder="N° document" value={form.document_number} onChange={e => setForm(p => ({ ...p, document_number: e.target.value }))}
      className={`${inputCls} w-28`} data-testid={`${prefix}-number-input`} />
    {[["issued_at", "Émis le"], ["valid_from", "Valide du"], ["expiry_date", "Expire le"]].map(([k, lbl]) => (
      <label key={k} className="flex items-center gap-1.5 text-[10px] text-gray-400">
        {lbl}
        <input type="date" value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
          className={inputCls} data-testid={`${prefix}-${k.replace("_", "-")}-input`} />
      </label>
    ))}
  </div>
);

// ─── Onglet Documents V2 — collection documents, échéances via moteur backend ───
export const DocumentsV2Tab = ({ tid, onDeadlinesChanged }) => {
  const [docs, setDocs] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY);

  const fetchDocs = useCallback(async () => {
    try {
      const r = await api.get(`${API}/documents`, { params: { tracker_id: tid } });
      if (r.data.success) setDocs(r.data.documents || []);
    } catch { /* liste indisponible */ } finally { setLoading(false); }
  }, [tid]);

  useEffect(() => {
    fetchDocs();
    api.get(`${API}/documents/categories`).then(r => { if (r.data.success) setCats(r.data.categories || []); }).catch(() => {});
  }, [fetchDocs]);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("tracker_id", String(tid));
    fd.append("category_id", form.category_id);
    fd.append("title", form.title || file.name);
    ["document_number", "issued_at", "valid_from", "expiry_date"].forEach(k => { if (form[k]) fd.append(k, form[k]); });
    try {
      await api.post(`${API}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 120000 });
      setForm(EMPTY); setFile(null);
      fetchDocs(); onDeadlinesChanged?.();
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(e.response?.status === 413 ? "Fichier trop volumineux (max 25 Mo)"
        : typeof detail === "string" ? detail : "Échec de l'envoi du fichier");
    }
    setUploading(false);
  };

  const startEdit = (d) => {
    setEditId(d.id);
    setEditForm({ category_id: d.category_id, title: d.title || "", document_number: d.document_number || "",
      issued_at: d.issued_at || "", valid_from: d.valid_from || "", expiry_date: d.expiry_date || "" });
  };
  const saveEdit = async () => {
    try {
      const body = {};
      Object.entries(editForm).forEach(([k, v]) => { body[k] = v || null; });
      await api.patch(`${API}/documents/${editId}`, body);
      setEditId(null);
      fetchDocs(); onDeadlinesChanged?.();
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Échec de la mise à jour");
    }
  };
  const del = async (id) => {
    try { await api.delete(`${API}/documents/${id}`); fetchDocs(); onDeadlinesChanged?.(); }
    catch { toast.error("Échec de la suppression"); }
  };

  const fileUrl = (d, inline) => `${API}/documents/${d.id}/file${inline ? "?inline=1" : ""}`;
  const isImage = (d) => (d.content_type || "").startsWith("image/");
  const isPdf = (d) => (d.content_type || "") === "application/pdf";
  const download = async (d) => {
    try {
      const r = await api.get(fileUrl(d, false), { responseType: "blob" });
      const u = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = u; a.download = d.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(u), 5000);
    } catch {
      toast.error("Échec du téléchargement du fichier");
    }
  };

  const metaLine = (d) => {
    const parts = [d.category_label, d.document_number ? `N° ${d.document_number}` : null,
      d.issued_at ? `émis le ${fmtD(d.issued_at)}` : null,
      d.valid_from || d.expiry_date ? `valide ${d.valid_from ? "du " + fmtD(d.valid_from) + " " : ""}${d.expiry_date ? "au " + fmtD(d.expiry_date) : ""}` : null,
      fmtSize(d.size), d.source === "legacy" ? "importé" : null];
    return parts.filter(Boolean).join(" · ");
  };

  return (
    <div className="space-y-3" data-testid="tab-content-documents">
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Ajouter un document (max 25 Mo)</div>
        <MetaFields form={form} setForm={setForm} cats={cats} prefix="doc" />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg cursor-pointer border border-gray-200 hover:bg-gray-50 text-gray-700">
            <FileText size={12} />
            {file ? file.name.slice(0, 40) : "Choisir un fichier"}
            <input type="file" className="hidden" onChange={e => setFile(e.target.files[0] || null)} data-testid="doc-file-input" />
          </label>
          <button onClick={upload} disabled={!file || uploading}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg ${!file || uploading ? "bg-gray-100 text-gray-400" : "bg-[#111] text-white hover:bg-black"}`}
            data-testid="doc-upload-btn">
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? "Envoi en cours…" : "Ajouter"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8"><Loader2 size={18} className="animate-spin text-gray-300 mx-auto" /></div>
      ) : docs.length === 0 ? (
        <div className="text-center text-xs text-gray-400 py-8">Aucun document</div>
      ) : docs.map(d => (
        <div key={d.id} className="bg-white border border-gray-200 rounded-xl p-3.5" data-testid={`doc-item-${d.id}`}>
          <div className="flex items-center justify-between">
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
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-gray-900 truncate">{d.title || d.filename}</span>
                  <DlBadge item={d.deadline} testId={`doc-deadline-${d.id}`} />
                </div>
                <div className="text-[10px] text-gray-400 truncate">{metaLine(d)}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {(isImage(d) || isPdf(d)) && (
                <button onClick={() => setPreview(d)} className="p-1.5 text-gray-400 hover:text-gray-700" title="Aperçu" data-testid={`doc-preview-${d.id}`}><Eye size={14} /></button>
              )}
              <button onClick={() => download(d)} className="p-1.5 text-gray-400 hover:text-gray-700" title="Télécharger" data-testid={`doc-download-${d.id}`}><Download size={14} /></button>
              <button onClick={() => (editId === d.id ? setEditId(null) : startEdit(d))} className="p-1.5 text-gray-400 hover:text-gray-700" title="Modifier les informations" data-testid={`doc-edit-${d.id}`}><Pencil size={13} /></button>
              <button onClick={() => del(d.id)} className="p-1.5 text-gray-300 hover:text-red-500" data-testid={`doc-del-${d.id}`}><Trash2 size={13} /></button>
            </div>
          </div>
          {editId === d.id && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2" data-testid={`doc-edit-form-${d.id}`}>
              <MetaFields form={editForm} setForm={setEditForm} cats={cats} prefix="doc-edit" />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="px-3 py-1.5 text-xs font-medium bg-[#111] text-white rounded-lg" data-testid="doc-edit-save">Enregistrer</button>
                <button onClick={() => setEditId(null)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg">Annuler</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {preview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPreview(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden" data-testid="doc-preview-modal">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-gray-900 truncate">{preview.title || preview.filename}</div>
                <div className="text-[10px] text-gray-400">{preview.category_label} · {fmtSize(preview.size)}</div>
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
