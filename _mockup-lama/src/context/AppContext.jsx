import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import {
  DEFAULT_CATEGORIES,
  SEED_PRODUCTS,
  SEED_INVENTORY,
  SEED_RECIPES,
  SEED_TRANSACTIONS,
  SEED_USERS,
  ROLE_PERMISSIONS
} from '../data/seedData';

const AppContext = createContext(null);

// Helper: Generate unique ID
const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

// Helper: Load from localStorage or use seed data
function loadState(key, seedData) {
  try {
    const stored = localStorage.getItem(`mourden_${key}`);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.warn(`Failed to load ${key} from localStorage`, e);
  }
  return seedData;
}

// Helper: Save to localStorage
function saveState(key, data) {
  try {
    localStorage.setItem(`mourden_${key}`, JSON.stringify(data));
  } catch (e) {
    console.warn(`Failed to save ${key} to localStorage`, e);
  }
}

// Initial state
const getInitialState = () => ({
  // Auth
  currentUser: loadState('currentUser', null),
  users: loadState('users', SEED_USERS),

  // Data
  products: loadState('products', SEED_PRODUCTS),
  inventory: loadState('inventory', SEED_INVENTORY),
  recipes: loadState('recipes', SEED_RECIPES),
  transactions: loadState('transactions', SEED_TRANSACTIONS),
  categories: loadState('categories', DEFAULT_CATEGORIES),
  stockOpnameRecords: loadState('stockOpnameRecords', []),
  openBills: loadState('openBills', []),

  // Shift Management
  activeShift: loadState('activeShift', null),
  closedShifts: loadState('closedShifts', []),

  // UI state
  notifications: [],
});

// Reducer
function appReducer(state, action) {
  switch (action.type) {
    // === AUTH ===
    case 'LOGIN':
      return { ...state, currentUser: action.payload };

    case 'LOGOUT':
      return { ...state, currentUser: null };

    // === PRODUCTS ===
    case 'ADD_PRODUCT':
      return { ...state, products: [...state.products, { ...action.payload, id: generateId('prod'), isActive: true }] };

    case 'UPDATE_PRODUCT':
      return {
        ...state,
        products: state.products.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p)
      };

    case 'DELETE_PRODUCT':
      return { ...state, products: state.products.filter(p => p.id !== action.payload) };

    case 'TOGGLE_PRODUCT':
      return {
        ...state,
        products: state.products.map(p => p.id === action.payload ? { ...p, isActive: !p.isActive } : p)
      };

    // === INVENTORY ===
    case 'ADD_INVENTORY':
      return {
        ...state,
        inventory: [...state.inventory, { ...action.payload, id: generateId('inv'), lastUpdated: new Date().toISOString() }]
      };

    case 'UPDATE_INVENTORY':
      return {
        ...state,
        inventory: state.inventory.map(i =>
          i.id === action.payload.id ? { ...i, ...action.payload, lastUpdated: new Date().toISOString() } : i
        )
      };

    case 'DELETE_INVENTORY':
      return { ...state, inventory: state.inventory.filter(i => i.id !== action.payload) };

    case 'DEDUCT_INVENTORY': {
      // action.payload = [{ inventoryId, quantity }]
      const deductions = action.payload;
      return {
        ...state,
        inventory: state.inventory.map(item => {
          const deduction = deductions.find(d => d.inventoryId === item.id);
          if (deduction) {
            return {
              ...item,
              currentStock: Math.max(0, item.currentStock - deduction.quantity),
              lastUpdated: new Date().toISOString()
            };
          }
          return item;
        })
      };
    }

    case 'BULK_UPDATE_INVENTORY': {
      // action.payload = [{ id, currentStock }]
      const updates = action.payload;
      return {
        ...state,
        inventory: state.inventory.map(item => {
          const update = updates.find(u => u.id === item.id);
          if (update) {
            return { ...item, currentStock: update.currentStock, lastUpdated: new Date().toISOString() };
          }
          return item;
        })
      };
    }

    // === RECIPES ===
    case 'ADD_RECIPE':
      return { ...state, recipes: [...state.recipes, { ...action.payload, id: generateId('recipe') }] };

    case 'UPDATE_RECIPE':
      return {
        ...state,
        recipes: state.recipes.map(r => r.id === action.payload.id ? { ...r, ...action.payload } : r)
      };

    case 'DELETE_RECIPE':
      return { ...state, recipes: state.recipes.filter(r => r.id !== action.payload) };

    // === TRANSACTIONS ===
    case 'ADD_TRANSACTION': {
      const shiftId = state.activeShift ? state.activeShift.id : null;
      return {
        ...state,
        transactions: [...state.transactions, { ...action.payload, id: generateId('txn'), shiftId, timestamp: new Date().toISOString() }]
      };
    }

    // === CATEGORIES ===
    case 'ADD_CATEGORY':
      if (state.categories.includes(action.payload)) return state;
      return { ...state, categories: [...state.categories, action.payload] };

    case 'DELETE_CATEGORY':
      return { ...state, categories: state.categories.filter(c => c !== action.payload) };

    // === STOCK OPNAME ===
    case 'ADD_STOCK_OPNAME':
      return {
        ...state,
        stockOpnameRecords: [...state.stockOpnameRecords, { ...action.payload, id: generateId('opname') }]
      };

    // === OPEN BILLS ===
    case 'SAVE_OPEN_BILL': {
      const existingIndex = state.openBills ? state.openBills.findIndex(b => b.id === action.payload.id) : -1;
      if (existingIndex > -1) {
        return {
          ...state,
          openBills: state.openBills.map(b => b.id === action.payload.id ? { ...b, ...action.payload, timestamp: new Date().toISOString() } : b)
        };
      } else {
        return {
          ...state,
          openBills: [...(state.openBills || []), { ...action.payload, id: generateId('bill'), timestamp: new Date().toISOString() }]
        };
      }
    }

    case 'DELETE_OPEN_BILL':
      return {
        ...state,
        openBills: (state.openBills || []).filter(b => b.id !== action.payload)
      };

    // === USERS ===
    case 'ADD_USER':
      return { ...state, users: [...state.users, { ...action.payload, id: generateId('user') }] };

    case 'UPDATE_USER':
      return {
        ...state,
        users: state.users.map(u => u.id === action.payload.id ? { ...u, ...action.payload } : u)
      };

    case 'DELETE_USER':
      return { ...state, users: state.users.filter(u => u.id !== action.payload) };

    // === NOTIFICATIONS ===
    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [{ ...action.payload, id: generateId('notif'), time: new Date().toISOString() }, ...state.notifications].slice(0, 50)
      };

    case 'CLEAR_NOTIFICATIONS':
      return { ...state, notifications: [] };

    // === SHIFT MANAGEMENT ===
    case 'OPEN_SHIFT':
      return {
        ...state,
        activeShift: {
          ...action.payload,
          id: generateId('shift'),
          openedAt: new Date().toISOString(),
          isOpen: true
        }
      };

    case 'CLOSE_SHIFT': {
      const closedShiftRecord = {
        ...state.activeShift,
        ...action.payload,
        closedAt: new Date().toISOString(),
        isOpen: false
      };
      return {
        ...state,
        activeShift: null,
        closedShifts: [...state.closedShifts, closedShiftRecord]
      };
    }

    // === RESET ===
    case 'RESET_ALL_DATA':
      localStorage.clear();
      return getInitialState();

    default:
      return state;
  }
}

