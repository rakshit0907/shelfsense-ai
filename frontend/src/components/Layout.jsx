// src/components/Layout.jsx — App shell: Sidebar + Topbar
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, BarChart3, Settings,
  Scan, Bell, ChevronRight, Menu, X, Wifi, WifiOff,
  ShoppingCart, Package, TrendingUp
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { fetchStatus } from '../lib/api';

const NAV_ITEMS = [
  { path: '/',           label: 'Dashboard',  icon: LayoutDashboard, desc: 'Live shelf view'    },
  { path: '/sales-log',  label: 'Sales Log',  icon: ClipboardList,   desc: 'Transaction history' },
  { path: '/analytics',  label: 'Analytics',  icon: BarChart3,       desc: 'Reports & trends'   },
  { path: '/settings',   label: 'Settings',   icon: Settings,        desc: 'Configuration'      },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-navy-500 flex items-center justify-center shadow-glow-teal flex-shrink-0">
        <Scan className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <div className="font-display font-bold text-navy-500 leading-none text-base">ShelfSense</div>
        <div className="text-[10px] text-slate-400 font-medium mt-0.5 leading-none">Enterprise Retail Intelligence</div>
      </div>
    </div>
  );
}

function SystemStatus({ status }) {
  const isOk = status?.status === 'ok';
  return (
    <div className="px-4 py-3 border-t border-surface-200">
      <div className="rounded-xl bg-surface-50 border border-surface-200 p-3 space-y-2">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">System Status</span>
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${isOk ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className={`text-[10px] font-medium ${isOk ? 'text-emerald-600' : 'text-slate-400'}`}>
              {isOk ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {status ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Mode</span>
              <span className={`text-[10px] font-semibold capitalize px-1.5 py-0.5 rounded-full ${status.mode === 'demo' ? 'bg-primary-50 text-primary-700' : 'bg-navy-100 text-navy-600'}`}>
                {status.mode === 'demo' ? 'Simulation' : 'Live'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Grid</span>
              <span className="text-[10px] font-medium text-slate-600">
                {status.grid ? `${status.grid.rows}×${status.grid.cols}` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Frames</span>
              <span className="text-[10px] font-medium text-slate-600">
                {status.tracker?.frames_processed ?? '—'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-slate-400">Connecting to backend…</p>
        )}
      </div>
    </div>
  );
}

export default function Layout({ children, alertCount = 0 }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState(null);

  useEffect(() => {
    const load = async () => {
      try { setSystemStatus(await fetchStatus()); } catch {}
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const SidebarContent = () => (
    <>
      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* Section label */}
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 pb-2">Navigation</p>

        {NAV_ITEMS.map(({ path, label, icon: Icon, desc }) => {
          const active = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`sidebar-item ${active ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <div className={`p-1.5 rounded-lg ${active ? 'bg-primary-100' : 'bg-surface-100'}`}>
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-primary-600' : 'text-slate-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${active ? 'text-primary-700' : 'text-slate-700'}`}>{label}</div>
                <div className="text-[10px] text-slate-400 leading-none">{desc}</div>
              </div>
              {active && <ChevronRight className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" />}
            </Link>
          );
        })}
      </nav>

      {/* System status at the bottom */}
      <SystemStatus status={systemStatus} />
    </>
  );

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-surface-200 fixed top-0 left-0 bottom-0 z-30">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-surface-200">
          <Logo />
        </div>
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col animate-slide-right shadow-2xl">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <Logo />
              <button onClick={() => setSidebarOpen(false)} className="btn-icon btn-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-white border-b border-surface-200 px-6 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden btn-icon btn-secondary"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-display font-bold text-navy-500 text-lg leading-none">
                {NAV_ITEMS.find(n => n.path === location.pathname)?.label || 'ShelfSense AI'}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* API connection indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-50 border border-surface-200">
              {systemStatus ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className={`text-xs font-medium ${systemStatus ? 'text-emerald-600' : 'text-slate-400'}`}>
                {systemStatus ? 'API Connected' : 'Connecting…'}
              </span>
            </div>

            {alertCount > 0 && (
              <Link to="/" className="relative btn-icon btn-secondary">
                <Bell className="w-4 h-4 text-slate-600" />
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                  {alertCount}
                </span>
              </Link>
            )}

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-surface-200">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-navy-500 flex items-center justify-center">
                <Scan className="w-4 h-4 text-white" />
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-semibold text-navy-500 leading-none">ShelfSense AI</p>
                <p className="text-[10px] text-slate-400 mt-0.5">v1.0.0</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
