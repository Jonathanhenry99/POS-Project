// Mourden Cafe POS — Seed Data
// Realistic sample data for demonstration

export const DEFAULT_CATEGORIES = [
  'Coffee',
  'Non-Coffee',
  'Tea',
  'Food',
  'Snack',
  'Dessert',
  'Beverage'
];

export const SEED_PRODUCTS = [
  { id: 'prod_001', name: 'Espresso', category: 'Coffee', price: 22000, image: '☕', isActive: true },
  { id: 'prod_002', name: 'Americano', category: 'Coffee', price: 25000, image: '☕', isActive: true },
  { id: 'prod_003', name: 'Cappuccino', category: 'Coffee', price: 30000, image: '☕', isActive: true },
  { id: 'prod_004', name: 'Cafe Latte', category: 'Coffee', price: 32000, image: '🥛', isActive: true },
  { id: 'prod_005', name: 'Mocha Latte', category: 'Coffee', price: 35000, image: '🍫', isActive: true },
  { id: 'prod_006', name: 'Vanilla Latte', category: 'Coffee', price: 35000, image: '🍦', isActive: true },
  { id: 'prod_007', name: 'Caramel Macchiato', category: 'Coffee', price: 38000, image: '🍮', isActive: true },
  { id: 'prod_008', name: 'Matcha Latte', category: 'Non-Coffee', price: 33000, image: '🍵', isActive: true },
  { id: 'prod_009', name: 'Chocolate', category: 'Non-Coffee', price: 30000, image: '🍫', isActive: true },
  { id: 'prod_010', name: 'Taro Latte', category: 'Non-Coffee', price: 32000, image: '🟣', isActive: true },
  { id: 'prod_011', name: 'Lemon Tea', category: 'Tea', price: 22000, image: '🍋', isActive: true },
  { id: 'prod_012', name: 'Earl Grey', category: 'Tea', price: 25000, image: '🫖', isActive: true },
  { id: 'prod_013', name: 'Jasmine Tea', category: 'Tea', price: 22000, image: '🌸', isActive: true },
  { id: 'prod_014', name: 'Croissant', category: 'Food', price: 28000, image: '🥐', isActive: true },
  { id: 'prod_015', name: 'Club Sandwich', category: 'Food', price: 42000, image: '🥪', isActive: true },
  { id: 'prod_016', name: 'Chicken Wrap', category: 'Food', price: 38000, image: '🌯', isActive: true },
  { id: 'prod_017', name: 'French Fries', category: 'Snack', price: 25000, image: '🍟', isActive: true },
  { id: 'prod_018', name: 'Nachos', category: 'Snack', price: 30000, image: '🧀', isActive: true },
  { id: 'prod_019', name: 'Cheesecake', category: 'Dessert', price: 35000, image: '🍰', isActive: true },
  { id: 'prod_020', name: 'Tiramisu', category: 'Dessert', price: 38000, image: '🍮', isActive: true },
  { id: 'prod_021', name: 'Mineral Water', category: 'Beverage', price: 10000, image: '💧', isActive: true },
  { id: 'prod_022', name: 'Orange Juice', category: 'Beverage', price: 25000, image: '🍊', isActive: true },
];

