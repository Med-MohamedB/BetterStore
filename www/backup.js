/**
 * backup.js — Data Backup & Restore.
 *
 * Export: bundles every store (products, categories, sales, customers,
 * suppliers, inventoryLog, settings) into one JSON file the user can save
 * anywhere (Drive, email to self, etc.), since this is the only copy of
 * their data — it all lives in this browser's IndexedDB.
 *
 * Import: replaces each store's contents with the backup's, preserving
 * original record IDs so relational references (sale.customerId,
 * item.productId, inventoryLog.productId) stay intact. Always confirmed
 * before running, since it's destructive.
 */

const Backup = (() => {
  const STORE_NAMES = ['products', 'categories', 'sales', 'customers', 'suppliers', 'inventoryLog'];

  async function render(container) {
    document.getElementById('topbarActions').innerHTML = '';

    const counts = {};
    for (const name of STORE_NAMES) counts[name] = await DB.count(name);

    container.innerHTML = `
      <div class="section-title">What's Included</div>
      <div class="card">
        ${STORE_NAMES.map((name) => `
          <div class="flex-between text-sm" style="margin-bottom:6px;">
            <span class="text-dim" style="text-transform:capitalize;">${name.replace(/([A-Z])/g, ' $1')}</span>
            <span class="num">${counts[name]}</span>
          </div>
        `).join('')}
        <div class="flex-between text-sm" style="margin-top:6px; padding-top:10px; border-top:1px solid var(--border);">
          <span class="text-dim">Settings</span><span class="text-dim">included</span>
        </div>
      </div>

      <div class="section-title">Backup</div>
      <button class="btn btn-primary tappable" id="exportBtn">📤 Export Backup (JSON)</button>
      <button class="btn btn-secondary mt-8 tappable" id="importBtn">📥 Import Backup</button>
      <input type="file" accept="application/json" id="importFile" style="display:none">

      <div class="section-title">CSV Export</div>
      <div class="flex gap-8">
        <button class="btn btn-secondary tappable" id="csvProductsBtn" style="flex:1;">Products CSV</button>
        <button class="btn btn-secondary tappable" id="csvSalesBtn" style="flex:1;">Sales CSV</button>
      </div>

      <div class="section-title">Danger Zone</div>
      <button class="btn btn-danger tappable" id="clearDataBtn">Clear All Data</button>
    `;

    container.querySelector('#exportBtn').addEventListener('click', exportBackup);
    const fileInput = container.querySelector('#importFile');
    container.querySelector('#importBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) importBackup(fileInput.files[0], container);
      fileInput.value = '';
    });
    container.querySelector('#csvProductsBtn').addEventListener('click', exportProductsCSV);
    container.querySelector('#csvSalesBtn').addEventListener('click', exportSalesCSV);
    container.querySelector('#clearDataBtn').addEventListener('click', () => clearAllData(container));
  }

  async function downloadBlob(content, filename, type, webSuccessMessage) {
    const cap = window.Capacitor;
    const isNative = cap && cap.isNativePlatform && cap.isNativePlatform();
    const plugins = cap && cap.Plugins;

    if (!cap) {
      Toast.error('Diagnostic: window.Capacitor is missing entirely');
    } else if (!isNative) {
      Toast.error('Diagnostic: Capacitor.isNativePlatform() is false');
    } else if (!plugins || !plugins.Filesystem) {
      Toast.error('Diagnostic: Filesystem plugin not registered');
    }

    if (isNative && plugins && plugins.Filesystem) {
      try {
        // Directory.Documents needs broad storage permissions that modern
        // Android (10+) no longer grants apps by default — that's the
        // EACCES. The app's own Cache dir needs no permission at all, and
        // handing it straight to Share lets the person pick exactly where
        // it goes (Downloads, Drive, email, etc.) via the system sheet.
        const written = await plugins.Filesystem.writeFile({
          path: filename,
          data: content,
          directory: 'CACHE',
          encoding: 'utf8',
        });
        if (plugins.Share) {
          await plugins.Share.share({ title: filename, url: written.uri, dialogTitle: `Save ${filename}` });
          Toast.success(`${filename} ready \u2014 choose where to save it`);
        } else {
          Toast.error('Diagnostic: Share plugin missing, can\u2019t hand off the file');
        }
      } catch (e) {
        const msg = (e && e.message) || String(e);
        console.warn('Native file export failed:', e);
        Toast.error(`Export failed: ${msg}`);
      }
      return;
    }

    // Web fallback (unchanged)
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (webSuccessMessage) Toast.success(webSuccessMessage);
  }

  function dateStamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  async function exportBackup() {
    const data = {};
    for (const name of STORE_NAMES) data[name] = await DB.getAll(name);
    data.settings = await Settings.getAll();

    const backup = { app: 'store-app', version: 1, exportedAt: new Date().toISOString(), data };
    await downloadBlob(JSON.stringify(backup, null, 2), `store-backup-${dateStamp()}.json`, 'application/json', 'Backup exported');
  }

  async function importBackup(file, container) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (e) {
      Toast.error('That file isn\u2019t valid JSON');
      return;
    }
    if (!parsed || !parsed.data || typeof parsed.data !== 'object') {
      Toast.error('That doesn\u2019t look like a Store App backup');
      return;
    }

    // Validate structure BEFORE touching the database at all — a
    // corrupted or hand-edited backup with the wrong data types must
    // never be allowed to leave the app half-cleared.
    for (const name of STORE_NAMES) {
      const value = parsed.data[name];
      if (value !== undefined && !Array.isArray(value)) {
        Toast.error(`Backup file is corrupted: "${name}" should be a list`);
        return;
      }
    }
    if (parsed.data.settings !== undefined &&
        (typeof parsed.data.settings !== 'object' || parsed.data.settings === null || Array.isArray(parsed.data.settings))) {
      Toast.error('Backup file is corrupted: settings section is malformed');
      return;
    }

    const summary = STORE_NAMES.map((n) => `${n}: ${(parsed.data[n] || []).length}`).join(', ');
    if (!confirm(`Import this backup? This REPLACES all current data.\n\n${summary}`)) return;
    const confirmed = await Security.requirePin('Confirm your PIN to restore this backup');
    if (!confirmed) { Toast.show('Cancelled'); return; }

    try {
      // One atomic transaction across every store — either the whole
      // backup applies, or (on any error) none of it does. Without this,
      // a bad record partway through could leave some stores cleared and
      // repopulated while others were never touched.
      await DB.runTx([...STORE_NAMES, 'settings'], 'readwrite', async (tx) => {
        for (const name of STORE_NAMES) {
          const store = tx.objectStore(name);
          await DB.reqToPromise(store.clear());
          for (const record of parsed.data[name] || []) {
            if (!record || typeof record !== 'object') continue; // skip malformed entries rather than fail the whole import
            await DB.reqToPromise(store.put(record));
          }
        }
        if (parsed.data.settings) {
          const settingsStore = tx.objectStore('settings');
          await DB.reqToPromise(settingsStore.clear());
          for (const [key, value] of Object.entries(parsed.data.settings)) {
            await DB.reqToPromise(settingsStore.put({ key, value }));
          }
        }
      });
    } catch (err) {
      console.error('Import failed:', err);
      Toast.error('Import failed \u2014 your existing data was not changed');
      return;
    }

    Toast.success('Backup imported');
    await Fmt.init();
    await applyTheme();
    render(container);
  }

  function toCSVValue(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(rows, headers) {
    const lines = [headers.join(',')];
    for (const row of rows) lines.push(headers.map((h) => toCSVValue(row[h])).join(','));
    return lines.join('\n');
  }

  async function exportProductsCSV() {
    const products = await DB.getAll('products');
    const headers = ['id', 'name', 'barcode', 'sku', 'category', 'purchasePrice', 'sellingPrice', 'discountPrice', 'quantity', 'minStock', 'supplier', 'unit', 'description'];
    // A UTF-8 BOM prefix is required for Excel (especially on Windows) to
    // correctly render non-Latin text — Arabic product names, for example —
    // instead of showing mojibake. Most other spreadsheet apps ignore it.
    await downloadBlob('\uFEFF' + toCSV(products, headers), `products-${dateStamp()}.csv`, 'text/csv;charset=utf-8', 'Products CSV exported');
  }

  async function exportSalesCSV() {
    const sales = await DB.getAll('sales');
    const rows = sales.map((s) => ({
      id: s.id,
      receiptNumber: s.receiptNumber,
      date: new Date(s.date).toISOString(),
      itemCount: s.items.reduce((n, it) => n + it.qty, 0),
      subtotal: s.subtotal,
      discount: (s.itemDiscounts || 0) + (s.discount || 0),
      tax: s.tax,
      total: s.total,
      paymentMethod: s.paymentMethod,
      customerName: s.customerName || '',
      status: s.status,
    }));
    const headers = ['id', 'receiptNumber', 'date', 'itemCount', 'subtotal', 'discount', 'tax', 'total', 'paymentMethod', 'customerName', 'status'];
    await downloadBlob('\uFEFF' + toCSV(rows, headers), `sales-${dateStamp()}.csv`, 'text/csv;charset=utf-8', 'Sales CSV exported');
  }

  async function clearAllData(container) {
    if (!confirm('Delete EVERYTHING — products, sales, customers, suppliers, history? This cannot be undone. Export a backup first if you\u2019re not sure.')) return;
    if (!confirm('Really clear all data? This is your last check.')) return;
    const confirmed = await Security.requirePin('Confirm your PIN to clear all data');
    if (!confirmed) { Toast.show('Cancelled'); return; }
    for (const name of STORE_NAMES) await DB.clear(name);
    Toast.success('All data cleared');
    render(container);
  }

  return { render };
})();

Router.register('backup', Backup.render);
window.Backup = Backup;
