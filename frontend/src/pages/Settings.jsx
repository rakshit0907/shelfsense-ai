// src/pages/Settings.jsx — Configuration page
import { useState, useEffect } from 'react';
import { Settings2, Grid3X3, Send, MessageSquare, Save, RefreshCw } from 'lucide-react';
import { updateConfig, sendWhatsApp, fetchStatus, fetchWhatsAppLog } from '../lib/api';
import { format, parseISO } from 'date-fns';

export default function Settings() {
  const [status, setStatus] = useState(null);
  const [waLog, setWaLog] = useState([]);
  const [form, setForm] = useState({
    mode: 'demo',
    grid_rows: 4,
    grid_cols: 5,
    shelf_x1: 0.05,
    shelf_y1: 0.10,
    shelf_x2: 0.95,
    shelf_y2: 0.90,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [sendingReport, setSendingReport] = useState(false);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    Promise.all([fetchStatus(), fetchWhatsAppLog()]).then(([s, log]) => {
      setStatus(s);
      setWaLog(log.log || []);
      setForm(f => ({
        ...f,
        mode: s.mode || 'demo',
        grid_rows: s.grid?.rows || 4,
        grid_cols: s.grid?.cols || 5,
        ...s.shelf_region,
      }));
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateConfig(form);
      showToast('Configuration saved!');
    } catch (err) {
      showToast('Save failed: ' + (err.response?.data?.detail || err.message), false);
    }
    setSaving(false);
  };

  const handleSendReport = async (force = false) => {
    setSendingReport(true);
    try {
      const res = await sendWhatsApp(force);
      showToast(res.message);
      const log = await fetchWhatsAppLog();
      setWaLog(log.log || []);
    } catch (err) {
      showToast(err.response?.data?.detail || 'Send failed', false);
    }
    setSendingReport(false);
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* System Mode */}
      <div className="card p-6">
        <h2 className="text-base font-display font-bold text-navy-500 mb-4 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary-500" /> System Mode
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {['demo', 'production'].map(mode => (
            <div
              key={mode}
              onClick={() => setForm(f => ({ ...f, mode }))}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-150 ${form.mode === mode ? 'border-primary-500 bg-primary-50' : 'border-surface-200 hover:border-surface-300'}`}
            >
              <p className="font-semibold text-navy-500 capitalize">{mode}</p>
              <p className="text-xs text-slate-500 mt-1">
                {mode === 'demo' ? 'Fast snapshots, simulated feed, lower latency' : 'Stable snapshots, real camera, noise-resistant'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Grid Config */}
      <div className="card p-6">
        <h2 className="text-base font-display font-bold text-navy-500 mb-4 flex items-center gap-2">
          <Grid3X3 className="w-5 h-5 text-primary-500" /> Grid Configuration
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Rows</label>
            <input
              type="number" min={1} max={10} className="input"
              value={form.grid_rows}
              onChange={e => setForm(f => ({ ...f, grid_rows: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="label">Columns</label>
            <input
              type="number" min={1} max={12} className="input"
              value={form.grid_cols}
              onChange={e => setForm(f => ({ ...f, grid_cols: Number(e.target.value) }))}
            />
          </div>
        </div>

        <h3 className="text-sm font-semibold text-navy-500 mt-5 mb-3">Shelf Region (0.0 – 1.0 normalised)</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'shelf_x1', label: 'Left (X1)' },
            { key: 'shelf_y1', label: 'Top (Y1)' },
            { key: 'shelf_x2', label: 'Right (X2)' },
            { key: 'shelf_y2', label: 'Bottom (Y2)' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                type="number" min={0} max={1} step={0.01} className="input"
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary mt-5 w-full">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {/* WhatsApp */}
      <div className="card p-6">
        <h2 className="text-base font-display font-bold text-navy-500 mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary-500" /> WhatsApp Reports
        </h2>
        <div className="p-3 rounded-xl bg-surface-50 border border-surface-200 text-xs text-slate-600 mb-4">
          <p className="font-semibold mb-1">To enable real WhatsApp:</p>
          <p>Add <code className="bg-surface-200 px-1 rounded">TWILIO_ACCOUNT_SID</code>, <code className="bg-surface-200 px-1 rounded">TWILIO_AUTH_TOKEN</code>, and <code className="bg-surface-200 px-1 rounded">TWILIO_TO</code> to your <code className="bg-surface-200 px-1 rounded">.env</code> file.</p>
          <p className="mt-1 text-slate-500">Without credentials, reports are logged to the console (mock mode).</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleSendReport(false)} disabled={sendingReport} className="btn-navy flex-1">
            <Send className="w-4 h-4" />
            {sendingReport ? 'Sending...' : 'Send Today\'s Report'}
          </button>
          <button onClick={() => handleSendReport(true)} disabled={sendingReport} className="btn-secondary">
            <RefreshCw className="w-4 h-4" /> Force Resend
          </button>
        </div>

        {/* Send log */}
        {waLog.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500 mb-2">Send History</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
              {waLog.map(entry => (
                <div key={entry.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-surface-50">
                  <span className="text-slate-700">{entry.date}</span>
                  <span className={`badge ${entry.sent ? 'badge-success' : 'badge-gray'}`}>
                    {entry.sent ? `Sent via ${entry.channel}` : 'Not sent'}
                  </span>
                  <span className="text-slate-400">{entry.sent_at ? format(parseISO(entry.sent_at), 'HH:mm') : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* System info */}
      {status && (
        <div className="card p-6">
          <h2 className="text-base font-display font-bold text-navy-500 mb-3">System Info</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Version', status.version],
              ['Mode', status.mode],
              ['Frames Processed', status.tracker?.frames_processed],
              ['Frames Skipped', status.tracker?.frames_skipped],
              ['Total Sales', status.tracker?.total_sales],
              ['Buffer', `${status.tracker?.buffer_size}/${status.tracker?.buffer_capacity}`],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between p-2.5 rounded-xl bg-surface-50">
                <span className="text-slate-500">{label}</span>
                <span className="font-medium text-navy-500">{val ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 animate-slide-up px-4 py-3 rounded-xl shadow-card-hover text-sm font-medium ${toast.ok ? 'bg-success-light text-green-800 border border-success-DEFAULT/30' : 'bg-danger-light text-red-800 border border-danger-DEFAULT/30'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
