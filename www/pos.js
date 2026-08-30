/**
 * pos.js — Point of Sale / Checkout.
 *
 * Cart lives in memory only (POS.cart) until "Complete Sale" persists it
 * as an immutable sales record — item prices/discounts are copied onto
 * the sale at checkout time, so editing a product's price later never
 * changes historical sales (per the spec's explicit requirement).
 */

const POS = (() => {
  let cart = []; // [{ productId, name, unit, price, qty, discount, image }]
  let totalDiscount = 0;
  let selectedCustomer = null; // { id, name } | null

  /* ---------------------------------------------------------------- */
  /* Route entry point                                                  */
  /* ---------------------------------------------------------------- */

  async function render(container) {
    const actions = document.getElementById('topbarActions');
    actions.innerHTML = `
      <button class="icon-btn tappable" id="posClearBtn" title="Clear cart">🗑️</button>
    `;
    actions.querySelector('#posClearBtn').addEventListener('click', () => {
      if (!cart.length) return;
      if (confirm('Clear the current cart?')) {
        cart = []; totalDiscount = 0;
        updateCartBadge(0);
        renderCart(container);
      }
    });

    updateCartBadge(cartCount());
    renderCart(container);
  }

  function cartCount() {
    return cart.reduce((s, c) => s + c.qty, 0);
  }

  function addToCart(product, qty = 1) {
    const existing = cart.find((c) => c.productId === product.id);
    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        productId: product.id,
        name: product.name,
        unit: product.unit || 'pcs',
        price: product.discountPrice ?? product.sellingPrice,
        qty,
        discount: 0,
        image: product.image || null,
      });
    }
    updateCartBadge(cartCount());
    Toast.success(`${product.name} added`);
    if (Router.current === 'pos') renderCart(document.getElementById('view'));
  }

  /* ---------------------------------------------------------------- */
  /* Cart view                                                          */
  /* ---------------------------------------------------------------- */

  function totals() {
    const itemsSubtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const itemDiscounts = cart.reduce((s, c) => s + (c.discount || 0), 0);
    const afterItemDiscounts = itemsSubtotal - itemDiscounts;
    const afterAllDiscounts = Math.max(0, afterItemDiscounts - totalDiscount);
    return { itemsSubtotal, itemDiscounts, afterAllDiscounts };
  }

  async function renderCart(container) {
    const posSettings = await Settings.get('pos');
    const { itemsSubtotal, itemDiscounts, afterAllDiscounts } = totals();
    const taxAmount = posSettings.taxEnabled ? afterAllDiscounts * (posSettings.taxPercent / 100) : 0;
    const grandTotal = afterAllDiscounts + taxAmount;

    container.innerHTML = `
      <div class="flex gap-8">
        <button class="btn btn-secondary tappable" id="scanAddBtn" style="flex:1;">📷 Scan</button>
        <button class="btn btn-secondary tappable" id="searchAddBtn" style="flex:1;">🔍 Add Product</button>
      </div>

      <button class="list-row tappable mt-16" id="customerRow" style="width:100%; border:1px solid var(--border); cursor:pointer;">
        <div class="list-row__icon">👤</div>
        <div class="list-row__body">
          <div class="list-row__title">${selectedCustomer ? escapeHTML(selectedCustomer.name) : 'Walk-in customer'}</div>
          <div class="list-row__subtitle">${selectedCustomer ? 'Tap to change' : 'Tap to attach a customer'}</div>
        </div>
        <div class="list-row__trailing">${selectedCustomer ? `<span class="chip" id="clearCustomerChip" style="padding:4px 10px;">Clear</span>` : ''}</div>
      </button>

      <div class="section-title">Cart ${cart.length ? `· ${cart.reduce((s, c) => s + c.qty, 0)} item${cart.reduce((s, c) => s + c.qty, 0) !== 1 ? 's' : ''}` : ''}</div>

      ${cart.length ? `
        <div class="list stagger" id="cartList">
          ${cart.map(cartRowHTML).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-state__icon">🛒</div>
          <div class="empty-state__title">Cart is empty</div>
          <div class="empty-state__hint">Scan a barcode or tap "Add Product" to start a sale.</div>
        </div>
      `}

      ${cart.length ? `
        <div class="section-title">Summary</div>
        <div class="card">
          <div class="flex-between"><span class="text-dim text-sm">Subtotal</span><span class="num text-sm">${Fmt.money(itemsSubtotal)}</span></div>
          <div class="flex-between mt-8"><span class="text-dim text-sm">Item discounts</span><span class="num text-sm">− ${Fmt.money(itemDiscounts)}</span></div>
          <div class="flex-between mt-8" style="align-items:center;">
            <span class="text-dim text-sm">Total discount</span>
            <input type="number" inputmode="decimal" id="totalDiscountInput" value="${totalDiscount || ''}" placeholder="0"
              style="width:90px; height:32px; text-align:right; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); padding:0 8px;" class="num">
          </div>
          ${posSettings.taxEnabled ? `<div class="flex-between mt-8"><span class="text-dim text-sm">Tax (${posSettings.taxPercent}%)</span><span class="num text-sm">${Fmt.money(taxAmount)}</span></div>` : ''}
          <div class="flex-between mt-16" style="padding-top:12px; border-top:1px solid var(--border);">
            <span style="font-weight:700;">Total</span>
            <span class="num" style="font-weight:700; font-size:18px; color:var(--accent);">${Fmt.money(grandTotal)}</span>
          </div>
        </div>
        <button class="btn btn-primary mt-16 tappable" id="chargeBtn">Charge ${Fmt.money(grandTotal)}</button>
      ` : ''}
    `;

    container.querySelector('#scanAddBtn').addEventListener('click', () => {
      Scanner.openContinuous({
        title: 'Scan to Cart',
        onScan: async (code) => {
          const product = await DB.getByIndex('products', 'barcode', code);
          if (product) {
            addToCart(product);
            return { text: `✓ ${product.name}`, variant: 'success' };
          }
          return {
            text: `Not found: ${code} \u2014 tap to add product`,
            variant: 'warn',
            onTap: () => {
              Scanner.closeActive();
              setTimeout(() => {
                Products.openForm(null, {
                  prefillBarcode: code,
                  onSaved: (saved) => addToCart(saved),
                });
              }, 260);
            },
          };
        },
      });
    });
    container.querySelector('#searchAddBtn').addEventListener('click', openProductPicker);

    container.querySelector('#customerRow').addEventListener('click', (e) => {
      if (e.target.id === 'clearCustomerChip') {
        e.stopPropagation();
        selectedCustomer = null;
        renderCart(container);
        return;
      }
      if (window.Customers) {
        Customers.openPicker((c) => {
          selectedCustomer = c ? { id: c.id, name: c.name } : null;
          renderCart(container);
        });
      } else {
        Toast.show('Customer management isn\u2019t available yet');
      }
    });

    const cartList = container.querySelector('#cartList');
    if (cartList) {
      enableSwipeRows(cartList, {
        onDelete: (id) => {
          cart = cart.filter((c) => String(c.productId) !== String(id));
          updateCartBadge(cartCount());
          renderCart(container);
        },
      });
      cartList.querySelectorAll('[data-stepper-minus]').forEach((btn) => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); adjustQty(container, btn.dataset.stepperMinus, -1); });
      });
      cartList.querySelectorAll('[data-stepper-plus]').forEach((btn) => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); adjustQty(container, btn.dataset.stepperPlus, 1); });
      });
      cartList.querySelectorAll('[data-item-discount]').forEach((btn) => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); editItemDiscount(container, btn.dataset.itemDiscount); });
      });
    }

    const discountInput = container.querySelector('#totalDiscountInput');
    if (discountInput) {
      discountInput.addEventListener('change', (e) => {
        totalDiscount = Math.max(0, parseFloat(e.target.value) || 0);
        renderCart(container);
      });
    }

    const chargeBtn = container.querySelector('#chargeBtn');
    if (chargeBtn) chargeBtn.addEventListener('click', () => openPaymentSheet(container));
  }

  function cartRowHTML(item) {
    const thumb = item.image ? `<img src="${item.image}" alt="">` : '🛒';
    const lineTotal = item.price * item.qty - (item.discount || 0);
    const inner = `
      <div class="list-row">
        <div class="list-row__icon">${thumb}</div>
        <div class="list-row__body">
          <div class="list-row__title">${escapeHTML(item.name)}</div>
          <div class="list-row__subtitle flex gap-8" style="align-items:center;">
            <span class="stepper" style="gap:6px;">
              <button class="stepper__btn tappable" style="width:26px;height:26px;font-size:14px;" data-stepper-minus="${item.productId}">−</button>
              <span class="stepper__value num" style="font-size:13px; min-width:22px;">${item.qty}</span>
              <button class="stepper__btn tappable" style="width:26px;height:26px;font-size:14px;" data-stepper-plus="${item.productId}">+</button>
            </span>
            <button class="chip tappable" style="padding:3px 8px; font-size:11px;" data-item-discount="${item.productId}">
              ${item.discount ? `− ${Fmt.money(item.discount)}` : 'Discount'}
            </button>
          </div>
        </div>
        <div class="list-row__trailing">
          <div class="list-row__amount num">${Fmt.money(lineTotal)}</div>
        </div>
      </div>`;
    return swipeRowHTML(inner, { id: item.productId, editable: false });
  }

  function adjustQty(container, productId, delta) {
    const item = cart.find((c) => String(c.productId) === String(productId));
    if (!item) return;
    item.qty = Math.max(1, item.qty + delta);
    updateCartBadge(cartCount());
    renderCart(container);
  }

  function editItemDiscount(container, productId) {
    const item = cart.find((c) => String(c.productId) === String(productId));
    if (!item) return;
    const input = prompt(`Discount amount for ${item.name}:`, item.discount || 0);
    if (input === null) return;
    const value = Math.max(0, parseFloat(input) || 0);
    item.discount = Math.min(value, item.price * item.qty);
    renderCart(container);
  }

  /* ---------------------------------------------------------------- */
  /* Product picker (manual search-to-add)                              */
  /* ---------------------------------------------------------------- */

  function openProductPicker() {
    const bodyHTML = `
      <div class="search-bar">
        <span class="search-bar__icon">🔍</span>
        <input type="text" id="pickerSearch" placeholder="Search name, barcode, SKU...">
      </div>
      <div id="pickerResults" class="list"></div>
    `;
    const sheetEl = Sheet.open({ title: 'Add Product', bodyHTML });
    const resultsEl = sheetEl.querySelector('#pickerResults');
    const searchEl = sheetEl.querySelector('#pickerSearch');

    async function runSearch(q) {
      const all = await DB.getAll('products');
      const filtered = !q ? all : all.filter((p) =>
        [p.name, p.barcode, p.sku].filter(Boolean).some((f) => f.toLowerCase().includes(q.toLowerCase())));
      resultsEl.innerHTML = filtered.slice(0, 30).map((p) => `
        <div class="list-row tappable" data-pick="${p.id}">
          <div class="list-row__icon">${p.image ? `<img src="${p.image}" alt="">` : '📦'}</div>
          <div class="list-row__body">
            <div class="list-row__title">${escapeHTML(p.name)}</div>
            <div class="list-row__subtitle">${p.quantity} ${escapeHTML(p.unit || 'pcs')} in stock</div>
          </div>
          <div class="list-row__trailing"><div class="list-row__amount num">${Fmt.money(p.discountPrice ?? p.sellingPrice)}</div></div>
        </div>
      `).join('') || `<div class="empty-state"><div class="empty-state__icon">🔍</div><div class="empty-state__title">No products found</div></div>`;

      resultsEl.querySelectorAll('[data-pick]').forEach((row) => {
        row.addEventListener('click', async () => {
          const p = await DB.get('products', Number(row.dataset.pick));
          if (p) addToCart(p);
        });
      });
    }

    searchEl.addEventListener('input', (e) => runSearch(e.target.value));
    runSearch('');
    setTimeout(() => searchEl.focus(), 300);
  }

  /* ---------------------------------------------------------------- */
  /* Payment + complete sale                                            */
  /* ---------------------------------------------------------------- */

  async function openPaymentSheet(mainContainer) {
    const posSettings = await Settings.get('pos');
    const { itemsSubtotal, itemDiscounts, afterAllDiscounts } = totals();
    const taxAmount = posSettings.taxEnabled ? afterAllDiscounts * (posSettings.taxPercent / 100) : 0;
    const grandTotal = afterAllDiscounts + taxAmount;

    let method = posSettings.defaultPaymentMethod || 'cash';

    const bodyHTML = `
      <div class="flex-between">
        <span class="text-dim text-sm">Total due</span>
        <span class="num" style="font-weight:700; font-size:20px; color:var(--accent);">${Fmt.money(grandTotal)}</span>
      </div>

      <div class="chip-row mt-16" id="paymentChips" style="margin-bottom:4px;">
        ${['cash', 'card', 'bank transfer', 'other'].map((m) => `
          <button class="chip tappable${m === method ? ' active' : ''}" data-method="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</button>
        `).join('')}
      </div>

      <div id="cashFields" style="${method === 'cash' ? '' : 'display:none;'}">
        <div class="field mt-16">
          <label>Amount received</label>
          <input type="number" inputmode="decimal" id="amountReceived" placeholder="0">
        </div>
        <div class="flex-between">
          <span class="text-dim text-sm">Change</span>
          <span class="num" id="changeDisplay" style="font-weight:700;">${Fmt.money(0)}</span>
        </div>
      </div>
    `;
    const footerHTML = `<button class="btn btn-primary tappable" id="completeSaleBtn">Complete Sale</button>`;

    const sheetEl = Sheet.open({ title: 'Payment', bodyHTML, footerHTML });

    sheetEl.querySelectorAll('[data-method]').forEach((chip) => {
      chip.addEventListener('click', () => {
        method = chip.dataset.method;
        sheetEl.querySelectorAll('[data-method]').forEach((c) => c.classList.toggle('active', c === chip));
        sheetEl.querySelector('#cashFields').style.display = method === 'cash' ? '' : 'none';
      });
    });

    const receivedInput = sheetEl.querySelector('#amountReceived');
    const changeDisplay = sheetEl.querySelector('#changeDisplay');
    receivedInput.addEventListener('input', () => {
      const received = parseFloat(receivedInput.value) || 0;
      const change = Math.max(0, received - grandTotal);
      changeDisplay.textContent = Fmt.money(change);
    });

    sheetEl.querySelector('#completeSaleBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return; // guards against a rapid double-tap creating two sales
      const received = method === 'cash' ? (parseFloat(receivedInput.value) || 0) : grandTotal;
      if (method === 'cash' && received < grandTotal) {
        Toast.error('Amount received is less than the total');
        return;
      }
      if (posSettings.confirmBeforeSale && !confirm(`Complete this sale for ${Fmt.money(grandTotal)}?`)) return;

      btn.disabled = true;
      btn.textContent = 'Completing\u2026';
      let sale;
      try {
        sale = await completeSale({
          itemsSubtotal, itemDiscounts, totalDiscount, taxAmount, grandTotal,
          paymentMethod: method,
          amountReceived: received,
          change: method === 'cash' ? Math.max(0, received - grandTotal) : 0,
        });
      } catch (err) {
        console.error('Sale failed:', err);
        Toast.error('Something went wrong completing the sale \u2014 nothing was charged');
        btn.disabled = false;
        btn.textContent = 'Complete Sale';
        return;
      }

      await showSuccessCheck('Sale Complete');
      Sheet.close();
      setTimeout(() => openReceipt(sale), 100);
    });
  }

  async function completeSale({ itemsSubtotal, itemDiscounts, totalDiscount, taxAmount, grandTotal, paymentMethod, amountReceived, change }) {
    const receiptNumber = Ids.receiptNumber();
    let sale;

    // Everything below runs inside ONE IndexedDB transaction spanning
    // sales + products + inventoryLog: the sale record, every stock
    // decrement, and every log entry either all commit together or all
    // roll back together. Previously these were separate transactions —
    // a failure partway through could have left a sale recorded with
    // stock never decremented, or vice versa.
    await DB.runTx(['sales', 'products', 'inventoryLog'], 'readwrite', async (tx) => {
      const productsStore = tx.objectStore('products');
      const salesStore = tx.objectStore('sales');
      const logStore = tx.objectStore('inventoryLog');

      // Read every needed product from WITHIN this transaction, so the
      // snapshot can't be stale relative to a concurrent write elsewhere.
      const productById = new Map();
      for (const c of cart) {
        const product = await DB.reqToPromise(productsStore.get(c.productId));
        productById.set(c.productId, product);
      }

      const saleItems = cart.map((c) => {
        const product = productById.get(c.productId);
        return {
          productId: c.productId,
          name: c.name,
          unit: c.unit,
          price: c.price,                                   // selling price AT TIME OF SALE
          purchasePrice: product ? product.purchasePrice : 0, // cost AT TIME OF SALE — never changes later
          qty: c.qty,
          discount: c.discount || 0,
        };
      });

      sale = {
        receiptNumber,
        date: new Date(),
        items: saleItems,
        subtotal: itemsSubtotal,
        itemDiscounts,
        discount: totalDiscount,
        tax: taxAmount,
        total: grandTotal,
        paymentMethod,
        amountReceived,
        change,
        customerId: selectedCustomer ? selectedCustomer.id : null,
        customerName: selectedCustomer ? selectedCustomer.name : null,
        status: 'completed',
      };

      sale.id = await DB.reqToPromise(salesStore.add(sale));

      for (const item of saleItems) {
        const product = productById.get(item.productId);
        if (!product) continue;
        const newQty = Math.max(0, product.quantity - item.qty);
        await DB.reqToPromise(productsStore.put({ ...product, quantity: newQty, lastUpdated: new Date() }));
        await DB.reqToPromise(logStore.add({
          productId: product.id,
          productName: product.name,
          change: -item.qty,
          newQuantity: newQty,
          reason: `Sale ${receiptNumber}`,
          date: new Date(),
        }));
      }
    });

    cart = [];
    totalDiscount = 0;
    selectedCustomer = null;
    updateCartBadge(0);
    Toast.success('Sale completed');
    return sale;
  }

  /* ---------------------------------------------------------------- */
  /* Receipt                                                            */
  /* ---------------------------------------------------------------- */

  async function openReceipt(sale) {
    const store = await Settings.get('store');
    const bodyHTML = Receipt.html(sale, store);
    const footerHTML = `
      <div class="flex gap-8">
        <button class="btn btn-secondary tappable" id="printReceiptBtn">🖨️ Print</button>
        <button class="btn btn-secondary tappable" id="shareReceiptBtn">📤 Share</button>
      </div>
      <button class="btn btn-primary mt-8 tappable" id="newSaleBtn">New Sale</button>
    `;

    const sheetEl = Sheet.open({ title: 'Receipt', bodyHTML, footerHTML, onClose: () => {
      if (Router.current === 'pos') renderCart(document.getElementById('view'));
    }});

    sheetEl.querySelector('#printReceiptBtn').addEventListener('click', () => printReceipt(sale, store));
    sheetEl.querySelector('#shareReceiptBtn').addEventListener('click', () => shareReceipt(sale, store));
    sheetEl.querySelector('#newSaleBtn').addEventListener('click', () => Sheet.close());
  }

  return { render, addToCart, hasItems: () => cart.length > 0 };
})();

Router.register('pos', POS.render);
window.POS = POS;
