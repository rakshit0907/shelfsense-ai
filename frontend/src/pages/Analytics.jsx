// src/pages/Analytics.jsx — Charts and summary stats
import { useState, useEffect } from 'react';
import { TrendingUp, BarChart2, PieChart, Calendar } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart as RPie, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { fetchSalesSummary, fetchDailyReport } from '../lib/api';

const COLORS = ['#14b8a6', '#1e3a5f', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#22c55e'];

export default function Analytics() {
  const [summary, setSummary] = useState([]);
  const [report, setReport] = useState(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSalesSummary(days), fetchDailyReport()])
      .then(([s, r]) => { setSummary(s.summary || []); setReport(r); })
      .finally(() => setLoading(false));
  }, [days]);

  // Daily trend data
  const byDate = {};
  summary.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = { date: s.date, total: 0 };
    byDate[s.date][s.item_name] = (byDate[s.date][s.item_name] || 0) + s.quantity;
    byDate[s.date].total += s.quantity;
  });
  const trendData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

  // Per-item totals (for pie)
  const itemTotals = {};
  summary.forEach(s => { itemTotals[s.item_name] = (itemTotals[s.item_name] || 0) + s.quantity; });
  const pieData = Object.entries(itemTotals).map(([name, value]) => ({ name, value }));

  // Top items (for bar)
  const barData = Object.entries(itemTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const total = Object.values(itemTotals).reduce((a, b) => a + b, 0);
  const topItem = barData[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <p>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="card p-4 flex items-center gap-4">
        <Calendar className="w-5 h-5 text-primary-500" />
        <span className="text-sm font-medium text-navy-500">Time Range:</span>
        {[7, 14, 30].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={days === d ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          >
            {d}d
          </button>
        ))}
        <div className="ml-auto flex items-center gap-4 text-sm">
          <div className="text-center">
            <p className="font-bold text-navy-500 text-2xl font-display">{total}</p>
            <p className="text-slate-500 text-xs">Total Units</p>
          </div>
          {topItem && (
            <div className="text-center">
              <p className="font-bold text-primary-600 text-lg font-display capitalize">{topItem[0]}</p>
              <p className="text-slate-500 text-xs">Top Seller ({topItem[1]} units)</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales trend */}
        <div className="chart-container">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary-500" />
            Sales Trend
          </h3>
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ border: 'none', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="total" stroke="#14b8a6" strokeWidth={2} fill="url(#colorTotal)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Per-item bar */}
        <div className="chart-container">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-navy-500" />
            Top Products
          </h3>
          {barData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ border: 'none', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie chart */}
        <div className="chart-container">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-primary-500" />
            Sales Distribution
          </h3>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <RPie>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ border: 'none', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }} />
              </RPie>
            </ResponsiveContainer>
          )}
        </div>

        {/* Today's summary */}
        <div className="chart-container">
          <h3 className="section-title mb-4">Today's Summary</h3>
          {(report?.sales || []).length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No sales today</div>
          ) : (
            <div className="space-y-2">
              {(report.sales || []).map((s, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-50 hover:bg-surface-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-sm font-medium capitalize text-navy-500">{s.item_name}</span>
                  </div>
                  <span className="badge badge-teal">{s.quantity} units</span>
                </div>
              ))}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-primary-50 border border-primary-200 mt-3">
                <span className="text-sm font-bold text-navy-500">Total</span>
                <span className="badge badge-navy">{report.total_units} units</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
