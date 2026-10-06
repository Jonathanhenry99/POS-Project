import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  Calendar,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Clock,
  Download,
  Filter,
  RefreshCw,
  FileSpreadsheet,
  Tag,
  CreditCard,
  Search
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

function Reports() {
  const { transactions, products, formatCurrency } = useAppContext();

  // 1. Date defaults (Last 7 days to today)
  const defaultStartDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  }, []);

  const defaultEndDate = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  // 2. Filter States
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [selectedProduct, setSelectedProduct] = useState('All');
  const [paymentMethod, setPaymentMethod] = useState('All');
  const [startHour, setStartHour] = useState('00');
  const [endHour, setEndHour] = useState('23');
  const [searchQuery, setSearchQuery] = useState('');

  // Reset Filters
  const handleResetFilters = () => {
    setStartDate(defaultStartDate);
    setEndDate(defaultEndDate);
    setSelectedProduct('All');
    setPaymentMethod('All');
    setStartHour('00');
    setEndHour('23');
    setSearchQuery('');
  };

  // 3. Filter Logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const txnDate = new Date(t.timestamp);
      const txnDateStr = t.timestamp.split('T')[0];
      const txnHour = txnDate.getHours();

      // Date Range filter
      const matchesStartDate = !startDate || txnDateStr >= startDate;
      const matchesEndDate = !endDate || txnDateStr <= endDate;

      // Payment method filter
      const matchesPayment = paymentMethod === 'All' || t.paymentMethod === paymentMethod;

      // Hour range filter
      const currentStartHour = parseInt(startHour);
      const currentEndHour = parseInt(endHour);
      const matchesHour = txnHour >= currentStartHour && txnHour <= currentEndHour;

      // Product filter
      const matchesProduct = selectedProduct === 'All' || t.items.some(item => item.productId === selectedProduct);

      // Text search filter (Transaction ID or Customer Name)
      const matchesSearch = !searchQuery || 
        t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.customerName && t.customerName.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesStartDate && matchesEndDate && matchesPayment && matchesHour && matchesProduct && matchesSearch;
    });
  }, [transactions, startDate, endDate, paymentMethod, startHour, endHour, selectedProduct, searchQuery]);

  // 4. Detailed calculation of filtered items
  const reportStats = useMemo(() => {
    let totalRevenue = 0;
    let totalItemsCount = 0;
    const itemsSoldMap = {};
    const paymentMap = {
      cash: 0,
      card: 0,
      'e-wallet': 0
    };

    filteredTransactions.forEach(t => {
      // Calculate revenue
      totalRevenue += t.total;

      // Process items in transaction
      t.items.forEach(it => {
        // If filter is specific to a product, we only count that product
        if (selectedProduct === 'All' || it.productId === selectedProduct) {
          totalItemsCount += it.quantity;
          itemsSoldMap[it.productName] = (itemsSoldMap[it.productName] || 0) + it.quantity;
        }
      });

      // Process payment method revenue
      if (t.paymentMethod && paymentMap[t.paymentMethod] !== undefined) {
        paymentMap[t.paymentMethod] += t.total;
      }
    });

    const averageBill = filteredTransactions.length > 0 ? totalRevenue / filteredTransactions.length : 0;

    // Convert payment map to PieChart format
    const paymentChartData = Object.entries(paymentMap).map(([key, val]) => ({
      name: key === 'cash' ? 'Tunai' : key === 'card' ? 'Debit/Kredit' : 'QRIS',
      value: val,
      key
    })).filter(item => item.value > 0);

    // Convert items sold map to Top 5 BarChart format
    const topMenusChartData = Object.entries(itemsSoldMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      totalRevenue,
      transactionsCount: filteredTransactions.length,
      totalItemsCount,
      averageBill,
      paymentChartData,
      topMenusChartData
    };
  }, [filteredTransactions, selectedProduct]);

  // 5. Exporter: Download CSV
  const handleDownloadCSV = () => {
    if (filteredTransactions.length === 0) return;

    const headers = [
      'Tanggal & Waktu',
      'ID Transaksi',
      'Nama Pelanggan',
      'Meja',
      'Tipe Pesanan',
      'Nama Menu',
      'Kuantitas',
      'Harga Satuan',
      'Subtotal Menu',
      'Metode Pembayaran',
      'Pajak Transaksi (10%)',
      'Total Transaksi'
    ];

    const csvRows = [headers.join(',')];

    filteredTransactions.forEach(t => {
      t.items.forEach(it => {
        // Apply dynamic quote escaping
        const row = [
          `"${new Date(t.timestamp).toLocaleString('id-ID').replace(/"/g, '""')}"`,
          `"${t.id.replace(/"/g, '""')}"`,
          `"${(t.customerName || 'Pelanggan Umum').replace(/"/g, '""')}"`,
          `"${(t.tableNumber || '-').replace(/"/g, '""')}"`,
          `"${(t.orderType || '-').replace(/"/g, '""')}"`,
          `"${it.productName.replace(/"/g, '""')}"`,
          it.quantity,
          it.price,
          it.subtotal || (it.price * it.quantity),
          `"${t.paymentMethod?.toUpperCase()}"`,
          t.total * 0.1,
          t.total
        ];
        csvRows.push(row.join(','));
      });
    });

    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `laporan_penjualan_mourden_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Pie chart coloring
  const COLORS = ['#22c55e', '#3b82f6', '#8b5cf6'];

  return (
    <div className="reports-page animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', paddingBottom: '40px' }}>
      
      {/* ===== HEADER ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
            Laporan Penjualan
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Analisis omset, menu terlaris, rincian transaksi, dan unduh laporan kasir Mourden.
          </p>
        </div>
        <button
          onClick={handleDownloadCSV}
          disabled={filteredTransactions.length === 0}
          className="btn btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            borderRadius: '12px',
            fontSize: '0.88rem',
            fontWeight: 700,
            background: filteredTransactions.length > 0 ? 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)' : '#475569',
            border: 'none',
            color: 'white',
            cursor: filteredTransactions.length > 0 ? 'pointer' : 'not-allowed',
            boxShadow: filteredTransactions.length > 0 ? '0 4px 15px rgba(37,99,235,0.3)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          <Download size={16} /> Unduh Laporan (CSV)
        </button>
      </div>

      {/* ===== FILTER CONSOLE (GLASS CARD) ===== */}
      <div className="glass-card" style={{ padding: 'var(--space-lg) var(--space-xl)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
          <Filter size={16} style={{ color: 'var(--accent-primary)' }} />
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Konsol Filter</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          {/* Tanggal Mulai */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Tanggal Mulai
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '0.82rem', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
              />
            </div>
          </div>

          {/* Tanggal Akhir */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Tanggal Akhir
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '0.82rem', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
            />
          </div>

          {/* Menu / Produk */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              List Menu Restoran
            </label>
            <select
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '0.82rem', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
            >
              <option value="All">⭐ Semua Menu</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.image} {p.name}</option>
              ))}
            </select>
          </div>

          {/* Metode Pembayaran */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Jenis Pembayaran
            </label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '0.82rem', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
            >
              <option value="All">Semua Pembayaran</option>
              <option value="cash">💵 Tunai (Cash)</option>
              <option value="card">💳 Debit/Kredit Card</option>
              <option value="e-wallet">📱 QRIS / E-Wallet</option>
            </select>
          </div>

          {/* Jam Mulai */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Mulai Jam
            </label>
            <select
              value={startHour}
              onChange={e => setStartHour(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '0.82rem', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
            >
              {Array.from({ length: 24 }).map((_, i) => {
                const h = String(i).padStart(2, '0');
                return <option key={h} value={h}>{h}:00</option>;
              })}
            </select>
          </div>

          {/* Jam Akhir */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Hingga Jam
            </label>
            <select
              value={endHour}
              onChange={e => setEndHour(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '0.82rem', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
            >
              {Array.from({ length: 24 }).map((_, i) => {
                const h = String(i).padStart(2, '0');
                return <option key={h} value={h}>{h}:59</option>;
              })}
            </select>
          </div>

          {/* Search ID/Nama */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Cari Pelanggan / ID
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '1px 12px' }}>
              <Search size={14} style={{ color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="ID Transaksi / Nama..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '8px 0', border: 'none', background: 'transparent', fontSize: '0.82rem', color: 'var(--text-primary)', outline: 'none' }}
              />
            </div>
          </div>

          {/* Action Reset */}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={handleResetFilters}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '8px',
                border: '1px solid var(--glass-border)',
                background: 'var(--glass-bg-hover)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              <RefreshCw size={14} /> Reset Filter
            </button>
          </div>
        </div>
      </div>

      {/* ===== LIVE STATISTIC CARDS (KPI WIDGETS) ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        
        {/* KPI 1: Total Omset */}
        <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={24} style={{ color: '#22c55e' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Penerimaan / Omset</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              {formatCurrency(reportStats.totalRevenue)}
            </div>
          </div>
        </div>

        {/* KPI 2: Total Transaksi */}
        <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingCart size={24} style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Transaksi</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              {reportStats.transactionsCount} Bill
            </div>
          </div>
        </div>

        {/* KPI 3: Total Kuantitas Kopi & Menu */}
        <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={24} style={{ color: '#8b5cf6' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Item Terjual (Kuantitas)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              {reportStats.totalItemsCount} pcs
            </div>
          </div>
        </div>

        {/* KPI 4: Rata-rata Pembelian (Average Order Value) */}
        <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={24} style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Rerata Pembelian per Bill</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              {formatCurrency(reportStats.averageBill)}
            </div>
          </div>
        </div>

      </div>

      {/* ===== CHARTS SECTION (2 COLUMNS) ===== */}
      {filteredTransactions.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--space-lg)' }}>
          {/* Chart 1: Menu Terlaris (Top 5 Menu) */}
          <div className="glass-card" style={{ padding: '20px 24px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag size={16} style={{ color: 'var(--accent-primary)' }} /> Top 5 Menu Terlaris (Kuantitas)
            </h3>
            <div style={{ width: '100%', height: 260 }}>
              {reportStats.topMenusChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reportStats.topMenusChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                    <XAxis type="number" stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" width={100} tick={{ fill: 'var(--text-secondary)', fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
                      formatter={(value) => [`${value} unit`, 'Kuantitas']}
                    />
                    <Bar dataKey="qty" fill="var(--accent-primary)" radius={[0, 4, 4, 0]}>
                      {reportStats.topMenusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Tidak ada data untuk grafik ini
                </div>
              )}
            </div>
          </div>

          {/* Chart 2: Metode Pembayaran (Revenue share) */}
          <div className="glass-card" style={{ padding: '20px 24px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CreditCard size={16} style={{ color: 'var(--accent-primary)' }} /> Penerimaan per Metode Pembayaran
            </h3>
            <div style={{ width: '100%', height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {reportStats.paymentChartData.length > 0 ? (
                <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportStats.paymentChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {reportStats.paymentChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
                        formatter={(value) => [formatCurrency(value), 'Penerimaan']}
                      />
                      <Legend verticalAlign="bottom" height={36} formatter={(value, entry, index) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600 }}>{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Tidak ada data pembayaran
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ===== TRANSACTIONS DETAIL TABLE ===== */}
      <div className="glass-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={16} style={{ color: 'var(--accent-primary)' }} /> Rincian Transaksi Terfilter ({filteredTransactions.length} Bill)
          </h3>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Menampilkan data berurutan dari yang terbaru
          </div>
        </div>

        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--glass-bg-active)', color: 'var(--text-primary)', borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '14px 16px', fontWeight: 700 }}>ID Transaksi</th>
                <th style={{ padding: '14px 16px', fontWeight: 700 }}>Waktu & Tanggal</th>
                <th style={{ padding: '14px 16px', fontWeight: 700 }}>Nama Pelanggan</th>
                <th style={{ padding: '14px 16px', fontWeight: 700 }}>Meja & Tipe</th>
                <th style={{ padding: '14px 16px', fontWeight: 700 }}>Detail Menu Yang Dibeli</th>
                <th style={{ padding: '14px 16px', fontWeight: 700, textAlign: 'center' }}>Pembayaran</th>
                <th style={{ padding: '14px 16px', fontWeight: 700, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions
                .slice()
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--accent-primary)' }}>{t.id}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      {new Date(t.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{t.customerName || 'Pelanggan Umum'}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', background: 'var(--glass-bg-active)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {t.orderType === 'dine-in' ? `🍽️ Meja ${t.tableNumber || '-'}` : t.orderType === 'takeaway' ? '🛍️ Take Away' : '🛵 Delivery'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', maxWidth: '300px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {t.items.map((it, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                            <span style={{ color: 'var(--text-primary)' }}>{it.productName} <span style={{ fontWeight: 700 }}>x{it.quantity}</span></span>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{formatCurrency(it.subtotal || (it.price * it.quantity))}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', textTransform: 'uppercase', fontWeight: 700, fontSize: '0.75rem', color: t.paymentMethod === 'cash' ? '#22c55e' : t.paymentMethod === 'card' ? '#3b82f6' : '#8b5cf6' }}>
                      {t.paymentMethod === 'cash' ? '💵 cash' : t.paymentMethod === 'card' ? '💳 card' : '📱 qris'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(t.total)}
                    </td>
                  </tr>
                ))}

              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Tidak ada rincian transaksi penjualan yang sesuai dengan kriteria filter saat ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

export default Reports;
