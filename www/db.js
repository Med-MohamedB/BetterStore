/**
 * db.js — IndexedDB abstraction layer for the Store App
 *
 * Every other module (products.js, pos.js, inventory.js, sales.js, etc.)
 * talks to storage ONLY through the DB object defined here. Nothing else
 * in the app should call indexedDB directly.
 *
 * Database: "StoreAppDB"
 * Object stores (tables):
 *   products     - keyPath: id (autoIncrement), indexes: barcode, sku, category, name
 *   categories   - keyPath: id (autoIncrement), indexes: name
 *   sales        - keyPath: id (autoIncrement), indexes: date, receiptNumber
 *   customers    - keyPath: id (autoIncrement), indexes: name, phone
 *   suppliers    - keyPath: id (autoIncrement), indexes: name
 *   inventoryLog - keyPath: id (autoIncrement), indexes: productId, date
 *   settings     - keyPath: key (single row per setting, e.g. "store", "appearance", "pos")
 */

const DB_NAME = 'StoreAppDB';
const DB_VERSION = 1;

/** @type {IDBDatabase|null} */
let _db = null;

/**
 * Opens (or creates/upgrades) the database. Safe to call multiple times —
 * subsequent calls resolve immediately once _db is cached.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // products
      if (!db.objectStoreNames.contains('products')) {
        const store = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
        store.createIndex('barcode', 'barcode', { unique: false });
        store.createIndex('sku', 'sku', { unique: false });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }

      // categories
      if (!db.objectStoreNames.contains('categories')) {
        const store = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
        store.createIndex('name', 'name', { unique: true });
      }

      // sales
      if (!db.objectStoreNames.contains('sales')) {
        const store = db.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('receiptNumber', 'receiptNumber', { unique: true });
      }

      // customers
      if (!db.objectStoreNames.contains('customers')) {
        const store = db.createObjectStore('customers', { keyPath: 'id', autoIncrement: true });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('phone', 'phone', { unique: false });
      }

      // suppliers
      if (!db.objectStoreNames.contains('suppliers')) {
        const store = db.createObjectStore('suppliers', { keyPath: 'id', autoIncrement: true });
        store.createIndex('name', 'name', { unique: false });
      }

      // inventoryLog
      if (!db.objectStoreNames.contains('inventoryLog')) {
        const store = db.createObjectStore('inventoryLog', { keyPath: 'id', autoIncrement: true });
        store.createIndex('productId', 'productId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }

      // settings (single-row-per-key store)
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Runs a transaction against one or more stores. `work` may be async —
 * sequential awaited IDB requests issued against the SAME `tx` inside it
 * keep the transaction alive (each resolves via microtask, not a macrotask,
 * which is what IndexedDB requires to avoid auto-committing early). This is
 * what makes multi-step, multi-store operations — like completing a sale,
 * which touches sales + products + inventoryLog together — atomic instead
 * of a sequence of separate transactions that could partially fail.
 * @param {string|string[]} storeNames
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction) => (void|Promise<void>)} work
 * @returns {Promise<void>} resolves when the transaction completes
 */
function runTx(storeNames, mode, work) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      Promise.resolve(work(tx)).catch((err) => {
        try { tx.abort(); } catch (e) { /* already aborted/completed */ }
        reject(err);
      });
    });
  });
}

/** Wraps an IDBRequest in a Promise. */
function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ---------------------------------------------------------------------- */
/* Generic CRUD helpers used by every "table"                              */
/* ---------------------------------------------------------------------- */

