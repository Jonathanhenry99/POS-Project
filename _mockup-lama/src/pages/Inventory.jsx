import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Search, Plus, Edit2, Trash2, X, RefreshCw, Layers } from 'lucide-react';

function Inventory() {
  const { inventory, dispatch, formatCurrency } = useAppContext();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('All'); // 'All', 'Low', 'Healthy'
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [selectedItem, setSelectedItem] = useState(null);

  // Form states
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('gram');
  const [currentStock, setCurrentStock] = useState('');
  const [minStock, setMinStock] = useState('');
  const [costPerUnit, setCostPerUnit] = useState('');

  // 1. Stats Calculation
  const stats = useMemo(() => {
    const totalItems = inventory.length;
    const lowStockCount = inventory.filter(item => item.currentStock <= item.minStock).length;
    const totalInventoryValue = inventory.reduce((total, item) => total + (item.currentStock * item.costPerUnit), 0);
    
    return {
      totalItems,
      lowStockCount,
      totalInventoryValue
    };
  }, [inventory]);

  // 2. Filters & Search
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      const isLow = item.currentStock <= item.minStock;
      const matchesFilter = 
        stockFilter === 'All' || 
        (stockFilter === 'Low' && isLow) || 
        (stockFilter === 'Healthy' && !isLow);

      return matchesSearch && matchesFilter;
    });
  }, [inventory, searchQuery, stockFilter]);

  const openAddModal = () => {
    setModalMode('add');
    setName('');
    setUnit('gram');
    setCurrentStock('');
    setMinStock('');
    setCostPerUnit('');
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setModalMode('edit');
    setSelectedItem(item);
    setName(item.name);
    setUnit(item.unit);
    setCurrentStock(item.currentStock);
    setMinStock(item.minStock);
    setCostPerUnit(item.costPerUnit);
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !unit || currentStock === '' || minStock === '' || costPerUnit === '') {
      alert('Please fill in all fields.');
      return;
    }

    const payload = {
      name,
      unit,
      currentStock: parseFloat(currentStock),
      minStock: parseFloat(minStock),
      costPerUnit: parseFloat(costPerUnit)
    };

    if (modalMode === 'add') {
      dispatch({ type: 'ADD_INVENTORY', payload });
    } else {
      dispatch({ type: 'UPDATE_INVENTORY', payload: { ...payload, id: selectedItem.id } });
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this inventory item? This could affect recipes referencing it.')) {
      dispatch({ type: 'DELETE_INVENTORY', payload: id });
    }
  };

  // Helper to get stock status details
  const getStockStatus = (item) => {
    const ratio = item.currentStock / item.minStock;
    if (item.currentStock === 0) return { label: 'Out of Stock', class: 'low', percent: 0 };
    if (item.currentStock <= item.minStock) return { label: 'Low Stock', class: 'medium', percent: Math.min(100, Math.round(ratio * 100)) };
    return { label: 'Healthy', class: 'high', percent: 100 };
  };

  return (
    <div className="inventory-page animate-fadeIn">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <h1>Inventory Management</h1>
          <p className="text-secondary">Track raw material levels, restocking costs, and low stock warnings.</p>
        </div>
        <button onClick={openAddModal} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Add Material
        </button>
      </div>

      {/* Summary Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">TOTAL MATERIALS</span>
            <div className="stat-card-icon blue">
              <Layers />
            </div>
          </div>
          <div className="stat-card-value">{stats.totalItems} items</div>
          <div className="stat-card-change positive">Registered ingredients</div>
        </div>

        <div className="stat-card" style={{ border: stats.lowStockCount > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--glass-border)' }}>
          <div className="stat-card-header">
            <span className="stat-card-label">LOW STOCK WARNINGS</span>
            <div className="stat-card-icon red">
              <Layers />
            </div>
          </div>
          <div className="stat-card-value" style={{ color: stats.lowStockCount > 0 ? 'var(--color-danger)' : 'var(--text-primary)' }}>
            {stats.lowStockCount} items
          </div>
          <div className={`stat-card-change ${stats.lowStockCount > 0 ? 'negative' : 'positive'}`}>
            {stats.lowStockCount > 0 ? 'Needs prompt action' : 'All stocks healthy'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">TOTAL INVENTORY VALUE</span>
            <div className="stat-card-icon green">
              <RefreshCw />
            </div>
          </div>
          <div className="stat-card-value">{formatCurrency(stats.totalInventoryValue)}</div>
          <div className="stat-card-change positive">Estimated asset HPP</div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="toolbar-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', background: 'var(--glass-bg)', padding: '16px 20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['All', 'Low', 'Healthy'].map(filterVal => (
            <button
              key={filterVal}
              onClick={() => setStockFilter(filterVal)}
              className={`btn btn-sm ${stockFilter === filterVal ? 'btn-primary' : 'btn-secondary'}`}
            >
              {filterVal === 'All' ? 'All Stocks' : filterVal === 'Low' ? 'Low Stock' : 'Healthy Stock'}
            </button>
          ))}
        </div>

        <div className="search-bar" style={{ width: '100%', maxWidth: '300px' }}>
          <Search />
          <input
            type="text"
            placeholder="Search material..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ padding: '16px 24px' }}>Material Name</th>
                <th>Units</th>
                <th style={{ textAlign: 'right' }}>Current Stock</th>
                <th style={{ textAlign: 'right' }}>Min Stock</th>
                <th style={{ textAlign: 'right' }}>Unit Cost</th>
                <th>Status</th>
                <th style={{ textAlign: 'right', padding: '16px 24px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map(item => {
                const status = getStockStatus(item);
                return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, fontSize: '0.95rem', padding: '14px 24px' }}>{item.name}</td>
                    <td><span className="badge badge-secondary" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', background: 'var(--glass-bg-active)' }}>{item.unit}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 600 }}>{item.currentStock}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--text-secondary)' }}>{item.minStock}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--accent-primary)', fontWeight: 600 }}>{formatCurrency(item.costPerUnit)}</td>
                    <td>
                      <div className="stock-level">
                        <div className="stock-level-bar">
                          <div className={`stock-level-fill ${status.class}`} style={{ width: `${status.percent}%` }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: status.class === 'low' ? 'var(--color-danger)' : status.class === 'medium' ? 'var(--color-warning)' : 'var(--color-success)' }}>
                          {status.label}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 24px' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => openEditModal(item)} className="btn btn-sm btn-secondary btn-icon" title="Edit Item">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="btn btn-sm btn-secondary btn-icon" style={{ color: 'var(--color-danger)' }} title="Delete Item">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No materials matching filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal animate-modalIn" style={{ width: '100%', maxWidth: '480px', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: '24px', borderRadius: 'var(--radius-xl)' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0 16px 0', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)' }}>
              <h2>{modalMode === 'add' ? 'Add Inventory Material' : 'Edit Inventory Material'}</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Material Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Arabica Coffee Beans"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Measurement Unit</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {['gram', 'ml', 'pcs', 'bottle', 'box', 'unit'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Unit Cost (IDR)</label>
                  <input
                    type="number"
                    required
                    placeholder="Cost per unit (e.g. 150)"
                    value={costPerUnit}
                    onChange={(e) => setCostPerUnit(e.target.value)}
                    style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                  />
                </div>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Current Stock</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 5000"
                    value={currentStock}
                    onChange={(e) => setCurrentStock(e.target.value)}
                    style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Minimum Stock Alert</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 500"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inventory;
