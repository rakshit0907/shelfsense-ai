// src/pages/Dashboard.jsx — Main monitoring dashboard
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play, Square, Zap, Send, RefreshCw, TrendingUp,
  Package, ShoppingCart, Activity, Brain
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import { format, parseISO } from 'date-fns';

import ShelfGrid from '../components/ShelfGrid';
import LiveFeed from '../components/LiveFeed';
import AlertsPanel from '../components/AlertsPanel';
import { useWebSocket, WS_STATUS } from '../hooks/useWebSocket';
import {
  fetchStatus, fetchDailyReport, fetchSalesSummary,
  startCamera, stopCamera, updateConfig, sendWhatsApp
} from '../lib/api';

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, delta, icon: Icon, color = 'text-primary-500' }) {
  return (
    <div className="kpi-card animate-fade-in">
      <div className="flex items-center justify-between">
        <span className="kpi-label">{label}</span>
        <div className={`p-2 rounded-xl bg-surface-100`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <div className="kpi-value">{value ?? '—'}</div>
      {delta !== undefined && (
        <div className={delta >= 0 ? 'kpi-delta-up' : 'kpi-delta-down'}>
          {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)} today
        </div>
      )}
    </div>
  );
}

// ── Sale Ticker ───────────────────────────────────────────────────────────────
function SaleTicker({ events = [] }) {
  const EMOJI = { bottle: '🍶', chips: '🍟', juice: '🧃', water: '💧', cola: '🥤', snack: '🍫', _: '📦' };
  return (
    <div className="card p-4">
      <div className="section-header">
        <h3 className="section-title flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary-500" />
          Live Sales Feed
        </h3>
        {events.length > 0 && <span className="badge badge-teal">{events.length} events</span>}
      </div>
      <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
        {events.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Watching for sales...</p>
          </div>
        ) : (
          events.map((ev, i) => (
            <div key={i} className="sale-ticker">
              <span className="text-2xl">{EMOJI[ev.item_name] || EMOJI._}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-navy-500 capitalize">{ev.item_name}</p>
                <p className="text-xs text-slate-500">
                  {ev.quantity} unit{ev.quantity > 1 ? 's' : ''} sold •{' '}
                  {ev.timestamp ? format(parseISO(ev.timestamp), 'HH:mm:ss') : 'just now'}
                </p>
              </div>
              <span className="badge badge-success">+{ev.quantity}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Insights Panel ────────────────────────────────────────────────────────────
function InsightsPanel({ insights }) {
  return (
    <div className="card p-4">
      <div className="section-header">
        <h3 className="section-title flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary-500" />
          AI Insights
        </h3>
        <span className="badge badge-teal">Business Intelligence</span>
      </div>
      <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-surface-50 rounded-xl p-3 border border-surface-200">
        {insights || 'Generating insights...'}
      </div>
    </div>
  );
}

// ── Sales Chart ───────────────────────────────────────────────────────────────
function SalesChart({ summary }) {
  // Transform data: group by date
  const byDate = {};
  (summary || []).forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = { date: s.date };
    byDate[s.date][s.item_name] = (byDate[s.date][s.item_name] || 0) + s.quantity;
  });
  const data = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

  // Get unique items
  const items = [...new Set((summary || []).map(s => s.item_name))];
  const COLORS = ['#14b8a6', '#1e3a5f', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

  if (data.length === 0) {
    return (
      <div className="chart-container">
        <h3 className="section-title mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary-500" />
          Sales Trend (7 days)
        </h3>
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
          No sales data yet
        </div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary-500" />
        Sales Trend (7 days)
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip
            contentStyle={{ border: 'none', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
          />
          <Legend />
          {items.map((item, i) => (
            <Bar key={item} dataKey={item} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === items.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Controls Panel ────────────────────────────────────────────────────────────
function ControlsPanel({ cameraActive, isDemoMode, wsStatus, onCameraToggle, onModeToggle, onSendReport, onRefresh }) {
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await sendWhatsApp();
      setSendResult({ ok: true, msg: res.message });
    } catch (err) {
      setSendResult({ ok: false, msg: err.response?.data?.detail || 'Send failed' });
    } finally {
      setSending(false);
      setTimeout(() => setSendResult(null), 5000);
    }
  };

  const wsColor = wsStatus === WS_STATUS.CONNECTED ? 'status-dot-green' : wsStatus === WS_STATUS.CONNECTING ? 'status-dot-amber' : 'status-dot-gray';

  return (
    <div className="card p-4">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-primary-500" />
        Controls
      </h3>
      <div className="space-y-3">
        {/* Camera toggle */}
        <button
          onClick={onCameraToggle}
          className={cameraActive ? 'btn-danger w-full' : 'btn-primary w-full'}
        >
          {cameraActive ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {cameraActive ? 'Stop Monitoring' : 'Start Monitoring'}
        </button>

        {/* Demo/Production toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-50 border border-surface-200">
          <div>
            <p className="text-sm font-semibold text-navy-500">
              {isDemoMode ? 'Simulation Active' : 'Live Monitoring'}
            </p>
            <p className="text-xs text-slate-500">{isDemoMode ? 'Fast, predictive testing' : 'High-stability CCTV feed'}</p>
          </div>
          <button
            onClick={onModeToggle}
            className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-400 ${isDemoMode ? 'bg-primary-500' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${isDemoMode ? 'translate-x-6' : ''}`} />
          </button>
        </div>

        {/* WebSocket status */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-50 text-xs text-slate-500">
          <span className={`status-dot ${wsColor}`} />
          WebSocket: <span className="font-medium capitalize">{wsStatus}</span>
        </div>

        {/* Refresh */}
        <button onClick={onRefresh} className="btn-secondary w-full">
          <RefreshCw className="w-4 h-4" />
          Refresh Data
        </button>

        {/* WhatsApp report */}
        <button onClick={handleSend} disabled={sending} className="btn-navy w-full">
          <Send className="w-4 h-4" />
          {sending ? 'Sending...' : 'Send WhatsApp Report'}
        </button>

        {sendResult && (
          <div className={`p-2 rounded-lg text-xs text-center ${sendResult.ok ? 'bg-success-light text-green-700' : 'bg-danger-light text-red-700'}`}>
            {sendResult.msg}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [grid, setGrid] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [saleEvents, setSaleEvents] = useState([]);
  const [highlightedCells, setHighlightedCells] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [systemStatus, setSystemStatus] = useState('initializing');
  const [insights, setInsights] = useState('');
  const [dailyReport, setDailyReport] = useState(null);
  const [salesSummary, setSalesSummary] = useState([]);
  const [stats, setStats] = useState({});
  const highlightTimeout = useRef(null);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      const [report, summary] = await Promise.all([
        fetchDailyReport(),
        fetchSalesSummary(7),
      ]);
      setDailyReport(report);
      setSalesSummary(summary.summary || []);
      setInsights(report.insights || '');
    } catch (err) {
      console.warn('Load error:', err);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // WebSocket message handler
  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'connected':
        setGrid(msg.grid || []);
        setSystemStatus(msg.status || 'normal');
        break;
      case 'grid_update':
      case 'snapshot':
        setGrid(msg.grid || []);
        setAlerts(msg.alerts || []);
        setSystemStatus(msg.status || 'normal');
        if (msg.stats) setStats(msg.stats);
        break;
      case 'sale_detected':
        setSaleEvents(prev => [msg, ...prev].slice(0, 50));
        // Highlight sold cells
        if (msg.cells?.length) {
          setHighlightedCells(msg.cells);
          clearTimeout(highlightTimeout.current);
          highlightTimeout.current = setTimeout(() => setHighlightedCells([]), 3000);
        }
        // Refresh report
        loadData();
        break;
      case 'status':
        setSystemStatus(msg.status);
        break;
    }
  }, [loadData]);

  const { status: wsStatus } = useWebSocket('/ws/live', handleWsMessage);

  const handleCameraToggle = async () => {
    try {
      if (cameraActive) {
        await stopCamera();
        setCameraActive(false);
      } else {
        await startCamera();
        setCameraActive(true);
      }
    } catch (err) {
      console.warn('Camera toggle error:', err);
      setCameraActive(v => !v);
    }
  };

  const handleModeToggle = async () => {
    const newMode = isDemoMode ? 'production' : 'demo';
    setIsDemoMode(!isDemoMode);
    try {
      await updateConfig({ mode: newMode });
    } catch {}
  };

  // Compute KPI values
  const totalSold = dailyReport?.total_units || 0;
  const filledCells = grid.flat().filter(c => c !== 'empty').length;
  const totalCells = (grid.length || 0) * (grid[0]?.length || 0);
  const fillRate = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Units Sold Today"  value={totalSold}    icon={ShoppingCart} color="text-primary-500" delta={totalSold} />
        <KpiCard label="Shelf Fill Rate"   value={`${fillRate}%`} icon={Package}    color="text-navy-500" />
        <KpiCard label="Active Alerts"     value={alerts.length}  icon={Activity}   color={alerts.length > 0 ? 'text-danger-DEFAULT' : 'text-success-DEFAULT'} />
        <KpiCard label="Frames Processed"  value={stats.frames_processed || 0} icon={TrendingUp} color="text-primary-500" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left col: Camera + Shelf */}
        <div className="xl:col-span-2 space-y-4">
          <LiveFeed cameraActive={cameraActive} status={systemStatus} isDemoMode={isDemoMode} />

          <div className="card p-4">
            <div className="section-header">
              <h3 className="section-title flex items-center gap-2">
                <Package className="w-5 h-5 text-primary-500" />
                Shelf Grid
                <span className="badge badge-gray">{grid.length}×{grid[0]?.length || 0}</span>
              </h3>
              <div className="flex items-center gap-1.5 text-xs">
                <span className={`status-dot ${systemStatus === 'normal' ? 'status-dot-green' : systemStatus === 'occluded' ? 'status-dot-amber' : 'status-dot-gray'}`} />
                <span className="capitalize text-slate-500">{systemStatus}</span>
              </div>
            </div>
            <ShelfGrid grid={grid} highlightedCells={highlightedCells} />
          </div>

          <SalesChart summary={salesSummary} />
        </div>

        {/* Right col: Controls + Ticker + Insights + Alerts */}
        <div className="space-y-4">
          <ControlsPanel
            cameraActive={cameraActive}
            isDemoMode={isDemoMode}
            wsStatus={wsStatus}
            onCameraToggle={handleCameraToggle}
            onModeToggle={handleModeToggle}
            onRefresh={loadData}
          />
          <SaleTicker events={saleEvents} />
          <InsightsPanel insights={insights} />
          <AlertsPanel alerts={alerts} />
        </div>
      </div>
    </div>
  );
}