const DB = {
  /** Add a new record. Returns the generated id. */
  async add(storeName, record) {
    const db = await openDB();
    return reqToPromise(
      db.transaction(storeName, 'readwrite').objectStore(storeName).add(record)
    );
  },

  /** Put (insert or overwrite) a record. Returns the id. */
  async put(storeName, record) {
    const db = await openDB();
    return reqToPromise(
      db.transaction(storeName, 'readwrite').objectStore(storeName).put(record)
    );
  },

  /** Get a single record by primary key. */
  async get(storeName, key) {
    const db = await openDB();
    return reqToPromise(
      db.transaction(storeName, 'readonly').objectStore(storeName).get(key)
    );
  },

  /** Get all records in a store (optionally via an index + query). */
  async getAll(storeName, indexName = null, query = null) {
    const db = await openDB();
    const store = db.transaction(storeName, 'readonly').objectStore(storeName);
    const target = indexName ? store.index(indexName) : store;
    return reqToPromise(target.getAll(query));
  },

  /** Get a single record by an index value (first match). */
  async getByIndex(storeName, indexName, value) {
    const db = await openDB();
    const store = db.transaction(storeName, 'readonly').objectStore(storeName);
    return reqToPromise(store.index(indexName).get(value));
  },

  /** Delete a record by primary key. */
  async delete(storeName, key) {
    const db = await openDB();
    return reqToPromise(
      db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key)
    );
  },

  /** Count all records in a store. */
  async count(storeName) {
    const db = await openDB();
    return reqToPromise(
      db.transaction(storeName, 'readonly').objectStore(storeName).count()
    );
  },

  /** Clear every record in a store. */
  async clear(storeName) {
    const db = await openDB();
    return reqToPromise(
      db.transaction(storeName, 'readwrite').objectStore(storeName).clear()
    );
  },

  /** Low-level access for multi-store transactions (e.g. completing a sale). */
  runTx,
  reqToPromise,
  openDB,
};

/* ---------------------------------------------------------------------- */
/* Settings helpers (settings store is a flat key -> value map)            */
/* ---------------------------------------------------------------------- */

const DEFAULT_SETTINGS = {
  store: {
    name: 'My Store',
    logo: null, // base64 data URL
    phone: '',
    address: '',
    currency: 'DZD',
  },
  appearance: {
    theme: 'system', // 'light' | 'dark' | 'system'
    accentColor: '#AC5FDB',
  },
  pos: {
    defaultPaymentMethod: 'cash',
    taxPercent: 0,
    taxEnabled: false,
    confirmBeforeSale: true,
    receiptFooter: 'Thank you for your purchase!',
  },
  inventory: {
    lowStockWarnings: true,
    defaultMinStock: 5,
  },
  security: {
    pinEnabled: false,
    pin: null,
    biometricEnabled: false,
    biometricCredentialId: null,
  },
};

const Settings = {
  /** Get one settings section (e.g. "store", "pos"), merged with defaults. */
  async get(section) {
    const row = await DB.get('settings', section);
    const defaults = DEFAULT_SETTINGS[section] || {};
    return Object.assign({}, defaults, row ? row.value : {});
  },

  /** Save (merge + persist) one settings section. */
  async set(section, partialValue) {
    const current = await Settings.get(section);
    const merged = Object.assign({}, current, partialValue);
    await DB.put('settings', { key: section, value: merged });
    return merged;
  },

  /** Get every settings section at once, as a plain object. */
  async getAll() {
    const rows = await DB.getAll('settings');
    const result = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    for (const row of rows) {
      result[row.key] = Object.assign({}, result[row.key], row.value);
    }
    return result;
  },
};

/* ---------------------------------------------------------------------- */
/* Small ID / number utilities shared across modules                       */
/* ---------------------------------------------------------------------- */

const Ids = {
  /** Generates a receipt number like "RCPT-20260822-0001x9F2". */
  receiptNumber() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `RCPT-${y}${m}${d}-${rand}`;
  },

  /** Generates an internal barcode/SKU for products that don't have one, e.g. "INT-000123-4821". */
  internalBarcode() {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const ts = Date.now().toString().slice(-6);
    return `INT-${ts}-${rand}`;
  },
};

// Expose on window for plain-script (non-module) usage across files.
window.DB = DB;
window.Settings = Settings;
window.Ids = Ids;
