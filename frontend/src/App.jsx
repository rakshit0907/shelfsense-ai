// src/App.jsx — Router + Layout wrapper
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SalesLog from './pages/SalesLog';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';

export default function App() {
  const [alertCount, setAlertCount] = useState(0);

  return (
    <BrowserRouter>
      <Layout alertCount={alertCount}>
        <Routes>
          <Route path="/"           element={<Dashboard onAlertCount={setAlertCount} />} />
          <Route path="/sales-log"  element={<SalesLog />} />
          <Route path="/analytics"  element={<Analytics />} />
          <Route path="/settings"   element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
