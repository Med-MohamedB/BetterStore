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
    const actions = document.getElementById('topbarActions');
    actions.innerHTML = `<button class="icon-btn tappable" id="scanReceiptBtn" title="${I18n.t('sales.scanReceipt')}">${Icon('scan')}</button>`;
    actions.querySelector('#scanReceiptBtn').addEventListener('click', () => scanForReceipt(container));
    await renderList(container);
  }

  /** Opens the camera, decodes a receipt's barcode (its receiptNumber —
   *  see Barcode128 in app.js), and jumps straight to that sale's detail/
   *  receipt view. Works for ANY past sale, regardless of the current
   *  search/filter state of the list underneath. */
  function scanForReceipt(container) {
    Scanner.openContinuous({
      title: I18n.t('sales.scanReceiptTitle'),
      onScan: async (code) => {
        const sale = await DB.getByIndex('sales', 'receiptNumber', code);
        if (sale) {
          Scanner.closeActive();
          setTimeout(() => openDetail(sale, container), 260);
          return { text: `\u2713 ${sale.receiptNumber}`, variant: 'success' };
        }
        return { text: I18n.t('sales.notAReceipt', { code }), variant: 'warn' };
      },
    });
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
          <div class="stat-card__label">${I18n.t('sales.transactions')}</div>
          <div class="stat-card__value num">${filtered.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">${I18n.t('sales.total')}</div>
          <div class="stat-card__value accent num">${Fmt.money(totalRevenue)}</div>
        </div>
      </div>

      <div class="search-bar mt-16">
        <span class="search-bar__icon">${Icon('search')}</span>
        <input type="text" id="salesSearch" placeholder="${I18n.t('sales.searchPlaceholder')}" value="${escapeHTML(searchQuery)}">
        ${searchQuery ? `<button class="search-bar__clear tappable" id="clearSalesSearch">${Icon('x', { size: 14 })}</button>` : ''}
      </div>

      <div class="chip-row" id="dateChips">
        ${[['all', I18n.t('sales.allTime')], ['today', I18n.t('sales.today')], ['week', I18n.t('sales.thisWeek')], ['month', I18n.t('sales.thisMonth')]].map(([k, label]) => `
          <button class="chip tappable${dateFilter === k ? ' active' : ''}" data-date="${k}">${label}</button>
        `).join('')}
      </div>
      <div class="chip-row" id="paymentChips" style="margin-top:-6px;">
        ${['all', 'cash', 'card', 'bank transfer', 'other'].map((m) => `
          <button class="chip tappable${paymentFilter === m ? ' active' : ''}" data-payment="${m}">${m === 'all' ? I18n.t('sales.allMethods') : I18n.t(`pos.method${m === 'bank transfer' ? 'BankTransfer' : m.charAt(0).toUpperCase() + m.slice(1)}`)}</button>
        `).join('')}
      </div>

      ${filtered.length ? `
        <div class="list stagger" id="salesList">
          ${filtered.map(saleRowHTML).join('')}
        </div>
      ` : `
        <div class="empty-state${allSales.length ? '' : ' empty-state--illustrated'}">
          ${allSales.length
            ? `<div class="empty-state__icon">${Icon('receipt', { size: 32 })}</div>`
            : `<img class="empty-state__illustration" src="${themedIllustration('empty-sales')}" alt="">`}
          <div class="empty-state__title">${allSales.length ? I18n.t('sales.noSalesFound') : I18n.t('sales.noSalesYet')}</div>
          <div class="empty-state__hint">${allSales.length ? I18n.t('sales.tryDifferentFilter') : I18n.t('sales.makeFirstSale')}</div>
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
        <div class="list-row__icon">${refunded ? Icon('undo') : partial ? Icon('undo') : Icon('receipt')}</div>
        <div class="list-row__body">
          <div class="list-row__title">${s.receiptNumber}</div>
          <div class="list-row__subtitle">${Fmt.dateTime(s.date)} · ${paymentMethodLabel(s.paymentMethod)}</div>
        </div>
        <div class="list-row__trailing">
          <div class="list-row__amount num">${Fmt.money(s.total)}</div>
          ${refunded ? `<div class="mt-8"><span class="badge badge--danger">${I18n.t('sales.refundedBadge')}</span></div>` : ''}
          ${partial ? `<div class="mt-8"><span class="badge badge--warn">${I18n.t('sales.partiallyRefundedBadge')}</span></div>` : ''}
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
        <button class="btn btn-secondary tappable" id="reprintBtn">${Icon('printer')} ${I18n.t('sales.reprint')}</button>
        <button class="btn btn-secondary tappable" id="shareSaleBtn">${Icon('share')} ${I18n.t('products.share')}</button>
      </div>
      ${!refunded ? `<button class="btn btn-danger mt-8 tappable" id="refundBtn">${partial ? I18n.t('sales.refundMoreItems') : I18n.t('sales.refundItems')}</button>` : ''}
    `;

    const sheetEl = Sheet.open({ title: I18n.t('sales.saleDetail'), bodyHTML, footerHTML });

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
            <div class="list-row__subtitle">${Fmt.money(unitNet)} ${I18n.t('sales.each')}${item.refundedQty ? ` · ${I18n.t('sales.alreadyRefunded', { qty: item.refundedQty })}` : ''} · ${I18n.t('sales.refundable', { max })}</div>
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
        <span class="text-dim text-sm">${I18n.t('sales.selectItemsToRefund')}</span>
        <button class="chip tappable" id="refundToggleAllBtn">${I18n.t('sales.deselectAll')}</button>
      </div>
      ${refundableItems.map((item, idx) => rowHTML(item, idx)).join('<div style="border-top:1px solid var(--border);"></div>')}
    `;

    const footerHTML = `
      <div class="flex-between mt-8" style="font-weight:700;">
        <span>${I18n.t('sales.refundTotal')}</span><span class="num" id="refundTotalAmount">${Fmt.money(0)}</span>
      </div>
      <button class="btn btn-danger mt-8 tappable" id="confirmRefundBtn" disabled>${I18n.t('sales.selectItemsToRefund')}</button>
    `;

    let onCloseSkip = false;
    const sheetEl = Sheet.open({
      title: I18n.t('sales.refundItems'),
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
      confirmBtn.textContent = anySelected ? I18n.t('sales.refund', { amount: Fmt.money(total) }) : I18n.t('sales.selectItemsToRefund');
      sheetEl.querySelector('#refundToggleAllBtn').textContent = anySelected ? I18n.t('sales.deselectAll') : I18n.t('sales.selectAll');
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
      if (!(await Confirm.show(I18n.t('sales.refundConfirm', { amount: totalAmount }), { danger: true, confirmText: I18n.t('sales.refundConfirmBtn') }))) return;
      btn.disabled = true;
      btn.textContent = I18n.t('sales.refunding');
      try {
        await refundSaleItems(sale, selections);
      } catch (err) {
        console.error('Refund failed:', err);
        Toast.error(I18n.t('sales.refundFailedError'));
        btn.disabled = false;
        updateTotals();
        return;
      }
      onCloseSkip = true;
      Sheet.close();
      Toast.success(I18n.t('sales.refundAppliedToast'));
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
            reason: I18n.t('sales.refundReason', { receipt: sale.receiptNumber }),
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