// Provider Component
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, null, getInitialState);

  // Persist state changes to localStorage
  useEffect(() => {
    saveState('products', state.products);
    saveState('inventory', state.inventory);
    saveState('recipes', state.recipes);
    saveState('transactions', state.transactions);
    saveState('categories', state.categories);
    saveState('stockOpnameRecords', state.stockOpnameRecords);
    saveState('openBills', state.openBills);
    saveState('users', state.users);
    saveState('currentUser', state.currentUser);
    saveState('activeShift', state.activeShift);
    saveState('closedShifts', state.closedShifts);
  }, [state.products, state.inventory, state.recipes, state.transactions, state.categories, state.stockOpnameRecords, state.openBills, state.users, state.currentUser, state.activeShift, state.closedShifts]);

  // Auth helpers
  const login = useCallback((username, password) => {
    const user = state.users.find(u => u.username === username && u.password === password);
    if (user) {
      const { password: _, ...safeUser } = user;
      dispatch({ type: 'LOGIN', payload: safeUser });
      return { success: true, user: safeUser };
    }
    return { success: false, error: 'Invalid username or password' };
  }, [state.users]);

  const logout = useCallback(() => {
    dispatch({ type: 'LOGOUT' });
  }, []);

  // Permission check
  const hasPermission = useCallback((permission) => {
    if (!state.currentUser) return false;
    const perms = ROLE_PERMISSIONS[state.currentUser.role];
    return perms ? perms[permission] === true : false;
  }, [state.currentUser]);

  // Transaction with auto-deduction
  const processTransaction = useCallback((transactionData) => {
    // Calculate deductions based on recipes
    const deductions = [];

    for (const item of transactionData.items) {
      const recipe = state.recipes.find(r => r.productId === item.productId);
      if (recipe) {
        for (const ingredient of recipe.ingredients) {
          const existing = deductions.find(d => d.inventoryId === ingredient.inventoryId);
          if (existing) {
            existing.quantity += ingredient.quantity * item.quantity;
          } else {
            deductions.push({
              inventoryId: ingredient.inventoryId,
              quantity: ingredient.quantity * item.quantity
            });
          }
        }
      }
    }

    // Check stock availability
    const insufficientStock = [];
    for (const deduction of deductions) {
      const inventoryItem = state.inventory.find(i => i.id === deduction.inventoryId);
      if (inventoryItem && inventoryItem.currentStock < deduction.quantity) {
        insufficientStock.push({
          name: inventoryItem.name,
          required: deduction.quantity,
          available: inventoryItem.currentStock,
          unit: inventoryItem.unit
        });
      }
    }

    if (insufficientStock.length > 0) {
      return { success: false, error: 'Insufficient stock', insufficientStock };
    }

    // Process
    dispatch({ type: 'ADD_TRANSACTION', payload: transactionData });
    if (deductions.length > 0) {
      dispatch({ type: 'DEDUCT_INVENTORY', payload: deductions });
    }

    // Check for low stock alerts after deduction
    for (const deduction of deductions) {
      const inventoryItem = state.inventory.find(i => i.id === deduction.inventoryId);
      if (inventoryItem) {
        const newStock = inventoryItem.currentStock - deduction.quantity;
        if (newStock <= inventoryItem.minStock) {
          dispatch({
            type: 'ADD_NOTIFICATION',
            payload: {
              type: 'warning',
              title: 'Low Stock Alert',
              message: `${inventoryItem.name} is running low (${newStock} ${inventoryItem.unit} remaining)`
            }
          });
        }
      }
    }

    return { success: true };
  }, [state.recipes, state.inventory]);

  // Recipe cost calculator
  const calculateRecipeCost = useCallback((recipe) => {
    if (!recipe || !recipe.ingredients) return 0;
    return recipe.ingredients.reduce((total, ing) => {
      const invItem = state.inventory.find(i => i.id === ing.inventoryId);
      return total + (invItem ? invItem.costPerUnit * ing.quantity : 0);
    }, 0);
  }, [state.inventory]);

  // Get inventory item by ID
  const getInventoryItem = useCallback((id) => {
    return state.inventory.find(i => i.id === id);
  }, [state.inventory]);

  // Get product by ID
  const getProduct = useCallback((id) => {
    return state.products.find(p => p.id === id);
  }, [state.products]);

  // Get recipe by product ID
  const getRecipeByProduct = useCallback((productId) => {
    return state.recipes.find(r => r.productId === productId);
  }, [state.recipes]);

  // Format currency
  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
  }, []);

  // Shift helpers
  const openShift = useCallback((cashierName, openingCash) => {
    dispatch({
      type: 'OPEN_SHIFT',
      payload: { cashierName, openingCash: parseFloat(openingCash) || 0 }
    });
  }, []);

  const closeShift = useCallback((actualCash, notes) => {
    // Calculate expected cash from transactions in this shift
    const shiftTxns = state.transactions.filter(t => t.shiftId === (state.activeShift ? state.activeShift.id : null));
    const totalCash = shiftTxns.filter(t => t.paymentMethod === 'cash').reduce((s, t) => s + (t.total || 0), 0);
    const totalCard = shiftTxns.filter(t => t.paymentMethod === 'card').reduce((s, t) => s + (t.total || 0), 0);
    const totalEwallet = shiftTxns.filter(t => t.paymentMethod === 'e-wallet').reduce((s, t) => s + (t.total || 0), 0);
    const totalRevenue = totalCash + totalCard + totalEwallet;
    const openingCash = state.activeShift ? state.activeShift.openingCash : 0;
    const expectedCash = openingCash + totalCash;
    const discrepancy = (parseFloat(actualCash) || 0) - expectedCash;

    dispatch({
      type: 'CLOSE_SHIFT',
      payload: {
        actualCash: parseFloat(actualCash) || 0,
        expectedCash,
        discrepancy,
        totalCash,
        totalCard,
        totalEwallet,
        totalRevenue,
        totalTransactions: shiftTxns.length,
        notes: notes || ''
      }
    });
  }, [state.transactions, state.activeShift]);

  const value = {
    ...state,
    dispatch,
    login,
    logout,
    hasPermission,
    processTransaction,
    calculateRecipeCost,
    getInventoryItem,
    getProduct,
    getRecipeByProduct,
    formatCurrency,
    openShift,
    closeShift,
    ROLE_PERMISSIONS,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}

export default AppContext;
