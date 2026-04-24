// src/pages/SalesLog.jsx — Editable sales log with audit history and undo
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, History, Search,
  ChevronLeft, ChevronRight, Save, X, AlertTriangle, RotateCcw
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fetchSales, createSale, updateSale, deleteSale, fetchAuditLog } from '../lib/api';

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ sale, onSave, onClose }) {
  const isNew = !sale.id;
  const [form, setForm] = useState({
    item_name: sale?.item_name || '',
    quantity: sale?.quantity || 1,
    reason: 'manual correction',
  });
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.item_name.trim()) { setError('Item name is required.'); return; }
    if (form.quantity < 1) { setError('Quantity must be at least 1.'); return; }

    setSaving(true);
    try {
      if (isNew) {
        await createSale({ item_name: form.item_name, quantity: Number(form.quantity) });
      } else {
        await updateSale(sale.id, { item_name: form.item_name, quantity: Number(form.quantity), reason: form.reason });
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-bounce-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display font-bold text-navy-500">
            {isNew ? 'Add Sale Event' : 'Edit Sale'}
          </h2>
          <button onClick={onClose} className="btn-icon btn-secondary"><X className="w-4 h-4" /></button>
        </div>

        {error && (
          <div className="alert-warning mb-4 text-sm">
            <AlertTriangle className="w-4 h-4 text-warning-DEFAULT flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Change preview */}
        {!isNew && preview && (
          <div className="mb-4 p-3 rounded-xl bg-surface-50 border border-surface-200 text-xs">
            <p className="font-semibold text-slate-600 mb-1">Change Preview</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-slate-400">Before</p>
                <p className="font-medium">{sale.item_name} × {sale.quantity}</p>
              </div>
              <div>
                <p className="text-slate-400">After</p>
                <p className="font-medium text-primary-700">{form.item_name} × {form.quantity}</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Item Name</label>
            <input
              className="input"
              value={form.item_name}
              onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))}
              placeholder="e.g. bottle"
              list="item-suggestions"
            />
            <datalist id="item-suggestions">
              {['bottle','chips','juice','water','cola','snack','cereal','yogurt','candy','energy drink'].map(i => (
                <option key={i} value={i} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="label">Quantity</label>
            <input
              type="number"
              min={1}
              className="input"
              value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
            />
          </div>

          {!isNew && (
            <div>
              <label className="label">Reason for change</label>
              <input
                className="input"
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. manual correction"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {!isNew && (
              <button type="button" onClick={() => setPreview(p => !p)} className="btn-secondary flex-1">
                {preview ? 'Hide' : 'Preview'} Changes
              </button>
            )}
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : isNew ? 'Add Sale' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Audit Drawer ──────────────────────────────────────────────────────────────
function AuditDrawer({ onClose }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLog().then(d => { setLog(d.audit_log || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const ACTION_COLOR = { CREATE: 'badge-success', UPDATE: 'badge-teal', DELETE: 'badge-danger' };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal max-w-2xl animate-bounce-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display font-bold text-navy-500 flex items-center gap-2">
            <History className="w-5 h-5 text-primary-500" /> Audit History
          </h2>
          <button onClick={onClose} className="btn-icon btn-secondary"><X className="w-4 h-4" /></button>
        </div>
        {loading ? (
          <div className="text-center py-8 text-slate-400 text-sm">Loading...</div>
        ) : log.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No audit records yet.</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
            {log.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl bg-surface-50 border border-surface-200 text-sm">
                <span className={`badge ${ACTION_COLOR[entry.action] || 'badge-gray'} mt-0.5`}>{entry.action}</span>
                <div className="flex-1 min-w-0">
                  {entry.old_value && <p className="text-red-600 text-xs line-through">{entry.old_value}</p>}
                  {entry.new_value && <p className="text-green-700 text-xs">{entry.new_value}</p>}
                  {entry.reason && <p className="text-slate-500 text-xs mt-0.5">{entry.reason}</p>}
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {entry.timestamp ? format(parseISO(entry.timestamp), 'MMM d HH:mm') : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────────
function DeleteConfirm({ sale, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal max-w-sm animate-bounce-in">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-danger-light flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-7 h-7 text-danger-DEFAULT" />
          </div>
          <h2 className="text-lg font-display font-bold text-navy-500 mb-2">Delete Sale?</h2>
          <p className="text-sm text-slate-600 mb-6">
            This will permanently delete <strong>{sale.item_name} × {sale.quantity}</strong> from the log.
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={async () => { setDeleting(true); await onConfirm(); }}
              disabled={deleting}
              className="btn-danger flex-1"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SalesLog Page ─────────────────────────────────────────────────────────────
export default function SalesLog() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [editTarget, setEditTarget] = useState(null);  // null | sale | {new}
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showAudit, setShowAudit] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [toast, setToast] = useState(null);

  const PAGE_SIZE = 20;

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (search) params.item_filter = search;
      if (dateFilter) params.date_filter = dateFilter;
      const data = await fetchSales(params);
      setSales(data.sales || []);
    } catch {}
    setLoading(false);
  }, [page, search, dateFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    const sale = deleteTarget;
    setUndoStack(prev => [{ type: 'delete', sale }, ...prev.slice(0, 9)]);
    await deleteSale(sale.id);
    setDeleteTarget(null);
    showToast(`Deleted ${sale.item_name} × ${sale.quantity}`);
    load();
  };

  const handleUndo = async () => {
    const action = undoStack[0];
    if (!action) return;
    setUndoStack(prev => prev.slice(1));
    // Re-create (simplified undo)
    await createSale({ item_name: action.sale.item_name, quantity: action.sale.quantity });
    showToast('Undo successful — sale re-created');
    load();
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search items..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          {/* Date filter */}
          <input
            type="date"
            className="input w-auto"
            value={dateFilter}
            onChange={e => { setDateFilter(e.target.value); setPage(0); }}
          />
          {/* Actions */}
          <button onClick={() => setEditTarget({ new: true })} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Sale
          </button>
          <button onClick={() => setShowAudit(true)} className="btn-secondary">
            <History className="w-4 h-4" /> Audit Log
          </button>
          {undoStack.length > 0 && (
            <button onClick={handleUndo} className="btn-outline">
              <RotateCcw className="w-4 h-4" /> Undo
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Item</th>
              <th>Quantity</th>
              <th>Timestamp</th>
              <th>Cell</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-400">Loading...</td>
              </tr>
            ) : sales.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-400">No sales found</td>
              </tr>
            ) : (
              sales.map(sale => (
                <tr key={sale.id} className="group">
                  <td className="text-slate-400 font-mono text-xs">#{sale.id}</td>
                  <td>
                    <span className="font-semibold text-navy-500 capitalize">{sale.item_name}</span>
                  </td>
                  <td>
                    <span className="badge badge-teal">{sale.quantity}</span>
                  </td>
                  <td className="text-xs text-slate-500">
                    {sale.timestamp ? format(parseISO(sale.timestamp), 'MMM d, yyyy HH:mm:ss') : '—'}
                  </td>
                  <td className="text-xs text-slate-500">
                    {sale.cell_row != null ? `R${sale.cell_row + 1}C${sale.cell_col + 1}` : '—'}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditTarget(sale)} className="btn-icon btn-secondary">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(sale)} className="btn-icon hover:bg-danger-light hover:text-danger-DEFAULT transition-colors rounded-xl p-2">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Page {page + 1}</p>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-secondary btn-sm">
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <button onClick={() => setPage(p => p + 1)} disabled={sales.length < PAGE_SIZE} className="btn-secondary btn-sm">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 animate-slide-up px-4 py-3 rounded-xl shadow-card-hover text-sm font-medium ${toast.ok ? 'bg-success-light text-green-800 border border-success-DEFAULT/30' : 'bg-danger-light text-red-800 border border-danger-DEFAULT/30'}`}>
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {editTarget && (
        <EditModal
          sale={editTarget.new ? {} : editTarget}
          onSave={() => { setEditTarget(null); load(); showToast(editTarget.new ? 'Sale added!' : 'Sale updated!'); }}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          sale={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {showAudit && <AuditDrawer onClose={() => setShowAudit(false)} />}
    </div>
  );
}
