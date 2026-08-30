/**
 * products.js — Product Management
 *
 * Registers the "products" route (list + search/filter/sort) and provides
 * ProductForm (add/edit, used here and reused by scanner.js's "Product not
 * found -> Create Product" flow) plus ProductDetail (view/duplicate/adjust
 * stock/delete). All persistence goes through DB from db.js.
 */

const Products = (() => {
  let searchQuery = '';
  let activeCategory = 'All';
  let sortMode = 'name'; // 'name' | 'stock' | 'price'

  /* ---------------------------------------------------------------- */
  /* Code 39 barcode rendering — real, scannable, no library needed.   */
  /* Standard Code 39 character set: 0-9, A-Z, and - . space $ / + %   */
  /* ---------------------------------------------------------------- */

  const CODE39_PATTERNS = {
    '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
    '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
    '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
    'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
    'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
    'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
    'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
    'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
    'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
    '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
    '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100',
  };

  /** True if `code` can be rendered as a real Code 39 barcode. */
  function isCode39Compatible(code) {
    if (!code) return false;
    return [...code.toUpperCase()].every((c) => CODE39_PATTERNS[c]);
  }

  /** Draws `code` as a Code 39 barcode onto `canvas`. Returns false if the
   * code contains characters Code 39 can't represent (caller should show
   * a fallback instead). */
  function drawCode39(canvas, code, { narrow = 2, height = 70 } = {}) {
    const text = code.toUpperCase();
    if (!isCode39Compatible(text)) return false;

    const wide = narrow * 2.5;
    const chars = `*${text}*`.split('');
    const widthsPerChar = chars.map((c) =>
      CODE39_PATTERNS[c].split('').map((b) => (b === '1' ? wide : narrow))
    );
    const interGap = narrow;
    const totalWidth = widthsPerChar.reduce((sum, w) => sum + w.reduce((a, b) => a + b, 0), 0)
      + interGap * (chars.length - 1);

    const dpr = window.devicePixelRatio || 1;
    const quietZone = narrow * 10; // Code 39 needs quiet space on each side
    const cssWidth = totalWidth + quietZone * 2;
    canvas.width = cssWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cssWidth, height);
    ctx.fillStyle = '#000';

    let x = quietZone;
    widthsPerChar.forEach((widths, ci) => {
      widths.forEach((w, i) => {
        const isBar = i % 2 === 0; // elements alternate bar, space, bar, ...
        if (isBar) ctx.fillRect(x, 0, w, height);
        x += w;
      });
      if (ci < widthsPerChar.length - 1) x += interGap;
    });
    return true;
  }

  function openBarcodeView(product) {
    const code = product.barcode || product.sku;
    if (!code) { Toast.error('This product has no barcode or SKU to display'); return; }

    const compatible = isCode39Compatible(code);
    const bodyHTML = `
      <div style="background:#fff; border-radius:12px; padding:16px; display:flex; flex-direction:column; align-items:center;">
        ${compatible
          ? `<canvas id="barcodeCanvas"></canvas>`
          : `<div style="padding:24px; color:#666; text-align:center; font-size:13px;">This code uses characters Code 39 can't encode as bars — shown as text only below.</div>`
        }
        <div style="font-family:var(--font-num); font-size:13px; letter-spacing:2px; color:#111; margin-top:8px;">${escapeHTML(code)}</div>
      </div>
      <div class="text-dim text-sm mt-16" style="text-align:center;">${escapeHTML(product.name)}</div>
    `;
    const footerHTML = `
      <div class="flex gap-8">
        <button class="btn btn-secondary tappable" id="printBarcodeBtn">🖨️ Print</button>
        <button class="btn btn-secondary tappable" id="shareBarcodeBtn">📤 Share</button>
      </div>`;

    const sheetEl = Sheet.open({ title: 'Barcode', bodyHTML, footerHTML });
    if (compatible) {
      const canvas = sheetEl.querySelector('#barcodeCanvas');
      drawCode39(canvas, code);
    }

    sheetEl.querySelector('#printBarcodeBtn').addEventListener('click', () => {
      const printHTML = `
        <div style="text-align:center; padding:20px;">
          ${compatible ? sheetEl.querySelector('#barcodeCanvas').outerHTML : ''}
          <div style="font-family:monospace; font-size:13px; letter-spacing:2px; margin-top:8px;">${escapeHTML(code)}</div>
          <div style="font-size:12px; color:#444; margin-top:4px;">${escapeHTML(product.name)}</div>
        </div>`;
      // Canvas pixel data doesn't survive outerHTML on some browsers when
      // detached from the DOM — redraw once the print node is attached.
      printGenericHTML(printHTML);
      if (compatible) {
        setTimeout(() => {
          const printedCanvas = document.querySelector('#printArea canvas');
          if (printedCanvas) drawCode39(printedCanvas, code);
        }, 30);
      }
    });
    sheetEl.querySelector('#shareBarcodeBtn').addEventListener('click', async () => {
      const shared = await shareText({ title: product.name, text: code });
      if (!shared && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
        Toast.show('Sharing isn\u2019t supported on this browser');
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* List view                                                         */
  /* ---------------------------------------------------------------- */

  async function render(container, params = []) {
    setProductsTopbar();
    await renderShell(container);
    if (params[0] === 'new') {
      // Let the list paint first, then open the add-product sheet on top —
      // supports the dashboard's "Add Product" quick action deep link.
      setTimeout(() => openForm(), 50);
    }
  }

  function setProductsTopbar() {
    const actions = document.getElementById('topbarActions');
    actions.innerHTML = `
      <button class="icon-btn tappable" id="categoriesBtn" title="Manage categories">🏷️</button>
      <button class="icon-btn tappable" id="sortBtn" title="Sort">⇅</button>
      <button class="icon-btn tappable" id="addProductBtn" title="Add product">➕</button>
    `;
    actions.querySelector('#categoriesBtn').addEventListener('click', openCategoryManager);
    actions.querySelector('#sortBtn').addEventListener('click', cycleSortMode);
    actions.querySelector('#addProductBtn').addEventListener('click', () => openForm());
  }

  /* ---------------------------------------------------------------- */
  /* Category management: create, rename (bulk-updates every product   */
  /* using it), delete (safely reassigns affected products rather than */
  /* orphaning them), with a live product count per category.          */
  /* ---------------------------------------------------------------- */

  async function openCategoryManager() {
    const products = await DB.getAll('products');
    const categories = uniqueCategories(products);

    const bodyHTML = `
      <div class="field">
        <label>New category</label>
        <div class="flex gap-8">
          <input type="text" id="newCategoryInput" placeholder="e.g. Beverages" style="flex:1;">
          <button class="btn btn-primary btn-sm tappable" id="addCategoryBtn" style="width:auto; padding:0 16px;">Add</button>
        </div>
      </div>
      <div class="section-title">Existing Categories</div>
      <div class="list" id="categoryManagerList">
        ${categories.length ? categories.map((cat) => categoryRowHTML(cat, products)).join('') : `
          <div class="empty-state">
            <div class="empty-state__icon">🏷️</div>
            <div class="empty-state__title">No categories yet</div>
            <div class="empty-state__hint">Categories appear here once a product uses one.</div>
          </div>
        `}
      </div>
    `;
    const sheetEl = Sheet.open({ title: 'Manage Categories', bodyHTML });

    sheetEl.querySelector('#addCategoryBtn').addEventListener('click', () => {
      const input = sheetEl.querySelector('#newCategoryInput');
      const name = input.value.trim();
      if (!name) { Toast.error('Enter a category name'); return; }
      // A category with no products yet isn't stored anywhere on its own
      // (categories only exist as strings on products) — the honest thing
      // is to let the user know it'll appear once they assign it, rather
      // than pretend to create an empty record.
      input.value = '';
      Toast.show(`"${name}" will appear once a product uses it — try adding it from a product's Category field`);
    });

    wireCategoryRows(sheetEl);
  }

  function categoryRowHTML(cat, products) {
    const count = products.filter((p) => (p.category || 'Uncategorized') === cat).length;
    return `
      <div class="list-row" data-category-row="${escapeHTML(cat)}">
        <div class="list-row__icon">🏷️</div>
        <div class="list-row__body">
          <div class="list-row__title">${escapeHTML(cat)}</div>
          <div class="list-row__subtitle">${count} product${count !== 1 ? 's' : ''}</div>
        </div>
        <div class="list-row__trailing flex gap-8">
          <button class="chip tappable" data-rename-category="${escapeHTML(cat)}">Rename</button>
          <button class="chip tappable" data-delete-category="${escapeHTML(cat)}" style="color:var(--coral);">Delete</button>
        </div>
      </div>`;
  }

  function wireCategoryRows(sheetEl) {
    sheetEl.querySelectorAll('[data-rename-category]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const oldName = btn.dataset.renameCategory;
        const newName = prompt(`Rename category "${oldName}" to:`, oldName);
        if (!newName || !newName.trim() || newName.trim() === oldName) return;
        const products = await DB.getAll('products');
        const affected = products.filter((p) => (p.category || 'Uncategorized') === oldName);
        for (const p of affected) {
          await DB.put('products', { ...p, category: newName.trim(), lastUpdated: new Date() });
        }
        Toast.success(`Renamed to "${newName.trim()}" (${affected.length} product${affected.length !== 1 ? 's' : ''})`);
        Sheet.close();
        setTimeout(openCategoryManager, 260);
        if (Router.current === 'products') renderShell(document.getElementById('view'));
      });
    });
    sheetEl.querySelectorAll('[data-delete-category]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cat = btn.dataset.deleteCategory;
        const products = await DB.getAll('products');
        const affected = products.filter((p) => (p.category || 'Uncategorized') === cat);
        if (!confirm(`Delete category "${cat}"? ${affected.length} product${affected.length !== 1 ? 's' : ''} will move to Uncategorized — none will be deleted.`)) return;
        for (const p of affected) {
          await DB.put('products', { ...p, category: '', lastUpdated: new Date() });
        }
        Toast.success(`"${cat}" deleted — products moved to Uncategorized`);
        Sheet.close();
        setTimeout(openCategoryManager, 260);
        if (Router.current === 'products') renderShell(document.getElementById('view'));
      });
    });
  }

  function cycleSortMode() {
    const order = ['name', 'stock', 'price'];
    sortMode = order[(order.indexOf(sortMode) + 1) % order.length];
    const labels = { name: 'Name (A–Z)', stock: 'Stock (low first)', price: 'Price (low first)' };
    Toast.show(`Sorted by ${labels[sortMode]}`);
    renderResults(document.getElementById('view'));
  }

  let searchDebounceTimer = null;

  async function renderShell(container) {
    const products = await DB.getAll('products');
    const categories = ['All', ...uniqueCategories(products)];

    container.innerHTML = `
      <div class="search-bar">
        <span class="search-bar__icon">🔍</span>
        <input type="text" id="productSearch" placeholder="Search name, barcode, SKU..." value="${escapeHTML(searchQuery)}">
        <button class="search-bar__clear tappable" id="clearSearch" style="${searchQuery ? '' : 'display:none;'}">✕</button>
      </div>

      <div class="chip-row" id="categoryChips">
        ${categories.map((c) => `<button class="chip tappable${c === activeCategory ? ' active' : ''}" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join('')}
      </div>

      <div id="productListWrap"></div>
    `;

    const searchInput = container.querySelector('#productSearch');
    const clearBtn = container.querySelector('#clearSearch');

    // Belt-and-suspenders: explicitly defocus on mount. The input is
    // never destroyed/recreated after this (see below), so this is the
    // only point where anything (autofill heuristics, a leftover focus
    // from whatever screen was open before) could sneak the keyboard
    // open without the user actually tapping the field.
    searchInput.blur();

    // This input element is built exactly once per tab visit and never
    // recreated afterward — typing filters the results below it without
    // ever touching the input itself, so there's nothing to lose focus
    // and nothing to manually refocus. A short debounce also avoids
    // re-querying and re-rendering the list on every single keystroke.
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      clearBtn.style.display = searchQuery ? '' : 'none';
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => renderResults(container), 120);
    });

    clearBtn.addEventListener('click', () => {
      searchQuery = '';
      searchInput.value = '';
      clearBtn.style.display = 'none';
      renderResults(container);
      searchInput.focus(); // a deliberate tap on a button — fine to focus here
    });

    container.querySelectorAll('#categoryChips .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        activeCategory = chip.dataset.cat;
        container.querySelectorAll('#categoryChips .chip').forEach((c) => c.classList.toggle('active', c === chip));
        renderResults(container);
      });
    });

    await renderResults(container);
  }

  async function renderResults(container) {
    const products = await DB.getAll('products');

    let filtered = products.filter((p) => {
      const matchesSearch = !searchQuery || [p.name, p.barcode, p.sku, p.category]
        .filter(Boolean)
        .some((f) => f.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = activeCategory === 'All' || (p.category || 'Uncategorized') === activeCategory;
      return matchesSearch && matchesCategory;
    });

    filtered = sortProducts(filtered, sortMode);

    const wrap = container.querySelector('#productListWrap');
    if (!wrap) return; // navigated away from Products before this resolved
    wrap.innerHTML = filtered.length ? `
      <div class="list stagger" id="productList">
        ${filtered.map(productRowHTML).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-state__icon">📦</div>
        <div class="empty-state__title">${products.length ? 'No products match' : 'No products yet'}</div>
        <div class="empty-state__hint">${products.length ? 'Try a different search or category.' : 'Tap the + button above to add your first product.'}</div>
      </div>
    `;

    // Swipe actions + tap-to-view
    const listEl = wrap.querySelector('#productList');
    if (listEl) {
      enableSwipeRows(listEl, {
        onEdit: async (id) => openForm(await DB.get('products', Number(id))),
        onDelete: async (id) => confirmDelete(Number(id), container),
      });
      listEl.querySelectorAll('[data-open-detail]').forEach((row) => {
        row.addEventListener('click', async () => {
          const p = await DB.get('products', Number(row.dataset.openDetail));
          if (p) openDetail(p);
        });
      });
    }
  }

  function uniqueCategories(products) {
    const set = new Set(products.map((p) => p.category || 'Uncategorized'));
    return [...set].sort();
  }

  function sortProducts(list, mode) {
    const copy = [...list];
    if (mode === 'name') copy.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (mode === 'stock') copy.sort((a, b) => (a.quantity || 0) - (b.quantity || 0));
    if (mode === 'price') copy.sort((a, b) => (a.sellingPrice || 0) - (b.sellingPrice || 0));
    return copy;
  }

  function stockBadge(p) {
    const qty = p.quantity ?? 0;
    const min = p.minStock ?? 0;
    if (qty <= 0) return `<span class="badge badge--danger">Out of stock</span>`;
    if (qty <= min) return `<span class="badge badge--warn">Low · ${qty}</span>`;
    return `<span class="badge badge--success">${qty} in stock</span>`;
  }

  function productRowHTML(p) {
    const thumb = p.image
      ? `<img src="${p.image}" alt="">`
      : '📦';
    const inner = `
      <div class="list-row tappable" data-open-detail="${p.id}">
        <div class="list-row__icon">${thumb}</div>
        <div class="list-row__body">
          <div class="list-row__title">${escapeHTML(p.name)}</div>
          <div class="list-row__subtitle">${escapeHTML(p.category || 'Uncategorized')} · ${escapeHTML(p.sku || 'No SKU')}</div>
        </div>
        <div class="list-row__trailing">
          <div class="list-row__amount num">${Fmt.money(p.sellingPrice)}</div>
          <div class="mt-8">${stockBadge(p)}</div>
        </div>
      </div>`;
    return swipeRowHTML(inner, { id: p.id });
  }

  async function confirmDelete(id, container) {
    const p = await DB.get('products', id);
    if (!p) return;
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) {
      renderResults(container); // snap swiped row back
      return;
    }
    await DB.delete('products', id);
    Toast.success(`${p.name} deleted`);
    renderResults(container);
  }

  /* ---------------------------------------------------------------- */
  /* Add / Edit form (Sheet)                                           */
  /* ---------------------------------------------------------------- */

  function openForm(existing = null, opts = {}) {
    const isEdit = !!existing;
    const p = existing || {
      name: '', barcode: opts.prefillBarcode || '', sku: '', category: '',
      purchasePrice: '', sellingPrice: '', discountPrice: '', quantity: 0,
      minStock: 5, supplier: '', description: '', unit: 'pcs', image: null,
    };

    const bodyHTML = `
      <div class="image-picker tappable" id="imagePicker">
        ${p.image ? `<img src="${p.image}" alt="">` : `<span class="image-picker__icon">📷</span><span>Add photo</span>`}
      </div>
      <input type="file" accept="image/*" capture="environment" id="imageInput" style="display:none">

      <div class="field">
        <label>Product name *</label>
        <input type="text" id="f_name" value="${escapeHTML(p.name)}" placeholder="e.g. Coca Cola 1L">
      </div>

      <div class="field-row">
        <div class="field">
          <label>Barcode</label>
          <input type="text" id="f_barcode" value="${escapeHTML(p.barcode)}" placeholder="Scan or type">
        </div>
        <div class="field" style="flex:0 0 auto; align-self:flex-end;">
          <button class="btn btn-secondary btn-sm tappable" id="scanBarcodeFieldBtn" type="button" title="Scan barcode">📷</button>
        </div>
        <div class="field" style="flex:0 0 auto; align-self:flex-end;">
          <button class="btn btn-secondary btn-sm tappable" id="genBarcodeBtn" type="button">Generate</button>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>SKU</label>
          <input type="text" id="f_sku" value="${escapeHTML(p.sku)}" placeholder="Optional">
        </div>
        <div class="field">
          <label>Category</label>
          <input type="text" id="f_category" value="${escapeHTML(p.category)}" placeholder="e.g. Drinks" list="categoryList">
          <datalist id="categoryList"></datalist>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>Purchase price</label>
          <input type="number" inputmode="decimal" id="f_purchasePrice" value="${p.purchasePrice}" placeholder="0" min="0">
        </div>
        <div class="field">
          <label>Selling price *</label>
          <input type="number" inputmode="decimal" id="f_sellingPrice" value="${p.sellingPrice}" placeholder="0" min="0">
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>Discount price</label>
          <input type="number" inputmode="decimal" id="f_discountPrice" value="${p.discountPrice ?? ''}" placeholder="Optional" min="0">
        </div>
        <div class="field">
          <label>Unit</label>
          <input type="text" id="f_unit" value="${escapeHTML(p.unit || 'pcs')}" placeholder="pcs, kg, bottle...">
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>Quantity in stock</label>
          <input type="number" inputmode="numeric" id="f_quantity" value="${p.quantity}" min="0">
        </div>
        <div class="field">
          <label>Minimum stock level</label>
          <input type="number" inputmode="numeric" id="f_minStock" value="${p.minStock}" min="0">
        </div>
      </div>

      <div class="field">
        <label>Supplier</label>
        <input type="text" id="f_supplier" value="${escapeHTML(p.supplier || '')}" placeholder="Optional" list="supplierList">
        <datalist id="supplierList"></datalist>
      </div>

      <div class="field">
        <label>Description</label>
        <textarea id="f_description" placeholder="Optional notes about this product">${escapeHTML(p.description || '')}</textarea>
      </div>
    `;

    const footerHTML = `<button class="btn btn-primary tappable" id="saveProductBtn">${isEdit ? 'Save Changes' : 'Add Product'}</button>`;

    const sheetEl = Sheet.open({
      title: isEdit ? 'Edit Product' : 'Add Product',
      bodyHTML,
      footerHTML,
    });

    let imageData = p.image || null;

    // Populate category autocomplete
    DB.getAll('products').then((all) => {
      const dl = sheetEl.querySelector('#categoryList');
      dl.innerHTML = uniqueCategories(all).map((c) => `<option value="${escapeHTML(c)}">`).join('');
    });

    // Populate supplier autocomplete from the supplier directory
    DB.getAll('suppliers').then((all) => {
      const dl = sheetEl.querySelector('#supplierList');
      if (dl) dl.innerHTML = all.map((s) => `<option value="${escapeHTML(s.name)}">`).join('');
    });

    // Image picker
    const picker = sheetEl.querySelector('#imagePicker');
    const fileInput = sheetEl.querySelector('#imageInput');
    picker.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      imageData = await compressImageToDataURL(file);
      picker.innerHTML = `<img src="${imageData}" alt="">`;
    });

    // Scan barcode directly into the field
    sheetEl.querySelector('#scanBarcodeFieldBtn').addEventListener('click', async () => {
      const code = await Scanner.scanOnce();
      if (code) {
        sheetEl.querySelector('#f_barcode').value = code;
        Toast.success('Barcode scanned');
      }
    });

    // Generate barcode
    sheetEl.querySelector('#genBarcodeBtn').addEventListener('click', () => {
      sheetEl.querySelector('#f_barcode').value = Ids.internalBarcode();
    });

    // Save
    sheetEl.querySelector('#saveProductBtn').addEventListener('click', async () => {
      const name = sheetEl.querySelector('#f_name').value.trim();
      const sellingPrice = parseFloat(sheetEl.querySelector('#f_sellingPrice').value);
      const purchasePrice = parseFloat(sheetEl.querySelector('#f_purchasePrice').value) || 0;
      const discountPriceRaw = sheetEl.querySelector('#f_discountPrice').value;
      const discountPrice = discountPriceRaw ? parseFloat(discountPriceRaw) : null;
      const quantity = parseInt(sheetEl.querySelector('#f_quantity').value, 10) || 0;
      const minStock = parseInt(sheetEl.querySelector('#f_minStock').value, 10) || 0;
      const barcode = sheetEl.querySelector('#f_barcode').value.trim();

      if (!name) { Toast.error('Product name is required'); return; }
      if (isNaN(sellingPrice)) { Toast.error('Selling price is required'); return; }
      if (sellingPrice < 0 || purchasePrice < 0) { Toast.error('Prices can\u2019t be negative'); return; }
      if (discountPrice !== null && discountPrice < 0) { Toast.error('Discount price can\u2019t be negative'); return; }
      if (quantity < 0 || minStock < 0) { Toast.error('Stock quantities can\u2019t be negative'); return; }

      if (barcode) {
        const existing = await DB.getByIndex('products', 'barcode', barcode);
        if (existing && existing.id !== p.id) {
          Toast.error(`Barcode already used by "${existing.name}"`);
          return;
        }
      }

      const record = {
        name,
        barcode,
        sku: sheetEl.querySelector('#f_sku').value.trim(),
        category: sheetEl.querySelector('#f_category').value.trim(),
        purchasePrice,
        sellingPrice,
        discountPrice,
        quantity,
        minStock,
        supplier: sheetEl.querySelector('#f_supplier').value.trim(),
        description: sheetEl.querySelector('#f_description').value.trim(),
        unit: sheetEl.querySelector('#f_unit').value.trim() || 'pcs',
        image: imageData,
        lastUpdated: new Date(),
      };

      if (isEdit) {
        record.id = p.id;
        record.dateAdded = p.dateAdded;
        await DB.put('products', record);
        Toast.success('Product updated');
      } else {
        record.dateAdded = new Date();
        await DB.add('products', record);
        Toast.success('Product added');
      }

      Sheet.close();
      if (Router.current === 'products') renderShell(document.getElementById('view'));
      if (opts.onSaved) opts.onSaved(record);
    });
  }

  /** Resizes+compresses an image file to a JPEG data URL (max 640px wide). */
  function compressImageToDataURL(file, maxWidth = 640, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Detail view (Sheet): view, duplicate, adjust stock, delete         */
  /* ---------------------------------------------------------------- */

  function openDetail(p) {
    const bodyHTML = `
      <div class="image-picker" style="height:150px; border-style:solid;">
        ${p.image ? `<img src="${p.image}" alt="">` : `<span class="image-picker__icon">📦</span>`}
      </div>
      <div class="mt-16 flex-between">
        <div>
          <div style="font-size:18px; font-weight:700;">${escapeHTML(p.name)}</div>
          <div class="text-dim text-sm mt-8">${escapeHTML(p.category || 'Uncategorized')} · ${escapeHTML(p.sku || 'No SKU')}</div>
        </div>
        <div class="list-row__amount num" style="font-size:19px;">${Fmt.money(p.sellingPrice)}</div>
      </div>

      <div class="mt-16 stat-grid">
        <div class="stat-card">
          <div class="stat-card__label">In Stock</div>
          <div class="stat-card__value num">${p.quantity} <span style="font-size:13px; font-weight:600; color:var(--text-dim);">${escapeHTML(p.unit || 'pcs')}</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Profit / unit</div>
          <div class="stat-card__value teal num">${Fmt.money((p.sellingPrice || 0) - (p.purchasePrice || 0))}</div>
        </div>
      </div>

      <div class="section-title">Adjust Stock</div>
      <div class="card flex-between">
        <div class="stepper">
          <button class="stepper__btn tappable" id="stockMinus">−</button>
          <div class="stepper__value num" id="stockValue">${p.quantity}</div>
          <button class="stepper__btn tappable" id="stockPlus">+</button>
        </div>
        <button class="btn btn-secondary btn-sm tappable" id="saveStockBtn">Save</button>
      </div>

      <div class="section-title">Details</div>
      <div class="card">
        <div class="flex-between mt-8" style="margin-top:0;"><span class="text-dim text-sm">Barcode</span><span class="num num-id text-sm">${escapeHTML(p.barcode || '—')}</span></div>
        <div class="flex-between mt-8"><span class="text-dim text-sm">Purchase price</span><span class="num text-sm">${Fmt.money(p.purchasePrice)}</span></div>
        <div class="flex-between mt-8"><span class="text-dim text-sm">Discount price</span><span class="num text-sm">${p.discountPrice ? Fmt.money(p.discountPrice) : '—'}</span></div>
        <div class="flex-between mt-8"><span class="text-dim text-sm">Minimum stock</span><span class="num text-sm">${p.minStock}</span></div>
        <div class="flex-between mt-8"><span class="text-dim text-sm">Supplier</span><span class="text-sm">${escapeHTML(p.supplier || '—')}</span></div>
        ${p.description ? `<div class="mt-8 text-sm text-dim" style="line-height:1.5;">${escapeHTML(p.description)}</div>` : ''}
      </div>
    `;

    const footerHTML = `
      <div class="flex gap-8">
        <button class="btn btn-secondary tappable" id="barcodeBtn">Barcode</button>
        <button class="btn btn-secondary tappable" id="dupBtn">Duplicate</button>
        <button class="btn btn-secondary tappable" id="editBtn">Edit</button>
        <button class="btn btn-danger tappable" id="delBtn" style="max-width:52px; padding:0;">🗑️</button>
      </div>`;

    const sheetEl = Sheet.open({ title: 'Product Details', bodyHTML, footerHTML });

    let pendingQty = p.quantity;
    const valueEl = sheetEl.querySelector('#stockValue');
    sheetEl.querySelector('#stockMinus').addEventListener('click', () => {
      pendingQty = Math.max(0, pendingQty - 1);
      valueEl.textContent = pendingQty;
    });
    sheetEl.querySelector('#stockPlus').addEventListener('click', () => {
      pendingQty += 1;
      valueEl.textContent = pendingQty;
    });
    sheetEl.querySelector('#saveStockBtn').addEventListener('click', async () => {
      const delta = pendingQty - p.quantity;
      if (delta === 0) { Toast.show('No change'); return; }
      await DB.put('products', { ...p, quantity: pendingQty, lastUpdated: new Date() });
      await DB.add('inventoryLog', {
        productId: p.id,
        productName: p.name,
        change: delta,
        newQuantity: pendingQty,
        reason: 'Manual adjustment',
        date: new Date(),
      });
      Toast.success(`Stock updated to ${pendingQty}`);
      Sheet.close();
      if (Router.current === 'products') renderResults(document.getElementById('view'));
    });

    sheetEl.querySelector('#barcodeBtn').addEventListener('click', () => {
      Sheet.close();
      setTimeout(() => openBarcodeView(p), 260);
    });

    sheetEl.querySelector('#dupBtn').addEventListener('click', async () => {
      const copy = { ...p };
      delete copy.id;
      copy.name = `${p.name} (Copy)`;
      copy.barcode = '';
      copy.sku = '';
      copy.dateAdded = new Date();
      copy.lastUpdated = new Date();
      await DB.add('products', copy);
      Toast.success('Product duplicated');
      Sheet.close();
      if (Router.current === 'products') renderShell(document.getElementById('view'));
    });

    sheetEl.querySelector('#editBtn').addEventListener('click', () => {
      Sheet.close();
      setTimeout(() => openForm(p), 260);
    });

    sheetEl.querySelector('#delBtn').addEventListener('click', async () => {
      if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
      await DB.delete('products', p.id);
      Toast.success(`${p.name} deleted`);
      Sheet.close();
      if (Router.current === 'products') renderResults(document.getElementById('view'));
    });
  }

  return { render, openForm, openDetail };
})();

Router.register('products', Products.render);
window.Products = Products;
