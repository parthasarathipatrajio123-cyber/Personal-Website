/* ==========================================================================
   LocalBiz OS — Core
   Loaded (in <head>) by every page. Provides the global `LB` namespace:
   storage, demo data, formatting, business calculations, UI helpers
   (toasts, confirm dialogs, tooltips, pagination), theme, auth guard,
   invoice rendering and the app shell (sidebar + topbar).
   All data is demo data kept in this browser's localStorage.
   ========================================================================== */
(function (window, document) {
  'use strict';

  const KEYS = {
    products: 'lb_products',
    customers: 'lb_customers',
    sales: 'lb_sales',
    expenses: 'lb_expenses',
    payments: 'lb_payments',
    settings: 'lb_settings',
    user: 'lb_user',
    session: 'lb_session',
    seeded: 'lb_seeded_v1',
    ui: 'lb_ui',
    flash: 'lb_flash'
  };

  /* ------------------------------------------------------------------
     Storage
     ------------------------------------------------------------------ */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        console.warn('LocalBiz OS: could not save to localStorage.', err);
      }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (err) { /* storage unavailable */ }
    }
  };

  /** Collection helpers. Every write fires `lb:data` so the shell can refresh badges. */
  const db = {
    all(name) { return store.get(KEYS[name], []); },
    save(name, list) {
      store.set(KEYS[name], list);
      document.dispatchEvent(new CustomEvent('lb:data', { detail: { name } }));
    },
    get(name, id) { return db.all(name).find((item) => item.id === id) || null; },
    upsert(name, item) {
      const list = db.all(name);
      const index = list.findIndex((x) => x.id === item.id);
      if (index > -1) list[index] = item; else list.unshift(item);
      db.save(name, list);
      return item;
    },
    remove(name, id) { db.save(name, db.all(name).filter((item) => item.id !== id)); }
  };

  const uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  /* ------------------------------------------------------------------
     Dates — stored as local 'YYYY-MM-DD' strings
     ------------------------------------------------------------------ */
  const pad = (n) => String(n).padStart(2, '0');
  const date = {
    iso(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    today() { return date.iso(new Date()); },
    parse(iso) {
      const [y, m, d] = String(iso).split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    },
    add(iso, days) {
      const d = date.parse(iso);
      d.setDate(d.getDate() + days);
      return date.iso(d);
    },
    /** Whole days from b to a (a − b). */
    diff(a, b) { return Math.round((date.parse(a) - date.parse(b)) / 86400000); },
    format(iso, options) {
      if (!iso) return '—';
      return date.parse(iso).toLocaleDateString('en-IN', options || { day: '2-digit', month: 'short', year: 'numeric' });
    },
    short(iso) { return date.format(iso, { day: 'numeric', month: 'short' }); },
    relative(iso) {
      const days = date.diff(date.today(), iso);
      if (days === 0) return 'Today';
      if (days === 1) return 'Yesterday';
      if (days > 1 && days < 7) return `${days} days ago`;
      return date.format(iso);
    },
    startOfMonth(iso) { return String(iso).slice(0, 8) + '01'; },
    inRange(iso, from, to) { return (!from || iso >= from) && (!to || iso <= to); }
  };

  /* ------------------------------------------------------------------
     Settings, theme & currency
     ------------------------------------------------------------------ */
  const DEFAULT_SETTINGS = {
    businessName: 'Sunrise General Store',
    ownerName: 'Demo Owner',
    phone: '+91 98300 00000',
    email: 'demo@localbiz.app',
    address: '12 Park Street, Kolkata, West Bengal 700016',
    businessType: 'Grocery',
    taxRate: 5,
    theme: 'light',
    currency: 'INR',
    notifications: { lowStock: true, paymentReminders: true, dailySummary: true }
  };

  function settings() {
    const saved = store.get(KEYS.settings, {});
    return Object.assign({}, DEFAULT_SETTINGS, saved, {
      notifications: Object.assign({}, DEFAULT_SETTINGS.notifications, saved.notifications || {})
    });
  }

  function saveSettings(patch) {
    const next = Object.assign(settings(), patch);
    store.set(KEYS.settings, next);
    document.dispatchEvent(new CustomEvent('lb:settings', { detail: next }));
    return next;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme === 'dark' ? 'dark' : 'light');
  }

  const CURRENCIES = {
    INR: { locale: 'en-IN', symbol: '₹', label: 'Indian Rupee' },
    USD: { locale: 'en-US', symbol: '$', label: 'US Dollar' },
    EUR: { locale: 'en-IE', symbol: '€', label: 'Euro' }
  };

  /**
   * Format a money value in the selected display currency.
   * Values are not converted — the currency setting only changes the display.
   * options.round → no decimals, options.compact → 1.2L / 12K style.
   */
  function money(value, options = {}) {
    const code = CURRENCIES[settings().currency] ? settings().currency : 'INR';
    const n = Number(value) || 0;
    const fmt = { style: 'currency', currency: code };
    if (options.compact) {
      // Hand-rolled so INR uses K / L (lakh) / Cr (crore) consistently across browsers.
      const abs = Math.abs(n);
      const units = code === 'INR' ? [[1e7, 'Cr'], [1e5, 'L'], [1e3, 'K']] : [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
      const unit = units.find(([size]) => abs >= size);
      if (!unit) return new Intl.NumberFormat(CURRENCIES[code].locale, { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(n);
      const short = Number((abs / unit[0]).toFixed(1));
      return `${n < 0 ? '−' : ''}${CURRENCIES[code].symbol}${short}${unit[1]}`;
    } else if (options.round) {
      fmt.maximumFractionDigits = 0;
    } else {
      fmt.minimumFractionDigits = 2;
      fmt.maximumFractionDigits = 2;
    }
    return new Intl.NumberFormat(CURRENCIES[code].locale, fmt).format(n);
  }

  const num = (value) => new Intl.NumberFormat('en-IN').format(Number(value) || 0);
  const pct = (value, digits = 1) => `${(Number(value) || 0).toFixed(digits)}%`;

  /* ------------------------------------------------------------------
     Domain metadata
     ------------------------------------------------------------------ */
  const PRODUCT_CATEGORIES = {
    Grocery: { icon: 'bi-basket2', tone: 'tone-success' },
    Beverages: { icon: 'bi-cup-hot', tone: 'tone-warning' },
    Household: { icon: 'bi-house-door', tone: 'tone-info' },
    Stationery: { icon: 'bi-journal-text', tone: 'tone-accent' },
    Electronics: { icon: 'bi-lightning-charge', tone: 'tone-warning' },
    'Personal Care': { icon: 'bi-droplet', tone: 'tone-info' },
    Clothing: { icon: 'bi-bag', tone: 'tone-accent' },
    Services: { icon: 'bi-tools', tone: 'tone-neutral' },
    Other: { icon: 'bi-box', tone: 'tone-neutral' }
  };

  const EXPENSE_CATEGORIES = {
    Rent: { icon: 'bi-building', color: '#5b5bd6' },
    Electricity: { icon: 'bi-lightning-charge', color: '#f59e0b' },
    Salary: { icon: 'bi-person-badge', color: '#0ea5e9' },
    Transport: { icon: 'bi-truck', color: '#10b981' },
    Supplier: { icon: 'bi-box-seam', color: '#8b5cf6' },
    Marketing: { icon: 'bi-megaphone', color: '#ec4899' },
    Maintenance: { icon: 'bi-wrench-adjustable', color: '#ef4444' },
    Other: { icon: 'bi-three-dots', color: '#64748b' }
  };

  const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Credit'];
  const BUSINESS_TYPES = ['Grocery', 'Retail', 'Clothing', 'Electronics', 'Stationery', 'Salon', 'Repair Shop', 'Service Business', 'Other'];

  /* ------------------------------------------------------------------
     Business calculations
     ------------------------------------------------------------------ */

  /** Discount is applied on the subtotal, tax on the discounted amount. */
  function calcTotals(items, discountPct = 0, taxPct = 0) {
    const subtotal = round2(items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.price) || 0), 0));
    const discount = round2(subtotal * (Number(discountPct) || 0) / 100);
    const tax = round2((subtotal - discount) * (Number(taxPct) || 0) / 100);
    return { subtotal, discount, tax, total: round2(subtotal - discount + tax) };
  }

  function productStatus(p) {
    if (Number(p.stock) <= 0) return 'Out of stock';
    if (Number(p.stock) <= Number(p.minStock)) return 'Low stock';
    return 'In stock';
  }
  const isLowStock = (p) => Number(p.stock) <= Number(p.minStock);

  const sales = {
    due(s) { return Math.max(0, round2(s.total - (Number(s.paid) || 0))); },

    /** Paid → Overdue (past due date) → Partial → Pending. */
    status(s) {
      if (sales.due(s) <= 0) return 'Paid';
      if (s.dueDate && s.dueDate < date.today()) return 'Overdue';
      if ((Number(s.paid) || 0) > 0) return 'Partial';
      return 'Pending';
    },

    customerName(s) {
      const c = db.get('customers', s.customerId);
      return c ? c.name : (s.customerName || 'Walk-in customer');
    },

    nextInvoiceNo() {
      const highest = db.all('sales').reduce((max, s) => Math.max(max, parseInt(String(s.invoiceNo).replace(/\D/g, ''), 10) || 0), 1000);
      return `INV-${highest + 1}`;
    },

    /**
     * Create a sale/invoice: validates stock, reduces inventory,
     * logs the initial payment and saves everything.
     * Returns { ok, sale } or { ok:false, error }.
     */
    create(data) {
      const products = db.all('products');
      const items = [];
      for (const line of data.items) {
        const product = products.find((p) => p.id === line.productId);
        if (!product) return { ok: false, error: 'Please choose a valid product.' };
        const qty = Math.floor(Number(line.qty));
        if (!(qty > 0)) return { ok: false, error: `Enter a quantity for ${product.name}.` };
        const alreadyUsed = items.filter((i) => i.productId === product.id).reduce((n, i) => n + i.qty, 0);
        if (qty + alreadyUsed > Number(product.stock)) {
          return { ok: false, error: `Only ${product.stock} unit(s) of ${product.name} in stock.` };
        }
        items.push({ productId: product.id, name: product.name, qty, price: round2(line.price), cost: Number(product.purchasePrice) || 0 });
      }
      if (!items.length) return { ok: false, error: 'Add at least one product.' };

      const totals = calcTotals(items, data.discountPct, data.taxPct);
      let paid = 0;
      if (data.paymentStatus === 'Paid') paid = totals.total;
      else if (data.paymentStatus === 'Partial') paid = Math.min(round2(data.amountPaid), totals.total);
      if (data.paymentStatus === 'Partial' && !(paid > 0 && paid < totals.total)) {
        return { ok: false, error: 'Partial amount must be more than zero and less than the grand total.' };
      }

      const customer = db.get('customers', data.customerId);
      const saleDate = data.date || date.today();
      const sale = Object.assign({
        id: uid('s_'),
        invoiceNo: sales.nextInvoiceNo(),
        customerId: data.customerId,
        customerName: customer ? customer.name : 'Walk-in customer',
        items,
        discountPct: Number(data.discountPct) || 0,
        taxPct: Number(data.taxPct) || 0,
        paid,
        method: data.method || 'Cash',
        date: saleDate,
        dueDate: data.dueDate || date.add(saleDate, 15),
        notes: data.notes || '',
        createdAt: Date.now()
      }, totals);

      // Reduce stock for every line item.
      items.forEach((line) => {
        const product = products.find((p) => p.id === line.productId);
        product.stock = Number(product.stock) - line.qty;
      });
      db.save('products', products);
      db.upsert('sales', sale);

      if (paid > 0) {
        db.upsert('payments', { id: uid('pay_'), saleId: sale.id, invoiceNo: sale.invoiceNo, customerId: sale.customerId, amount: paid, method: sale.method === 'Credit' ? 'Cash' : sale.method, date: saleDate, note: 'Paid at time of sale', createdAt: Date.now() });
      }
      return { ok: true, sale };
    },

    /** Delete a sale, return its items to stock and drop its payment records. */
    remove(id) {
      const sale = db.get('sales', id);
      if (!sale) return;
      const products = db.all('products');
      sale.items.forEach((line) => {
        const product = products.find((p) => p.id === line.productId);
        if (product) product.stock = Number(product.stock) + Number(line.qty);
      });
      db.save('products', products);
      db.save('payments', db.all('payments').filter((p) => p.saleId !== id));
      db.remove('sales', id);
    }
  };

  /** Aggregate numbers used by the dashboard and reports. */
  function summarize(from, to) {
    const saleList = db.all('sales').filter((s) => date.inRange(s.date, from, to));
    const expenseList = db.all('expenses').filter((e) => date.inRange(e.date, from, to));
    const revenue = round2(saleList.reduce((n, s) => n + s.total, 0));
    const expenses = round2(expenseList.reduce((n, e) => n + Number(e.amount), 0));
    const collected = round2(saleList.reduce((n, s) => n + (Number(s.paid) || 0), 0));
    return { sales: saleList, expenseList, revenue, expenses, profit: round2(revenue - expenses), collected, orders: saleList.length };
  }

  /* ------------------------------------------------------------------
     Demo data (generated once, relative to today, deterministic)
     ------------------------------------------------------------------ */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildDemoData() {
    const rand = mulberry32(20260926);
    const between = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const today = date.today();

    const products = [
      ['p1', 'Premium Rice (5 kg)', 'Grocery', 'GR-1001', 42, 10, 520, 640],
      ['p2', 'Cooking Oil (1 L)', 'Grocery', 'GR-1002', 8, 12, 145, 175],
      ['p3', 'Organic Sugar (1 kg)', 'Grocery', 'GR-1003', 55, 10, 48, 62],
      ['p4', 'Tea Pack (500 g)', 'Beverages', 'BV-2001', 6, 10, 180, 240],
      ['p5', 'Detergent Powder (1 kg)', 'Household', 'HH-3001', 30, 8, 95, 128],
      ['p6', 'Notebook (A5, 200 pages)', 'Stationery', 'ST-4001', 120, 25, 32, 55],
      ['p7', 'LED Bulb (9 W)', 'Electronics', 'EL-5001', 4, 10, 75, 120],
      ['p8', 'Ballpoint Pens (Pack of 10)', 'Stationery', 'ST-4002', 64, 20, 40, 70],
      ['p9', 'Herbal Toothpaste (150 g)', 'Personal Care', 'PC-6001', 18, 10, 72, 99],
      ['p10', 'Extension Board (4-way)', 'Electronics', 'EL-5002', 0, 5, 210, 299],
      ['p11', 'Masoor Dal (1 kg)', 'Grocery', 'GR-1004', 36, 10, 95, 118],
      ['p12', 'Instant Coffee (100 g)', 'Beverages', 'BV-2002', 22, 8, 210, 275]
    ].map(([id, name, category, sku, stock, minStock, purchasePrice, sellingPrice]) => ({
      id, name, category, sku, stock, minStock, purchasePrice, sellingPrice,
      description: '', createdAt: date.add(today, -130)
    }));

    const customers = [
      ['c1', 'Rahul Das', '+91 98300 11245', 'rahul.das@example.com', 'Salt Lake, Kolkata', -125],
      ['c2', 'Ananya Roy', '+91 98311 20457', 'ananya.roy@example.com', 'Ballygunge, Kolkata', -120],
      ['c3', 'Arjun Sen', '+91 90070 33218', 'arjun.sen@example.com', 'Behala, Kolkata', -110],
      ['c4', 'Priya Sharma', '+91 98740 44192', 'priya.sharma@example.com', 'New Town, Kolkata', -104],
      ['c5', 'Vikram Mehta', '+91 99030 55871', 'vikram.mehta@example.com', 'Howrah', -96],
      ['c6', 'Sneha Patel', '+91 98365 61230', 'sneha.patel@example.com', 'Park Circus, Kolkata', -80],
      ['c7', 'Karan Malhotra', '+91 97480 72914', 'karan.m@example.com', 'Dum Dum, Kolkata', -64],
      ['c8', 'Meera Iyer', '+91 98040 83356', 'meera.iyer@example.com', 'Jadavpur, Kolkata', -45],
      ['c9', 'Rohan Gupta', '+91 90510 94420', 'rohan.gupta@example.com', 'Garia, Kolkata', -18],
      ['c10', 'Kavya Nair', '+91 98302 15678', 'kavya.nair@example.com', 'Tollygunge, Kolkata', -9]
    ].map(([id, name, phone, email, address, offset]) => ({
      id, name, phone, email, address, status: 'Active', notes: '', createdAt: date.add(today, offset)
    }));
    customers.find((c) => c.id === 'c5').status = 'Inactive';

    // Sales for the last 90 days.
    const salesList = [];
    for (let offset = -89; offset <= 0; offset++) {
      const day = date.add(today, offset);
      const weekday = date.parse(day).getDay();
      let count = between(0, 3) + (weekday === 0 || weekday === 6 ? 1 : 0);
      if (offset === 0) count = 3;
      for (let k = 0; k < count; k++) {
        const eligible = customers.filter((c) => c.createdAt <= day && c.status === 'Active' || (c.id === 'c5' && offset < -40));
        const customer = pick(eligible.length ? eligible : customers);
        const lines = between(1, 3);
        const items = [];
        for (let l = 0; l < lines; l++) {
          const product = pick(products);
          if (items.some((i) => i.productId === product.id)) continue;
          const qty = product.sellingPrice > 250 ? between(1, 2) : between(1, 5);
          items.push({ productId: product.id, name: product.name, qty, price: product.sellingPrice, cost: product.purchasePrice });
        }
        const discountPct = pick([0, 0, 0, 5, 10]);
        const taxPct = 5;
        const totals = calcTotals(items, discountPct, taxPct);
        const age = -offset;
        const r = rand();
        let paymentStatus = 'Paid';
        if (age > 20) paymentStatus = r < 0.95 ? 'Paid' : (r < 0.975 ? 'Partial' : 'Pending');
        else paymentStatus = r < 0.62 ? 'Paid' : (r < 0.82 ? 'Partial' : 'Pending');
        const paid = paymentStatus === 'Paid' ? totals.total : paymentStatus === 'Partial' ? round2(totals.total * pick([0.3, 0.5, 0.6])) : 0;
        const method = paymentStatus === 'Pending' ? 'Credit' : pick(['Cash', 'UPI', 'UPI', 'Card', 'Cash']);
        salesList.push(Object.assign({
          id: `s${salesList.length + 1}`,
          customerId: customer.id,
          customerName: customer.name,
          items, discountPct, taxPct, paid, method,
          date: day,
          dueDate: date.add(day, 15),
          notes: '',
          createdAt: date.parse(day).getTime() + k * 3600000
        }, totals));
      }
    }
    salesList.forEach((s, i) => { s.invoiceNo = `INV-${1001 + i}`; });

    const payments = salesList.filter((s) => s.paid > 0).map((s, i) => ({
      id: `pay${i + 1}`, saleId: s.id, invoiceNo: s.invoiceNo, customerId: s.customerId,
      amount: s.paid, method: s.method === 'Credit' ? 'Cash' : s.method, date: s.date,
      note: 'Paid at time of sale', createdAt: s.createdAt
    }));

    // Expenses for the same 90-day window.
    const expenses = [];
    const addExpense = (name, category, amount, day, method) => {
      expenses.push({ id: `e${expenses.length + 1}`, name, category, amount, date: day, method, notes: '', createdAt: date.parse(day).getTime() });
    };
    for (let offset = -89; offset <= 0; offset++) {
      const day = date.add(today, offset);
      const dom = date.parse(day).getDate();
      const month = date.format(day, { month: 'long' });
      if (dom === 1) {
        addExpense(`Shop rent — ${month}`, 'Rent', 9000, day, 'Bank Transfer');
        addExpense(`Helper salary — ${month}`, 'Salary', 7000, day, 'Bank Transfer');
      }
      if (dom === 6) addExpense(`Electricity bill — ${month}`, 'Electricity', between(21, 32) * 100, day, 'UPI');
      if (dom === 10 || dom === 24) addExpense('Wholesale stock purchase', 'Supplier', between(40, 75) * 100, day, 'Bank Transfer');
      if (offset % 8 === 0) addExpense('Delivery & auto fare', 'Transport', between(25, 80) * 10, day, 'Cash');
      if (offset === -70 || offset === -25) addExpense('Printed pamphlets & banner', 'Marketing', between(12, 20) * 100, day, 'UPI');
      if (offset === -52) addExpense('Refrigerator servicing', 'Maintenance', 1850, day, 'Cash');
      if (offset === -12) addExpense('Shelf repair', 'Maintenance', 950, day, 'Cash');
      if (offset === -33 || offset === -4) addExpense('Cleaning supplies', 'Other', between(3, 7) * 100, day, 'Cash');
    }

    return { products, customers, sales: salesList, payments, expenses };
  }

  function seedDemoData() {
    const data = buildDemoData();
    ['products', 'customers', 'sales', 'payments', 'expenses'].forEach((name) => store.set(KEYS[name], data[name]));
    store.set(KEYS.seeded, { at: Date.now() });
  }

  function resetDemoData() {
    seedDemoData();
    document.dispatchEvent(new CustomEvent('lb:data', { detail: { name: 'all' } }));
  }

  /* ------------------------------------------------------------------
     Auth (demo only — no real authentication)
     ------------------------------------------------------------------ */
  const auth = {
    session() {
      const local = store.get(KEYS.session, null);
      if (local) return local;
      try { return JSON.parse(sessionStorage.getItem(KEYS.session) || 'null'); } catch (err) { return null; }
    },
    signIn(email, remember) {
      const session = { email, at: Date.now() };
      auth.clear();
      if (remember) store.set(KEYS.session, session);
      else { try { sessionStorage.setItem(KEYS.session, JSON.stringify(session)); } catch (err) { store.set(KEYS.session, session); } }
    },
    clear() {
      store.remove(KEYS.session);
      try { sessionStorage.removeItem(KEYS.session); } catch (err) { /* ignore */ }
    },
    signOut() {
      auth.clear();
      flash('You have been signed out.', 'info');
      window.location.href = 'login.html';
    },
    user() { return store.get(KEYS.user, null); },
    saveUser(user) { store.set(KEYS.user, user); }
  };

  /* ------------------------------------------------------------------
     Small DOM & formatting helpers
     ------------------------------------------------------------------ */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const param = (name) => new URLSearchParams(window.location.search).get(name);

  /** Remove one-off query params (e.g. ?action=new) so a refresh doesn't repeat them. */
  function clearParams(...names) {
    const url = new URL(window.location.href);
    names.forEach((n) => url.searchParams.delete(n));
    window.history.replaceState({}, '', url.pathname.split('/').pop() + url.search + url.hash);
  }

  function debounce(fn, wait = 150) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  function avatarTone(name) {
    let hash = 0;
    for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return `tone-${(hash % 6) + 1}`;
  }

  const avatar = (name, size = '') => `<span class="avatar ${size} ${avatarTone(name)}" aria-hidden="true">${esc(initials(name))}</span>`;

  const STATUS_CLASS = {
    Paid: 'status-paid', Partial: 'status-partial', Pending: 'status-pending', Overdue: 'status-overdue',
    Active: 'status-active', Inactive: 'status-inactive',
    'In stock': 'status-instock', 'Low stock': 'status-low', 'Out of stock': 'status-out'
  };
  const badge = (status) => `<span class="status-badge ${STATUS_CLASS[status] || 'status-inactive'}">${esc(status)}</span>`;

  function options(list, selected, placeholder) {
    const head = placeholder ? `<option value="">${esc(placeholder)}</option>` : '';
    return head + list.map((item) => {
      const value = typeof item === 'object' ? item.value : item;
      const label = typeof item === 'object' ? item.label : item;
      return `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`;
    }).join('');
  }

  function emptyState({ icon = 'bi-inbox', title = 'Nothing here yet', text = '', action = '', compact = false } = {}) {
    return `<div class="empty-state${compact ? ' compact' : ''}">
      <div class="empty-icon"><i class="bi ${icon}"></i></div>
      <h3>${esc(title)}</h3>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${action}
    </div>`;
  }

  const emptyRow = (colspan, opts) => `<tr><td colspan="${colspan}" class="p-0 border-0">${emptyState(opts)}</td></tr>`;

  /* Pagination */
  function paginate(list, page, perPage = 10) {
    const pages = Math.max(1, Math.ceil(list.length / perPage));
    const current = Math.min(Math.max(1, page), pages);
    const start = (current - 1) * perPage;
    return { items: list.slice(start, start + perPage), page: current, pages, total: list.length, from: list.length ? start + 1 : 0, to: Math.min(start + perPage, list.length) };
  }

  function pagerHTML(p) {
    if (p.pages <= 1) return '';
    const btn = (page, label, extra = '', disabled = false) =>
      `<button type="button" class="btn btn-light btn-sm ${extra}" data-page="${page}" ${disabled ? 'disabled' : ''}>${label}</button>`;
    let html = btn(p.page - 1, '<i class="bi bi-chevron-left"></i><span class="visually-hidden">Previous page</span>', 'pg-nav', p.page === 1);
    for (let i = 1; i <= p.pages; i++) {
      if (i === 1 || i === p.pages || Math.abs(i - p.page) <= 1) html += btn(i, i, i === p.page ? 'active' : '');
      else if (Math.abs(i - p.page) === 2) html += '<span class="px-1 text-muted">…</span>';
    }
    html += btn(p.page + 1, '<i class="bi bi-chevron-right"></i><span class="visually-hidden">Next page</span>', 'pg-nav', p.page === p.pages);
    return `<nav class="pager" aria-label="Pagination">${html}</nav>`;
  }

  /** Render a table footer with "Showing x–y of z" and pagination; calls onPage(n). */
  function renderPager(container, p, onPage, noun = 'records') {
    if (!container) return;
    container.innerHTML = `<span>Showing <strong>${p.from}–${p.to}</strong> of <strong>${p.total}</strong> ${noun}</span>${pagerHTML(p)}`;
    container.hidden = p.total === 0;
    container.onclick = (e) => {
      const b = e.target.closest('[data-page]');
      if (b && !b.disabled) onPage(Number(b.dataset.page));
    };
  }

  /* ------------------------------------------------------------------
     Tooltips, toasts, confirm dialog, flash messages
     ------------------------------------------------------------------ */
  function initTooltips(root = document) {
    if (!window.bootstrap) return;
    $$('[data-bs-toggle="tooltip"]', root).forEach((el) => bootstrap.Tooltip.getOrCreateInstance(el, { trigger: 'hover focus' }));
  }

  function disposeTooltips(root = document) {
    if (!window.bootstrap) return;
    // Hide now, dispose later: Bootstrap's show animation queues a callback that
    // would throw if the instance were disposed mid-transition.
    $$('[data-bs-toggle="tooltip"]', root).forEach((el) => {
      const t = bootstrap.Tooltip.getInstance(el);
      if (!t) return;
      t.hide();
      setTimeout(() => t.dispose(), 400);
    });
  }

  function hideTooltips() {
    if (!window.bootstrap) return;
    $$('[data-bs-toggle="tooltip"]').forEach((el) => { const t = bootstrap.Tooltip.getInstance(el); if (t) t.hide(); });
  }

  /** Replace an element's HTML safely (cleans up tooltips first). */
  function render(el, html) {
    if (!el) return;
    disposeTooltips(el);
    el.innerHTML = html;
    initTooltips(el);
  }

  const TOAST_ICONS = { success: 'bi-check-lg', error: 'bi-x-lg', warning: 'bi-exclamation-lg', info: 'bi-info-lg' };

  function toast(message, type = 'success', duration = 3600) {
    let stack = $('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('aria-live', 'polite');
      stack.setAttribute('aria-atomic', 'false');
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `lb-toast ${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span class="toast-icon"><i class="bi ${TOAST_ICONS[type] || TOAST_ICONS.info}"></i></span>
      <div class="toast-msg">${esc(message)}</div>
      <button type="button" class="btn-close" aria-label="Dismiss"></button>`;
    const close = () => {
      if (el.classList.contains('hide')) return;
      el.classList.add('hide');
      setTimeout(() => el.remove(), 260);
    };
    el.querySelector('.btn-close').addEventListener('click', close);
    stack.appendChild(el);
    setTimeout(close, duration);
  }

  /** Store a toast to show after the next page load (e.g. after a redirect). */
  function flash(message, type = 'success') {
    try { sessionStorage.setItem(KEYS.flash, JSON.stringify({ message, type })); } catch (err) { /* ignore */ }
  }

  function showFlash() {
    try {
      const data = JSON.parse(sessionStorage.getItem(KEYS.flash) || 'null');
      if (data) {
        sessionStorage.removeItem(KEYS.flash);
        setTimeout(() => toast(data.message, data.type), 250);
      }
    } catch (err) { /* ignore */ }
  }

  /** Promise-based confirmation modal. Resolves true when confirmed. */
  function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Delete', variant = 'danger', icon = 'bi-trash3' } = {}) {
    return new Promise((resolve) => {
      let modalEl = $('#lbConfirm');
      if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.className = 'modal fade';
        modalEl.id = 'lbConfirm';
        modalEl.tabIndex = -1;
        modalEl.setAttribute('aria-hidden', 'true');
        modalEl.setAttribute('aria-labelledby', 'lbConfirmTitle');
        modalEl.innerHTML = `<div class="modal-dialog modal-dialog-centered confirm-dialog">
          <div class="modal-content"><div class="modal-body text-center p-4">
            <div class="stat-icon mx-auto mb-3" data-confirm-icon></div>
            <h2 class="h5 mb-2" id="lbConfirmTitle"></h2>
            <p class="text-muted mb-0" data-confirm-message></p>
          </div>
          <div class="modal-footer justify-content-center gap-2">
            <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn" data-confirm-ok></button>
          </div></div></div>`;
        document.body.appendChild(modalEl);
      }
      const iconEl = $('[data-confirm-icon]', modalEl);
      iconEl.className = `stat-icon mx-auto mb-3 ${variant === 'danger' ? 'tone-danger' : 'tone-accent'}`;
      iconEl.innerHTML = `<i class="bi ${icon}"></i>`;
      $('#lbConfirmTitle', modalEl).textContent = title;
      $('[data-confirm-message]', modalEl).textContent = message;
      const ok = $('[data-confirm-ok]', modalEl);
      ok.className = `btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`;
      ok.textContent = confirmText;

      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      let confirmed = false;
      ok.onclick = () => { confirmed = true; modal.hide(); };
      modalEl.addEventListener('hidden.bs.modal', () => resolve(confirmed), { once: true });
      modal.show();
    });
  }

  /* ------------------------------------------------------------------
     Forms
     ------------------------------------------------------------------ */
  /** Bootstrap validation: returns true if valid, otherwise shows messages and focuses the first invalid field. */
  function validate(form) {
    form.classList.add('was-validated');
    const valid = form.checkValidity();
    if (!valid) {
      const first = form.querySelector(':invalid');
      if (first) first.focus();
    }
    return valid;
  }

  function resetForm(form) {
    form.reset();
    form.classList.remove('was-validated');
    $$('input, select, textarea', form).forEach((el) => el.setCustomValidity(''));
  }

  function formData(form) {
    const data = {};
    new FormData(form).forEach((value, key) => { data[key] = typeof value === 'string' ? value.trim() : value; });
    return data;
  }

  function fillForm(form, data) {
    Object.entries(data).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (!field || field instanceof RadioNodeList) return;
      if (field.type === 'checkbox') field.checked = Boolean(value);
      else field.value = value == null ? '' : value;
    });
  }

  function btnLoading(btn, loading, label) {
    if (!btn) return;
    if (loading) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>${esc(label || 'Please wait…')}</span>`;
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }

  const modal = (el) => bootstrap.Modal.getOrCreateInstance(typeof el === 'string' ? $(el) : el);

  /* ------------------------------------------------------------------
     Files: CSV export & downloads
     ------------------------------------------------------------------ */
  function toCSV(rows) {
    return rows.map((row) => row.map((cell) => {
      const s = cell == null ? '' : String(cell);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\r\n');
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // The BOM lets Excel detect UTF-8 (needed for ₹ and €).
  const downloadCSV = (filename, rows) => download(filename, '﻿' + toCSV(rows), 'text/csv;charset=utf-8');

  /* ------------------------------------------------------------------
     Charts (Chart.js, when loaded on the page)
     ------------------------------------------------------------------ */
  const charts = {
    palette: ['#5b5bd6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#64748b'],
    css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); },
    alpha(hex, a) {
      const h = hex.replace('#', '');
      const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
      const n = parseInt(full, 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    },
    applyDefaults() {
      if (!window.Chart) return;
      const d = window.Chart.defaults;
      d.font.family = 'Inter, system-ui, sans-serif';
      d.font.size = 12;
      d.color = charts.css('--lb-muted');
      d.borderColor = charts.css('--lb-border');
      d.maintainAspectRatio = false;
      d.plugins.legend.display = false;
      Object.assign(d.plugins.tooltip, {
        backgroundColor: '#0b1020', titleColor: '#fff', bodyColor: '#c4cad8',
        borderColor: 'rgba(255,255,255,.08)', borderWidth: 1, padding: 10, cornerRadius: 10,
        boxPadding: 4, usePointStyle: true, titleFont: { weight: '600' }
      });
    },
    /** Vertical gradient fill for line charts. */
    gradient(context, hex) {
      const { chart } = context;
      const { ctx, chartArea } = chart;
      if (!chartArea) return charts.alpha(hex, 0.1);
      const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      g.addColorStop(0, charts.alpha(hex, 0.22));
      g.addColorStop(1, charts.alpha(hex, 0));
      return g;
    },
    moneyTick: (value) => money(value, { compact: true })
  };

  /* ------------------------------------------------------------------
     Invoice document (view, print, download)
     ------------------------------------------------------------------ */
  const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><defs><linearGradient id="invg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b8bf5"/><stop offset="1" stop-color="#4a4ac2"/></linearGradient></defs><rect width="40" height="40" rx="11" fill="url(#invg)"/><path d="M13 10.5v19h14.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="19" y="18" width="4" height="7" rx="1.2" fill="#fff" opacity=".7"/><rect x="24.5" y="13" width="4" height="12" rx="1.2" fill="#fff" opacity=".9"/></svg>';

  /** Single source of invoice styles: injected into the app and embedded in downloads. */
  const INVOICE_CSS = `
.invoice-doc{background:#fff;color:#0f172a;padding:2.5rem;border-radius:12px;font:14px/1.55 Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;border:1px solid #e4e8f0}
.invoice-doc *{box-sizing:border-box}
.invoice-doc h2{color:#0f172a;font-size:1.6rem;font-weight:800;letter-spacing:-.03em;margin:0 0 .2rem}
.invoice-doc .inv-head{display:flex;justify-content:space-between;gap:1.5rem;flex-wrap:wrap;padding-bottom:1.5rem;border-bottom:2px solid #0f172a}
.invoice-doc .inv-brand{display:flex;align-items:center;gap:.75rem}
.invoice-doc .inv-brand strong{font-size:1.05rem;display:block}
.invoice-doc .inv-right{text-align:right}
.invoice-doc .inv-muted{color:#64748b}
.invoice-doc .inv-label{font-size:.68rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#64748b;margin-bottom:.35rem}
.invoice-doc .inv-parties{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;padding:1.5rem 0}
.invoice-doc .inv-parties strong{display:block}
.invoice-doc table{width:100%;border-collapse:collapse}
.invoice-doc th{font-size:.68rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#64748b;text-align:left;padding:.6rem .5rem;border-bottom:1px solid #cbd5e1;background:#f8fafc}
.invoice-doc td{padding:.7rem .5rem;border-bottom:1px solid #e2e8f0;color:#1e293b}
.invoice-doc .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.invoice-doc .inv-totals{margin-left:auto;width:100%;max-width:300px;margin-top:1.25rem}
.invoice-doc .inv-totals div{display:flex;justify-content:space-between;padding:.3rem 0;font-variant-numeric:tabular-nums;color:#334155}
.invoice-doc .inv-totals .grand{border-top:2px solid #0f172a;margin-top:.4rem;padding-top:.6rem;font-size:1.1rem;font-weight:700;color:#0f172a}
.invoice-doc .inv-totals .due{color:#c62a2f;font-weight:600}
.invoice-doc .inv-foot{margin-top:2rem;padding-top:1rem;border-top:1px solid #e2e8f0;font-size:.78rem;color:#64748b;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.invoice-doc .inv-stamp{display:inline-block;margin-top:.5rem;font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:.25rem .6rem;border-radius:6px;border:1.5px solid currentColor}
.invoice-doc .inv-stamp.paid{color:#15803d}.invoice-doc .inv-stamp.partial{color:#b45309}.invoice-doc .inv-stamp.pending{color:#0369a1}.invoice-doc .inv-stamp.overdue{color:#c62a2f}
@media (max-width:767.98px){.invoice-doc{padding:1.25rem}.invoice-doc .inv-parties{grid-template-columns:1fr;gap:1rem}.invoice-doc .inv-right{text-align:left}}
@media print{.invoice-doc{border:0;padding:0;border-radius:0}}`;

  function ensureInvoiceStyles() {
    if ($('#lbInvoiceCss')) return;
    const style = document.createElement('style');
    style.id = 'lbInvoiceCss';
    style.textContent = INVOICE_CSS;
    document.head.appendChild(style);
  }

  const invoice = {
    html(sale) {
      ensureInvoiceStyles();
      const biz = settings();
      const customer = db.get('customers', sale.customerId) || { name: sale.customerName || 'Walk-in customer' };
      const status = sales.status(sale);
      const rows = sale.items.map((it, i) => `<tr>
          <td>${i + 1}</td><td>${esc(it.name)}</td>
          <td class="r">${num(it.qty)}</td><td class="r">${money(it.price)}</td><td class="r">${money(it.qty * it.price)}</td>
        </tr>`).join('');
      return `<article class="invoice-doc">
        <header class="inv-head">
          <div class="inv-brand">${LOGO_SVG}
            <div><strong>${esc(biz.businessName)}</strong><span class="inv-muted">${esc(biz.address)}</span></div>
          </div>
          <div class="inv-right">
            <h2>Invoice</h2>
            <div class="inv-muted">${esc(sale.invoiceNo)}</div>
            <span class="inv-stamp ${status.toLowerCase()}">${status}</span>
          </div>
        </header>
        <section class="inv-parties">
          <div><div class="inv-label">From</div><strong>${esc(biz.businessName)}</strong>
            <div class="inv-muted">${esc(biz.ownerName)}</div><div class="inv-muted">${esc(biz.phone)}</div><div class="inv-muted">${esc(biz.email)}</div></div>
          <div><div class="inv-label">Bill to</div><strong>${esc(customer.name)}</strong>
            ${customer.phone ? `<div class="inv-muted">${esc(customer.phone)}</div>` : ''}
            ${customer.email ? `<div class="inv-muted">${esc(customer.email)}</div>` : ''}
            ${customer.address ? `<div class="inv-muted">${esc(customer.address)}</div>` : ''}</div>
          <div><div class="inv-label">Details</div>
            <div>Invoice date: <b>${date.format(sale.date)}</b></div>
            <div>Due date: <b>${date.format(sale.dueDate)}</b></div>
            <div>Payment: <b>${esc(sale.method)}</b></div></div>
        </section>
        <table>
          <thead><tr><th>#</th><th>Product</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="inv-totals">
          <div><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
          <div><span>Discount (${sale.discountPct}%)</span><span>− ${money(sale.discount)}</span></div>
          <div><span>Tax / GST (${sale.taxPct}%)</span><span>${money(sale.tax)}</span></div>
          <div class="grand"><span>Grand total</span><span>${money(sale.total)}</span></div>
          <div><span>Amount paid</span><span>${money(sale.paid)}</span></div>
          ${sales.due(sale) > 0 ? `<div class="due"><span>Balance due</span><span>${money(sales.due(sale))}</span></div>` : ''}
        </div>
        <footer class="inv-foot">
          <span>Thank you for your business.</span>
          <span>Generated with LocalBiz OS · Demo invoice for illustration only</span>
        </footer>
      </article>`;
    },

    print(sale) {
      let root = $('#printRoot');
      if (!root) {
        root = document.createElement('div');
        root.id = 'printRoot';
        document.body.appendChild(root);
      }
      root.innerHTML = invoice.html(sale);
      document.body.classList.add('is-printing');
      const cleanup = () => { document.body.classList.remove('is-printing'); window.removeEventListener('afterprint', cleanup); };
      window.addEventListener('afterprint', cleanup);
      setTimeout(() => { window.print(); setTimeout(cleanup, 500); }, 50);
    },

    /** Open the invoice in a shared modal with print / download / payment actions. */
    show(sale) {
      let el = $('#lbInvoiceView');
      if (!el) {
        el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'lbInvoiceView';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'lbInvoiceViewTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl"><div class="modal-content">
          <div class="modal-header"><div><h2 class="modal-title" id="lbInvoiceViewTitle"></h2><p class="modal-subtitle" data-inv-sub></p></div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
          <div class="modal-body bg-body-tertiary" data-inv-body></div>
          <div class="modal-footer flex-wrap gap-2">
            <a class="btn btn-light me-auto" data-inv-pay href="#"><i class="bi bi-cash-coin"></i>Record payment</a>
            <button type="button" class="btn btn-light" data-inv-download><i class="bi bi-download"></i>Download</button>
            <button type="button" class="btn btn-primary" data-inv-print><i class="bi bi-printer"></i>Print</button>
          </div></div></div>`;
        document.body.appendChild(el);
      }
      $('#lbInvoiceViewTitle', el).innerHTML = `${esc(sale.invoiceNo)} ${badge(sales.status(sale))}`;
      $('[data-inv-sub]', el).textContent = `${sales.customerName(sale)} · ${date.format(sale.date)} · ${money(sale.total)}`;
      $('[data-inv-body]', el).innerHTML = invoice.html(sale);
      const pay = $('[data-inv-pay]', el);
      pay.hidden = sales.due(sale) <= 0;
      pay.href = `payments.html?invoice=${encodeURIComponent(sale.id)}`;
      $('[data-inv-download]', el).onclick = () => { invoice.download(sale); toast(`${sale.invoiceNo} downloaded.`); };
      $('[data-inv-print]', el).onclick = () => invoice.print(sale);
      modal(el).show();
    },

    /** Download a self-contained HTML copy of the invoice. */
    download(sale) {
      const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(sale.invoiceNo)} — ${esc(settings().businessName)}</title>
<style>body{margin:0;padding:2rem 1rem;background:#f4f6fa}.wrap{max-width:820px;margin:0 auto}${INVOICE_CSS}</style></head>
<body><div class="wrap">${invoice.html(sale)}</div></body></html>`;
      download(`${sale.invoiceNo}.html`, doc, 'text/html;charset=utf-8');
    }
  };

  /* ------------------------------------------------------------------
     App shell: sidebar, topbar, search, notifications, help
     ------------------------------------------------------------------ */
  const NAV = [
    { section: 'Overview', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'bi-grid-1x2', href: 'dashboard.html' }] },
    { section: 'Operations', items: [
      { id: 'sales', label: 'Sales', icon: 'bi-bag-check', href: 'sales.html' },
      { id: 'products', label: 'Products', icon: 'bi-box-seam', href: 'products.html' },
      { id: 'customers', label: 'Customers', icon: 'bi-people', href: 'customers.html' }
    ] },
    { section: 'Finance', items: [
      { id: 'invoices', label: 'Invoices', icon: 'bi-receipt', href: 'invoices.html' },
      { id: 'expenses', label: 'Expenses', icon: 'bi-wallet2', href: 'expenses.html' },
      { id: 'payments', label: 'Payments', icon: 'bi-credit-card-2-front', href: 'payments.html' }
    ] },
    { section: 'Insights', items: [
      { id: 'reports', label: 'Reports', icon: 'bi-bar-chart-line', href: 'reports.html' },
      { id: 'settings', label: 'Settings', icon: 'bi-gear', href: 'settings.html' }
    ] }
  ];

  const ui = {
    get() { return store.get(KEYS.ui, {}); },
    set(patch) { store.set(KEYS.ui, Object.assign(ui.get(), patch)); }
  };

  const currentPage = () => document.documentElement.dataset.app;
  const isDesktop = () => window.matchMedia('(min-width: 992px)').matches;

  function profile() {
    const s = settings();
    const user = auth.user() || {};
    const session = auth.session() || {};
    return { name: s.ownerName || user.ownerName || 'Owner', business: s.businessName, email: session.email || s.email };
  }

  function navCounts() {
    return {
      products: db.all('products').filter(isLowStock).length,
      payments: db.all('sales').filter((s) => sales.status(s) === 'Overdue').length
    };
  }

  function sidebarHTML() {
    const page = currentPage();
    const counts = navCounts();
    const me = profile();
    const sections = NAV.map((group) => `
      <div class="nav-section-label">${group.section}</div>
      ${group.items.map((item) => `
        <a class="sidebar-link${item.id === page ? ' active' : ''}" href="${item.href}" data-label="${item.label}"${item.id === page ? ' aria-current="page"' : ''}>
          <i class="bi ${item.icon}" aria-hidden="true"></i><span class="link-label">${item.label}</span>
          ${counts[item.id] ? `<span class="nav-count" data-count="${item.id}" aria-label="${counts[item.id]} need attention">${counts[item.id]}</span>` : ''}
        </a>`).join('')}`).join('');

    return `<aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="sidebar-brand">
        <a href="dashboard.html" class="brand-link" aria-label="LocalBiz OS dashboard">
          <img src="assets/icons/logo.svg" alt="">
          <span class="brand-text">LocalBiz OS<span class="brand-sub">Business workspace</span></span>
        </a>
        <button type="button" class="btn btn-icon sidebar-close" data-action="close-sidebar" aria-label="Close navigation"><i class="bi bi-x-lg"></i></button>
      </div>
      <nav class="sidebar-nav">${sections}</nav>
      <div class="sidebar-footer">
        <a class="sidebar-link" href="#" data-action="help" data-label="Help"><i class="bi bi-question-circle" aria-hidden="true"></i><span class="link-label">Help &amp; guide</span></a>
        <div class="sidebar-user">
          <a href="settings.html#profile" class="d-flex align-items-center gap-2 flex-grow-1 min-w-0 text-reset" aria-label="Open profile settings">
            ${avatar(me.name)}
            <span class="user-meta"><span class="user-name d-block" data-me="name">${esc(me.name)}</span><span class="user-role d-block" data-me="business">${esc(me.business)}</span></span>
          </a>
          <button type="button" class="btn btn-icon" data-action="logout" data-bs-toggle="tooltip" data-bs-placement="top" title="Log out" aria-label="Log out"><i class="bi bi-box-arrow-right"></i></button>
        </div>
      </div>
    </aside>
    <div class="sidebar-backdrop" data-action="close-sidebar"></div>`;
  }

  function topbarHTML() {
    const me = profile();
    const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const dark = settings().theme === 'dark';
    return `<header class="topbar">
      <button type="button" class="btn btn-icon" data-action="toggle-sidebar" aria-label="Toggle navigation" aria-controls="sidebar"><i class="bi bi-list"></i></button>
      <div class="topbar-search" role="search">
        <i class="bi bi-search" aria-hidden="true"></i>
        <input type="search" class="form-control" id="globalSearch" placeholder="Search products, customers, invoices…" autocomplete="off" aria-label="Search the workspace" aria-controls="searchResults" aria-expanded="false">
        <kbd>/</kbd>
        <div class="search-results" id="searchResults" role="listbox" aria-label="Search results"></div>
      </div>
      <div class="ms-auto d-flex align-items-center gap-1 gap-sm-2">
        <span class="topbar-date"><i class="bi bi-calendar3" aria-hidden="true"></i>${today}</span>
        <button type="button" class="btn btn-icon" data-action="toggle-theme" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Toggle dark mode" aria-label="Toggle dark mode">
          <i class="bi ${dark ? 'bi-sun' : 'bi-moon-stars'}"></i>
        </button>
        <div class="dropdown">
          <button type="button" class="btn btn-icon notif-btn" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" aria-label="Notifications">
            <i class="bi bi-bell"></i><span class="notif-dot" hidden></span>
          </button>
          <div class="dropdown-menu dropdown-menu-end notif-menu" id="notifMenu"></div>
        </div>
        <div class="dropdown">
          <button type="button" class="profile-btn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Account menu">
            ${avatar(me.name, 'avatar-sm')}
            <span class="profile-text d-none d-md-block"><span class="profile-name d-block" data-me="name">${esc(me.name)}</span><span class="profile-biz d-block" data-me="business">${esc(me.business)}</span></span>
            <i class="bi bi-chevron-down small text-muted d-none d-md-inline"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end profile-menu">
            <li class="px-3 py-2"><div class="fw-semibold" data-me="name">${esc(me.name)}</div><div class="small text-muted text-truncate">${esc(me.email)}</div></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="settings.html#profile"><i class="bi bi-shop"></i>Business profile</a></li>
            <li><a class="dropdown-item" href="settings.html#appearance"><i class="bi bi-palette"></i>Appearance</a></li>
            <li><a class="dropdown-item" href="#" data-action="help"><i class="bi bi-question-circle"></i>Help &amp; guide</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="#" data-action="logout"><i class="bi bi-box-arrow-right"></i>Log out</a></li>
          </ul>
        </div>
      </div>
    </header>`;
  }

  function footerHTML() {
    return `<footer class="app-footer">
      <span>© ${new Date().getFullYear()} LocalBiz OS · Demo workspace</span>
      <span><i class="bi bi-shield-check me-1"></i>All records are sample data stored only in this browser.</span>
    </footer>`;
  }

  function renderShell() {
    const sidebarSlot = $('#appSidebar');
    const topbarSlot = $('#appTopbar');
    if (sidebarSlot) sidebarSlot.outerHTML = sidebarHTML();
    if (topbarSlot) topbarSlot.outerHTML = topbarHTML();
    const main = $('.app-main');
    if (main && !$('.app-footer', main)) main.insertAdjacentHTML('beforeend', footerHTML());
    updateRailTitles();
    renderNotifications();
    bindShell();
  }

  /** In the collapsed rail, show the label as a native title on hover. */
  function updateRailTitles() {
    const collapsed = document.documentElement.classList.contains('sidebar-collapsed') && isDesktop();
    $$('.sidebar-link').forEach((link) => {
      if (collapsed) link.setAttribute('title', link.dataset.label); else link.removeAttribute('title');
    });
  }

  function openSidebar(open) {
    document.documentElement.classList.toggle('sidebar-open', open);
    const toggle = $('[data-action="toggle-sidebar"]');
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
    if (open) { const first = $('.sidebar .sidebar-link'); if (first) first.focus({ preventScroll: true }); }
  }

  function toggleSidebar() {
    if (isDesktop()) {
      const collapsed = !document.documentElement.classList.contains('sidebar-collapsed');
      document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
      ui.set({ sidebarCollapsed: collapsed });
      updateRailTitles();
      document.dispatchEvent(new CustomEvent('lb:layout'));
    } else {
      openSidebar(!document.documentElement.classList.contains('sidebar-open'));
    }
  }

  function refreshShellCounts() {
    const counts = navCounts();
    ['products', 'payments'].forEach((id) => {
      const link = $(`.sidebar-link[href="${id}.html"]`);
      if (!link) return;
      let el = $('.nav-count', link);
      if (counts[id]) {
        if (!el) { el = document.createElement('span'); el.className = 'nav-count'; link.appendChild(el); }
        el.textContent = counts[id];
      } else if (el) el.remove();
    });
    renderNotifications();
  }

  function refreshProfile() {
    const me = profile();
    $$('[data-me="name"]').forEach((el) => { el.textContent = me.name; });
    $$('[data-me="business"]').forEach((el) => { el.textContent = me.business; });
    $$('.sidebar-user .avatar, .profile-btn .avatar').forEach((el) => {
      el.textContent = initials(me.name);
      el.className = el.className.replace(/tone-\d/, avatarTone(me.name));
    });
  }

  /* Notifications are derived from live data and the user's notification settings. */
  function buildNotifications() {
    const s = settings();
    const list = [];
    if (s.notifications.lowStock) {
      db.all('products').filter(isLowStock).sort((a, b) => a.stock - b.stock).forEach((p) => {
        const out = Number(p.stock) <= 0;
        list.push({
          id: `stock-${p.id}-${p.stock}`, icon: 'bi-box-seam', tone: out ? 'tone-danger' : 'tone-warning',
          title: `${p.name} is ${out ? 'out of stock' : 'running low'}`,
          text: `${p.stock} left · reorder level ${p.minStock}`, href: `products.html?q=${encodeURIComponent(p.sku)}`
        });
      });
    }
    if (s.notifications.paymentReminders) {
      const today = date.today();
      db.all('sales').filter((x) => sales.due(x) > 0).forEach((x) => {
        const status = sales.status(x);
        const soon = status !== 'Overdue' && date.diff(x.dueDate, today) <= 3;
        if (status !== 'Overdue' && !soon) return;
        list.push({
          id: `due-${x.id}-${x.paid}-${status}`, icon: 'bi-clock-history', tone: status === 'Overdue' ? 'tone-danger' : 'tone-info',
          title: `${x.invoiceNo} ${status === 'Overdue' ? 'is overdue' : 'is due soon'}`,
          text: `${sales.customerName(x)} owes ${money(sales.due(x))} · due ${date.short(x.dueDate)}`,
          href: `payments.html?q=${encodeURIComponent(x.invoiceNo)}`
        });
      });
    }
    if (s.notifications.dailySummary) {
      const today = summarize(date.today(), date.today());
      list.unshift({
        id: `summary-${date.today()}-${today.orders}`, icon: 'bi-graph-up-arrow', tone: 'tone-accent',
        title: "Today's summary", text: `${today.orders} sale(s) worth ${money(today.revenue)} · ${money(today.collected)} collected`, href: 'reports.html'
      });
    }
    return list;
  }

  function renderNotifications() {
    const menu = $('#notifMenu');
    if (!menu) return;
    const list = buildNotifications();
    const seen = new Set(ui.get().notifSeen || []);
    const unread = list.filter((n) => !seen.has(n.id)).length;
    const dot = $('.notif-dot');
    if (dot) dot.hidden = unread === 0;
    const bell = $('.notif-btn');
    if (bell) bell.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');

    menu.innerHTML = `<div class="notif-head">
        <div><div class="fw-semibold">Notifications</div><div class="small text-muted">${unread ? `${unread} unread` : 'You’re all caught up'}</div></div>
        ${list.length ? '<button type="button" class="btn btn-sm btn-ghost" data-action="mark-read">Mark all read</button>' : ''}
      </div>
      <div class="notif-list">${list.length ? list.slice(0, 12).map((n) => `
        <a class="notif-item" href="${n.href}">
          <span class="notif-icon ${n.tone}"><i class="bi ${n.icon}"></i></span>
          <span><span class="d-block fw-semibold text-body">${esc(n.title)}${seen.has(n.id) ? '' : ' <span class="badge-new">New</span>'}</span>
          <span class="notif-time">${esc(n.text)}</span></span>
        </a>`).join('') : emptyState({ icon: 'bi-bell-slash', title: 'No notifications', text: 'Alerts you enable in Settings will appear here.', compact: true })}
      </div>
      <div class="border-top p-2 text-center"><a href="settings.html#notifications" class="small fw-semibold">Notification settings</a></div>`;
  }

  /* Global search across products, customers and invoices. */
  function runSearch(term) {
    const box = $('#searchResults');
    const input = $('#globalSearch');
    const q = term.trim().toLowerCase();
    if (!q) { box.classList.remove('show'); input.setAttribute('aria-expanded', 'false'); return; }
    const match = (...fields) => fields.some((f) => String(f || '').toLowerCase().includes(q));
    const groups = [
      { label: 'Products', icon: 'bi-box-seam', items: db.all('products').filter((p) => match(p.name, p.sku, p.category)).slice(0, 4)
        .map((p) => ({ text: p.name, meta: `${p.stock} in stock`, href: `products.html?q=${encodeURIComponent(p.sku)}` })) },
      { label: 'Customers', icon: 'bi-person', items: db.all('customers').filter((c) => match(c.name, c.phone, c.email)).slice(0, 4)
        .map((c) => ({ text: c.name, meta: c.phone, href: `customers.html?q=${encodeURIComponent(c.name)}` })) },
      { label: 'Invoices', icon: 'bi-receipt', items: db.all('sales').filter((s) => match(s.invoiceNo, sales.customerName(s))).slice(0, 5)
        .map((s) => ({ text: `${s.invoiceNo} · ${sales.customerName(s)}`, meta: money(s.total), href: `invoices.html?q=${encodeURIComponent(s.invoiceNo)}` })) }
    ].filter((g) => g.items.length);

    box.innerHTML = groups.length ? groups.map((g) => `<div class="search-group-label">${g.label}</div>` +
      g.items.map((it) => `<a class="search-item" role="option" href="${it.href}"><i class="bi ${g.icon}"></i><span class="text-truncate">${esc(it.text)}</span><span class="meta">${esc(it.meta)}</span></a>`).join('')).join('')
      : `<div class="p-3 text-center small text-muted">No results for “${esc(term.trim())}”</div>`;
    box.classList.add('show');
    input.setAttribute('aria-expanded', 'true');
  }

  function showHelp() {
    let el = $('#lbHelp');
    if (!el) {
      el = document.createElement('div');
      el.className = 'modal fade';
      el.id = 'lbHelp';
      el.tabIndex = -1;
      el.setAttribute('aria-labelledby', 'lbHelpTitle');
      el.setAttribute('aria-hidden', 'true');
      const tips = [
        ['bi-bag-check', 'Sales', 'Record a sale — stock is reduced automatically and an invoice number is assigned.'],
        ['bi-box-seam', 'Products', 'Keep stock and prices current. Items at or below their reorder level are flagged.'],
        ['bi-people', 'Customers', 'Open a profile to see purchase history and outstanding dues.'],
        ['bi-receipt', 'Invoices', 'Create multi-item invoices, then print or download them.'],
        ['bi-credit-card-2-front', 'Payments', 'Record full or partial payments against invoices.'],
        ['bi-bar-chart-line', 'Reports', 'Pick a date range and export the numbers as CSV.']
      ];
      el.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content">
        <div class="modal-header"><div><h2 class="modal-title" id="lbHelpTitle">Help &amp; quick guide</h2><p class="modal-subtitle">How to get around LocalBiz OS</p></div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body">
          <div class="alert-lb info mb-4"><i class="bi bi-info-circle"></i><div class="alert-text"><strong>Demo mode.</strong> Everything you see is sample data saved in this browser's localStorage. Nothing is sent to a server. You can restore the original sample data from <a href="settings.html#data">Settings → Data</a>.</div></div>
          <div class="row g-3">${tips.map(([icon, title, text]) => `<div class="col-md-6"><div class="d-flex gap-3"><span class="stat-icon tone-accent"><i class="bi ${icon}"></i></span><div><div class="fw-semibold">${title}</div><div class="small text-muted">${text}</div></div></div></div>`).join('')}</div>
          <hr class="my-4">
          <div class="small-caps mb-2">Keyboard shortcuts</div>
          <div class="d-flex flex-wrap gap-3 small"><span><kbd>/</kbd> Focus search</span><span><kbd>Esc</kbd> Close menus and dialogs</span></div>
        </div></div></div>`;
      document.body.appendChild(el);
    }
    modal(el).show();
  }

  function bindShell() {
    document.addEventListener('click', (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) {
        if (!e.target.closest('.topbar-search')) { const box = $('#searchResults'); if (box) box.classList.remove('show'); }
        return;
      }
      const action = actionEl.dataset.action;
      if (action === 'toggle-sidebar') toggleSidebar();
      else if (action === 'close-sidebar') openSidebar(false);
      else if (action === 'logout') { e.preventDefault(); auth.signOut(); }
      else if (action === 'help') { e.preventDefault(); openSidebar(false); showHelp(); }
      else if (action === 'toggle-theme') {
        const next = settings().theme === 'dark' ? 'light' : 'dark';
        saveSettings({ theme: next });
        applyTheme(next);
        hideTooltips();
        actionEl.querySelector('i').className = `bi ${next === 'dark' ? 'bi-sun' : 'bi-moon-stars'}`;
        toast(`${next === 'dark' ? 'Dark' : 'Light'} mode enabled.`, 'info', 2200);
      } else if (action === 'mark-read') {
        ui.set({ notifSeen: buildNotifications().map((n) => n.id) });
        renderNotifications();
      }
    });

    const input = $('#globalSearch');
    if (input) {
      const search = debounce(() => runSearch(input.value), 120);
      input.addEventListener('input', search);
      input.addEventListener('focus', () => { if (input.value.trim()) runSearch(input.value); });
      input.addEventListener('keydown', (e) => {
        const items = $$('#searchResults .search-item');
        let index = items.findIndex((el) => el.classList.contains('is-active'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!items.length) return;
          index = e.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
          items.forEach((el, i) => el.classList.toggle('is-active', i === index));
          items[index].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          const target = items[index] || items[0];
          if (target) { e.preventDefault(); window.location.href = target.getAttribute('href'); }
        } else if (e.key === 'Escape') {
          $('#searchResults').classList.remove('show');
          input.blur();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if (e.key === '/' && !typing && input) { e.preventDefault(); input.focus(); }
      if (e.key === 'Escape' && document.documentElement.classList.contains('sidebar-open')) openSidebar(false);
    });

    // Close the mobile drawer when a nav link is followed.
    $$('.sidebar .sidebar-link[href$=".html"]').forEach((link) => link.addEventListener('click', () => openSidebar(false)));

    window.addEventListener('resize', debounce(() => {
      if (isDesktop()) openSidebar(false);
      updateRailTitles();
    }, 150));

    document.addEventListener('lb:data', refreshShellCounts);
    document.addEventListener('lb:settings', () => { refreshProfile(); renderNotifications(); });
  }

  /** Update the ₹/$/€ prefix inside money input groups. */
  function syncCurrencySigns() {
    const code = settings().currency;
    $$('.currency-sign').forEach((el) => { el.textContent = (CURRENCIES[code] || CURRENCIES.INR).symbol; });
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  const LB = {
    KEYS, store, db, uid, round2, date, settings, saveSettings, applyTheme, CURRENCIES, money, num, pct,
    PRODUCT_CATEGORIES, EXPENSE_CATEGORIES, PAYMENT_METHODS, BUSINESS_TYPES,
    calcTotals, productStatus, isLowStock, sales, summarize, seedDemoData, resetDemoData, auth,
    $, $$, esc, param, clearParams, debounce, initials, avatar, badge, options, emptyState, emptyRow,
    paginate, renderPager, initTooltips, disposeTooltips, hideTooltips, render, toast, flash, confirm: confirmDialog,
    validate, resetForm, formData, fillForm, btnLoading, modal, toCSV, download, downloadCSV, charts, invoice,
    redirecting: false,
    /** Register page code; it runs after the shell is ready (and never while redirecting). */
    page(fn) {
      const run = () => { if (!LB.redirecting) fn(); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
      else run();
    }
  };
  window.LB = LB;

  // Runs immediately in <head>: apply theme and sidebar state before first paint.
  applyTheme(settings().theme);
  if (!store.get(KEYS.seeded, null)) seedDemoData();

  if (currentPage()) {
    if (!auth.session()) {
      LB.redirecting = true;
      flash('Please log in to open your workspace.', 'info');
      window.location.replace('login.html');
    } else {
      const pref = ui.get().sidebarCollapsed;
      const collapsed = typeof pref === 'boolean' ? pref : window.innerWidth < 1200;
      if (collapsed) document.documentElement.classList.add('sidebar-collapsed');
    }
  }

  /** Marketing page behaviour: sticky navbar, scroll reveal, session-aware CTA. */
  function initMarketing() {
    const nav = $('.lp-nav');
    if (!nav) return;
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Collapse the mobile menu after choosing a section.
    $$('.lp-nav .nav-link[href^="#"]').forEach((link) => link.addEventListener('click', () => {
      const menu = $('.lp-nav .navbar-collapse.show');
      if (menu && window.bootstrap) bootstrap.Collapse.getOrCreateInstance(menu).hide();
    }));

    if (auth.session()) {
      $$('[data-guest-only]').forEach((el) => { el.hidden = true; });
      $$('[data-member-only]').forEach((el) => { el.hidden = false; });
    }

    const targets = $$('.reveal, .analytics-panel');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('in-view'); io.unobserve(entry.target); }
      }), { threshold: 0.15 });
      targets.forEach((el) => io.observe(el));
    } else targets.forEach((el) => el.classList.add('in-view'));

    $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (LB.redirecting) return;
    if (currentPage()) renderShell();
    initMarketing();
    charts.applyDefaults();
    syncCurrencySigns();
    document.addEventListener('lb:settings', syncCurrencySigns);
    initTooltips(document);
    showFlash();
    document.addEventListener('show.bs.modal', hideTooltips);
    document.addEventListener('show.bs.dropdown', hideTooltips);
  });
})(window, document);
