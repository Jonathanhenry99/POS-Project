import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import AppLayout from './components/Layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import MenuManagement from './pages/MenuManagement';
import RecipeManagement from './pages/RecipeManagement';
import Inventory from './pages/Inventory';
import StockOpname from './pages/StockOpname';
import Reports from './pages/Reports';
import SalesHistory from './pages/SalesHistory';
import ShiftManagement from './pages/ShiftManagement';
import PrinterSettings from './pages/PrinterSettings';

function App() {
  return (
    <AppProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/pos" element={<POS />} />
            <Route path="/menu" element={<MenuManagement />} />
            <Route path="/recipes" element={<RecipeManagement />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/stock-opname" element={<StockOpname />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/sales-history" element={<SalesHistory />} />
            <Route path="/manage-shift" element={<ShiftManagement />} />
            <Route path="/printer-settings" element={<PrinterSettings />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AppProvider>
  );
}

export default App;
