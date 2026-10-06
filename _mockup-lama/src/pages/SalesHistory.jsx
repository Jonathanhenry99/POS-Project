import React, { useState, useMemo, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Search, Calendar, Filter, Printer, X, FileText, ChevronDown, RefreshCw } from 'lucide-react';

function SalesHistory() {
  const { transactions, formatCurrency, currentUser } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterMethod, setFilterMethod] = useState('all');
  const [selectedTxn, setSelectedTxn] = useState(null);
  const receiptRef = useRef(null);

  const filteredTxns = useMemo(() => {
    return transactions
      .filter(t => {
        if (filterDate && t.timestamp) {
          const txnDate = new Date(t.timestamp).toISOString().split('T')[0];
          if (txnDate !== filterDate) return false;
        }
        if (filterMethod !== 'all' && t.paymentMethod !== filterMethod) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchId = (t.id || '').toLowerCase().includes(q);
          const matchCustomer = (t.customerName || '').toLowerCase().includes(q);
          if (!matchId && !matchCustomer) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [transactions, filterDate, filterMethod, searchQuery]);

  const handlePrint = () => {
    if (!receiptRef.current) return;
    const printWindow = window.open('', '_blank', 'width=400,height=700');
    printWindow.document.write(`<html><head><title>Struk Kasir</title><style>
      body { font-family: 'Courier New', monospace; font-size: 11px; color: #000; padding: 16px; max-width: 300px; margin: 0 auto; }
      .center { text-align: center; } .bold { font-weight: bold; }
      .dashed { border-top: 1px dashed #999; margin: 8px 0; }
      .row { display: flex; justify-content: space-between; margin: 2px 0; }
      @media print { body { margin: 0; padding: 8px; } }
    </style></head><body>`);
    printWindow.document.write(receiptRef.current.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const payMethodLabel = (m) => m === 'cash' ? 'Tunai' : m === 'card' ? 'Kartu' : m === 'e-wallet' ? 'QRIS' : m;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '0', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #e2e8f0' }}>
        <h2 style={{ fontWeight: 800, fontSize: '1.3rem', color: '#1e293b', marginBottom: '4px' }}>Riwayat Penjualan</h2>
        <p style={{ fontSize: '0.82rem', color: '#64748b' }}>Riwayat transaksi kasir — klik untuk melihat struk detail.</p>
      </div>

      {/* Filter Bar */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 12px', background: '#fff' }}>
          <Calendar size={15} style={{ color: '#64748b' }} />
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            style={{ border: 'none', background: 'transparent', fontSize: '0.82rem', color: '#1e293b', outline: 'none' }}
          />
        </div>
        <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
          style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer', appearance: 'auto' }}>
          <option value="all">Semua Metode</option>
          <option value="cash">Tunai (Cash)</option>
          <option value="card">Debit/Kredit</option>
          <option value="e-wallet">QRIS</option>
        </select>
        <div style={{ flex: 1, minWidth: '180px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 12px', background: '#fff' }}>
          <Search size={15} style={{ color: '#94a3b8' }} />
          <input type="text" placeholder="Cari ID / pelanggan..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '0.82rem', color: '#1e293b', outline: 'none' }}
          />
        </div>
        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
          {filteredTxns.length} transaksi
        </div>
      </div>

      {/* Main Content: List + Detail */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: selectedTxn ? '1fr 420px' : '1fr', overflow: 'hidden', minHeight: 0 }}>
        {/* Transaction List */}
        <div style={{ overflowY: 'auto', padding: '12px 24px' }}>
          {filteredTxns.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <FileText size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
              <div style={{ fontSize: '1rem', fontWeight: 600 }}>Tidak ada transaksi</div>
              <div style={{ fontSize: '0.82rem' }}>Coba ubah filter tanggal atau pencarian.</div>
            </div>
          )}
          {filteredTxns.map(txn => (
            <div
              key={txn.id}
              onClick={() => setSelectedTxn(txn)}
              style={{
                padding: '14px 18px', borderRadius: '10px', marginBottom: '8px', cursor: 'pointer', transition: 'all 0.15s',
                border: selectedTxn?.id === txn.id ? '2px solid #2563eb' : '1px solid #e2e8f0',
                background: selectedTxn?.id === txn.id ? '#eff6ff' : '#fff',
                boxShadow: selectedTxn?.id === txn.id ? '0 2px 8px rgba(37,99,235,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', fontFamily: 'var(--font-mono)' }}>{txn.id?.slice(0, 16) || '-'}</span>
                  <span style={{
                    padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                    background: txn.paymentMethod === 'cash' ? '#dcfce7' : txn.paymentMethod === 'card' ? '#dbeafe' : '#fef3c7',
                    color: txn.paymentMethod === 'cash' ? '#166534' : txn.paymentMethod === 'card' ? '#1e40af' : '#92400e'
                  }}>{payMethodLabel(txn.paymentMethod)}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  {txn.customerName || 'Pelanggan Umum'} • {txn.items?.length || 0} item • {new Date(txn.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e40af', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                {formatCurrency(txn.total || 0)}
              </div>
            </div>
          ))}
        </div>

        {/* Detail Panel */}
        {selectedTxn && (
          <div style={{ borderLeft: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1e293b' }}>Detail Struk</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handlePrint} style={{
                  padding: '6px 14px', borderRadius: '8px', border: '1px solid #2563eb', background: '#eff6ff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, color: '#1e40af'
                }}>
                  <Printer size={14} /> Reprint
                </button>
                <button onClick={() => setSelectedTxn(null)} style={{
                  width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b'
                }}>
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Receipt Preview */}
            <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
              <div ref={receiptRef} style={{
                background: '#fff', width: '100%', maxWidth: '320px', padding: '20px', border: '1px solid #cbd5e1', borderRadius: '10px',
                fontFamily: "'Courier New', monospace", fontSize: '11px', color: '#000', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}>
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '20px' }}>☕</div>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', letterSpacing: '2px' }}>mourden</div>
                  <div style={{ fontSize: '11px', fontWeight: 'bold' }}>Mourden Cafe & Eatery</div>
                  <div style={{ fontSize: '9px', color: '#666' }}>Cabang Poris Utama</div>
                </div>
                <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
                <div style={{ lineHeight: '1.5' }}>
                  <div><b>Sales No</b> : {selectedTxn.id?.slice(0, 16) || '-'}</div>
                  <div><b>Date</b>&nbsp;&nbsp;&nbsp;&nbsp; : {new Date(selectedTxn.timestamp).toLocaleString('id-ID')}</div>
                  <div><b>Cashier</b> : {selectedTxn.cashierName || currentUser?.name || '-'}</div>
                  <div><b>Customer</b> : {selectedTxn.customerName || 'Pelanggan Umum'}</div>
                  <div><b>Table</b>&nbsp;&nbsp;&nbsp; : {selectedTxn.tableNumber || '-'}</div>
                  <div><b>Type</b>&nbsp;&nbsp;&nbsp;&nbsp; : {selectedTxn.orderType === 'dine-in' ? 'DINE IN' : selectedTxn.orderType === 'takeaway' ? 'TAKE AWAY' : 'DELIVERY'}</div>
                </div>
                <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
                {(selectedTxn.items || []).map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                    <div>
                      <div><b>{item.quantity} {item.productName}</b></div>
                      <div style={{ fontSize: '9px', color: '#666' }}>{formatCurrency(item.price)} / unit</div>
                    </div>
                    <div style={{ fontWeight: 'bold', alignSelf: 'flex-end' }}>{formatCurrency((item.price || 0) * (item.quantity || 0))}</div>
                  </div>
                ))}
                <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}>
                  <span>Grand Total:</span>
                  <span>{formatCurrency(selectedTxn.total || 0)}</span>
                </div>
                <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                  <span>Metode:</span>
                  <span style={{ fontWeight: 'bold' }}>{payMethodLabel(selectedTxn.paymentMethod)}</span>
                </div>
                {selectedTxn.paymentMethod === 'cash' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                      <span>Diterima:</span>
                      <span>{formatCurrency(selectedTxn.cashReceived || 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                      <span>Kembalian:</span>
                      <span>{formatCurrency(selectedTxn.change || 0)}</span>
                    </div>
                  </>
                )}
                <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
                <div style={{ textAlign: 'center', fontSize: '9px', color: '#666' }}>
                  Terima kasih telah berkunjung!<br />— Mourden Cafe —
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SalesHistory;
