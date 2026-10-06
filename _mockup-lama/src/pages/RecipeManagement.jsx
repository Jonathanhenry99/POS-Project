import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, Edit2, Trash2, X, PlusCircle, Scale } from 'lucide-react';

function RecipeManagement() {
  const { products, inventory, recipes, dispatch, formatCurrency, calculateRecipeCost } = useAppContext();
  
  const [selectedProduct, setSelectedProduct] = useState(products[0] || null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states
  const [recipeIngredients, setRecipeIngredients] = useState([]); // Array of { inventoryId, quantity }
  
  const currentRecipe = useMemo(() => {
    if (!selectedProduct) return null;
    return recipes.find(r => r.productId === selectedProduct.id);
  }, [selectedProduct, recipes]);

  const hppCost = useMemo(() => {
    return currentRecipe ? calculateRecipeCost(currentRecipe) : 0;
  }, [currentRecipe, calculateRecipeCost]);

  const profitMargin = useMemo(() => {
    if (!selectedProduct) return 0;
    const price = selectedProduct.price;
    if (price === 0) return 0;
    return ((price - hppCost) / price) * 100;
  }, [selectedProduct, hppCost]);

  const openEditModal = () => {
    if (currentRecipe) {
      setRecipeIngredients(currentRecipe.ingredients.map(ing => ({
        inventoryId: ing.inventoryId,
        quantity: ing.quantity
      })));
    } else {
      setRecipeIngredients([]);
    }
    setIsModalOpen(true);
  };

  const handleAddIngredientRow = () => {
    const firstInventory = inventory[0];
    if (!firstInventory) return;
    setRecipeIngredients(prev => [...prev, {
      inventoryId: firstInventory.id,
      quantity: 1
    }]);
  };

  const handleRemoveIngredientRow = (index) => {
    setRecipeIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index, field, value) => {
    setRecipeIngredients(prev => {
      return prev.map((item, i) => {
        if (i === index) {
          return { ...item, [field]: value };
        }
        return item;
      });
    });
  };

  const handleSaveRecipe = (e) => {
    e.preventDefault();
    if (!selectedProduct) return;

    // Filter duplicate or invalid ingredients
    const cleanedIngredients = recipeIngredients.map(ing => {
      const invItem = inventory.find(i => i.id === ing.inventoryId);
      return {
        inventoryId: ing.inventoryId,
        quantity: parseFloat(ing.quantity) || 0,
        unit: invItem ? invItem.unit : 'unit'
      };
    }).filter(ing => ing.quantity > 0);

    const payload = {
      productId: selectedProduct.id,
      ingredients: cleanedIngredients
    };

    if (currentRecipe) {
      dispatch({
        type: 'UPDATE_RECIPE',
        payload: { ...payload, id: currentRecipe.id }
      });
    } else {
      dispatch({
        type: 'ADD_RECIPE',
        payload
      });
    }
    setIsModalOpen(false);
  };

  const handleDeleteRecipe = () => {
    if (currentRecipe && window.confirm('Are you sure you want to delete the recipe for this product?')) {
      dispatch({ type: 'DELETE_RECIPE', payload: currentRecipe.id });
      setIsModalOpen(false);
    }
  };

  // Calculate HPP dynamically for display in modal
  const tempHppCost = useMemo(() => {
    return recipeIngredients.reduce((total, ing) => {
      const invItem = inventory.find(i => i.id === ing.inventoryId);
      const qty = parseFloat(ing.quantity) || 0;
      return total + (invItem ? invItem.costPerUnit * qty : 0);
    }, 0);
  }, [recipeIngredients, inventory]);

  return (
    <div className="recipe-management-page animate-fadeIn">
      {/* Header */}
      <div className="page-header">
        <h1>Recipe Management</h1>
        <p className="text-secondary">Map menu items to raw inventory materials for automatic stock deduction & cost calculation (HPP).</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--space-xl)', alignItems: 'start' }}>
        
        {/* Left Side: Product Selector */}
        <div className="glass-card" style={{ padding: 'var(--space-md)', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          <h3 style={{ padding: '8px 12px', fontSize: '0.95rem', fontWeight: 700, borderBottom: '1px solid var(--glass-border)', marginBottom: '10px' }}>Menu Items</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {products.map(prod => {
              const hasRec = recipes.some(r => r.productId === prod.id);
              const isSelected = selectedProduct?.id === prod.id;
              
              return (
                <button
                  key={prod.id}
                  onClick={() => setSelectedProduct(prod)}
                  className={`btn`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'var(--accent-primary-dim)' : 'transparent',
                    color: isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.3rem' }}>{prod.image}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{prod.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{prod.category}</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: hasRec ? 'var(--color-success-dim)' : 'var(--accent-tertiary-dim)',
                    color: hasRec ? 'var(--color-success)' : 'var(--accent-tertiary)'
                  }}>
                    {hasRec ? 'Active' : 'No Recipe'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Recipe Details & Analysis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          {selectedProduct ? (
            <>
              {/* Recipe Info Card */}
              <div className="glass-card recipe-card">
                <div className="recipe-card-header" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px', marginBottom: '15px' }}>
                  <div className="recipe-card-product">
                    <span className="recipe-card-emoji">{selectedProduct.image}</span>
                    <div>
                      <h2 className="recipe-card-name">{selectedProduct.name}</h2>
                      <span className="recipe-card-category">{selectedProduct.category} — Selling Price: {formatCurrency(selectedProduct.price)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    {currentRecipe && (
                      <button onClick={handleDeleteRecipe} className="btn btn-secondary btn-sm" style={{ color: 'var(--color-danger)' }}>
                        Delete Recipe
                      </button>
                    )}
                    <button onClick={openEditModal} className="btn btn-primary btn-sm">
                      {currentRecipe ? 'Edit Recipe' : 'Create Recipe'}
                    </button>
                  </div>
                </div>

                {/* Recipe Ingredients list */}
                {currentRecipe ? (
                  <div className="recipe-ingredient-list">
                    <h3 style={{ fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-secondary)' }}>Ingredients List:</h3>
                    {currentRecipe.ingredients.map(ing => {
                      const invItem = inventory.find(i => i.id === ing.inventoryId);
                      return (
                        <div key={ing.inventoryId} className="recipe-ingredient">
                          <span className="recipe-ingredient-name">{invItem ? invItem.name : 'Unknown Ingredient'}</span>
                          <span className="recipe-ingredient-amount">{ing.quantity} {ing.unit}</span>
                        </div>
                      );
                    })}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '20px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)' }}>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Raw Material Cost (HPP)</span>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-tertiary)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                          {formatCurrency(hppCost)}
                        </div>
                      </div>

                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Gross Profit Margin</span>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: profitMargin > 40 ? 'var(--color-success)' : 'var(--accent-tertiary)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                          {profitMargin.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Scale size={48} style={{ opacity: 0.3, marginBottom: '15px' }} />
                    <h3>No Recipe Defined</h3>
                    <p style={{ fontSize: '0.85rem', maxWidth: '400px', margin: '8px auto' }}>Define a recipe to track and auto-deduct raw material inventory automatically during POS transactions.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="glass-card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a product from the list to manage its recipe.
            </div>
          )}
        </div>
      </div>

      {/* Edit Recipe Modal */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal modal-lg animate-modalIn" style={{ width: '100%', maxWidth: '640px', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: '24px', borderRadius: 'var(--radius-xl)' }}>
            
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0 16px 0', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)' }}>
              <h2>Configure Recipe: {selectedProduct.name}</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRecipe}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px', marginBottom: '20px' }}>
                {recipeIngredients.map((item, idx) => {
                  const currentInv = inventory.find(i => i.id === item.inventoryId);
                  return (
                    <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <select
                        value={item.inventoryId}
                        onChange={(e) => handleIngredientChange(idx, 'inventoryId', e.target.value)}
                        style={{ flex: 2 }}
                      >
                        {inventory.map(inv => (
                          <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>
                        ))}
                      </select>

                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="Quantity"
                        value={item.quantity}
                        onChange={(e) => handleIngredientChange(idx, 'quantity', e.target.value)}
                        style={{ width: '100px', fontFamily: 'var(--font-mono)' }}
                      />

                      <span style={{ minWidth: '40px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {currentInv ? currentInv.unit : ''}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRemoveIngredientRow(idx)}
                        className="btn btn-sm btn-secondary btn-icon"
                        style={{ color: 'var(--color-danger)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}

                {recipeIngredients.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No ingredients added. Click 'Add Ingredient' below to configure.
                  </div>
                )}
              </div>

              {/* Actions & Cost preview */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--glass-border)', paddingTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <button type="button" onClick={handleAddIngredientRow} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <PlusCircle size={16} /> Add Ingredient
                </button>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Estimated Cost (HPP)</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-tertiary)', fontFamily: 'var(--font-mono)' }}>
                    {formatCurrency(tempHppCost)}
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Recipe
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default RecipeManagement;