export const SEED_INVENTORY = [
  { id: 'inv_001', name: 'Coffee Beans (Arabica)', unit: 'gram', currentStock: 5000, minStock: 500, costPerUnit: 150, lastUpdated: new Date().toISOString() },
  { id: 'inv_002', name: 'Fresh Milk', unit: 'ml', currentStock: 10000, minStock: 2000, costPerUnit: 25, lastUpdated: new Date().toISOString() },
  { id: 'inv_003', name: 'Water', unit: 'ml', currentStock: 50000, minStock: 5000, costPerUnit: 2, lastUpdated: new Date().toISOString() },
  { id: 'inv_004', name: 'Sugar', unit: 'gram', currentStock: 3000, minStock: 500, costPerUnit: 15, lastUpdated: new Date().toISOString() },
  { id: 'inv_005', name: 'Chocolate Syrup', unit: 'ml', currentStock: 2000, minStock: 300, costPerUnit: 80, lastUpdated: new Date().toISOString() },
  { id: 'inv_006', name: 'Vanilla Syrup', unit: 'ml', currentStock: 1500, minStock: 300, costPerUnit: 90, lastUpdated: new Date().toISOString() },
  { id: 'inv_007', name: 'Caramel Syrup', unit: 'ml', currentStock: 1500, minStock: 300, costPerUnit: 90, lastUpdated: new Date().toISOString() },
  { id: 'inv_008', name: 'Matcha Powder', unit: 'gram', currentStock: 800, minStock: 150, costPerUnit: 350, lastUpdated: new Date().toISOString() },
  { id: 'inv_009', name: 'Cocoa Powder', unit: 'gram', currentStock: 1000, minStock: 200, costPerUnit: 120, lastUpdated: new Date().toISOString() },
  { id: 'inv_010', name: 'Taro Powder', unit: 'gram', currentStock: 1000, minStock: 200, costPerUnit: 180, lastUpdated: new Date().toISOString() },
  { id: 'inv_011', name: 'Tea Bags (Lemon)', unit: 'pcs', currentStock: 100, minStock: 20, costPerUnit: 500, lastUpdated: new Date().toISOString() },
  { id: 'inv_012', name: 'Tea Bags (Earl Grey)', unit: 'pcs', currentStock: 80, minStock: 20, costPerUnit: 600, lastUpdated: new Date().toISOString() },
  { id: 'inv_013', name: 'Tea Bags (Jasmine)', unit: 'pcs', currentStock: 90, minStock: 20, costPerUnit: 500, lastUpdated: new Date().toISOString() },
  { id: 'inv_014', name: 'Lemon', unit: 'pcs', currentStock: 30, minStock: 10, costPerUnit: 3000, lastUpdated: new Date().toISOString() },
  { id: 'inv_015', name: 'Croissant (Frozen)', unit: 'pcs', currentStock: 25, minStock: 10, costPerUnit: 8000, lastUpdated: new Date().toISOString() },
  { id: 'inv_016', name: 'Bread Loaf', unit: 'pcs', currentStock: 15, minStock: 5, costPerUnit: 15000, lastUpdated: new Date().toISOString() },
  { id: 'inv_017', name: 'Chicken Breast', unit: 'gram', currentStock: 3000, minStock: 500, costPerUnit: 65, lastUpdated: new Date().toISOString() },
  { id: 'inv_018', name: 'Cheese Slice', unit: 'pcs', currentStock: 50, minStock: 15, costPerUnit: 3500, lastUpdated: new Date().toISOString() },
  { id: 'inv_019', name: 'Potato (Frozen Fries)', unit: 'gram', currentStock: 5000, minStock: 1000, costPerUnit: 30, lastUpdated: new Date().toISOString() },
  { id: 'inv_020', name: 'Tortilla Chips', unit: 'gram', currentStock: 2000, minStock: 500, costPerUnit: 60, lastUpdated: new Date().toISOString() },
  { id: 'inv_021', name: 'Cream Cheese', unit: 'gram', currentStock: 1500, minStock: 300, costPerUnit: 100, lastUpdated: new Date().toISOString() },
  { id: 'inv_022', name: 'Mascarpone', unit: 'gram', currentStock: 1000, minStock: 200, costPerUnit: 150, lastUpdated: new Date().toISOString() },
  { id: 'inv_023', name: 'Orange (Fresh)', unit: 'pcs', currentStock: 20, minStock: 8, costPerUnit: 5000, lastUpdated: new Date().toISOString() },
  { id: 'inv_024', name: 'Mineral Water Bottle', unit: 'pcs', currentStock: 48, minStock: 12, costPerUnit: 3000, lastUpdated: new Date().toISOString() },
  { id: 'inv_025', name: 'Whipped Cream', unit: 'ml', currentStock: 2000, minStock: 500, costPerUnit: 50, lastUpdated: new Date().toISOString() },
  { id: 'inv_026', name: 'Tortilla Wrap', unit: 'pcs', currentStock: 20, minStock: 8, costPerUnit: 5000, lastUpdated: new Date().toISOString() },
  { id: 'inv_027', name: 'Lettuce', unit: 'gram', currentStock: 1000, minStock: 300, costPerUnit: 40, lastUpdated: new Date().toISOString() },
  { id: 'inv_028', name: 'Salsa Sauce', unit: 'ml', currentStock: 1500, minStock: 300, costPerUnit: 60, lastUpdated: new Date().toISOString() },
];

