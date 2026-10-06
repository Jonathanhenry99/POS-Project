import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Search, Plus, Edit2, Trash2, Check, X, FileText, ToggleLeft, ToggleRight, Info, DollarSign, Percent } from 'lucide-react';

function MenuManagement() {
  const { products, categories, dispatch, formatCurrency, getRecipeByProduct } = useAppContext();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState(categories[0] || 'Coffee');
  const [price, setPrice] = useState('');
  const [emoji, setEmoji] = useState('☕');
  const [isActive, setIsActive] = useState(true);

  // Tax and Service Charge states
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);
  const [serviceChargePercent, setServiceChargePercent] = useState(5);
  const [taxPB1Enabled, setTaxPB1Enabled] = useState(true);
  const [taxPB1Percent, setTaxPB1Percent] = useState(10);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  const openAddModal = () => {
    setModalMode('add');
    setName('');
    setDescription('');
    setSku('');
    setCategory(categories[0] || 'Coffee');
    setPrice('');
    setEmoji('☕');
    setIsActive(true);
    setServiceChargeEnabled(false);
    setServiceChargePercent(5);
    setTaxPB1Enabled(true);
    setTaxPB1Percent(10);
    setIsModalOpen(true);
  };

  const openEditModal = (product) => {
    setModalMode('edit');
    setSelectedProduct(product);
    setName(product.name);
    setDescription(product.description || '');
    setSku(product.sku || '');
    setCategory(product.category);
    setPrice(product.price);
    setEmoji(product.image);
    setIsActive(product.isActive !== false);
    setServiceChargeEnabled(product.serviceChargeEnabled || false);
    setServiceChargePercent(product.serviceChargePercent || 5);
    setTaxPB1Enabled(product.taxPB1Enabled !== false); // default true for legacy
    setTaxPB1Percent(product.taxPB1Percent || 10);
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !price) {
      alert('Nama dan Harga dasar wajib diisi.');
      return;
    }

    const payload = {
      name,
      description,
      sku,
      category,
      price: parseFloat(price),
      image: emoji,
      isActive,
      serviceChargeEnabled,
      serviceChargePercent: parseFloat(serviceChargePercent) || 0,
      taxPB1Enabled,
      taxPB1Percent: parseFloat(taxPB1Percent) || 0
    };

    if (modalMode === 'add') {
      dispatch({ type: 'ADD_PRODUCT', payload });
    } else {
      dispatch({ type: 'UPDATE_PRODUCT', payload: { ...payload, id: selectedProduct.id } });
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus menu ini?')) {
      dispatch({ type: 'DELETE_PRODUCT', payload: id });
    }
  };

  const toggleStatus = (id) => {
    dispatch({ type: 'TOGGLE_PRODUCT', payload: id });
  };

  // Derived calculations for preview
  const basePriceNum = parseFloat(price) || 0;
  const scAmount = serviceChargeEnabled ? (basePriceNum * (serviceChargePercent / 100)) : 0;
  // Note: PB1 is usually calculated from (Base Price + SC)
  const pb1Amount = taxPB1Enabled ? ((basePriceNum + scAmount) * (taxPB1Percent / 100)) : 0;
  const finalPrice = basePriceNum + scAmount + pb1Amount;

  return (
    <div className="menu-management-page animate-fadeIn">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <h1>Menu Management</h1>
          <p className="text-secondary">Kelola daftar menu, harga dasar, service charge, dan pajak PB1 restoran.</p>
        </div>
        <button onClick={openAddModal} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Tambah Menu Baru
        </button>
      </div>

      {/* Toolbar / Filters */}
      <div className="toolbar-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', background: 'var(--glass-bg)', padding: '16px 20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', maxWidth: '100%', paddingBottom: '2px' }}>
          <button
            onClick={() => setSelectedCategory('All')}
            className={`btn btn-sm ${selectedCategory === 'All' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Semua Kategori
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`btn btn-sm ${selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="search-bar" style={{ width: '100%', maxWidth: '300px' }}>
          <Search />
          <input
            type="text"
            placeholder="Cari nama menu..."
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
                <th style={{ width: '80px', padding: '16px 24px' }}>Item</th>
                <th>Nama Menu</th>
                <th>Kategori</th>
                <th style={{ textAlign: 'right' }}>Harga Dasar</th>
                <th style={{ textAlign: 'center' }}>SC & PB1</th>
                <th style={{ textAlign: 'right' }}>Harga Akhir (Est)</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '16px 24px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(product => {
                const pBase = product.price || 0;
                const pSC = (product.serviceChargeEnabled ? (pBase * ((product.serviceChargePercent||5)/100)) : 0);
                const pPB1 = (product.taxPB1Enabled !== false ? ((pBase + pSC) * ((product.taxPB1Percent||10)/100)) : 0);
                const pFinal = pBase + pSC + pPB1;

                return (
                  <tr key={product.id}>
                    <td style={{ fontSize: '1.8rem', textAlign: 'center', padding: '12px 24px' }}>{product.image}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{product.name}</div>
                      {product.sku && <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>SKU: {product.sku}</div>}
                    </td>
                    <td><span className="badge badge-secondary" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--glass-bg-active)' }}>{product.category}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>{formatCurrency(pBase)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        {product.serviceChargeEnabled && <span className="badge" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb', padding: '2px 6px', fontSize: '0.75rem' }}>SC {product.serviceChargePercent}%</span>}
                        {product.taxPB1Enabled !== false && <span className="badge" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', padding: '2px 6px', fontSize: '0.75rem' }}>PB1 {product.taxPB1Percent || 10}%</span>}
                        {!product.serviceChargeEnabled && product.taxPB1Enabled === false && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>-</span>}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 700, color: 'var(--accent-primary)' }}>
                      {formatCurrency(pFinal)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button onClick={() => toggleStatus(product.id)} style={{ cursor: 'pointer', verticalAlign: 'middle', background: 'none', border: 'none' }}>
                        {product.isActive !== false ? (
                          <span style={{ color: 'var(--color-success)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
                            <ToggleRight size={28} /> Aktif
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
                            <ToggleLeft size={28} /> Nonaktif
                          </span>
                        )}
                      </button>
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 24px' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => openEditModal(product)} className="btn btn-sm btn-secondary btn-icon" title="Edit Item">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(product.id)} className="btn btn-sm btn-secondary btn-icon" style={{ color: 'var(--color-danger)' }} title="Delete Item">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Tidak ada menu yang sesuai dengan pencarian Anda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal - Professional Version */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="modal animate-modalIn" style={{ width: '100%', maxWidth: '800px', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: '32px', borderRadius: 'var(--radius-xl)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0 20px 0', marginBottom: '24px', borderBottom: '1px solid var(--glass-border)' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{modalMode === 'add' ? 'Tambah Menu Baru' : 'Edit Menu Item'}</h2>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', marginTop: '4px' }}>Atur detail produk, harga dasar, dan pengaturan pajak.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '32px' }}>
                
                {/* LEFT COLUMN: Form Inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* Section 1: Basic Info */}
                  <div style={{ background: 'var(--glass-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>
                      <FileText size={18} /> <span>Informasi Dasar</span>
                    </div>
                    
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label className="form-label">Nama Menu <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <input type="text" required placeholder="Cth: Iced Caffe Latte" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '1rem' }} />
                    </div>

                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                      <div className="form-group">
                        <label className="form-label">Kategori <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '1rem' }}>
                          {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Kode SKU (Opsional)</label>
                        <input type="text" placeholder="Cth: COF-001" value={sku} onChange={(e) => setSku(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '1rem' }} />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label className="form-label">Deskripsi (Opsional)</label>
                      <textarea placeholder="Deskripsi singkat mengenai menu ini..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '1rem', resize: 'none' }} />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Ikon / Emoji <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <input type="text" required maxLength="2" value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ width: '64px', textAlign: 'center', fontSize: '1.5rem', padding: '8px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {['☕', '🥛', '🍵', '🥐', '🥪', '🍝', '🍰', '🍹', '🥩'].map(em => (
                            <button key={em} type="button" onClick={() => setEmoji(em)} style={{ fontSize: '1.4rem', padding: '6px', background: emoji === em ? 'var(--accent-primary)' : 'var(--bg-primary)', border: '1px solid var(--glass-border)', borderRadius: '8px', cursor: 'pointer' }}>
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Pricing & Tax */}
                  <div style={{ background: 'var(--glass-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>
                      <DollarSign size={18} /> <span>Harga & Pajak</span>
                    </div>

                    <div className="form-group" style={{ marginBottom: '20px' }}>
                      <label className="form-label">Harga Dasar (IDR) <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Harga sebelum dikenakan service charge dan PB1.</p>
                      <input type="number" required placeholder="Cth: 35000" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: '100%', padding: '14px', borderRadius: '8px', border: '2px solid var(--glass-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '1.2rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }} />
                    </div>

                    {/* Tax Toggles */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                      
                      {/* Service Charge Toggle */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Service Charge</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Terapkan biaya layanan.</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {serviceChargeEnabled && (
                            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '2px 8px' }}>
                              <input type="number" value={serviceChargePercent} onChange={e => setServiceChargePercent(e.target.value)} style={{ width: '40px', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', textAlign: 'right', fontWeight: 600, fontSize: '0.95rem' }} />
                              <span style={{ fontSize: '0.9rem', color: 'var(--text-tertiary)', marginLeft: '2px' }}>%</span>
                            </div>
                          )}
                          <button type="button" onClick={() => setServiceChargeEnabled(!serviceChargeEnabled)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                            {serviceChargeEnabled ? <ToggleRight size={32} style={{ color: 'var(--color-success)' }} /> : <ToggleLeft size={32} style={{ color: 'var(--text-muted)' }} />}
                          </button>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px dashed var(--glass-border)' }} />

                      {/* PB1 Toggle */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Pajak Restoran (PB1)</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Terapkan pajak PB1 ke menu ini.</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {taxPB1Enabled && (
                            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '2px 8px' }}>
                              <input type="number" value={taxPB1Percent} onChange={e => setTaxPB1Percent(e.target.value)} style={{ width: '40px', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', textAlign: 'right', fontWeight: 600, fontSize: '0.95rem' }} />
                              <span style={{ fontSize: '0.9rem', color: 'var(--text-tertiary)', marginLeft: '2px' }}>%</span>
                            </div>
                          )}
                          <button type="button" onClick={() => setTaxPB1Enabled(!taxPB1Enabled)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                            {taxPB1Enabled ? <ToggleRight size={32} style={{ color: 'var(--color-success)' }} /> : <ToggleLeft size={32} style={{ color: 'var(--text-muted)' }} />}
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Live Preview & Status */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* Status Card */}
                  <div style={{ background: 'var(--glass-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Status Menu</span>
                      <button type="button" onClick={() => setIsActive(!isActive)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isActive ? (
                          <><span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-success)' }}>Aktif</span><ToggleRight size={32} style={{ color: 'var(--color-success)' }} /></>
                        ) : (
                          <><span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Nonaktif</span><ToggleLeft size={32} style={{ color: 'var(--text-muted)' }} /></>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Live Receipt / Price Preview Card */}
                  <div style={{ background: 'linear-gradient(145deg, #1e293b, #0f172a)', padding: '24px', borderRadius: '16px', border: '1px solid #334155', color: 'white', position: 'sticky', top: '24px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600 }}>
                      <Percent size={16} /> <span>SIMULASI HARGA (LIVE PREVIEW)</span>
                    </div>

                    <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px', color: '#0f172a' }}>
                      
                      {/* Product Preview Header */}
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                        <div style={{ width: '48px', height: '48px', background: '#e2e8f0', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>
                          {emoji}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '1.1rem', lineHeight: '1.2' }}>{name || 'Nama Menu'}</div>
                          <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>{category} {sku && `• ${sku}`}</div>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px dashed #cbd5e1', marginBottom: '16px' }} />

                      {/* Calculation Breakdown */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.95rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#475569' }}>Harga Dasar</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatCurrency(basePriceNum)}</span>
                        </div>

                        {serviceChargeEnabled && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#475569' }}>Service Charge ({serviceChargePercent}%)</span>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>+ {formatCurrency(scAmount)}</span>
                          </div>
                        )}

                        {taxPB1Enabled && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#475569' }}>PB1 Pajak Restoran ({taxPB1Percent}%)</span>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>+ {formatCurrency(pb1Amount)}</span>
                          </div>
                        )}
                      </div>

                      <div style={{ borderTop: '1px dashed #cbd5e1', margin: '16px 0' }} />

                      {/* Final Total */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#1e40af' }}>Harga Jual Final</span>
                        <span style={{ fontWeight: 800, fontSize: '1.4rem', fontFamily: 'var(--font-mono)', color: '#1e40af' }}>{formatCurrency(finalPrice)}</span>
                      </div>

                      <div style={{ marginTop: '16px', padding: '10px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <Info size={16} style={{ color: '#2563eb', flexShrink: 0, marginTop: '2px' }} />
                        <span style={{ fontSize: '0.8rem', color: '#1e40af', lineHeight: '1.4' }}>
                          Harga jual final ini yang akan dibayarkan oleh pelanggan di kasir.
                        </span>
                      </div>
                    </div>

                  </div>
                </div>

              </div>

              {/* Modal Footer (Action Buttons) */}
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '32px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '14px 24px', borderRadius: '10px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s' }}>
                  Batal
                </button>
                <button type="submit" style={{ padding: '14px 32px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', border: 'none', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(37,99,235,0.3)', transition: 'all 0.2s' }}>
                  <Check size={20} /> Simpan Menu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default MenuManagement;
