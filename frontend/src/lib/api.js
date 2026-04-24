// src/lib/api.js — Axios API client
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE  = import.meta.env.VITE_WS_URL  || 'ws://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

export const WS_URL = WS_BASE;

// ── API helpers ──────────────────────────────────────────────────────────────

export const fetchStatus    = () => api.get('/api/status').then(r => r.data);
export const fetchGrid      = () => api.get('/api/grid').then(r => r.data);
export const fetchAlerts    = () => api.get('/api/alerts').then(r => r.data);
export const fetchInsights  = () => api.get('/api/insights').then(r => r.data);
export const fetchDailyReport = (date) =>
  api.get('/api/daily-report', { params: date ? { target_date: date } : {} }).then(r => r.data);
export const fetchSalesSummary = (days = 7) =>
  api.get('/api/sales/summary', { params: { days } }).then(r => r.data);

export const fetchSales = (params = {}) =>
  api.get('/api/sales', { params }).then(r => r.data);
export const createSale   = (data)      => api.post('/api/sales', data).then(r => r.data);
export const updateSale   = (id, data)  => api.put(`/api/sales/${id}`, data).then(r => r.data);
export const deleteSale   = (id)        => api.delete(`/api/sales/${id}`).then(r => r.data);
export const fetchAuditLog = (saleId)   =>
  api.get('/api/sales/audit', { params: saleId ? { sale_id: saleId } : {} }).then(r => r.data);

export const startCamera  = ()          => api.post('/api/camera/start').then(r => r.data);
export const stopCamera   = ()          => api.post('/api/camera/stop').then(r => r.data);
export const updateConfig = (data)      => api.post('/api/config', data).then(r => r.data);
export const sendWhatsApp = (force = false) =>
  api.post('/api/whatsapp/send', null, { params: { force } }).then(r => r.data);
export const fetchWhatsAppLog = () => api.get('/api/whatsapp/log').then(r => r.data);