export const SEED_RECIPES = [
  { id: 'recipe_001', productId: 'prod_001', ingredients: [
    { inventoryId: 'inv_001', quantity: 18, unit: 'gram' },
    { inventoryId: 'inv_003', quantity: 30, unit: 'ml' },
  ]},
  { id: 'recipe_002', productId: 'prod_002', ingredients: [
    { inventoryId: 'inv_001', quantity: 18, unit: 'gram' },
    { inventoryId: 'inv_003', quantity: 200, unit: 'ml' },
  ]},
  { id: 'recipe_003', productId: 'prod_003', ingredients: [
    { inventoryId: 'inv_001', quantity: 18, unit: 'gram' },
    { inventoryId: 'inv_002', quantity: 150, unit: 'ml' },
    { inventoryId: 'inv_003', quantity: 30, unit: 'ml' },
  ]},
  { id: 'recipe_004', productId: 'prod_004', ingredients: [
    { inventoryId: 'inv_001', quantity: 18, unit: 'gram' },
    { inventoryId: 'inv_002', quantity: 200, unit: 'ml' },
    { inventoryId: 'inv_003', quantity: 30, unit: 'ml' },
  ]},
  { id: 'recipe_005', productId: 'prod_005', ingredients: [
    { inventoryId: 'inv_001', quantity: 18, unit: 'gram' },
    { inventoryId: 'inv_002', quantity: 180, unit: 'ml' },
    { inventoryId: 'inv_005', quantity: 30, unit: 'ml' },
    { inventoryId: 'inv_025', quantity: 20, unit: 'ml' },
  ]},
  { id: 'recipe_006', productId: 'prod_006', ingredients: [
    { inventoryId: 'inv_001', quantity: 18, unit: 'gram' },
    { inventoryId: 'inv_002', quantity: 180, unit: 'ml' },
    { inventoryId: 'inv_006', quantity: 30, unit: 'ml' },
  ]},
  { id: 'recipe_007', productId: 'prod_007', ingredients: [
    { inventoryId: 'inv_001', quantity: 18, unit: 'gram' },
    { inventoryId: 'inv_002', quantity: 180, unit: 'ml' },
    { inventoryId: 'inv_007', quantity: 30, unit: 'ml' },
    { inventoryId: 'inv_006', quantity: 10, unit: 'ml' },
  ]},
  { id: 'recipe_008', productId: 'prod_008', ingredients: [
    { inventoryId: 'inv_008', quantity: 15, unit: 'gram' },
    { inventoryId: 'inv_002', quantity: 200, unit: 'ml' },
    { inventoryId: 'inv_004', quantity: 10, unit: 'gram' },
  ]},
  { id: 'recipe_009', productId: 'prod_009', ingredients: [
    { inventoryId: 'inv_009', quantity: 25, unit: 'gram' },
    { inventoryId: 'inv_002', quantity: 200, unit: 'ml' },
    { inventoryId: 'inv_004', quantity: 15, unit: 'gram' },
  ]},
  { id: 'recipe_010', productId: 'prod_010', ingredients: [
    { inventoryId: 'inv_010', quantity: 25, unit: 'gram' },
    { inventoryId: 'inv_002', quantity: 200, unit: 'ml' },
    { inventoryId: 'inv_004', quantity: 10, unit: 'gram' },
  ]},
  { id: 'recipe_011', productId: 'prod_011', ingredients: [
    { inventoryId: 'inv_011', quantity: 1, unit: 'pcs' },
    { inventoryId: 'inv_014', quantity: 1, unit: 'pcs' },
    { inventoryId: 'inv_003', quantity: 250, unit: 'ml' },
    { inventoryId: 'inv_004', quantity: 15, unit: 'gram' },
  ]},
  { id: 'recipe_012', productId: 'prod_012', ingredients: [
    { inventoryId: 'inv_012', quantity: 1, unit: 'pcs' },
    { inventoryId: 'inv_003', quantity: 250, unit: 'ml' },
  ]},
  { id: 'recipe_013', productId: 'prod_013', ingredients: [
    { inventoryId: 'inv_013', quantity: 1, unit: 'pcs' },
    { inventoryId: 'inv_003', quantity: 250, unit: 'ml' },
  ]},
  { id: 'recipe_014', productId: 'prod_014', ingredients: [
    { inventoryId: 'inv_015', quantity: 1, unit: 'pcs' },
  ]},
  { id: 'recipe_015', productId: 'prod_015', ingredients: [
    { inventoryId: 'inv_016', quantity: 1, unit: 'pcs' },
    { inventoryId: 'inv_017', quantity: 100, unit: 'gram' },
    { inventoryId: 'inv_018', quantity: 2, unit: 'pcs' },
    { inventoryId: 'inv_027', quantity: 30, unit: 'gram' },
  ]},
  { id: 'recipe_016', productId: 'prod_016', ingredients: [
    { inventoryId: 'inv_026', quantity: 1, unit: 'pcs' },
    { inventoryId: 'inv_017', quantity: 80, unit: 'gram' },
    { inventoryId: 'inv_027', quantity: 20, unit: 'gram' },
    { inventoryId: 'inv_028', quantity: 20, unit: 'ml' },
  ]},
  { id: 'recipe_017', productId: 'prod_017', ingredients: [
    { inventoryId: 'inv_019', quantity: 200, unit: 'gram' },
  ]},
  { id: 'recipe_018', productId: 'prod_018', ingredients: [
    { inventoryId: 'inv_020', quantity: 100, unit: 'gram' },
    { inventoryId: 'inv_018', quantity: 2, unit: 'pcs' },
    { inventoryId: 'inv_028', quantity: 30, unit: 'ml' },
  ]},
  { id: 'recipe_019', productId: 'prod_019', ingredients: [
    { inventoryId: 'inv_021', quantity: 100, unit: 'gram' },
    { inventoryId: 'inv_004', quantity: 30, unit: 'gram' },
  ]},
  { id: 'recipe_020', productId: 'prod_020', ingredients: [
    { inventoryId: 'inv_022', quantity: 80, unit: 'gram' },
    { inventoryId: 'inv_001', quantity: 5, unit: 'gram' },
    { inventoryId: 'inv_004', quantity: 20, unit: 'gram' },
  ]},
  { id: 'recipe_021', productId: 'prod_021', ingredients: [
    { inventoryId: 'inv_024', quantity: 1, unit: 'pcs' },
  ]},
  { id: 'recipe_022', productId: 'prod_022', ingredients: [
    { inventoryId: 'inv_023', quantity: 2, unit: 'pcs' },
    { inventoryId: 'inv_004', quantity: 10, unit: 'gram' },
  ]},
];

