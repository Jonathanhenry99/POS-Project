import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Clock, DollarSign, TrendingUp, AlertTriangle, CheckCircle, PlayCircle, StopCircle, ChevronDown, CreditCard, Wallet, CircleDollarSign, Users, FileText } from 'lucide-react';

function ShiftManagement() {
  const { activeShift, closedShifts, transactions, currentUser, formatCurrency, openShift, closeShift } = useAppContext();
  const [openingCashInput, setOpeningCashInput] = useState('500000');
  const [cashierNameInput, setCashierNameInput] = useState(currentUser?.name || '');
  const [actualCashInput, setActualCashInput] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Current shift transactions
  const shiftTxns = useMemo(() => {
    if (!activeShift) return [];
    return transactions.filter(t => t.shiftId === activeShift.id);
  }, [transactions, activeShift]);

  const shiftStats = useMemo(() => {
    const totalCash = shiftTxns.filter(t => t.paymentMethod === 'cash').reduce((s, t) => s + (t.total || 0), 0);
    const totalCard = shiftTxns.filter(t => t.paymentMethod === 'card').reduce((s, t) => s + (t.total || 0), 0);
    const totalEwallet = shiftTxns.filter(t => t.paymentMethod === 'e-wallet').reduce((s, t) => s + (t.total || 0), 0);
    const totalRevenue = totalCash + totalCard + totalEwallet;
    const openingCash = activeShift ? activeShift.openingCash : 0;
    const expectedCash = openingCash + totalCash;
    return { totalCash, totalCard, totalEwallet, totalRevenue, expectedCash, txnCount: shiftTxns.length };
  }, [shiftTxns, activeShift]);

  const shiftDuration = useMemo(() => {
    if (!activeShift) return '-';
    const start = new Date(activeShift.openedAt);
    const now = new Date();
    const diffMs = now - start;
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `${hrs}j ${mins}m`;
  }, [activeShift]);

  const handleOpenShift = (e) => {
    e.preventDefault();
    openShift(cashierNameInput || currentUser?.name || 'Kasir', openingCashInput);
  };

  const handleCloseShift = () => {
    closeShift(actualCashInput, closeNotes);
    setShowCloseConfirm(false);
    setActualCashInput('');
    setCloseNotes('');
  };

  const cardStyle = {
    background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
  };

  // ========== SHIFT CLOSED: Show Open Shift Form ==========
  if (!activeShift) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontWeight: 800, fontSize: '1.3rem', color: '#1e293b', marginBottom: '4px' }}>Kelola Shift & Tutup Toko</h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b' }}>Status shift: <span style={{ color: '#ef4444', fontWeight: 700 }}>Ditutup</span></p>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: '24px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <StopCircle size={40} style={{ color: '#ef4444' }} />
          </div>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>Shift Belum Dibuka</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: '1.5' }}>
              Kasir perlu membuka shift baru untuk memulai transaksi POS. Masukkan nama kasir dan modal awal laci.
            </p>
          </div>

          <form onSubmit={handleOpenShift} style={{ width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Nama Kasir</label>
              <input type="text" value={cashierNameInput} onChange={e => setCashierNameInput(e.target.value)} required
                placeholder="Nama kasir shift ini..."
                style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', color: '#1e293b', outline: 'none', background: '#fff' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Modal Awal Laci (Rp)</label>
              <input type="number" value={openingCashInput} onChange={e => setOpeningCashInput(e.target.value)} required
                placeholder="500000"
                style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '1.1rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#1e293b', outline: 'none', background: '#fff' }}
              />
              <div style={{ display: 'flex', gap: '6px' }}>
                {[300000, 500000, 1000000].map(amt => (
                  <button key={amt} type="button" onClick={() => setOpeningCashInput(amt.toString())}
                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>
                    {formatCurrency(amt)}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" style={{
              padding: '14px', borderRadius: '12px', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
              color: '#fff', fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: '0 4px 15px rgba(34,197,94,0.3)'
            }}>
              <PlayCircle size={20} /> Buka Shift Baru
            </button>
          </form>

          {/* Closed Shifts History */}
          {closedShifts.length > 0 && (
            <div style={{ width: '100%', maxWidth: '600px', marginTop: '20px' }}>
              <button onClick={() => setShowHistory(!showHistory)} style={{
                display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#475569', cursor: 'pointer',
                background: 'none', border: 'none', marginBottom: '8px'
              }}>
                <ChevronDown size={14} style={{ transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                Riwayat Shift Sebelumnya ({closedShifts.length})
              </button>
              {showHistory && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[...closedShifts].reverse().slice(0, 10).map((s, i) => (
                    <div key={i} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{s.cashierName}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {new Date(s.openedAt).toLocaleDateString('id-ID')} • {s.totalTransactions} trx
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1e40af', fontFamily: 'var(--font-mono)' }}>{formatCurrency(s.totalRevenue || 0)}</div>
                        <div style={{
                          fontSize: '0.68rem', fontWeight: 700,
                          color: s.discrepancy === 0 ? '#16a34a' : s.discrepancy > 0 ? '#2563eb' : '#ef4444'
                        }}>
                          Selisih: {s.discrepancy > 0 ? '+' : ''}{formatCurrency(s.discrepancy || 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== SHIFT OPEN: Show Active Shift Dashboard ==========
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: '1.3rem', color: '#1e293b', marginBottom: '4px' }}>Kelola Shift & Tutup Toko</h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
            Status: <span style={{ color: '#22c55e', fontWeight: 700 }}>● Shift Aktif</span> — {activeShift.cashierName} — Durasi: {shiftDuration}
          </p>
        </div>
        <button
          onClick={() => setShowCloseConfirm(true)}
          style={{
            padding: '10px 20px', borderRadius: '10px', border: '2px solid #ef4444', background: '#fef2f2', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 700, color: '#ef4444'
          }}
        >
          <StopCircle size={18} /> Tutup Shift / Tutup Toko
        </button>
      </div>

      {/* Stats Grid */}
      <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Modal Awal Laci', value: formatCurrency(activeShift.openingCash), icon: <DollarSign size={20} />, bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
          { label: 'Total Pendapatan', value: formatCurrency(shiftStats.totalRevenue), icon: <TrendingUp size={20} />, bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
          { label: 'Tunai (Cash)', value: formatCurrency(shiftStats.totalCash), icon: <CircleDollarSign size={20} />, bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
          { label: 'Kartu (EDC)', value: formatCurrency(shiftStats.totalCard), icon: <CreditCard size={20} />, bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
          { label: 'QRIS', value: formatCurrency(shiftStats.totalEwallet), icon: <Wallet size={20} />, bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
          { label: 'Expected Cash di Laci', value: formatCurrency(shiftStats.expectedCash), icon: <CheckCircle size={20} />, bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0' },
          { label: 'Jumlah Transaksi', value: shiftStats.txnCount, icon: <FileText size={20} />, bg: '#f5f3ff', color: '#5b21b6', border: '#c4b5fd' },
          { label: 'Kasir Aktif', value: activeShift.cashierName, icon: <Users size={20} />, bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
        ].map((s, i) => (
          <div key={i} style={{ ...cardStyle, border: `1px solid ${s.border}`, background: s.bg, display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ color: s.color, flexShrink: 0 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{s.label}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: s.color, fontFamily: typeof s.value === 'number' || s.value?.startsWith?.('Rp') ? 'var(--font-mono)' : 'inherit' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Shift Info */}
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Informasi Shift</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.82rem', color: '#475569' }}>
            <div>Shift ID: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{activeShift.id?.slice(0, 18)}</span></div>
            <div>Dibuka: <span style={{ fontWeight: 600 }}>{new Date(activeShift.openedAt).toLocaleString('id-ID')}</span></div>
            <div>Kasir: <span style={{ fontWeight: 600 }}>{activeShift.cashierName}</span></div>
            <div>Durasi: <span style={{ fontWeight: 600 }}>{shiftDuration}</span></div>
          </div>
        </div>
      </div>

      {/* Close Shift Modal */}
      {showCloseConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: '480px', background: '#fff', borderRadius: '16px', padding: '28px', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={22} style={{ color: '#ef4444' }} />
              </div>
              <div>
                <h3 style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e293b' }}>Tutup Shift / Tutup Toko</h3>
                <p style={{ fontSize: '0.78rem', color: '#64748b' }}>Masukkan uang tunai riil yang ada di laci kasir sekarang.</p>
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#475569', marginBottom: '4px' }}>
                <span>Expected Cash (Sistem):</span>
                <span style={{ fontWeight: 800, color: '#1e40af', fontFamily: 'var(--font-mono)' }}>{formatCurrency(shiftStats.expectedCash)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#475569' }}>
                <span>Total Pendapatan Shift:</span>
                <span style={{ fontWeight: 800, color: '#166534', fontFamily: 'var(--font-mono)' }}>{formatCurrency(shiftStats.totalRevenue)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Uang Tunai Riil di Laci (Rp)</label>
                <input type="number" value={actualCashInput} onChange={e => setActualCashInput(e.target.value)} required
                  placeholder="Masukkan jumlah uang tunai riil..."
                  style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '1.1rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#1e293b', outline: 'none' }}
                />
              </div>

              {actualCashInput && (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px',
                  background: (parseFloat(actualCashInput) - shiftStats.expectedCash) === 0 ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${(parseFloat(actualCashInput) - shiftStats.expectedCash) === 0 ? '#bbf7d0' : '#fecaca'}`,
                  display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem'
                }}>
                  <span style={{ fontWeight: 600 }}>Selisih Kas:</span>
                  <span style={{
                    fontWeight: 800, fontFamily: 'var(--font-mono)',
                    color: (parseFloat(actualCashInput) - shiftStats.expectedCash) === 0 ? '#16a34a' :
                           (parseFloat(actualCashInput) - shiftStats.expectedCash) > 0 ? '#2563eb' : '#ef4444'
                  }}>
                    {(parseFloat(actualCashInput) - shiftStats.expectedCash) > 0 ? '+' : ''}
                    {formatCurrency((parseFloat(actualCashInput) || 0) - shiftStats.expectedCash)}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Catatan (opsional)</label>
                <textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} rows={2}
                  placeholder="Catatan penutupan shift..."
                  style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.82rem', color: '#1e293b', outline: 'none', resize: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowCloseConfirm(false)} style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc',
                cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700, color: '#475569'
              }}>Batal</button>
              <button onClick={handleCloseShift} disabled={!actualCashInput} style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                background: actualCashInput ? '#ef4444' : '#fca5a5',
                cursor: actualCashInput ? 'pointer' : 'not-allowed',
                fontSize: '0.88rem', fontWeight: 700, color: '#fff'
              }}>Konfirmasi Tutup Shift</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShiftManagement;
