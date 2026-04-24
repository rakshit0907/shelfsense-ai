// src/components/AlertsPanel.jsx
import { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle, X, Bell } from 'lucide-react';

function AlertIcon({ type }) {
  const props = 'w-5 h-5 flex-shrink-0 mt-0.5';
  if (type === 'critical') return <AlertCircle className={`${props} text-danger-DEFAULT`} />;
  if (type === 'warning')  return <AlertTriangle className={`${props} text-warning-DEFAULT`} />;
  if (type === 'info')     return <Info className={`${props} text-info-DEFAULT`} />;
  return <CheckCircle className={`${props} text-success-DEFAULT`} />;
}

function AlertItem({ alert, onDismiss }) {
  const classMap = {
    critical: 'alert-critical',
    warning:  'alert-warning',
    info:     'alert-info',
    success:  'alert-success',
  };
  return (
    <div className={classMap[alert.type] || 'alert-info'}>
      <AlertIcon type={alert.type} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{alert.title}</p>
        <p className="text-xs opacity-80 mt-0.5">{alert.message}</p>
        {alert.timestamp && (
          <p className="text-xs opacity-60 mt-1">
            {new Date(alert.timestamp).toLocaleTimeString()}
          </p>
        )}
      </div>
      <button onClick={() => onDismiss(alert.id)} className="opacity-50 hover:opacity-100 transition-opacity">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function AlertsPanel({ alerts = [], className = '' }) {
  const [dismissed, setDismissed] = useState(new Set());

  const visible = alerts.filter(a => !dismissed.has(a.id));

  const dismissAll = () => {
    setDismissed(new Set(alerts.map(a => a.id)));
  };

  return (
    <div className={`card p-4 ${className}`}>
      <div className="section-header">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-warning-DEFAULT" />
          <h3 className="section-title">Alerts</h3>
          {visible.length > 0 && (
            <span className="badge badge-danger">{visible.length}</span>
          )}
        </div>
        {visible.length > 0 && (
          <button onClick={dismissAll} className="btn-secondary btn-sm text-xs">
            Dismiss all
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
        {visible.length === 0 ? (
          <div className="text-center py-6 text-slate-400">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">All clear — no alerts</p>
          </div>
        ) : (
          visible.map(alert => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onDismiss={(id) => setDismissed(prev => new Set([...prev, id]))}
            />
          ))
        )}
      </div>
    </div>
  );
}