// Generate sample transactions for the past 7 days
function generateSampleTransactions() {
  const transactions = [];
  const now = new Date();
  const products = SEED_PRODUCTS;
  const paymentMethods = ['cash', 'card', 'e-wallet'];

  let txnId = 1;
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const day = new Date(now);
    day.setDate(day.getDate() - daysAgo);
    
    // Random number of transactions per day (8-20)
    const numTxns = Math.floor(Math.random() * 13) + 8;
    
    for (let i = 0; i < numTxns; i++) {
      const hour = 8 + Math.floor(Math.random() * 12); // 8am - 8pm
      const minute = Math.floor(Math.random() * 60);
      const txnDate = new Date(day);
      txnDate.setHours(hour, minute, 0, 0);

      // Random items (1-4)
      const numItems = Math.floor(Math.random() * 4) + 1;
      const items = [];
      const usedProducts = new Set();

      for (let j = 0; j < numItems; j++) {
        let product;
        do {
          product = products[Math.floor(Math.random() * products.length)];
        } while (usedProducts.has(product.id));
        usedProducts.add(product.id);

        const qty = Math.floor(Math.random() * 3) + 1;
        items.push({
          productId: product.id,
          productName: product.name,
          quantity: qty,
          price: product.price,
          subtotal: product.price * qty
        });
      }

      const total = items.reduce((sum, item) => sum + item.subtotal, 0);
      const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
      const cashReceived = paymentMethod === 'cash' ? Math.ceil(total / 10000) * 10000 + (Math.random() > 0.5 ? 10000 : 0) : total;

      transactions.push({
        id: `txn_${String(txnId++).padStart(4, '0')}`,
        items,
        total,
        paymentMethod,
        cashReceived,
        change: cashReceived - total,
        timestamp: txnDate.toISOString(),
        cashierName: 'Admin'
      });
    }
  }

  return transactions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

export const SEED_TRANSACTIONS = generateSampleTransactions();

export const SEED_USERS = [
  { id: 'user_001', username: 'owner', password: 'owner123', name: 'Owner Mourden', role: 'owner' },
  { id: 'user_002', username: 'cashier', password: 'cashier123', name: 'Cashier 1', role: 'cashier' },
];

// Role permissions
export const ROLE_PERMISSIONS = {
  owner: {
    dashboard: true,
    pos: true,
    menu: true,
    recipe: true,
    inventory: true,
    stockOpname: true,
    categories: true,
    users: true,
    reports: true,
    settings: true,
    salesHistory: true,
    shiftManagement: true,
    printerSettings: true,
  },
  cashier: {
    dashboard: false,
    pos: true,
    menu: false,
    recipe: false,
    inventory: false,
    stockOpname: false,
    categories: false,
    users: false,
    reports: false,
    settings: false,
    salesHistory: true,
    shiftManagement: true,
    printerSettings: true,
  }
};
