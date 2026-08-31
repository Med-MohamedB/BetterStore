/**
 * sales.js — Sales History.
 *
 * Every sale is immutable once created (see pos.js) except for its
 * `status` field, which this module can flip to 'refunded' — restoring
 * the sold stock and logging the restoration, but never editing the
 * historical prices/totals themselves.
 */

const Sales = (() => {
  let searchQuery = '';
  let paymentFilter = 'all'; // 'all' | 'cash' | 'card' | 'bank transfer' | 'other'
  let dateFilter = 'all';    // 'all' | 'today' | 'week' | 'month'

  async function render(container) {
    document.getElementById('topbarActions').innerHTML = '';
    await renderList(container);
  }

  function inDateRange(sale) {
    if (dateFilter === 'all') return true;
    const d = new Date(sale.date);
    const now = new Date();
    if (dateFilter === 'today') return d.toDateString() === now.toDateString();
    if (dateFilter === 'week') {
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    }
    if (dateFilter === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  }

  async function renderList(container) {
    const allSales = (await DB.getAll('sales')).sort((a, b) => new Date(b.date) - new Date(a.date));

    const filtered = allSales.filter((s) => {
      const matchesSearch = !searchQuery || s.receiptNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPayment = paymentFilter === 'all' || s.paymentMethod === paymentFilter;
      return matchesSearch && matchesPayment && inDateRange(s);
    });

    const totalRevenue = filtered.reduce((sum, s) => sum + saleNetTotal(s), 0);

    container.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-card__label">Transactions</div>
          <div class="stat-card__value num">${filtered.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Total</div>
          <div class="stat-card__value accent num">${Fmt.money(totalRevenue)}</div>
        </div>
      </div>

      <div class="search-bar mt-16">
        <span class="search-bar__icon">🔍</span>
        <input type="text" id="salesSearch" placeholder="Search receipt number..." value="${escapeHTML(searchQuery)}">
        ${searchQuery ? `<button class="search-bar__clear tappable" id="clearSalesSearch">✕</button>` : ''}
      </div>

      <div class="chip-row" id="dateChips">
        ${[['all', 'All Time'], ['today', 'Today'], ['week', 'This Week'], ['month', 'This Month']].map(([k, label]) => `
          <button class="chip tappable${dateFilter === k ? ' active' : ''}" data-date="${k}">${label}</button>
        `).join('')}
      </div>
      <div class="chip-row" id="paymentChips" style="margin-top:-6px;">
        ${['all', 'cash', 'card', 'bank transfer', 'other'].map((m) => `
          <button class="chip tappable${paymentFilter === m ? ' active' : ''}" data-payment="${m}">${m === 'all' ? 'All Methods' : m.charAt(0).toUpperCase() + m.slice(1)}</button>
        `).join('')}
      </div>

      ${filtered.length ? `
        <div class="list stagger" id="salesList">
          ${filtered.map(saleRowHTML).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-state__icon">🧾</div>
          <div class="empty-state__title">No sales found</div>
          <div class="empty-state__hint">Try a different filter, or make your first sale from the POS tab.</div>
        </div>
      `}
    `;

    const searchInput = container.querySelector('#salesSearch');
    searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; renderList(container); });
    const clearBtn = container.querySelector('#clearSalesSearch');
    if (clearBtn) clearBtn.addEventListener('click', () => { searchQuery = ''; renderList(container); });

    container.querySelectorAll('[data-date]').forEach((chip) => {
      chip.addEventListener('click', () => { dateFilter = chip.dataset.date; renderList(container); });
    });
    container.querySelectorAll('[data-payment]').forEach((chip) => {
      chip.addEventListener('click', () => { paymentFilter = chip.dataset.payment; renderList(container); });
    });

    container.querySelectorAll('[data-sale-row]').forEach((row) => {
      row.addEventListener('click', async () => {
        const sale = await DB.get('sales', Number(row.dataset.saleRow));
        if (sale) openDetail(sale, container);
      });
    });
  }

  function saleRowHTML(s) {
    const refunded = s.status === 'refunded';
    const partial = s.status === 'partially_refunded';
    return `
      <div class="list-row tappable" data-sale-row="${s.id}" style="${refunded ? 'opacity:0.55;' : ''}">
        <div class="list-row__icon">${refunded ? '↩️' : partial ? '↩️' : '🧾'}</div>
        <div class="list-row__body">
          <div class="list-row__title">${s.receiptNumber}</div>
          <div class="list-row__subtitle">${Fmt.dateTime(s.date)} · ${s.paymentMethod}</div>
        </div>
        <div class="list-row__trailing">
          <div class="list-row__amount num">${Fmt.money(s.total)}</div>
          ${refunded ? `<div class="mt-8"><span class="badge badge--danger">Refunded</span></div>` : ''}
          ${partial ? `<div class="mt-8"><span class="badge badge--warn">Partially Refunded</span></div>` : ''}
        </div>
      </div>`;
  }

  async function openDetail(sale, listContainer) {
    const store = await Settings.get('store');
    const refunded = sale.status === 'refunded';
    const partial = sale.status === 'partially_refunded';

    const bodyHTML = Receipt.html(sale, store);

    const footerHTML = `
      <div class="flex gap-8">
        <button class="btn btn-secondary tappable" id="reprintBtn">🖨️ Reprint</button>
        <button class="btn btn-secondary tappable" id="shareSaleBtn">📤 Share</button>
      </div>
      ${!refunded ? `<button class="btn btn-danger mt-8 tappable" id="refundBtn">${partial ? 'Refund More Items' : 'Refund Items'}</button>` : ''}
    `;

    const sheetEl = Sheet.open({ title: 'Sale Detail', bodyHTML, footerHTML });

    sheetEl.querySelector('#reprintBtn').addEventListener('click', () => printReceipt(sale, store));
    sheetEl.querySelector('#shareSaleBtn').addEventListener('click', () => shareReceipt(sale, store));

    const refundBtn = sheetEl.querySelector('#refundBtn');
    if (refundBtn) {
      refundBtn.addEventListener('click', () => openRefundSheet(sale, listContainer));
    }
  }

  /** Lets the cashier pick exactly which items — and how many of each —
   *  to refund, rather than forcing an all-or-nothing return. Supports
   *  refunding a sale across more than one visit: each item tracks its
   *  own `refundedQty` so a second partial refund can't over-return it. */
  async function openRefundSheet(sale, listContainer) {
    const remaining = (item) => item.qty - (item.refundedQty || 0);
    const refundableItems = sale.items.filter((item) => remaining(item) > 0);

    const rowHTML = (item, idx) => {
      const max = remaining(item);
      const unitNet = (item.price * item.qty - (item.discount || 0)) / item.qty;
      return `
        <div class="list-row" data-refund-row="${idx}" style="padding:10px 0;">
          <div class="list-row__body">
            <div class="list-row__title">${escapeHTML(item.name)}</div>
            <div class="list-row__subtitle">${Fmt.money(unitNet)} each${item.refundedQty ? ` · ${item.refundedQty} already refunded` : ''} · ${max} refundable</div>
          </div>
          <div class="flex gap-8" style="align-items:center;">
            <button class="stepper__btn tappable" style="width:30px;height:30px;font-size:16px;" data-refund-minus="${idx}">−</button>
            <span class="num" style="min-width:22px; text-align:center;" data-refund-qty="${idx}">${max}</span>
            <button class="stepper__btn tappable" style="width:30px;height:30px;font-size:16px;" data-refund-plus="${idx}">+</button>
          </div>
        </div>
      `;
    };

    const bodyHTML = `
      <div class="flex-between" style="margin-bottom:6px;">
        <span class="text-dim text-sm">Select items to refund</span>
        <button class="chip tappable" id="refundToggleAllBtn">Deselect all</button>
      </div>
      ${refundableItems.map((item, idx) => rowHTML(item, idx)).join('<div style="border-top:1px solid var(--border);"></div>')}
    `;

    const footerHTML = `
      <div class="flex-between mt-8" style="font-weight:700;">
        <span>Refund total</span><span class="num" id="refundTotalAmount">${Fmt.money(0)}</span>
      </div>
      <button class="btn btn-danger mt-8 tappable" id="confirmRefundBtn" disabled>Select items to refund</button>
    `;

    let onCloseSkip = false;
    const sheetEl = Sheet.open({
      title: 'Refund Items',
      bodyHTML,
      footerHTML,
      onClose: () => { if (!onCloseSkip) openDetail(sale, listContainer); },
    });

    // qtyByIdx starts fully selected (max refundable) for every item — the
    // common case is refunding everything; partial is an adjustment down.
    const qtyByIdx = refundableItems.map((item) => remaining(item));

    const updateTotals = () => {
      let total = 0;
      refundableItems.forEach((item, idx) => {
        const unitNet = (item.price * item.qty - (item.discount || 0)) / item.qty;
        total += unitNet * qtyByIdx[idx];
      });
      sheetEl.querySelector('#refundTotalAmount').textContent = Fmt.money(total);
      const confirmBtn = sheetEl.querySelector('#confirmRefundBtn');
      const anySelected = qtyByIdx.some((q) => q > 0);
      confirmBtn.disabled = !anySelected;
      confirmBtn.textContent = anySelected ? `Refund ${Fmt.money(total)}` : 'Select items to refund';
      sheetEl.querySelector('#refundToggleAllBtn').textContent = anySelected ? 'Deselect all' : 'Select all';
      compactifyNumbers(sheetEl);
    };

    refundableItems.forEach((item, idx) => {
      const max = remaining(item);
      sheetEl.querySelector(`[data-refund-minus="${idx}"]`).addEventListener('click', () => {
        qtyByIdx[idx] = Math.max(0, qtyByIdx[idx] - 1);
        sheetEl.querySelector(`[data-refund-qty="${idx}"]`).textContent = qtyByIdx[idx];
        updateTotals();
      });
      sheetEl.querySelector(`[data-refund-plus="${idx}"]`).addEventListener('click', () => {
        qtyByIdx[idx] = Math.min(max, qtyByIdx[idx] + 1);
        sheetEl.querySelector(`[data-refund-qty="${idx}"]`).textContent = qtyByIdx[idx];
        updateTotals();
      });
    });

    sheetEl.querySelector('#refundToggleAllBtn').addEventListener('click', () => {
      const anySelected = qtyByIdx.some((q) => q > 0);
      refundableItems.forEach((item, idx) => {
        qtyByIdx[idx] = anySelected ? 0 : remaining(item);
        sheetEl.querySelector(`[data-refund-qty="${idx}"]`).textContent = qtyByIdx[idx];
      });
      updateTotals();
    });

    sheetEl.querySelector('#confirmRefundBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      const selections = refundableItems
        .map((item, idx) => ({ productId: item.productId, qty: qtyByIdx[idx] }))
        .filter((s) => s.qty > 0);
      const totalAmount = sheetEl.querySelector('#refundTotalAmount').textContent;
      if (!confirm(`Refund ${totalAmount} and restore stock for the selected items?`)) return;
      btn.disabled = true;
      btn.textContent = 'Refunding\u2026';
      try {
        await refundSaleItems(sale, selections);
      } catch (err) {
        console.error('Refund failed:', err);
        Toast.error('Something went wrong \u2014 the refund was not applied');
        btn.disabled = false;
        updateTotals();
        return;
      }
      onCloseSkip = true;
      Sheet.close();
      Toast.success('Refund applied and stock restored');
      renderList(listContainer);
    });

    updateTotals();
  }

  /** Refunds a chosen subset of a sale's items (any quantity up to what's
   *  still refundable), restores exactly that stock, and prorates the
   *  sale's item-level discount plus any sale-level discount/tax across
   *  just the portion being refunded — so `sale.totalRefunded` (and thus
   *  `saleNetTotal`, used everywhere revenue is reported) stays accurate
   *  whether this is the first refund on the sale or a follow-up one. */
  async function refundSaleItems(sale, selections) {
    await DB.runTx(['sales', 'products', 'inventoryLog'], 'readwrite', async (tx) => {
      const productsStore = tx.objectStore('products');
      const logStore = tx.objectStore('inventoryLog');
      const salesStore = tx.objectStore('sales');

      const items = sale.items.map((item) => ({ ...item }));
      let subtotalRefundedNow = 0;

      for (const sel of selections) {
        const item = items.find((it) => it.productId === sel.productId);
        if (!item || sel.qty <= 0) continue;
        const already = item.refundedQty || 0;
        const refundQty = Math.min(sel.qty, item.qty - already);
        if (refundQty <= 0) continue;

        const product = await DB.reqToPromise(productsStore.get(item.productId));
        if (product) {
          const newQty = product.quantity + refundQty;
          await DB.reqToPromise(productsStore.put({ ...product, quantity: newQty, lastUpdated: new Date() }));
          await DB.reqToPromise(logStore.add({
            productId: product.id,
            productName: product.name,
            change: refundQty,
            newQuantity: newQty,
            reason: `Refund ${sale.receiptNumber}`,
            date: new Date(),
          }));
        }

        item.refundedQty = already + refundQty;
        const unitNet = (item.price * item.qty - (item.discount || 0)) / item.qty;
        subtotalRefundedNow += unitNet * refundQty;
      }

      // Prorate the sale-level discount/tax across the fraction of the
      // pre-tax subtotal being refunded this operation, so a sale with a
      // storewide discount or tax doesn't have its refund under/overstated.
      const saleDiscount = sale.discount || 0;
      const saleTax = sale.tax || 0;
      const fraction = sale.subtotal > 0 ? subtotalRefundedNow / sale.subtotal : 0;
      const totalRefundedNow = subtotalRefundedNow - saleDiscount * fraction + saleTax * fraction;

      const totalRefunded = (sale.totalRefunded || 0) + totalRefundedNow;
      const fullyRefunded = items.every((it) => (it.refundedQty || 0) >= it.qty);
      const anyRefunded = items.some((it) => (it.refundedQty || 0) > 0);
      const status = fullyRefunded ? 'refunded' : anyRefunded ? 'partially_refunded' : sale.status;

      await DB.reqToPromise(salesStore.put({
        ...sale,
        items,
        totalRefunded,
        status,
        refundedAt: new Date(),
      }));
    });
  }

  return { render };
})();

Router.register('sales', Sales.render);
window.Sales = Sales;
