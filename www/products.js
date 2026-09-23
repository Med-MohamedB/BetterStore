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
    if (!code) { Toast.error(I18n.t('products.noBarcodeToShow')); return; }

    const compatible = isCode39Compatible(code);
    const bodyHTML = `
      <div style="background:#fff; border-radius:12px; padding:16px; display:flex; flex-direction:column; align-items:center;">
        ${compatible
          ? `<canvas id="barcodeCanvas"></canvas>`
          : `<div style="padding:24px; color:#666; text-align:center; font-size:13px;">${I18n.t('products.code39Unsupported')}</div>`
        }
        <div style="font-family:var(--font-num); font-size:13px; letter-spacing:2px; color:#111; margin-top:8px;">${escapeHTML(code)}</div>
      </div>
      <div class="text-dim text-sm mt-16" style="text-align:center;">${escapeHTML(product.name)}</div>
    `;
    const footerHTML = `
      <div class="flex gap-8">
        <button class="btn btn-secondary tappable" id="printBarcodeBtn">${Icon('printer')} ${I18n.t('products.print')}</button>
        <button class="btn btn-secondary tappable" id="shareBarcodeBtn">${Icon('share')} ${I18n.t('products.share')}</button>
      </div>`;

    const sheetEl = Sheet.open({ title: I18n.t('products.barcodeSheetTitle'), bodyHTML, footerHTML });
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
        Toast.show(I18n.t('products.sharingNotSupported'));
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
      <button class="icon-btn tappable" id="categoriesBtn" title="${I18n.t('products.manageCategories')}">${Icon('tag')}</button>
      <button class="icon-btn tappable" id="sortBtn" title="${I18n.t('products.sort')}">⇅</button>
    `;
    actions.querySelector('#categoriesBtn').addEventListener('click', openCategoryManager);
    actions.querySelector('#sortBtn').addEventListener('click', cycleSortMode);
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
        <label>${I18n.t('products.newCategoryLabel')}</label>
        <div class="flex gap-8">
          <input type="text" id="newCategoryInput" placeholder="${I18n.t('products.categoryPlaceholder')}" style="flex:1;">
          <button class="btn btn-primary btn-sm tappable" id="addCategoryBtn" style="width:auto; padding:0 16px;">${I18n.t('common.add')}</button>
        </div>
      </div>
      <div class="section-title">${I18n.t('products.existingCategories')}</div>
      <div class="list" id="categoryManagerList">
        ${categories.length ? categories.map((cat) => categoryRowHTML(cat, products)).join('') : `
          <div class="empty-state">
            <div class="empty-state__icon">${Icon('tag', { size: 32 })}</div>
            <div class="empty-state__title">${I18n.t('products.noCategoriesYet')}</div>
            <div class="empty-state__hint">${I18n.t('products.categoriesHint')}</div>
          </div>
        `}
      </div>
    `;
    const sheetEl = Sheet.open({ title: I18n.t('products.manageCategoriesTitle'), bodyHTML });

    sheetEl.querySelector('#addCategoryBtn').addEventListener('click', () => {
      const input = sheetEl.querySelector('#newCategoryInput');
      const name = input.value.trim();
      if (!name) { Toast.error(I18n.t('products.enterCategoryName')); return; }
      // A category with no products yet isn't stored anywhere on its own
      // (categories only exist as strings on products) — the honest thing
      // is to let the user know it'll appear once they assign it, rather
      // than pretend to create an empty record.
      input.value = '';
      Toast.show(I18n.t('products.categoryWillAppear', { name }));
    });

    wireCategoryRows(sheetEl);
  }

  function categoryRowHTML(cat, products) {
    const count = products.filter((p) => (p.category || 'Uncategorized') === cat).length;
    return `
      <div class="list-row" data-category-row="${escapeHTML(cat)}">
        <div class="list-row__icon">${Icon('tag')}</div>
        <div class="list-row__body">
          <div class="list-row__title">${escapeHTML(cat)}</div>
          <div class="list-row__subtitle">${count} product${count !== 1 ? 's' : ''}</div>
        </div>
        <div class="list-row__trailing flex gap-8">
          <button class="chip tappable" data-rename-category="${escapeHTML(cat)}">${I18n.t('products.rename')}</button>
          <button class="chip tappable" data-delete-category="${escapeHTML(cat)}" style="color:var(--coral);">${I18n.t('common.delete')}</button>
        </div>
      </div>`;
  }

  function wireCategoryRows(sheetEl) {
    sheetEl.querySelectorAll('[data-rename-category]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const oldName = btn.dataset.renameCategory;
        const newName = prompt(I18n.t('products.renamePromptTitle', { old: oldName }), oldName);
        if (!newName || !newName.trim() || newName.trim() === oldName) return;
        const products = await DB.getAll('products');
        const affected = products.filter((p) => (p.category || 'Uncategorized') === oldName);
        for (const p of affected) {
          await DB.put('products', { ...p, category: newName.trim(), lastUpdated: new Date() });
        }
        Toast.success(I18n.t('products.renamedToast', { name: newName.trim(), count: affected.length, plural: affected.length !== 1 ? 's' : '' }));
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
        if (!(await Confirm.show(I18n.t('products.deleteCategoryConfirm', { cat, count: affected.length, plural: affected.length !== 1 ? 's' : '' }), { danger: true, confirmText: I18n.t('products.deleteCategory') }))) return;
        for (const p of affected) {
          await DB.put('products', { ...p, category: '', lastUpdated: new Date() });
        }
        Toast.success(I18n.t('products.categoryDeletedToast', { cat }));
        Sheet.close();
        setTimeout(openCategoryManager, 260);
        if (Router.current === 'products') renderShell(document.getElementById('view'));
      });
    });
  }

  function cycleSortMode() {
    const order = ['name', 'stock', 'price'];
    sortMode = order[(order.indexOf(sortMode) + 1) % order.length];
    const labels = { name: I18n.t('products.sortName'), stock: I18n.t('products.sortStock'), price: I18n.t('products.sortPrice') };
    Toast.show(I18n.t('products.sortedBy', { label: labels[sortMode] }));
    renderResults(document.getElementById('view'));
  }

  let searchDebounceTimer = null;

  async function renderShell(container) {
    const products = await DB.getAll('products');
    const categories = ['All', ...uniqueCategories(products)];

    container.innerHTML = `
      <div class="search-bar">
        <span class="search-bar__icon">${Icon('search')}</span>
        <input type="text" id="productSearch" placeholder="${I18n.t('products.searchPlaceholder')}" value="${escapeHTML(searchQuery)}">
        <button class="search-bar__clear tappable" id="clearSearch" style="${searchQuery ? '' : 'display:none;'}">${Icon('x', { size: 14 })}</button>
      </div>

      <div class="chip-row" id="categoryChips">
        ${categories.map((c) => `<button class="chip tappable${c === activeCategory ? ' active' : ''}" data-cat="${escapeHTML(c)}">${escapeHTML(c === 'All' ? I18n.t('common.all') : c === 'Uncategorized' ? I18n.t('products.uncategorized') : c)}</button>`).join('')}
      </div>

      <div id="productListWrap"></div>
      <button class="screen-fab tappable" id="productFab" title="${I18n.t('products.addProduct')}">${Icon('plus')}</button>
    `;
    container.querySelector('#productFab').addEventListener('click', () => openForm());

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
      <div class="empty-state${products.length ? '' : ' empty-state--illustrated'}">
        ${products.length
          ? `<div class="empty-state__icon">${Icon('package', { size: 32 })}</div>`
          : `<img class="empty-state__illustration" src="${themedIllustration('empty-products')}" alt="">`}
        <div class="empty-state__title">${products.length ? I18n.t('products.noProductsMatch') : I18n.t('products.noProductsYet')}</div>
        <div class="empty-state__hint">${products.length ? I18n.t('products.tryDifferentSearch') : I18n.t('products.tapToAddFirst')}</div>
      </div>
    `;

    // Swipe actions + tap-to-view
    const listEl = wrap.querySelector('#productList');
    if (!filtered.length && !products.length) {
      const fab = document.getElementById('productFab');
      if (fab) DoodleHint.show('addFirstProduct', fab, I18n.t('products.addFirstProductHint'), 'br');
    }
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
    if (qty <= 0) return `<span class="badge badge--danger">${I18n.t('products.outOfStock')}</span>`;
    if (qty <= min) return `<span class="badge badge--warn">${I18n.t('products.lowStock', { qty })}</span>`;
    return `<span class="badge badge--success">${I18n.t('products.inStock', { qty })}</span>`;
  }

  function productRowHTML(p) {
    const thumb = p.image
      ? `<img src="${p.image}" alt="">`
      : Icon('package');
    const inner = `
      <div class="list-row tappable" data-open-detail="${p.id}">
        <div class="list-row__icon">${thumb}</div>
        <div class="list-row__body">
          <div class="list-row__title">${escapeHTML(p.name)}</div>
          <div class="list-row__subtitle">${escapeHTML(p.category || I18n.t('products.uncategorized'))} · ${p.sku ? `<span class="ltr-code">${escapeHTML(p.sku)}</span>` : escapeHTML(I18n.t('products.noSku'))}</div>
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
    if (!(await Confirm.show(I18n.t('products.form.deleteConfirm', { name: p.name }), { danger: true }))) {
      renderResults(container); // snap swiped row back
      return;
    }
    await DB.delete('products', id);
    Toast.success(I18n.t('products.detail.deleted', { name: p.name }));
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
        ${p.image ? `<img src="${p.image}" alt="">` : `<span class="image-picker__icon">${Icon('camera', { size: 28 })}</span><span>${I18n.t('products.form.addPhoto')}</span>`}
      </div>
      <input type="file" accept="image/*" capture="environment" id="imageInput" style="display:none">

      <div class="field">
        <label>${I18n.t('products.form.nameLabel')}</label>
        <input type="text" id="f_name" value="${escapeHTML(p.name)}" placeholder="${I18n.t('products.form.namePlaceholder')}">
      </div>

      <div class="field-row">
        <div class="field">
          <label>${I18n.t('products.form.barcodeLabel')}</label>
          <input type="text" id="f_barcode" dir="ltr" class="ltr-code" value="${escapeHTML(p.barcode)}" placeholder="${I18n.t('products.form.barcodePlaceholder')}">
        </div>
        <div class="field" style="flex:0 0 auto; align-self:flex-end;">
          <button class="btn btn-secondary btn-sm tappable" id="scanBarcodeFieldBtn" type="button" title="${I18n.t('products.form.scanBarcode')}">${Icon('camera')}</button>
        </div>
        <div class="field" style="flex:0 0 auto; align-self:flex-end;">
          <button class="btn btn-secondary btn-sm tappable" id="genBarcodeBtn" type="button">${I18n.t('products.form.generate')}</button>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>${I18n.t('products.form.skuLabel')}</label>
          <input type="text" id="f_sku" dir="ltr" class="ltr-code" value="${escapeHTML(p.sku)}" placeholder="${I18n.t('products.form.optional')}">
        </div>
        <div class="field">
          <label>${I18n.t('products.form.categoryLabel')}</label>
          <input type="text" id="f_category" value="${escapeHTML(p.category)}" placeholder="${I18n.t('products.form.categoryPlaceholder')}" list="categoryList">
          <datalist id="categoryList"></datalist>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>${I18n.t('products.form.purchasePriceLabel')}</label>
          <input type="number" inputmode="decimal" id="f_purchasePrice" value="${p.purchasePrice}" placeholder="0" min="0">
        </div>
        <div class="field">
          <label>${I18n.t('products.form.sellingPriceLabel')}</label>
          <input type="number" inputmode="decimal" id="f_sellingPrice" value="${p.sellingPrice}" placeholder="0" min="0">
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>${I18n.t('products.form.discountPriceLabel')}</label>
          <input type="number" inputmode="decimal" id="f_discountPrice" value="${p.discountPrice ?? ''}" placeholder="${I18n.t('products.form.optional')}" min="0">
        </div>
        <div class="field">
          <label>${I18n.t('products.form.unitLabel')}</label>
          <input type="text" id="f_unit" value="${escapeHTML(p.unit || 'pcs')}" placeholder="${I18n.t('products.form.unitPlaceholder')}">
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>${I18n.t('products.form.stockLabel')}</label>
          <input type="number" inputmode="numeric" id="f_quantity" value="${p.quantity}" min="0">
        </div>
        <div class="field">
          <label>${I18n.t('products.form.minStockLabel')}</label>
          <input type="number" inputmode="numeric" id="f_minStock" value="${p.minStock}" min="0">
        </div>
      </div>

      <div class="field">
        <label>${I18n.t('products.form.supplierLabel')}</label>
        <input type="text" id="f_supplier" value="${escapeHTML(p.supplier || '')}" placeholder="${I18n.t('products.form.optional')}" list="supplierList">
        <datalist id="supplierList"></datalist>
      </div>

      <div class="field">
        <label>${I18n.t('products.form.descriptionLabel')}</label>
        <textarea id="f_description" placeholder="${I18n.t('products.form.descriptionPlaceholder')}">${escapeHTML(p.description || '')}</textarea>
      </div>
    `;

    const footerHTML = `<button class="btn btn-primary tappable" id="saveProductBtn">${isEdit ? I18n.t('products.form.saveChanges') : I18n.t('products.form.addTitle')}</button>`;

    const sheetEl = Sheet.open({
      title: isEdit ? I18n.t('products.form.editTitle') : I18n.t('products.form.addTitle'),
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
        const barcodeInput = sheetEl.querySelector('#f_barcode');
        barcodeInput.value = code;
        barcodeInput.focus();
        Toast.success(I18n.t('products.form.barcodeScanned'));
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

      if (!name) { Toast.error(I18n.t('products.form.nameRequired')); return; }
      if (isNaN(sellingPrice)) { Toast.error(I18n.t('products.form.priceRequired')); return; }
      if (sellingPrice < 0 || purchasePrice < 0) { Toast.error(I18n.t('products.form.pricesNegative')); return; }
      if (discountPrice !== null && discountPrice < 0) { Toast.error(I18n.t('products.form.discountNegative')); return; }
      if (quantity < 0 || minStock < 0) { Toast.error(I18n.t('products.form.stockNegative')); return; }

      if (barcode) {
        const existing = await DB.getByIndex('products', 'barcode', barcode);
        if (existing && existing.id !== p.id) {
          Toast.error(I18n.t('products.form.barcodeUsed', { name: existing.name }));
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
        Toast.success(I18n.t('products.form.updated'));
      } else {
        record.dateAdded = new Date();
        await DB.add('products', record);
        Toast.success(I18n.t('products.form.added'));
        DoodleHint.complete('addFirstProduct');
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
        ${p.image ? `<img src="${p.image}" alt="">` : `<span class="image-picker__icon">${Icon('package', { size: 28 })}</span>`}
      </div>
      <div class="mt-16 flex-between">
        <div>
          <div style="font-size:18px; font-weight:700;">${escapeHTML(p.name)}</div>
          <div class="text-dim text-sm mt-8">${escapeHTML(p.category || I18n.t('products.uncategorized'))} · ${p.sku ? `<span class="ltr-code">${escapeHTML(p.sku)}</span>` : escapeHTML(I18n.t('products.noSku'))}</div>
        </div>
        <div class="list-row__amount num" style="font-size:19px;">${Fmt.money(p.sellingPrice)}</div>
      </div>

      <div class="mt-16 stat-grid">
        <div class="stat-card">
          <div class="stat-card__label">${I18n.t('products.detail.inStock')}</div>
          <div class="stat-card__value num">${p.quantity} <span style="font-size:13px; font-weight:600; color:var(--text-dim);">${escapeHTML(p.unit || 'pcs')}</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">${I18n.t('products.detail.profitPerUnit')}</div>
          <div class="stat-card__value teal num">${Fmt.money((p.sellingPrice || 0) - (p.purchasePrice || 0))}</div>
        </div>
      </div>

      <div class="section-title">${I18n.t('products.detail.adjustStock')}</div>
      <div class="card flex-between">
        <div class="stepper">
          <button class="stepper__btn tappable" id="stockMinus">−</button>
          <div class="stepper__value num" id="stockValue">${p.quantity}</div>
          <button class="stepper__btn tappable" id="stockPlus">+</button>
        </div>
        <button class="btn btn-secondary btn-sm tappable" id="saveStockBtn">${I18n.t('common.save')}</button>
      </div>
      <button class="btn btn-secondary tappable mt-8" id="restockBtn" style="width:100%;">${Icon('package')} ${I18n.t('products.detail.restock')}</button>

      <div class="section-title">${I18n.t('products.detail.details')}</div>
      <div class="card">
        <div class="flex-between mt-8" style="margin-top:0;"><span class="text-dim text-sm">${I18n.t('products.detail.barcode')}</span><span class="num num-id ltr-code text-sm">${escapeHTML(p.barcode || '—')}</span></div>
        <div class="flex-between mt-8"><span class="text-dim text-sm">${I18n.t('products.detail.purchasePrice')}</span><span class="num text-sm">${Fmt.money(p.purchasePrice)}</span></div>
        <div class="flex-between mt-8"><span class="text-dim text-sm">${I18n.t('products.detail.discountPrice')}</span><span class="num text-sm">${p.discountPrice ? Fmt.money(p.discountPrice) : '—'}</span></div>
        <div class="flex-between mt-8"><span class="text-dim text-sm">${I18n.t('products.detail.minStock')}</span><span class="num text-sm">${p.minStock}</span></div>
        <div class="flex-between mt-8"><span class="text-dim text-sm">${I18n.t('products.detail.supplier')}</span><span class="text-sm">${escapeHTML(p.supplier || '—')}</span></div>
        ${p.description ? `<div class="mt-8 text-sm text-dim" style="line-height:1.5;">${escapeHTML(p.description)}</div>` : ''}
      </div>
    `;

    const footerHTML = `
      <div class="flex gap-8">
        <button class="btn btn-secondary tappable" id="barcodeBtn">${I18n.t('products.detail.barcode')}</button>
        <button class="btn btn-secondary tappable" id="dupBtn">${I18n.t('products.detail.duplicate')}</button>
        <button class="btn btn-secondary tappable" id="editBtn">${I18n.t('common.edit')}</button>
        <button class="btn btn-danger tappable" id="delBtn" style="max-width:52px; padding:0;">${Icon('trash')}</button>
      </div>`;

    const sheetEl = Sheet.open({ title: I18n.t('products.detail.title'), bodyHTML, footerHTML });

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
    sheetEl.querySelector('#restockBtn').addEventListener('click', () => {
      Sheet.close();
      setTimeout(() => PurchaseOrders.openForm(null, [{ productId: p.id, productName: p.name, unit: p.unit || 'pcs', qty: 1, unitCost: p.purchasePrice || 0 }]), 260);
    });
    sheetEl.querySelector('#saveStockBtn').addEventListener('click', async () => {
      const delta = pendingQty - p.quantity;
      if (delta === 0) { Toast.show(I18n.t('products.detail.noChange')); return; }
      await DB.put('products', { ...p, quantity: pendingQty, lastUpdated: new Date() });
      await DB.add('inventoryLog', {
        productId: p.id,
        productName: p.name,
        change: delta,
        newQuantity: pendingQty,
        reason: I18n.t('products.detail.manualAdjustment'),
        date: new Date(),
      });
      Toast.success(I18n.t('products.detail.stockUpdated', { qty: pendingQty }));
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
      copy.name = `${p.name}${I18n.t('products.detail.copySuffix')}`;
      copy.barcode = '';
      copy.sku = '';
      copy.dateAdded = new Date();
      copy.lastUpdated = new Date();
      await DB.add('products', copy);
      Toast.success(I18n.t('products.detail.duplicated'));
      Sheet.close();
      if (Router.current === 'products') renderShell(document.getElementById('view'));
    });

    sheetEl.querySelector('#editBtn').addEventListener('click', () => {
      Sheet.close();
      setTimeout(() => openForm(p), 260);
    });

    sheetEl.querySelector('#delBtn').addEventListener('click', async (e) => {
      Icon.shake(e.currentTarget.querySelector('.icon-svg'));
      if (!(await Confirm.show(I18n.t('products.form.deleteConfirm', { name: p.name }), { danger: true }))) return;
      await DB.delete('products', p.id);
      Toast.success(I18n.t('products.detail.deleted', { name: p.name }));
      Sheet.close();
      if (Router.current === 'products') renderResults(document.getElementById('view'));
    });
  }

  /** A search-and-pick sheet for another screen to attach a product to
   *  itself — used by purchaseorders.js to add a line item. Unlike
   *  Customers/Suppliers.openPicker there's no inline "add new" here: a
   *  product needs prices and a category to be useful, so an unmatched
   *  search just points the person at the Products screen instead. */
  function openPicker(onPick) {
    const bodyHTML = `
      <div class="search-bar">
        <span class="search-bar__icon">${Icon('search')}</span>
        <input type="text" id="prodPickerSearch" placeholder="${I18n.t('products.picker.searchPlaceholder')}">
      </div>
      <div id="prodPickerResults" class="list"></div>
    `;
    // stacked: true — commonly opened from inside another sheet (e.g. a
    // new Purchase Order form); layer on top instead of destroying it.
    const sheetEl = Sheet.open({ title: I18n.t('products.picker.title'), bodyHTML, stacked: true });
    const resultsEl = sheetEl.querySelector('#prodPickerResults');
    const searchEl = sheetEl.querySelector('#prodPickerSearch');

    async function runSearch(q) {
      const all = await DB.getAll('products');
      const filtered = !q ? all : all.filter((p) => [p.name, p.barcode, p.sku].filter(Boolean).some((f) => String(f).toLowerCase().includes(q.toLowerCase())));
      resultsEl.innerHTML = filtered.length
        ? filtered.slice(0, 50).map((p) => `
          <div class="list-row tappable" data-pick-product="${p.id}">
            <div class="list-row__icon">${p.image ? `<img src="${p.image}">` : Icon('package')}</div>
            <div class="list-row__body"><div class="list-row__title">${escapeHTML(p.name)}</div><div class="list-row__subtitle">${I18n.t('products.picker.stockSubtitle', { qty: p.quantity, cost: Fmt.money(p.purchasePrice || 0) })}</div></div>
          </div>
        `).join('')
        : `<div class="text-dim text-sm mt-16" style="text-align:center;">${I18n.t(q ? 'products.picker.noMatch' : 'products.picker.noProducts')}</div>`;
      resultsEl.querySelectorAll('[data-pick-product]').forEach((row) => {
        row.addEventListener('click', async () => {
          const p = await DB.get('products', Number(row.dataset.pickProduct));
          Sheet.close();
          onPick(p);
        });
      });
    }

    searchEl.addEventListener('input', (e) => runSearch(e.target.value));
    runSearch('');
    setTimeout(() => searchEl.focus(), 300);
  }

  return { render, openForm, openDetail, openPicker };
})();

Router.register('products', Products.render);
window.Products = Products;
