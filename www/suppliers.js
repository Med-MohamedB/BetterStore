/**
 * suppliers.js — Supplier Management.
 *
 * Products already store `supplier` as a plain name string (kept simple,
 * matching how `category` works). This module manages the supplier
 * directory itself and shows, per supplier, which products are currently
 * linked to them by name — no schema migration needed on products.
 */

const Suppliers = (() => {
  let searchQuery = '';

  async function render(container) {
    const actions = document.getElementById('topbarActions');
    actions.innerHTML = '';
    await renderList(container);
  }

  async function renderList(container) {
    const [suppliers, products] = await Promise.all([DB.getAll('suppliers'), DB.getAll('products')]);

    const filtered = suppliers.filter((s) => {
      if (!searchQuery) return true;
      return [s.name, s.phone, s.email].filter(Boolean).some((f) => f.toLowerCase().includes(searchQuery.toLowerCase()));
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    container.innerHTML = `
      <div class="search-bar">
        <span class="search-bar__icon">${Icon('search')}</span>
        <input type="text" id="supplierSearch" placeholder="${I18n.t('suppliers.searchPlaceholder')}" value="${escapeHTML(searchQuery)}">
        ${searchQuery ? `<button class="search-bar__clear tappable" id="clearSupplierSearch">${Icon('x', { size: 14 })}</button>` : ''}
      </div>

      ${filtered.length ? `
        <div class="list stagger" id="supplierList">
          ${filtered.map((s) => supplierRowHTML(s, products)).join('')}
        </div>
      ` : `
        <div class="empty-state${suppliers.length ? '' : ' empty-state--illustrated'}">
          ${suppliers.length
            ? `<div class="empty-state__icon">${Icon('truck', { size: 32 })}</div>`
            : `<img class="empty-state__illustration" src="${themedIllustration('empty-suppliers')}" alt="">`}
          <div class="empty-state__title">${suppliers.length ? I18n.t('suppliers.noSuppliersMatch') : I18n.t('suppliers.noSuppliersYet')}</div>
          <div class="empty-state__hint">${suppliers.length ? I18n.t('suppliers.tryDifferentSearch') : I18n.t('suppliers.tapToAddFirst')}</div>
        </div>
      `}
      <button class="screen-fab tappable" id="supplierFab" title="${I18n.t('suppliers.addSupplier')}">${Icon('plus')}</button>
    `;
    container.querySelector('#supplierFab').addEventListener('click', () => openForm());
    if (!filtered.length && !suppliers.length) {
      DoodleHint.show('addFirstSupplier', container.querySelector('#supplierFab'), I18n.t('suppliers.addFirstSupplierHint'), 'br');
    }

    const searchInput = container.querySelector('#supplierSearch');
    searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; renderList(container); });
    const clearBtn = container.querySelector('#clearSupplierSearch');
    if (clearBtn) clearBtn.addEventListener('click', () => { searchQuery = ''; renderList(container); });

    container.querySelectorAll('[data-supplier-row]').forEach((row) => {
      row.addEventListener('click', async () => {
        const s = await DB.get('suppliers', Number(row.dataset.supplierRow));
        if (s) openDetail(s, products, container);
      });
    });
  }

  function productsFor(supplierName, products) {
    return products.filter((p) => (p.supplier || '').trim().toLowerCase() === supplierName.trim().toLowerCase());
  }

  function supplierRowHTML(s, products) {
    const linked = productsFor(s.name, products);
    return `
      <div class="list-row tappable" data-supplier-row="${s.id}">
        <div class="list-row__icon">${Icon('truck')}</div>
        <div class="list-row__body">
          <div class="list-row__title">${escapeHTML(s.name)}</div>
          <div class="list-row__subtitle">${escapeHTML(s.phone || I18n.t('suppliers.noPhone'))}</div>
        </div>
        <div class="list-row__trailing"><span class="badge badge--neutral">${I18n.t('suppliers.productCount', { count: linked.length, plural: linked.length !== 1 ? 's' : '' })}</span></div>
      </div>`;
  }

  function openForm(existing = null) {
    const isEdit = !!existing;
    const s = existing || { name: '', phone: '', email: '', address: '', notes: '' };

    const bodyHTML = `
      <div class="field"><label>${I18n.t('suppliers.form.nameLabel')}</label><input type="text" id="f_name" value="${escapeHTML(s.name)}" placeholder="${I18n.t('suppliers.form.namePlaceholder')}"></div>
      <div class="field"><label>${I18n.t('suppliers.form.phoneLabel')}</label><input type="tel" id="f_phone" value="${escapeHTML(s.phone)}" placeholder="${I18n.t('suppliers.form.optional')}"></div>
      <div class="field"><label>${I18n.t('suppliers.form.emailLabel')}</label><input type="text" id="f_email" value="${escapeHTML(s.email)}" placeholder="${I18n.t('suppliers.form.optional')}"></div>
      <div class="field"><label>${I18n.t('suppliers.form.addressLabel')}</label><input type="text" id="f_address" value="${escapeHTML(s.address)}" placeholder="${I18n.t('suppliers.form.optional')}"></div>
      <div class="field"><label>${I18n.t('suppliers.form.notesLabel')}</label><textarea id="f_notes" placeholder="${I18n.t('suppliers.form.optional')}">${escapeHTML(s.notes || '')}</textarea></div>
    `;
    const footerHTML = `<button class="btn btn-primary tappable" id="saveSupplierBtn">${isEdit ? I18n.t('suppliers.form.saveChanges') : I18n.t('suppliers.form.addTitle')}</button>`;
    const sheetEl = Sheet.open({ title: isEdit ? I18n.t('suppliers.form.editTitle') : I18n.t('suppliers.form.addTitle'), bodyHTML, footerHTML });

    sheetEl.querySelector('#saveSupplierBtn').addEventListener('click', async () => {
      const name = sheetEl.querySelector('#f_name').value.trim();
      if (!name) { Toast.error(I18n.t('suppliers.form.nameRequired')); return; }

      const record = {
        name,
        phone: sheetEl.querySelector('#f_phone').value.trim(),
        email: sheetEl.querySelector('#f_email').value.trim(),
        address: sheetEl.querySelector('#f_address').value.trim(),
        notes: sheetEl.querySelector('#f_notes').value.trim(),
      };
      if (isEdit) { record.id = s.id; await DB.put('suppliers', record); Toast.success(I18n.t('suppliers.form.updated')); }
      else { await DB.add('suppliers', record); Toast.success(I18n.t('suppliers.form.added')); DoodleHint.complete('addFirstSupplier'); }

      Sheet.close();
      if (Router.current === 'suppliers') renderList(document.getElementById('view'));
    });
  }

  async function openDetail(s, products, listContainer) {
    const linked = productsFor(s.name, products);
    const inventoryValue = linked.reduce((sum, p) => sum + (p.quantity || 0) * (p.purchasePrice || 0), 0);

    const bodyHTML = `
      <div style="text-align:center;">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 10px;">${Icon('truck', { size: 26 })}</div>
        <div style="font-weight:700; font-size:17px;">${escapeHTML(s.name)}</div>
        ${s.phone ? `<div class="text-dim text-sm mt-8">${escapeHTML(s.phone)}</div>` : ''}
        ${s.email ? `<div class="text-dim text-sm">${escapeHTML(s.email)}</div>` : ''}
        ${s.address ? `<div class="text-dim text-sm">${escapeHTML(s.address)}</div>` : ''}
      </div>
      <div class="stat-grid mt-16">
        <div class="stat-card"><div class="stat-card__label">${I18n.t('suppliers.detail.productsSupplied')}</div><div class="stat-card__value num">${linked.length}</div></div>
        <div class="stat-card"><div class="stat-card__label">${I18n.t('suppliers.detail.stockValue')}</div><div class="stat-card__value teal num">${Fmt.money(inventoryValue)}</div></div>
      </div>
      ${s.notes ? `<div class="card mt-16"><div class="text-sm">${escapeHTML(s.notes)}</div></div>` : ''}
      ${linked.length ? `
        <div class="section-title">${I18n.t('suppliers.detail.productsSectionTitle')}</div>
        <div class="list">
          ${linked.map((p) => `
            <div class="list-row">
              <div class="list-row__icon">${p.image ? `<img src="${p.image}" alt="">` : Icon('package')}</div>
              <div class="list-row__body"><div class="list-row__title">${escapeHTML(p.name)}</div><div class="list-row__subtitle">${I18n.t('suppliers.detail.inStockUnit', { qty: p.quantity, unit: escapeHTML(p.unit || 'pcs') })}</div></div>
              <div class="list-row__trailing"><div class="list-row__amount num">${Fmt.money(p.sellingPrice)}</div></div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
    const footerHTML = `
      <button class="btn btn-primary tappable" id="newPOBtn">${Icon('package')} ${I18n.t('suppliers.detail.newPurchaseOrder')}</button>
      <div class="flex gap-8 mt-8">
        <button class="btn btn-secondary tappable" id="editSupplierBtn">${I18n.t('suppliers.detail.edit')}</button>
        <button class="btn btn-danger tappable" id="deleteSupplierBtn" style="max-width:60px;">${Icon('trash')}</button>
      </div>`;
    const sheetEl = Sheet.open({ title: I18n.t('suppliers.detail.title'), bodyHTML, footerHTML });

    sheetEl.querySelector('#newPOBtn').addEventListener('click', () => {
      Sheet.close();
      setTimeout(() => PurchaseOrders.openForm({ id: s.id, name: s.name }), 260);
    });
    sheetEl.querySelector('#editSupplierBtn').addEventListener('click', () => {
      Sheet.close();
      setTimeout(() => openForm(s), 260);
    });
    sheetEl.querySelector('#deleteSupplierBtn').addEventListener('click', async (e) => {
      Icon.shake(e.currentTarget.querySelector('.icon-svg'));
      if (!(await Confirm.show(I18n.t('suppliers.detail.deleteConfirm', { name: s.name }), { danger: true }))) return;
      await DB.delete('suppliers', s.id);
      Toast.success(I18n.t('suppliers.detail.deleted'));
      Sheet.close();
      if (Router.current === 'suppliers') renderList(listContainer);
    });
  }

  /** Same search-or-add pattern as Customers.openPicker — used by
   *  purchaseorders.js to attach a supplier to a new order. */
  function openPicker(onPick) {
    const bodyHTML = `
      <div class="search-bar">
        <span class="search-bar__icon">${Icon('search')}</span>
        <input type="text" id="suppPickerSearch" placeholder="${I18n.t('suppliers.picker.searchPlaceholder')}">
      </div>
      <div id="suppPickerResults" class="list"></div>
    `;
    const sheetEl = Sheet.open({ title: I18n.t('suppliers.picker.title'), bodyHTML });
    const resultsEl = sheetEl.querySelector('#suppPickerResults');
    const searchEl = sheetEl.querySelector('#suppPickerSearch');

    async function runSearch(q) {
      const all = await DB.getAll('suppliers');
      const filtered = !q ? all : all.filter((s) => [s.name, s.phone].filter(Boolean).some((f) => f.toLowerCase().includes(q.toLowerCase())));
      resultsEl.innerHTML = `
        ${q ? `<div class="list-row tappable" data-new-supplier="1"><div class="list-row__icon">${Icon('plus')}</div><div class="list-row__body"><div class="list-row__title">${I18n.t('suppliers.picker.addNew', { query: escapeHTML(q) })}</div></div></div>` : ''}
        ${filtered.map((s) => `
          <div class="list-row tappable" data-pick-supplier="${s.id}">
            <div class="list-row__icon">${Icon('truck')}</div>
            <div class="list-row__body"><div class="list-row__title">${escapeHTML(s.name)}</div><div class="list-row__subtitle">${escapeHTML(s.phone || '')}</div></div>
          </div>
        `).join('')}
      `;
      const newBtn = resultsEl.querySelector('[data-new-supplier]');
      if (newBtn) newBtn.addEventListener('click', async () => {
        const id = await DB.add('suppliers', { name: q, phone: '', email: '', address: '', notes: '' });
        DoodleHint.complete('addFirstSupplier');
        Sheet.close();
        onPick({ id, name: q });
      });
      resultsEl.querySelectorAll('[data-pick-supplier]').forEach((row) => {
        row.addEventListener('click', async () => {
          const s = await DB.get('suppliers', Number(row.dataset.pickSupplier));
          Sheet.close();
          onPick(s);
        });
      });
    }

    searchEl.addEventListener('input', (e) => runSearch(e.target.value));
    runSearch('');
    setTimeout(() => searchEl.focus(), 300);
  }

  return { render, openPicker };
})();

Router.register('suppliers', Suppliers.render);
window.Suppliers = Suppliers;
