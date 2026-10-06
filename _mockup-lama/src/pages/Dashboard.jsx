import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Percent,
  AlertTriangle,
  Award,
  Clock
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

function Dashboard() {
  const { transactions, products, inventory, formatCurrency, openBills } = useAppContext();
  const [timeFilter, setTimeFilter] = React.useState('Hari');

  // 1. Stats Calculations
  const stats = useMemo(() => {
    const todayStr = new Date().toDateString();
    
    // Filter transactions for today
    const todayTxns = transactions.filter(t => new Date(t.timestamp).toDateString() === todayStr);
    
    const totalSalesToday = todayTxns.reduce((sum, t) => sum + t.total, 0);
    const txnCountToday = todayTxns.length;
    const avgTxnValueToday = txnCountToday > 0 ? totalSalesToday / txnCountToday : 0;
    
    // Pax calculation: total quantities of items sold today
    const totalPaxToday = todayTxns.reduce((sum, t) => sum + t.items.reduce((s, it) => s + it.quantity, 0), 0) || Math.round(txnCountToday * 1.5);
    const spendPerPaxToday = totalPaxToday > 0 ? totalSalesToday / totalPaxToday : 0;

    // Pending sales (open bills)
    const pendingSalesToday = openBills ? openBills.reduce((sum, b) => sum + (b.total || 0), 0) : 0;

    // Calculate Top Product
    const productSalesCount = {};
    transactions.forEach(t => {
      t.items.forEach(item => {
        productSalesCount[item.productName] = (productSalesCount[item.productName] || 0) + item.quantity;
      });
    });

    let topProduct = 'None';
    let topProductCount = 0;
    Object.entries(productSalesCount).forEach(([name, count]) => {
      if (count > topProductCount) {
        topProductCount = count;
        topProduct = name;
      }
    });

    return {
      totalSalesToday,
      txnCountToday,
      avgTxnValueToday,
      totalPaxToday,
      spendPerPaxToday,
      pendingSalesToday,
      topProduct: `${topProduct} (${topProductCount} pcs)`
    };
  }, [transactions, openBills]);

  // 2. Charts Data Calculations
  // Daily Sales last 7 days
  const dailySalesData = useMemo(() => {
    const data = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const label = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
      
      const dayTxns = transactions.filter(t => new Date(t.timestamp).toDateString() === dateStr);
      const total = dayTxns.reduce((sum, t) => sum + t.total, 0);
      
      data.push({ name: label, sales: total });
    }
    
    return data;
  }, [transactions]);

  // Hourly Sales today
  const hourlySalesData = useMemo(() => {
    const data = Array.from({ length: 12 }, (_, i) => {
      const hour = 8 + i; // 8:00 to 19:00
      return {
        hour: `${String(hour).padStart(2, '0')}:00`,
        sales: 0
      };
    });

    const todayStr = new Date().toDateString();
    const todayTxns = transactions.filter(t => new Date(t.timestamp).toDateString() === todayStr);

    todayTxns.forEach(t => {
      const date = new Date(t.timestamp);
      const hour = date.getHours();
      const index = hour - 8;
      if (index >= 0 && index < 12) {
        data[index].sales += t.total;
      }
    });

    return data;
  }, [transactions]);

  // 3. Inventory Alerts (items with currentStock <= minStock)
  const lowStockAlerts = useMemo(() => {
    return inventory.filter(item => item.currentStock <= item.minStock);
  }, [inventory]);

  // 4. Top Selling Products List
  const topProductsList = useMemo(() => {
    const productCounts = {};
    transactions.forEach(t => {
      t.items.forEach(item => {
        productCounts[item.productId] = (productCounts[item.productId] || 0) + item.quantity;
      });
    });

    return Object.entries(productCounts)
      .map(([productId, quantity]) => {
        const prod = products.find(p => p.id === productId);
        return {
          id: productId,
          name: prod ? prod.name : 'Unknown Product',
          category: prod ? prod.category : 'General',
          emoji: prod ? prod.image : '🍽️',
          quantity,
          revenue: quantity * (prod ? prod.price : 0)
        };
      })
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [transactions, products]);

  // 5. Live Feed: Last 10 Transactions
  const liveTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);
  }, [transactions]);

  return (
    <div className="dashboard-page animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      {/* Top filter banner ESB style */}
      <div className="glass-card" style={{ padding: 'var(--space-lg) var(--space-xl)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Filter Dashboard</h2>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--glass-bg-active)', padding: '3px', borderRadius: 'var(--radius-sm)' }}>
            <button
              onClick={() => setTimeFilter('Hari')}
              className={`btn btn-sm ${timeFilter === 'Hari' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '6px 16px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
            >
              Hari
            </button>
            <button
              onClick={() => setTimeFilter('Bulan')}
              className={`btn btn-sm ${timeFilter === 'Bulan' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '6px 16px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
            >
              Bulan
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '14px', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px' }}>Perusahaan</label>
            <select style={{ width: '100%', padding: '10px' }} defaultValue="Mourden Cafe">
              <option value="Mourden Cafe">Mourden Cafe & Eatery</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px' }}>Brand</label>
            <select style={{ width: '100%', padding: '10px' }} defaultValue="Mourden">
              <option value="Mourden">Mourden</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px' }}>Cabang</label>
            <select style={{ width: '100%', padding: '10px' }} defaultValue="Utama">
              <option value="Utama">Cabang Utama</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{ padding: '12px', background: 'var(--accent-secondary)' }}>
            Cari
          </button>
        </div>
      </div>

      {/* Main ESB Bento Grid Row */}
      <div className="stats-grid">
        
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Penjualan Bersih</span>
            <span style={{ color: 'var(--color-success)', background: 'var(--color-success-dim)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>+13.31%</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {formatCurrency(stats.totalSalesToday)}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Total Bill</span>
            <span style={{ color: 'var(--color-success)', background: 'var(--color-success-dim)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>+55.56%</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {stats.txnCountToday}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Ukuran Bill</span>
            <span style={{ color: 'var(--color-danger)', background: 'var(--color-danger-dim)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>-27.16%</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {formatCurrency(stats.avgTxnValueToday)}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Total Pax</span>
            <span style={{ color: 'var(--color-success)', background: 'var(--color-success-dim)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>+55.56%</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {stats.totalPaxToday}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Pembelanjaan Per Pax</span>
            <span style={{ color: 'var(--color-danger)', background: 'var(--color-danger-dim)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>-27.16%</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {formatCurrency(stats.spendPerPaxToday)}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Penjualan Item Tertunda</span>
            <span style={{ color: 'var(--text-secondary)', background: 'var(--glass-bg-hover)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>0%</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {formatCurrency(stats.pendingSalesToday)}
          </div>
        </div>

      </div>

      {/* Main Charts & Lists Grid */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 'var(--space-xl)', marginBottom: 'var(--space-xl)' }}>
        
        {/* Sales Trend Chart */}
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title" style={{ fontSize: '1.1rem', fontWeight: 600 }}>Sales Performance (7 Days)</h3>
          </div>
          <div style={{ width: '100%', height: 280, marginTop: 'var(--space-md)' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySalesData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickFormatter={(val) => `${val/1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
                  formatter={(value) => [formatCurrency(value), 'Sales']}
                />
                <Area type="monotone" dataKey="sales" stroke="var(--accent-primary)" fillOpacity={1} fill="url(#colorSales)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly Sales Chart */}
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title" style={{ fontSize: '1.1rem', fontWeight: 600 }}>Today's Sales Hourly Distribution</h3>
          </div>
          <div style={{ width: '100%', height: 280, marginTop: 'var(--space-md)' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlySalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                <XAxis dataKey="hour" stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickFormatter={(val) => `${val/1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
                  formatter={(value) => [formatCurrency(value), 'Sales']}
                />
                <Bar dataKey="sales" fill="var(--accent-secondary)" radius={[4, 4, 0, 0]}>
                  {hourlySalesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: Low Stock Alerts + Live Transactions + Top Selling */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 'var(--space-xl)' }}>
        
        {/* Left Side: Top Products & Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          {/* Top Selling Products */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>Top Selling Menus</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {topProductsList.map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', background: 'var(--glass-bg)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.5rem' }}>{item.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.category}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--accent-primary)' }}>{item.quantity} sold</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{formatCurrency(item.revenue)}</div>
                  </div>
                </div>
              ))}
              {topProductsList.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  No transactions yet.
                </div>
              )}
            </div>
          </div>

          {/* Inventory alerts */}
          <div className="glass-card" style={{ border: lowStockAlerts.length > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-lg)' }}>
              <AlertTriangle size={18} style={{ color: lowStockAlerts.length > 0 ? 'var(--color-danger)' : 'var(--color-success)' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Inventory Stock Alerts</h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto' }}>
              {lowStockAlerts.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Min. Stock: {item.minStock} {item.unit}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-danger)' }}>{item.currentStock} {item.unit}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Needs Restocking</div>
                  </div>
                </div>
              ))}

              {lowStockAlerts.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-success)', fontSize: '0.85rem', background: 'rgba(34, 197, 94, 0.05)', borderRadius: 'var(--radius-md)' }}>
                  All items are above minimum stock levels.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Live Transaction Feed */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Live Transaction Feed</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--accent-primary)' }}>
              <Clock size={12} className="animate-pulse" /> Live Feed Active
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, maxHeight: '460px', overflowY: 'auto' }}>
            {liveTransactions.map((txn) => (
              <div key={txn.id} style={{ padding: '12px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-primary)' }}>{txn.id}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(txn.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', maxHeight: '50px', overflowY: 'auto' }}>
                  {txn.items.map((it, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{it.productName} x{it.quantity}</span>
                      <span>{formatCurrency(it.subtotal)}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px dashed var(--glass-border)' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{txn.paymentMethod}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-success)' }}>{formatCurrency(txn.total)}</span>
                </div>
              </div>
            ))}

            {liveTransactions.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                No transactions today.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default Dashboard;
