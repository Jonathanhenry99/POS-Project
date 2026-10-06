import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import {
  ShoppingCart,
  Search,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Wallet,
  CircleDollarSign,
  Check,
  X,
  Printer,
  Save,
  FolderOpen,
  History,
  TrendingUp,
  User,
  Coffee,
  Home,
  Wifi,
  AlertTriangle,
  Star,
  FileText,
  Menu
} from 'lucide-react';

function POS() {
  const navigate = useNavigate();
  const { setIsMobileMenuOpen } = useOutletContext() || {};
  const {
    products,
    categories,
    transactions,
    openBills,
    dispatch,
    processTransaction,
    formatCurrency,
    getRecipeByProduct,
    getInventoryItem,
    currentUser
  } = useAppContext();

  // UI State
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [paxCount, setPaxCount] = useState(1);

  // Client Details
  const [customerName, setCustomerName] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [orderType, setOrderType] = useState('dine-in');
  const [activeBillId, setActiveBillId] = useState(null);

  // Modals & Panels State
  const [checkoutStep, setCheckoutStep] = useState('catalog');
  const [isOpenBillsOpen, setIsOpenBillsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);

  // Void details
  const [voidAction, setVoidAction] = useState(null);
  const [voidReason, setVoidReason] = useState('');

  // Checkout Processing
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [completedTxn, setCompletedTxn] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [insufficientItems, setInsufficientItems] = useState([]);

  // Receipt ref for print
  const receiptRef = useRef(null);

  // Live clock
  const [clockStr, setClockStr] = useState('');
  React.useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClockStr(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const todayDateStr = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // Auto-print on successful checkout
  React.useEffect(() => {
    if (completedTxn && completedTxn.id !== 'PREVIEW') {
      const autoPrint = localStorage.getItem('mourden_auto_print') !== 'false';
      if (autoPrint) {
        const timer = setTimeout(() => {
          handlePrintReceipt();
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [completedTxn]);

  // Daily Turnover
  const dailyTurnover = useMemo(() => {
    const todayStr = new Date().toDateString();
    return transactions
      .filter(t => new Date(t.timestamp).toDateString() === todayStr)
      .reduce((sum, t) => sum + t.total, 0);
  }, [transactions]);

  const todayTxnCount = useMemo(() => {
    const todayStr = new Date().toDateString();
    return transactions.filter(t => new Date(t.timestamp).toDateString() === todayStr).length;
  }, [transactions]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return p.isActive && matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart handlers
  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        return [...prev, {
          productId: product.id,
          productName: product.name,
          price: product.price,
          quantity: 1,
          emoji: product.image,
          serviceChargeEnabled: product.serviceChargeEnabled || false,
          serviceChargePercent: product.serviceChargePercent || 5,
          taxPB1Enabled: product.taxPB1Enabled !== false,
          taxPB1Percent: product.taxPB1Percent || 10
        }];
      }
    });
  };

  const updateQty = (productId, change) => {
    const existing = cart.find(item => item.productId === productId);
    if (!existing) return;
    const newQty = existing.quantity + change;
    if (newQty <= 0) {
      handleInitiateVoid({ type: 'delete_item', productId, productName: existing.productName });
    } else {
      setCart(prev => prev.map(item =>
        item.productId === productId ? { ...item, quantity: newQty } : item
      ));
    }
  };

  const handleInitiateVoid = (actionData) => {
    setVoidAction(actionData);
    setVoidReason('');
    setIsVoidModalOpen(true);
  };

  const handleConfirmVoid = (e) => {
    e.preventDefault();
    if (!voidReason.trim()) return;
    const reason = voidReason.trim();

    if (voidAction.type === 'delete_item') {
      setCart(prev => prev.filter(item => item.productId !== voidAction.productId));
      dispatch({ type: 'ADD_NOTIFICATION', payload: { type: 'warning', title: 'Menu Dibatalkan (Void)', message: `"${voidAction.productName}" dibatalkan. Alasan: ${reason}` } });
    } else if (voidAction.type === 'clear_cart') {
      setCart([]); setCustomerName(''); setTableNumber(''); setOrderType('dine-in'); setActiveBillId(null);
      dispatch({ type: 'ADD_NOTIFICATION', payload: { type: 'warning', title: 'Pesanan Dikosongkan', message: `Seluruh pesanan dibatalkan. Alasan: ${reason}` } });
    } else if (voidAction.type === 'void_open_bill') {
      dispatch({ type: 'DELETE_OPEN_BILL', payload: voidAction.billId });
      dispatch({ type: 'ADD_NOTIFICATION', payload: { type: 'warning', title: 'Open Bill Void', message: `Pesanan atas nama ${voidAction.customerName} dibatalkan. Alasan: ${reason}` } });
    }
    setIsVoidModalOpen(false);
    setVoidAction(null);
  };

  const clearCart = () => {
    setCart([]); setCustomerName(''); setTableNumber(''); setOrderType('dine-in'); setActiveBillId(null);
  };

  // Totals
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0), [cart]);
  const totalItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  
  const totalSC = useMemo(() => cart.reduce((sum, item) => {
    if (!item.serviceChargeEnabled) return sum;
    return sum + ((item.price * (item.serviceChargePercent / 100)) * item.quantity);
  }, 0), [cart]);

  const tax = useMemo(() => cart.reduce((sum, item) => {
    if (!item.taxPB1Enabled) return sum;
    const base = item.price;
    const sc = item.serviceChargeEnabled ? (base * (item.serviceChargePercent / 100)) : 0;
    return sum + (((base + sc) * (item.taxPB1Percent / 100)) * item.quantity);
  }, 0), [cart]);

  const total = subtotal + totalSC + tax;
  const changeDue = useMemo(() => Math.max(0, (parseFloat(cashReceived) || 0) - total), [cashReceived, total]);

  // Open Bill
  const handleSaveOpenBill = () => {
    if (cart.length === 0) return;
    dispatch({
      type: 'SAVE_OPEN_BILL',
      payload: { id: activeBillId || undefined, customerName: customerName.trim() || 'Pelanggan Umum', tableNumber: tableNumber.trim() || '-', orderType, items: cart, subtotal, tax, totalSC, total, paxCount }
    });
    dispatch({ type: 'ADD_NOTIFICATION', payload: { type: 'success', title: 'Pesanan Disimpan', message: `Pesanan atas nama ${customerName || 'Pelanggan Umum'} berhasil disimpan.` } });
    clearCart();
  };

  const handleLoadOpenBill = (bill) => {
    setCart(bill.items); setCustomerName(bill.customerName); setTableNumber(bill.tableNumber); setOrderType(bill.orderType); setActiveBillId(bill.id);
    dispatch({ type: 'DELETE_OPEN_BILL', payload: bill.id });
    setIsOpenBillsOpen(false);
  };

  // Checkout
  const handleCheckoutSubmit = (e) => {
    e.preventDefault();
    setErrorMsg(''); setInsufficientItems([]);
    if (paymentMethod === 'cash') {
      const cashVal = parseFloat(cashReceived) || 0;
      if (cashVal < total) { setErrorMsg('Jumlah uang tunai yang diterima kurang.'); return; }
    }
    const transactionData = {
      items: cart.map(item => {
        const scAmount = item.serviceChargeEnabled ? (item.price * (item.serviceChargePercent/100)) : 0;
        const pb1Amount = item.taxPB1Enabled ? ((item.price + scAmount) * (item.taxPB1Percent/100)) : 0;
        const itemFinalPrice = item.price + scAmount + pb1Amount;
        return {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          basePrice: item.price,
          scAmount,
          pb1Amount,
          price: itemFinalPrice,
          subtotal: itemFinalPrice * item.quantity
        };
      }),
      subtotal,
      totalSC,
      tax,
      total,
      paymentMethod,
      cashReceived: paymentMethod === 'cash' ? parseFloat(cashReceived) : total,
      change: paymentMethod === 'cash' ? (parseFloat(cashReceived) - total) : 0,
      customerName: customerName.trim() || 'Pelanggan Umum', tableNumber: tableNumber.trim() || '-', orderType, paxCount, cashierName: currentUser?.name || 'Admin'
    };
    const result = processTransaction(transactionData);
    if (result.success) {
      setCompletedTxn({ ...transactionData, id: `MRD${Date.now().toString().slice(-8)}`, timestamp: new Date().toISOString() });
      setCheckoutStep('catalog'); clearCart();
    } else {
      setErrorMsg(result.error || 'Failed to process transaction');
      if (result.insufficientStock) setInsufficientItems(result.insufficientStock);
    }
  };

  const checkStockAvailability = (product) => {
    const recipe = getRecipeByProduct(product.id);
    if (!recipe) return { available: true };
    for (const ing of recipe.ingredients) {
      const invItem = getInventoryItem(ing.inventoryId);
      if (invItem && invItem.currentStock < ing.quantity) return { available: false, itemName: invItem.name };
    }
    return { available: true };
  };

  // Print receipt handler
  const handlePrintReceipt = () => {
    if (!receiptRef.current) return;
    const printWindow = window.open('', '_blank', 'width=400,height=700');
    printWindow.document.write(`
      <html><head><title>Struk Mourden Cafe</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 16px; color: #000; width: 300px; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .big { font-size: 16px; }
        .divider { border-top: 1px dashed #999; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .logo { font-size: 24px; margin-bottom: 4px; }
        .items { margin: 8px 0; }
        .item-name { font-weight: 600; }
      </style></head><body>
      ${receiptRef.current.innerHTML}
      <script>window.onload=function(){window.print();window.close();}</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  // ESB-style category colors
  const categoryColors = {
    'All': { bg: '#f1f5f9', color: '#334155', activeBg: '#1e40af', activeColor: '#fff' },
    'Coffee': { bg: '#fef3c7', color: '#92400e', activeBg: '#f97316', activeColor: '#fff' },
    'Non-Coffee': { bg: '#fce7f3', color: '#9d174d', activeBg: '#ec4899', activeColor: '#fff' },
    'Tea': { bg: '#d1fae5', color: '#065f46', activeBg: '#059669', activeColor: '#fff' },
    'Food': { bg: '#dbeafe', color: '#1e40af', activeBg: '#2563eb', activeColor: '#fff' },
    'Snack': { bg: '#fef9c3', color: '#854d0e', activeBg: '#eab308', activeColor: '#fff' },
    'Dessert': { bg: '#ede9fe', color: '#5b21b6', activeBg: '#7c3aed', activeColor: '#fff' },
    'Beverage': { bg: '#e0f2fe', color: '#0369a1', activeBg: '#0ea5e9', activeColor: '#fff' },
  };

  const getOrderTypeLabel = () => {
    if (orderType === 'dine-in') return `Dine In${paxCount > 0 ? ` (${paxCount} pax)` : ''}`;
    if (orderType === 'takeaway') return 'Take Away';
    return 'Delivery';
  };

  /* ====================================================================
     RENDER
     ==================================================================== */
  return (
    <div className="pos-page" style={{ height: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden', background: '#f0f4f8' }}>

      {/* ===== ESB BLUE TOP HEADER BAR ===== */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #1a56a0 50%, #2563eb 100%)',
        color: 'white', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderRadius: '0 0 12px 12px', boxShadow: '0 4px 20px rgba(30,58,95,0.3)', position: 'relative', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button 
            onClick={() => setIsMobileMenuOpen && setIsMobileMenuOpen(true)} 
            style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', border: 'none', color: 'white', cursor: 'pointer', transition: 'background 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            title="Menu Navigasi"
          >
            <Menu size={20} />
          </button>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.3rem', letterSpacing: '0.5px', fontFamily: 'var(--font-display)' }}>Mourden Cafe</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
              {currentUser?.name || 'Kasir'} | <span style={{ color: '#fbbf24' }}>Shift Open ✓</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>{todayDateStr}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '1px' }}>{clockStr}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', padding: '5px 14px', borderRadius: '20px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Online</span>
          </div>
        </div>
      </div>

      {/* ===== ESB SECOND ROW: Order Type + Customer + Quick Actions ===== */}
      <div style={{
        background: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '12px',
        borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap'
      }}>
        {/* Home button */}
        <button 
          onClick={() => navigate(currentUser?.role === 'owner' ? '/dashboard' : '/pos')}
          style={{ width: '38px', height: '38px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}
        >
          <Home size={18} />
        </button>

        {/* Order Type Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {['dine-in', 'takeaway', 'delivery'].map(type => (
            <button
              key={type} onClick={() => setOrderType(type)}
              style={{
                padding: '7px 14px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                background: orderType === type ? '#1e40af' : '#f1f5f9',
                color: orderType === type ? 'white' : '#475569',
                boxShadow: orderType === type ? '0 2px 8px rgba(30,64,175,0.3)' : 'none'
              }}
            >
              {type === 'dine-in' ? '🍽️ Dine In' : type === 'takeaway' ? '🛍️ Take Away' : '🛵 Delivery'}
            </button>
          ))}
          {orderType === 'dine-in' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '4px 8px' }}>
              <span style={{ fontSize: '0.82rem', color: '#1e40af', fontWeight: 600 }}>Pax:</span>
              <input type="number" min="1" value={paxCount} onChange={e => setPaxCount(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: '36px', border: 'none', background: 'transparent', textAlign: 'center', fontSize: '0.92rem', fontWeight: 700, color: '#1e40af', outline: 'none' }}
              />
            </div>
          )}
        </div>

        {/* Meja */}
        {orderType === 'dine-in' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '4px 10px' }}>
            <span style={{ fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>Meja:</span>
            <input type="text" placeholder="01" value={tableNumber} onChange={e => setTableNumber(e.target.value)}
              style={{ width: '36px', border: 'none', background: 'transparent', textAlign: 'center', fontSize: '0.92rem', fontWeight: 700, color: '#166534', outline: 'none' }}
            />
          </div>
        )}

        {/* Customer name */}
        <div style={{ flex: 1, minWidth: '180px', maxWidth: '320px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 12px', background: '#f8fafc' }}>
          <User size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <input
            type="text" placeholder="Info tambahan / nama customer"
            value={customerName} onChange={e => setCustomerName(e.target.value)}
            style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '0.95rem', color: '#1e293b', outline: 'none' }}
          />
          <Search size={14} style={{ color: '#94a3b8', flexShrink: 0, cursor: 'pointer' }} />
        </div>

        {/* Quick action buttons */}
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <button onClick={() => setIsOpenBillsOpen(true)} style={{
            padding: '7px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: '#334155', fontWeight: 600, position: 'relative'
          }}>
            <FolderOpen size={15} /> Tersimpan
            {openBills && openBills.length > 0 && (
              <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', color: 'white', fontSize: '0.6rem', fontWeight: 'bold', width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {openBills.length}
              </span>
            )}
          </button>
          <button onClick={() => setIsHistoryOpen(true)} style={{
            padding: '7px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: '#334155', fontWeight: 600
          }}>
            <History size={15} /> Riwayat
          </button>
        </div>
      </div>

      {/* ===== MAIN WORKSPACE: LEFT (CATALOG) + RIGHT (ORDER LIST) or PAYMENT SCREEN ===== */}
      {checkoutStep === 'catalog' ? (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', overflow: 'hidden', minHeight: 0 }}>

          {/* ===== LEFT: CATALOG ===== */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #e2e8f0', background: '#fff' }}>

            {/* Category Tabs (ESB-style pill buttons) */}
            <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {['All', ...categories].map(cat => {
                  const isActive = selectedCategory === cat;
                  const colors = categoryColors[cat] || categoryColors['All'];
                  return (
                    <button key={cat} onClick={() => setSelectedCategory(cat)}
                      style={{
                        padding: '8px 18px', borderRadius: '24px', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                        border: isActive ? 'none' : '1px solid #e2e8f0', whiteSpace: 'nowrap', transition: 'all 0.2s',
                        background: isActive ? colors.activeBg : colors.bg,
                        color: isActive ? colors.activeColor : colors.color,
                        boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                        transform: isActive ? 'scale(1.05)' : 'scale(1)'
                      }}>
                      {cat === 'All' ? '⭐ Semua' : cat}
                    </button>
                  );
                })}
              </div>

              {/* Breadcrumb: Pilih Kategori > Active Category */}
              <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                Pilih Kategori &gt; <span style={{ color: '#1e40af', fontWeight: 600 }}>{selectedCategory === 'All' ? 'Semua Menu' : selectedCategory}</span>
              </div>
            </div>

            {/* Search Bar */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 14px' }}>
                <Search size={16} style={{ color: '#94a3b8' }} />
                <input type="text" placeholder="Cari menu..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '1rem', color: '#1e293b', outline: 'none' }}
                />
              </div>
            </div>

            {/* Product Grid - ESB-style cards */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                {filteredProducts.map(product => {
                  const stockCheck = checkStockAvailability(product);
                  const cartItem = cart.find(c => c.productId === product.id);
                  return (
                    <div key={product.id}
                      onClick={() => stockCheck.available && addToCart(product)}
                      style={{
                        padding: '16px 12px', borderRadius: '12px', cursor: stockCheck.available ? 'pointer' : 'not-allowed',
                        border: cartItem ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: cartItem ? '#eff6ff' : (stockCheck.available ? '#f8fafc' : '#fef2f2'),
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                        transition: 'all 0.2s ease', position: 'relative', textAlign: 'center',
                        opacity: stockCheck.available ? 1 : 0.5,
                        transform: cartItem ? 'scale(1.02)' : 'scale(1)',
                        boxShadow: cartItem ? '0 4px 12px rgba(37,99,235,0.15)' : '0 1px 3px rgba(0,0,0,0.04)'
                      }}>
                      {cartItem && (
                        <div style={{
                          position: 'absolute', top: '-8px', right: '-8px', width: '24px', height: '24px', borderRadius: '50%',
                          background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.8rem', fontWeight: 800, boxShadow: '0 2px 6px rgba(37,99,235,0.4)'
                        }}>
                          {cartItem.quantity}
                        </div>
                      )}
                      <span style={{ fontSize: '2rem' }}>{product.image}</span>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b', lineHeight: '1.3', minHeight: '32px' }}>
                        {product.name}
                      </div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2563eb', fontFamily: 'var(--font-mono)' }}>
                        {formatCurrency(product.price)}
                      </div>
                      {!stockCheck.available && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#ef4444', color: 'white', fontSize: '0.75rem', padding: '3px 0', fontWeight: 'bold', borderRadius: '0 0 11px 11px' }}>
                          HABIS
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {filteredProducts.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                  <ShoppingCart size={48} style={{ marginBottom: '12px', opacity: 0.4 }} />
                  <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>Menu tidak ditemukan</div>
                  <div style={{ fontSize: '0.95rem' }}>Coba cari kategori atau nama lain.</div>
                </div>
              )}
            </div>
          </div>

          {/* ===== RIGHT: ORDER LIST ===== */}
          <div style={{ display: 'flex', flexDirection: 'column', background: '#fff' }}>

            {/* Order Header */}
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }} />
                <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b' }}>
                  {getOrderTypeLabel()}{tableNumber ? ` - Meja ${tableNumber}` : ''}
                </span>
              </div>
              {cart.length > 0 && (
                <button onClick={() => handleInitiateVoid({ type: 'clear_cart' })}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.88rem', fontWeight: 600 }}>
                  <Trash2 size={16} /> Hapus Semua
                </button>
              )}
            </div>

            {/* Daily Revenue Mini Widget */}
            <div style={{
              margin: '10px 16px 0', padding: '10px 16px', background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)', border: '1px solid #bfdbfe',
              borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Omset Hari Ini</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a', fontFamily: 'var(--font-mono)' }}>{formatCurrency(dailyTurnover)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Transaksi</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e40af', fontFamily: 'var(--font-mono)' }}>{todayTxnCount}</div>
              </div>
            </div>

            {/* Cart Items - LARGER TEXT like ESB */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {cart.map((item, idx) => (
                <div key={item.productId} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 0',
                  borderBottom: idx < cart.length - 1 ? '1px solid #f1f5f9' : 'none'
                }}>
                  {/* Quantity badge (ESB-style circled number) */}
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', background: '#1e40af', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', fontWeight: 800,
                    flexShrink: 0, marginTop: '2px'
                  }}>
                    {item.quantity}
                  </div>

                  {/* Item details */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', lineHeight: '1.4' }}>
                      {item.productName}
                    </div>
                    <div style={{ fontSize: '0.92rem', color: '#64748b', marginTop: '2px' }}>
                      {formatCurrency(item.price)} / item
                    </div>
                  </div>

                  {/* Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button onClick={() => updateQty(item.productId, -1)} style={{
                      width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #e2e8f0',
                      background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444'
                    }}>
                      <Minus size={18} />
                    </button>
                    <button onClick={() => updateQty(item.productId, 1)} style={{
                      width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #e2e8f0',
                      background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e'
                    }}>
                      <Plus size={18} />
                    </button>
                    <button onClick={() => handleInitiateVoid({ type: 'delete_item', productId: item.productId, productName: item.productName })} style={{
                      width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #fecaca',
                      background: '#fef2f2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444'
                    }}>
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Price */}
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e293b', fontFamily: 'var(--font-mono)', flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>
                    {formatCurrency(item.price * item.quantity)}
                  </div>
                </div>
              ))}

              {cart.length === 0 && (
                <div style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
                  <ShoppingCart size={40} style={{ marginBottom: '10px', opacity: 0.3 }} />
                  <div style={{ fontSize: '1rem', fontWeight: 600 }}>Pesanan masih kosong</div>
                  <div style={{ fontSize: '0.9rem' }}>Pilih menu di sebelah kiri</div>
                </div>
              )}
            </div>

            {/* ===== BOTTOM: SUMMARY & ACTION BUTTONS ===== */}
            {cart.length > 0 && (
              <div style={{ borderTop: '2px dashed #e2e8f0', background: '#fff' }}>
                {/* Summary */}
                <div style={{ padding: '12px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '1rem', color: '#64748b' }}>
                    <span>Kuantitas</span>
                    <span style={{ fontWeight: 700 }}>{totalItemCount} item</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '1rem', color: '#64748b' }}>
                    <span>Subtotal</span>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{formatCurrency(subtotal)}</span>
                  </div>
                  {totalSC > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '1rem', color: '#64748b' }}>
                      <span>Service Charge</span>
                      <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalSC)}</span>
                    </div>
                  )}
                  {tax > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '1rem', color: '#64748b' }}>
                      <span>PB1 Restoran</span>
                      <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{formatCurrency(tax)}</span>
                    </div>
                  )}
                </div>

                {/* Simpan + Cetak Struk Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '0 20px 10px' }}>
                  <button onClick={handleSaveOpenBill} style={{
                    padding: '16px', borderRadius: '10px', border: '2px solid #f97316', background: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1rem', fontWeight: 700, color: '#f97316',
                    transition: 'all 0.2s'
                  }}>
                    <Save size={20} /> Simpan
                  </button>
                  <button style={{
                    padding: '16px', borderRadius: '10px', border: '2px solid #475569', background: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1rem', fontWeight: 700, color: '#475569',
                    transition: 'all 0.2s'
                  }} onClick={() => { if (cart.length > 0) { setCompletedTxn({ items: cart.map(i => ({...i, subtotal: i.price * i.quantity})), total, customerName: customerName || 'Pelanggan Umum', tableNumber: tableNumber || '-', orderType, paxCount, paymentMethod: '-', cashReceived: 0, change: 0, id: 'PREVIEW', timestamp: new Date().toISOString(), cashierName: currentUser?.name || 'Admin' }); } }}>
                    <Printer size={20} /> Cetak Struk
                  </button>
                </div>

                {/* Big PAY Button */}
                <div style={{ padding: '0 20px 16px' }}>
                  <button onClick={() => { setCheckoutStep('payment'); setCashReceived(''); setErrorMsg(''); }} style={{
                    width: '100%', padding: '16px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                    fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.5px',
                    boxShadow: '0 4px 15px rgba(37,99,235,0.35)', transition: 'all 0.2s'
                  }}>
                    💳 Bayar | {formatCurrency(total)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ===== PAYMENT SCREEN (SPLIT VIEW) ===== */
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', overflow: 'hidden', minHeight: 0, background: '#f8fafc' }}>
          
          {/* LEFT: PAYMENT METHOD SELECTION FORM */}
          <div style={{
            display: 'flex', flexDirection: 'column', borderRight: '1px solid #cbd5e1', background: '#fff', padding: '24px', overflowY: 'auto'
          }}>
            {/* Back button */}
            <button
              onClick={() => setCheckoutStep('catalog')}
              style={{
                alignSelf: 'flex-start', padding: '10px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: 700, color: '#475569',
                transition: 'all 0.2s', marginBottom: '20px'
              }}
            >
              ← Kembali ke Kasir (Katalog)
            </button>

            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>Metode Pembayaran</h3>
            <p style={{ fontSize: '0.95rem', color: '#64748b', marginBottom: '20px' }}>
              Pelanggan: <span style={{ color: '#1e40af', fontWeight: 700 }}>{customerName || 'Pelanggan Umum'}</span> {tableNumber && ` | Meja: ${tableNumber}`} | Tipe: <span style={{ color: '#1e40af', fontWeight: 700 }}>{getOrderTypeLabel()}</span>
            </p>

            {errorMsg && (
              <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '20px', color: '#dc2626', fontSize: '0.95rem' }}>
                {errorMsg}
                {insufficientItems.length > 0 && insufficientItems.map((item, idx) => (
                  <div key={idx} style={{ marginTop: '4px' }}>• {item.name}: Butuh {item.required} {item.unit}, tersedia {item.available}</div>
                ))}
              </div>
            )}

            {/* Bill Total Display */}
            <div style={{
              background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)', border: '1px solid #bfdbfe', padding: '16px 20px', borderRadius: '12px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'
            }}>
              <span style={{ fontSize: '1.05rem', color: '#1e40af', fontWeight: 600 }}>Total Tagihan</span>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1e40af', fontFamily: 'var(--font-mono)' }}>{formatCurrency(total)}</span>
            </div>

            {/* Payment Method Selector Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
              <label style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>Pilih Tipe Pembayaran</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {[
                  { key: 'cash', icon: <CircleDollarSign size={20} />, label: 'Tunai (Cash)' },
                  { key: 'card', icon: <CreditCard size={20} />, label: 'Debit/Kredit' },
                  { key: 'e-wallet', icon: <Wallet size={20} />, label: 'QRIS' }
                ].map(m => (
                  <button key={m.key} type="button"
                    onClick={() => { setPaymentMethod(m.key); if (m.key !== 'cash') setCashReceived(total.toString()); else setCashReceived(''); }}
                    style={{
                      padding: '16px 8px', borderRadius: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', transition: 'all 0.2s',
                      border: paymentMethod === m.key ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: paymentMethod === m.key ? '#eff6ff' : '#f8fafc',
                      color: paymentMethod === m.key ? '#1e40af' : '#475569', fontWeight: 700
                    }}>
                    {m.icon}
                    <span style={{ fontSize: '0.9rem' }}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Received input (only if cash) */}
            {paymentMethod === 'cash' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                <label style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>Uang Tunai Diterima (Rp)</label>
                <input
                  type="number" required placeholder="Masukkan jumlah tunai..." value={cashReceived}
                  onChange={e => setCashReceived(e.target.value)}
                  style={{ padding: '14px 18px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 700, outline: 'none', color: '#1e293b' }}
                />
                {/* Quick cash selector */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[total, 50000, 100000].map(amt => {
                    const rounded = Math.ceil(amt / 10000) * 10000;
                    return (
                      <button key={rounded} type="button" onClick={() => setCashReceived(rounded.toString())}
                        style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#334155', transition: 'all 0.1s' }}>
                        {formatCurrency(rounded)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Change Display */}
            {paymentMethod === 'cash' && parseFloat(cashReceived) >= total && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', marginBottom: '24px' }}>
                <span style={{ color: '#166534', fontSize: '1rem', fontWeight: 600 }}>Kembalian</span>
                <span style={{ color: '#16a34a', fontWeight: 800, fontSize: '1.4rem', fontFamily: 'var(--font-mono)' }}>{formatCurrency(changeDue)}</span>
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={handleCheckoutSubmit}
              disabled={paymentMethod === 'cash' && (!cashReceived || parseFloat(cashReceived) < total)}
              style={{
                marginTop: 'auto', width: '100%', padding: '18px', borderRadius: '12px', border: 'none',
                cursor: (paymentMethod === 'cash' && (!cashReceived || parseFloat(cashReceived) < total)) ? 'not-allowed' : 'pointer',
                background: (paymentMethod === 'cash' && (!cashReceived || parseFloat(cashReceived) < total)) ? '#cbd5e1' : 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.5px',
                boxShadow: (paymentMethod === 'cash' && (!cashReceived || parseFloat(cashReceived) < total)) ? 'none' : '0 4px 15px rgba(37,99,235,0.35)', transition: 'all 0.2s'
              }}
            >
              ✓ Selesaikan & Konfirmasi Pembayaran
            </button>
          </div>

          {/* RIGHT: LIVE RECEIPT PREVIEW */}
          <div style={{
            display: 'flex', flexDirection: 'column', background: '#f1f5f9', padding: '24px', overflowY: 'auto',
            alignItems: 'center', justifyContent: 'flex-start'
          }}>
            <div style={{ alignSelf: 'flex-start', fontSize: '0.95rem', fontWeight: 700, color: '#475569', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={18} /> PRATONTON STRUK KASIR (LIVE PREVIEW)
            </div>

            {/* Receipt Preview card */}
            <div style={{
              background: '#fff', width: '100%', maxWidth: '340px', padding: '24px', border: '1px solid #cbd5e1', borderRadius: '12px',
              fontFamily: "'Courier New', monospace", fontSize: '13px', color: '#000', boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
              boxSizing: 'border-box'
            }}>
              {/* Logo */}
              <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '24px' }}>☕</div>
                <div style={{ fontWeight: 'bold', fontSize: '14px', letterSpacing: '2px' }}>mourden</div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '2px' }}>Mourden Cafe & Eatery</div>
                <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>Cabang Poris Utama</div>
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              {/* Receipt Info */}
              <div style={{ lineHeight: '1.6' }}>
                <div><b>Sales No</b> : DRAFT_PREVIEW</div>
                <div><b>Date</b>&nbsp;&nbsp;&nbsp;&nbsp; : {new Date().toLocaleString('id-ID')}</div>
                <div><b>Cashier</b> : {currentUser?.name || 'Kasir 1'}</div>
                <div><b>Customer</b> : {customerName || 'Pelanggan Umum'}</div>
                <div><b>Table</b>&nbsp;&nbsp;&nbsp; : {tableNumber || '-'}</div>
                <div><b>Order Type</b>: {orderType === 'dine-in' ? `DINE IN (${paxCount} pax)` : orderType === 'takeaway' ? 'TAKE AWAY' : 'DELIVERY'}</div>
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              {/* Items */}
              <div style={{ margin: '8px 0' }}>
                {cart.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', justifycontent: 'space-between', margin: '4px 0' }}>
                    <div style={{ maxWidth: '70%' }}>
                      <div><b>{it.quantity} {it.productName}</b></div>
                      <div style={{ fontSize: '9px', color: '#666' }}>{formatCurrency(it.price)} / unit</div>
                    </div>
                    <div style={{ fontWeight: 'bold', alignSelf: 'flex-end', marginLeft: 'auto' }}>{formatCurrency(it.price * it.quantity)}</div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              {/* Totals */}
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                <span>Total Items:</span>
                <span>{totalItemCount} pcs</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                <span>Subtotal:</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {totalSC > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                  <span>Service Charge:</span>
                  <span>{formatCurrency(totalSC)}</span>
                </div>
              )}
              {tax > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                  <span>PB1 Restoran:</span>
                  <span>{formatCurrency(tax)}</span>
                </div>
              )}

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px' }}>
                <span>Grand Total:</span>
                <span>{formatCurrency(total)}</span>
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              {/* Payment Details */}
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                <span>Metode:</span>
                <span style={{ fontWeight: 'bold' }}>{paymentMethod === 'cash' ? 'TUNAI (CASH)' : paymentMethod === 'card' ? 'DEBIT/KREDIT' : 'QRIS'}</span>
              </div>

              {paymentMethod === 'cash' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                    <span>Diterima:</span>
                    <span>{formatCurrency(parseFloat(cashReceived) || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                    <span>Kembalian:</span>
                    <span>{formatCurrency(changeDue)}</span>
                  </div>
                </>
              )}

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              <div style={{ textAlign: 'center', fontSize: '10px', color: '#666', marginTop: '6px' }}>
                Terima kasih telah berkunjung!<br />
                — Mourden Cafe —
              </div>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '12px', textAlign: 'center', maxWidth: '280px' }}>
              * Struk di atas merupakan draf pratonton. Struk final asli dapat dicetak setelah transaksi berhasil dikonfirmasi.
            </div>
          </div>

        </div>
      )}

      {/* ===== VOID MODAL ===== */}
      {isVoidModalOpen && voidAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: '420px', background: '#fff', borderRadius: '16px', padding: '28px', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={24} style={{ color: '#ef4444' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Konfirmasi Pembatalan</h3>
                <p style={{ fontSize: '0.95rem', color: '#64748b', margin: '2px 0 0' }}>
                  {voidAction.type === 'delete_item' ? `Hapus "${voidAction.productName}" dari pesanan` :
                   voidAction.type === 'clear_cart' ? 'Kosongkan seluruh pesanan' :
                   `Void pesanan atas nama ${voidAction.customerName}`}
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmVoid}>
              <label style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                Alasan pembatalan <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={voidReason} onChange={e => setVoidReason(e.target.value)}
                placeholder="Wajib diisi: contoh 'Pelanggan berubah pesanan', 'Stok habis'..."
                rows={3} required autoFocus
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px', fontSize: '1rem', resize: 'none', outline: 'none', fontFamily: 'var(--font-body)' }}
              />
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button type="button" onClick={() => { setIsVoidModalOpen(false); setVoidAction(null); }}
                  style={{ flex: 1, padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: '1rem', fontWeight: 600, color: '#475569' }}>
                  Batal
                </button>
                <button type="submit" disabled={!voidReason.trim()}
                  style={{ flex: 1, padding: '14px', borderRadius: '10px', border: 'none', background: voidReason.trim() ? '#ef4444' : '#fca5a5', cursor: voidReason.trim() ? 'pointer' : 'not-allowed', fontSize: '1rem', fontWeight: 700, color: 'white' }}>
                  Konfirmasi Void
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Checkout modal replaced by dedicated inline payment view */}

      {/* ===== OPEN BILLS MODAL ===== */}
      {isOpenBillsOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: '600px', background: '#fff', borderRadius: '16px', padding: '28px', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '1.25rem', color: '#1e293b' }}>Pesanan Tersimpan (Open Bill)</h3>
              <button onClick={() => setIsOpenBillsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={22} /></button>
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {openBills && openBills.map(bill => (
                <div key={bill.id} style={{ padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b' }}>{bill.customerName}</div>
                    <div style={{ fontSize: '0.88rem', color: '#64748b', marginTop: '2px' }}>
                      Meja: {bill.tableNumber} • {bill.items.length} menu • {new Date(bill.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 800, color: '#1e40af', fontFamily: 'var(--font-mono)', fontSize: '1.05rem' }}>{formatCurrency(bill.total)}</span>
                    <button onClick={() => handleLoadOpenBill(bill)} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700 }}>Buka</button>
                    <button onClick={() => handleInitiateVoid({ type: 'void_open_bill', billId: bill.id, customerName: bill.customerName })} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
              {(!openBills || openBills.length === 0) && (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Tidak ada pesanan tersimpan.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== HISTORY MODAL ===== */}
      {isHistoryOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: '600px', background: '#fff', borderRadius: '16px', padding: '28px', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '1.25rem', color: '#1e293b' }}>Riwayat Transaksi Hari Ini</h3>
              <button onClick={() => setIsHistoryOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={22} /></button>
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[...transactions].filter(t => new Date(t.timestamp).toDateString() === new Date().toDateString())
                .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))
                .map(txn => (
                  <div key={txn.id} style={{ padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e40af' }}>{txn.id}</span>
                        <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{new Date(txn.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>
                        {txn.customerName || 'Pelanggan Umum'} • {txn.paymentMethod?.toUpperCase()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 800, color: '#16a34a', fontFamily: 'var(--font-mono)', fontSize: '1.05rem' }}>{formatCurrency(txn.total)}</span>
                      <button onClick={() => { setCompletedTxn(txn); setIsHistoryOpen(false); }}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Printer size={14} /> Reprint
                      </button>
                    </div>
                  </div>
                ))}
              {transactions.filter(t => new Date(t.timestamp).toDateString() === new Date().toDateString()).length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Belum ada transaksi hari ini.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== RECEIPT MODAL (ESB-STYLE STRUK) ===== */}
      {completedTxn && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: '380px', background: '#fff', borderRadius: '16px', padding: '28px', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>

            {/* Success header */}
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#f0fdf4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                <Check size={28} style={{ color: '#16a34a' }} />
              </div>
              <h3 style={{ fontWeight: 700, fontSize: '1.25rem', color: '#1e293b' }}>Transaksi Berhasil</h3>
            </div>

            {/* Printable Receipt Area */}
            <div ref={receiptRef} style={{
              background: '#fff', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '12px',
              fontFamily: "'Courier New', monospace", fontSize: '14px', color: '#000', maxHeight: '360px', overflowY: 'auto'
            }}>
              {/* Logo */}
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '32px' }}>☕</div>
                <div style={{ fontWeight: 'bold', fontSize: '16px', letterSpacing: '2px' }}>mourden</div>
              </div>
              <div style={{ textAlign: 'center', fontSize: '15px', fontWeight: 'bold', marginBottom: '12px' }}>Mourden Cafe & Eatery</div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              <div style={{ lineHeight: '1.8' }}>
                <div><b>Sales No</b> : {completedTxn.id}</div>
                <div><b>Date</b>&nbsp;&nbsp;&nbsp;&nbsp; : {new Date(completedTxn.timestamp).toLocaleString('id-ID')}</div>
                <div><b>Info</b>&nbsp;&nbsp;&nbsp;&nbsp; : {completedTxn.customerName || 'Pelanggan Umum'}</div>
                <div><b>Table</b>&nbsp;&nbsp;&nbsp; : {completedTxn.tableNumber || '-'}</div>
                <div><b>Purpose</b>&nbsp; : {completedTxn.orderType === 'dine-in' ? 'DINE IN' : completedTxn.orderType === 'takeaway' ? 'TAKE AWAY' : 'DELIVERY'}</div>
                <div><b>Customer</b> : {completedTxn.customerName || 'Pelanggan Umum'}</div>
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              {/* Items */}
              {(completedTxn.items || []).map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{it.quantity} {it.productName}</div>
                  </div>
                  <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{formatCurrency(it.subtotal || (it.price * it.quantity))}</div>
                </div>
              ))}

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{totalItemCount || completedTxn.items?.reduce((s,i)=>s+i.quantity,0)} Items</span>
                <span><b>Subtotal : </b>{formatCurrency(completedTxn.subtotal || (completedTxn.total / 1.1))}</span>
              </div>
              {completedTxn.totalSC > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span></span>
                  <span>Service Charge : {formatCurrency(completedTxn.totalSC)}</span>
                </div>
              )}
              {completedTxn.tax > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span></span>
                  <span>Tax (PB1) : {formatCurrency(completedTxn.tax)}</span>
                </div>
              )}

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
                <span>Grand Total :</span>
                <span>{formatCurrency(completedTxn.total)}</span>
              </div>

              {completedTxn.paymentMethod && completedTxn.paymentMethod !== '-' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                    <span>{completedTxn.paymentMethod === 'cash' ? 'Cash (Tunai)' : completedTxn.paymentMethod.toUpperCase()} :</span>
                    <span>{formatCurrency(completedTxn.cashReceived)}</span>
                  </div>
                  {completedTxn.paymentMethod === 'cash' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Kembalian :</span>
                      <span>{formatCurrency(completedTxn.change)}</span>
                    </div>
                  )}
                </>
              )}

              <div style={{ borderTop: '1px dashed #999', margin: '10px 0' }} />
              <div style={{ textAlign: 'center', fontSize: '12px', color: '#666' }}>
                Terima kasih telah berkunjung!<br />
                — Mourden Cafe —
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={() => setCompletedTxn(null)} style={{
                flex: 1, padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc',
                cursor: 'pointer', fontSize: '1rem', fontWeight: 600, color: '#475569'
              }}>
                Tutup
              </button>
              <button onClick={handlePrintReceipt} style={{
                flex: 1, padding: '14px', borderRadius: '10px', border: 'none',
                background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
                cursor: 'pointer', fontSize: '1rem', fontWeight: 700, color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
              }}>
                <Printer size={20} /> Cetak Struk
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default POS;
