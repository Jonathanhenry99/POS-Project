import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { ClipboardCheck, History, Plus, Check, Info, Calendar } from 'lucide-react';

function StockOpname() {
  const { inventory, stockOpnameRecords, dispatch } = useAppContext();
  
  const [activeTab, setActiveTab] = useState('new'); // 'new' or 'history'
  
  // Opname form states
  const [opnameItems, setOpnameItems] = useState(
    inventory.map(item => ({
      inventoryId: item.id,
      name: item.name,
      unit: item.unit,
      systemStock: item.currentStock,
      actualStock: item.currentStock, // default to system stock
      notes: ''
    }))
  );

  // Auto-calculate differences
  const itemsWithDiff = useMemo(() => {
    return opnameItems.map(item => {
      const difference = item.actualStock - item.systemStock;
      return {
        ...item,
        difference
      };
    });
  }, [opnameItems]);

  const handleActualStockChange = (id, val) => {
    const numVal = val === '' ? 0 : parseFloat(val);
    setOpnameItems(prev => prev.map(item => 
      item.inventoryId === id ? { ...item, actualStock: numVal } : item
    ));
  };

  const handleNotesChange = (id, text) => {
    setOpnameItems(prev => prev.map(item => 
      item.inventoryId === id ? { ...item, notes: text } : item
    ));
  };

  const handleSubmitOpname = (e) => {
    e.preventDefault();

    if (!window.confirm('Submitting stock opname will update the system inventory stocks to match the actual stock counts. Proceed?')) {
      return;
    }

    const opnameId = `opname_${Date.now().toString().slice(-4)}`;
    const dateStr = new Date().toISOString().split('T')[0];

    const recordPayload = {
      date: dateStr,
      items: itemsWithDiff.map(item => ({
        inventoryId: item.inventoryId,
        name: item.name,
        systemStock: item.systemStock,
        actualStock: item.actualStock,
        difference: item.difference,
        notes: item.notes
      })),
      status: 'completed'
    };

    // 1. Save Opname history record
    dispatch({ type: 'ADD_STOCK_OPNAME', payload: recordPayload });

    // 2. Bulk update inventory items
    const inventoryUpdates = opnameItems.map(item => ({
      id: item.inventoryId,
      currentStock: item.actualStock
    }));
    dispatch({ type: 'BULK_UPDATE_INVENTORY', payload: inventoryUpdates });

    // 3. Trigger success notification
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: {
        type: 'success',
        title: 'Stock Opname Completed',
        message: 'System inventory counts updated successfully.'
      }
    });

    // 4. Reset form & switch tabs
    setOpnameItems(inventory.map(item => ({
      inventoryId: item.id,
      name: item.name,
      unit: item.unit,
      systemStock: item.currentStock,
      actualStock: item.currentStock,
      notes: ''
    })));
    setActiveTab('history');
  };

  return (
    <div className="stock-opname-page animate-fadeIn">
      {/* Page Header */}
      <div className="page-header">
        <h1>Stock Opname</h1>
        <p className="text-secondary">Perform stock checks to audit, align system data, and log variances.</p>
      </div>

      {/* Navigation tabs */}
      <div className="tabs" style={{ marginBottom: 'var(--space-xl)', width: 'fit-content' }}>
        <button
          onClick={() => setActiveTab('new')}
          className={`tab ${activeTab === 'new' ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <ClipboardCheck size={16} /> New Audit
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <History size={16} /> Audit Logs
        </button>
      </div>

      {/* Form: New audit */}
      {activeTab === 'new' ? (
        <form onSubmit={handleSubmitOpname} className="opname-form">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            
            {/* Header Labels */}
            <div className="opname-item" style={{ background: 'transparent', border: 'none', padding: '0 var(--space-lg)', fontWeight: 'bold', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              <div>Material Item</div>
              <div style={{ textAlign: 'right' }}>System Stock</div>
              <div style={{ textAlign: 'center' }}>Actual Stock</div>
              <div style={{ textAlign: 'center' }}>Variance</div>
              <div>Audit Notes / Remarks</div>
            </div>

            {/* List items */}
            {itemsWithDiff.map((item) => (
              <div key={item.inventoryId} className="opname-item">
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {item.systemStock} {item.unit}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <input
                    type="number"
                    step="any"
                    required
                    style={{ width: '80px', padding: '6px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}
                    value={item.actualStock}
                    onChange={(e) => handleActualStockChange(item.inventoryId, e.target.value)}
                  />
                </div>
                <div className={`difference ${item.difference > 0 ? 'positive' : item.difference < 0 ? 'negative' : 'zero'}`}>
                  {item.difference > 0 ? `+${item.difference}` : item.difference} {item.unit}
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="e.g. Spillage, counting error"
                    style={{ width: '100%', padding: '6px 12px', fontSize: '0.8rem' }}
                    value={item.notes}
                    onChange={(e) => handleNotesChange(item.inventoryId, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="submit" className="btn btn-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px' }}>
              <Check size={16} /> Submit & Sync Inventory
            </button>
          </div>
        </form>
      ) : (
        /* History lists */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {stockOpnameRecords.map((record) => (
            <div key={record.id} className="glass-card" style={{ padding: 'var(--space-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} style={{ color: 'var(--accent-primary)' }} />
                  <span style={{ fontWeight: 700 }}>Audit ID: {record.id}</span>
                </div>
                <span className="badge" style={{ background: 'var(--color-success-dim)', color: 'var(--color-success)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontWeight: 600 }}>
                  Completed & Synced
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {record.items.map((it, idx) => {
                  const hasVariance = it.difference !== 0;
                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <span>{it.name}</span>
                      <div style={{ display: 'flex', gap: '15px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>System: {it.systemStock} → Actual: {it.actualStock}</span>
                        <span style={{ fontWeight: 600, color: it.difference > 0 ? 'var(--color-success)' : it.difference < 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                          Variance: {it.difference > 0 ? `+${it.difference}` : it.difference}
                        </span>
                        {it.notes && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>({it.notes})</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {stockOpnameRecords.length === 0 && (
            <div className="glass-card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
              <Info size={48} style={{ opacity: 0.3, marginBottom: '15px' }} />
              <h3>No audits submitted yet</h3>
              <p style={{ fontSize: '0.85rem' }}>Click "New Audit" to record your first stock opname count.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default StockOpname;
