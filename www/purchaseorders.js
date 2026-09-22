/**
 * purchaseorders.js — Purchase Orders / Restocking.
 *
 * A purchase order is a supplier + a list of (product, qty, unit cost)
 * lines. It starts 'open' (just a record of what was ordered — no stock
 * change yet) and becomes 'received' the moment someone taps Receive,
 * which is the one place stock actually moves: each line bumps that
 * product's quantity, updates its purchasePrice to the new cost, and
 * writes an inventoryLog entry, exactly like products.js's own manual
 * stock adjustment does. Saving straight to 'received' covers the common
 * case of just logging a restock that already happened.
 */

const PurchaseOrders = (() => {
  let searchQuery = '';
  let statusFilter = 'all'; // 'all' | 'open' | 'received'

  async function render(container) {
    const actions = document.getElementById('topbarActions');
    actions.innerHTML = '';
    await renderList(container);
  }

  function statusBadge(status) {
    return status === 'received'
      ? `<span class="badge badge--success">${I18n.t('purchaseOrders.statusReceived')}</span>`
      : `<span class="badge badge--warn">${I18n.t('purchaseOrders.statusOpen')}</span>`;
  }

  function poSubtotal(po) {
    return (po.items || []).reduce((sum, it) => sum + it.qty * it.unitCost, 0);
  }

  async function renderList(container) {
    const orders = (await DB.getAll('purchaseOrders')).sort((a, b) => new Date(b.date) - new Date(a.date));

    const filtered = orders.filter((po) => {
      if (statusFilter !== 'all' && po.status !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (po.supplierName || '').toLowerCase().includes(q) || (po.poNumber || '').toLowerCase().includes(q);
    });

    container.innerHTML = `
      <div class="search-bar">
        <span class="search-bar__icon">${Icon('search')}</span>
        <input type="text" id="poSearch" placeholder="${I18n.t('purchaseOrders.searchPlaceholder')}" value="${escapeHTML(searchQuery)}">
        ${searchQuery ? `<button class="search-bar__clear tappable" id="clearPOSearch">${Icon('x', { size: 14 })}</button>` : ''}
      </div>
      <div class="chip-row mt-8" id="poStatusChips">
        ${['all', 'open', 'received'].map((s) => `
          <button class="chip tappable${statusFilter === s ? ' active' : ''}" data-status="${s}">${I18n.t(`purchaseOrders.filter${s.charAt(0).toUpperCase() + s.slice(1)}`)}</button>
        `).join('')}
      </div>

      ${filtered.length ? `
        <div class="list stagger mt-8" id="poList">
          ${filtered.map((po) => `
            <div class="list-row tappable" data-po-row="${po.id}">
              <div class="list-row__icon">${Icon('package')}</div>
              <div class="list-row__body">
                <div class="list-row__title">${escapeHTML(po.supplierName || I18n.t('purchaseOrders.noSupplier'))}</div>
                <div class="list-row__subtitle ltr-code">${po.poNumber} \u00b7 ${Fmt.dateTime(po.date)}</div>
              </div>
              <div class="list-row__trailing">
                <div class="list-row__amount num">${Fmt.money(poSubtotal(po))}</div>
                <div class="mt-4">${statusBadge(po.status)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-state__icon">${Icon('package', { size: 32 })}</div>
          <div class="empty-state__title">${orders.length ? I18n.t('purchaseOrders.noMatch') : I18n.t('purchaseOrders.noneYet')}</div>
          <div class="empty-state__hint">${orders.length ? I18n.t('purchaseOrders.tryDifferentSearch') : I18n.t('purchaseOrders.tapToAddFirst')}</div>
        </div>
      `}
      <button class="screen-fab tappable" id="poFab" title="${I18n.t('purchaseOrders.newOrder')}">${Icon('plus')}</button>
    `;

    container.querySelector('#poFab').addEventListener('click', () => openForm());
    if (!orders.length) DoodleHint.show('addFirstPO', container.querySelector('#poFab'), I18n.t('purchaseOrders.addFirstHint'), 'br');

    const searchInput = container.querySelector('#poSearch');
    searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; renderList(container); });
    const clearBtn = container.querySelector('#clearPOSearch');
    if (clearBtn) clearBtn.addEventListener('click', () => { searchQuery = ''; renderList(container); });

    container.querySelectorAll('[data-status]').forEach((chip) => {
      chip.addEventListener('click', () => { statusFilter = chip.dataset.status; renderList(container); });
    });

    container.querySelectorAll('[data-po-row]').forEach((row) => {
      row.addEventListener('click', async () => {
        const po = await DB.get('purchaseOrders', Number(row.dataset.poRow));
        if (po) openDetail(po, container);
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* New order                                                          */
  /* ---------------------------------------------------------------- */

  /** presetSupplier: { id, name } to skip the picker when opened from a
   *  supplier's own detail sheet (Suppliers.openDetail's "New Purchase
   *  Order" button). */
  function openForm(presetSupplier = null) {
    let supplier = presetSupplier;
    const items = []; // { productId, productName, unit, qty, unitCost }

    const bodyHTML = `
      <div class="list-row tappable" id="poSupplierRow" style="border:1px solid var(--border);">
        <div class="list-row__icon">${Icon('truck')}</div>
        <div class="list-row__body">
          <div class="list-row__title" id="poSupplierName">${supplier ? escapeHTML(supplier.name) : I18n.t('purchaseOrders.pickSupplier')}</div>
        </div>
        <div class="list-row__trailing"><div class="text-faint disclosure-chevron">\u203a</div></div>
      </div>

      <div class="section-title">${I18n.t('purchaseOrders.itemsSectionTitle')}</div>
      <div id="poItemsList"></div>
      <button class="btn btn-secondary tappable mt-8" id="poAddItemBtn" style="width:100%;">${Icon('plus')} ${I18n.t('purchaseOrders.addItem')}</button>

      <div class="flex-between mt-16">
        <span class="text-dim text-sm">${I18n.t('purchaseOrders.subtotalLabel')}</span>
        <span class="num" id="poSubtotalDisplay" style="font-weight:700; font-size:17px;">${Fmt.money(0)}</span>
      </div>

      <div class="field mt-16">
        <label>${I18n.t('purchaseOrders.notesLabel')}</label>
        <textarea id="poNotes" rows="2" placeholder="${I18n.t('customers.form.optional')}"></textarea>
      </div>
    `;
    const footerHTML = `
      <button class="btn btn-primary tappable" id="poSaveReceivedBtn">${I18n.t('purchaseOrders.saveReceivedBtn')}</button>
      <button class="btn btn-secondary mt-8 tappable" id="poSaveOpenBtn">${I18n.t('purchaseOrders.saveOpenBtn')}</button>
    `;
    const sheetEl = Sheet.open({ title: I18n.t('purchaseOrders.newTitle'), bodyHTML, footerHTML });

    const itemsListEl = sheetEl.querySelector('#poItemsList');
    const subtotalEl = sheetEl.querySelector('#poSubtotalDisplay');

    function paintItems() {
      itemsListEl.innerHTML = items.length ? items.map((it, i) => `
        <div class="card mt-8" data-item-index="${i}">
          <div class="flex-between">
            <div class="text-sm" style="font-weight:600;">${escapeHTML(it.productName)}</div>
            <button class="tappable text-dim" data-remove-item="${i}" style="padding:4px;">${Icon('x', { size: 16 })}</button>
          </div>
          <div class="flex gap-8 mt-8">
            <div class="field" style="flex:1;">
              <label>${I18n.t('purchaseOrders.qtyLabel')}</label>
              <input type="number" inputmode="numeric" min="1" step="1" value="${it.qty}" data-item-qty="${i}">
            </div>
            <div class="field" style="flex:1;">
              <label>${I18n.t('purchaseOrders.unitCostLabel')}</label>
              <input type="number" inputmode="decimal" min="0" step="0.01" value="${it.unitCost}" data-item-cost="${i}">
            </div>
          </div>
          <div class="text-dim text-sm text-right num mt-4">${Fmt.money(it.qty * it.unitCost)}</div>
        </div>
      `).join('') : `<div class="text-dim text-sm mt-8">${I18n.t('purchaseOrders.noItemsYet')}</div>`;

      itemsListEl.querySelectorAll('[data-remove-item]').forEach((btn) => {
        btn.addEventListener('click', () => { items.splice(Number(btn.dataset.removeItem), 1); paintItems(); });
      });
      itemsListEl.querySelectorAll('[data-item-qty]').forEach((input) => {
        input.addEventListener('input', () => {
          const i = Number(input.dataset.itemQty);
          items[i].qty = Math.max(1, Math.round(parseFloat(input.value) || 1));
          updateSubtotal();
        });
      });
      itemsListEl.querySelectorAll('[data-item-cost]').forEach((input) => {
        input.addEventListener('input', () => {
          const i = Number(input.dataset.itemCost);
          items[i].unitCost = Math.max(0, parseFloat(input.value) || 0);
          updateSubtotal();
        });
      });
      updateSubtotal();
    }

    function updateSubtotal() {
      subtotalEl.textContent = Fmt.money(items.reduce((sum, it) => sum + it.qty * it.unitCost, 0));
    }

    sheetEl.querySelector('#poSupplierRow').addEventListener('click', () => {
      Suppliers.openPicker((s) => {
        supplier = s;
        sheetEl.querySelector('#poSupplierName').textContent = s.name;
      });
    });

    sheetEl.querySelector('#poAddItemBtn').addEventListener('click', () => {
      Products.openPicker((p) => {
        items.push({ productId: p.id, productName: p.name, unit: p.unit || 'pcs', qty: 1, unitCost: p.purchasePrice || 0 });
        paintItems();
      });
    });

    paintItems();

    async function save(status) {
      if (!supplier) { Toast.error(I18n.t('purchaseOrders.supplierRequired')); return; }
      if (!items.length) { Toast.error(I18n.t('purchaseOrders.itemsRequired')); return; }

      const po = {
        poNumber: Ids.poNumber(),
        supplierId: supplier.id,
        supplierName: supplier.name,
        items: items.map((it) => ({ ...it })),
        status: 'open',
        date: new Date(),
        receivedDate: null,
        notes: sheetEl.querySelector('#poNotes').value.trim(),
      };
      po.id = await DB.add('purchaseOrders', po);

      if (status === 'received') {
        await receiveOrder(po);
      }

      Toast.success(I18n.t(status === 'received' ? 'purchaseOrders.savedAndReceived' : 'purchaseOrders.saved'));
      Sheet.close();
      if (Router.current === 'purchase-orders') renderList(document.getElementById('view'));
    }

    sheetEl.querySelector('#poSaveOpenBtn').addEventListener('click', async (e) => {
      if (e.currentTarget.disabled) return;
      e.currentTarget.disabled = true;
      await save('open');
    });
    sheetEl.querySelector('#poSaveReceivedBtn').addEventListener('click', async (e) => {
      if (e.currentTarget.disabled) return;
      e.currentTarget.disabled = true;
      await save('received');
    });
  }

  /* ---------------------------------------------------------------- */
  /* Receiving — the one place stock actually moves                     */
  /* ---------------------------------------------------------------- */

  async function receiveOrder(po) {
    for (const it of po.items) {
      const product = await DB.get('products', it.productId);
      if (!product) continue; // product was deleted since the order was placed — skip rather than fail the whole receive
      const newQuantity = (product.quantity || 0) + it.qty;
      await DB.put('products', { ...product, quantity: newQuantity, purchasePrice: it.unitCost, lastUpdated: new Date() });
      await DB.add('inventoryLog', {
        productId: product.id,
        productName: product.name,
        change: it.qty,
        newQuantity,
        reason: I18n.t('purchaseOrders.inventoryLogReason', { poNumber: po.poNumber }),
        date: new Date(),
      });
    }
    await DB.put('purchaseOrders', { ...po, status: 'received', receivedDate: new Date() });
  }

  /* ---------------------------------------------------------------- */
  /* Detail                                                              */
  /* ---------------------------------------------------------------- */

  function openDetail(po, listContainer) {
    const subtotal = poSubtotal(po);
    const bodyHTML = `
      <div style="text-align:center;">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;">${Icon('package', { size: 26 })}</div>
        <div style="font-weight:700; font-size:17px;">${escapeHTML(po.supplierName || I18n.t('purchaseOrders.noSupplier'))}</div>
        <div class="text-dim text-sm mt-4 ltr-code">${po.poNumber}</div>
        <div class="mt-8">${statusBadge(po.status)}</div>
      </div>
      <div class="section-title">${I18n.t('purchaseOrders.itemsSectionTitle')}</div>
      <div class="list">
        ${po.items.map((it) => `
          <div class="list-row">
            <div class="list-row__icon">${Icon('package')}</div>
            <div class="list-row__body"><div class="list-row__title">${escapeHTML(it.productName)}</div><div class="list-row__subtitle">${I18n.t('purchaseOrders.qtyAtCost', { qty: it.qty, cost: Fmt.money(it.unitCost) })}</div></div>
            <div class="list-row__trailing"><div class="list-row__amount num">${Fmt.money(it.qty * it.unitCost)}</div></div>
          </div>
        `).join('')}
      </div>
      <div class="flex-between mt-16">
        <span class="text-dim text-sm">${I18n.t('purchaseOrders.subtotalLabel')}</span>
        <span class="num" style="font-weight:700; font-size:17px;">${Fmt.money(subtotal)}</span>
      </div>
      <div class="text-dim text-sm mt-8">${I18n.t('purchaseOrders.orderedDate', { date: Fmt.dateTime(po.date) })}</div>
      ${po.receivedDate ? `<div class="text-dim text-sm">${I18n.t('purchaseOrders.receivedDate', { date: Fmt.dateTime(po.receivedDate) })}</div>` : ''}
      ${po.notes ? `<div class="card mt-16"><div class="text-sm">${escapeHTML(po.notes)}</div></div>` : ''}
    `;
    const footerHTML = po.status === 'open'
      ? `
        <button class="btn btn-primary tappable" id="poReceiveBtn">${Icon('package')} ${I18n.t('purchaseOrders.receiveBtn')}</button>
        <button class="btn btn-danger mt-8 tappable" id="poDeleteBtn">${I18n.t('common.delete')}</button>
      `
      : `<button class="btn btn-secondary tappable" id="poDoneBtn">${I18n.t('common.done')}</button>`;
    const sheetEl = Sheet.open({ title: I18n.t('purchaseOrders.detailTitle'), bodyHTML, footerHTML });

    const receiveBtn = sheetEl.querySelector('#poReceiveBtn');
    if (receiveBtn) receiveBtn.addEventListener('click', async () => {
      if (receiveBtn.disabled) return;
      if (!(await Confirm.show(I18n.t('purchaseOrders.receiveConfirm', { count: po.items.length })))) return;
      receiveBtn.disabled = true;
      await receiveOrder(po);
      Toast.success(I18n.t('purchaseOrders.received'));
      Sheet.close();
      if (Router.current === 'purchase-orders') renderList(listContainer);
    });
    const deleteBtn = sheetEl.querySelector('#poDeleteBtn');
    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
      if (!(await Confirm.show(I18n.t('purchaseOrders.deleteConfirm'), { danger: true }))) return;
      await DB.delete('purchaseOrders', po.id);
      Toast.success(I18n.t('purchaseOrders.deleted'));
      Sheet.close();
      if (Router.current === 'purchase-orders') renderList(listContainer);
    });
    const doneBtn = sheetEl.querySelector('#poDoneBtn');
    if (doneBtn) doneBtn.addEventListener('click', () => Sheet.close());
  }

  return { render, openForm };
})();

Router.register('purchase-orders', PurchaseOrders.render);
window.PurchaseOrders = PurchaseOrders;
