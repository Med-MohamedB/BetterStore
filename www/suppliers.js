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
        <input type="text" id="supplierSearch" placeholder="Search name, phone, email..." value="${escapeHTML(searchQuery)}">
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
          <div class="empty-state__title">${suppliers.length ? 'No suppliers match' : 'No suppliers yet'}</div>
          <div class="empty-state__hint">${suppliers.length ? 'Try a different search.' : 'Tap the button below to add your first supplier.'}</div>
        </div>
      `}
      <button class="screen-fab tappable" id="supplierFab" title="Add supplier">${Icon('plus')}</button>
    `;
    container.querySelector('#supplierFab').addEventListener('click', () => openForm());
    if (!filtered.length && !suppliers.length) {
      DoodleHint.show('addFirstSupplier', container.querySelector('#supplierFab'), 'Add your first supplier', 'br');
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
          <div class="list-row__subtitle">${escapeHTML(s.phone || 'No phone')}</div>
        </div>
        <div class="list-row__trailing"><span class="badge badge--neutral">${linked.length} product${linked.length !== 1 ? 's' : ''}</span></div>
      </div>`;
  }

  function openForm(existing = null) {
    const isEdit = !!existing;
    const s = existing || { name: '', phone: '', email: '', address: '', notes: '' };

    const bodyHTML = `
      <div class="field"><label>Name *</label><input type="text" id="f_name" value="${escapeHTML(s.name)}" placeholder="Supplier name"></div>
      <div class="field"><label>Phone</label><input type="tel" id="f_phone" value="${escapeHTML(s.phone)}" placeholder="Optional"></div>
      <div class="field"><label>Email</label><input type="text" id="f_email" value="${escapeHTML(s.email)}" placeholder="Optional"></div>
      <div class="field"><label>Address</label><input type="text" id="f_address" value="${escapeHTML(s.address)}" placeholder="Optional"></div>
      <div class="field"><label>Notes</label><textarea id="f_notes" placeholder="Optional">${escapeHTML(s.notes || '')}</textarea></div>
    `;
    const footerHTML = `<button class="btn btn-primary tappable" id="saveSupplierBtn">${isEdit ? 'Save Changes' : 'Add Supplier'}</button>`;
    const sheetEl = Sheet.open({ title: isEdit ? 'Edit Supplier' : 'Add Supplier', bodyHTML, footerHTML });

    sheetEl.querySelector('#saveSupplierBtn').addEventListener('click', async () => {
      const name = sheetEl.querySelector('#f_name').value.trim();
      if (!name) { Toast.error('Supplier name is required'); return; }

      const record = {
        name,
        phone: sheetEl.querySelector('#f_phone').value.trim(),
        email: sheetEl.querySelector('#f_email').value.trim(),
        address: sheetEl.querySelector('#f_address').value.trim(),
        notes: sheetEl.querySelector('#f_notes').value.trim(),
      };
      if (isEdit) { record.id = s.id; await DB.put('suppliers', record); Toast.success('Supplier updated'); }
      else { await DB.add('suppliers', record); Toast.success('Supplier added'); DoodleHint.complete('addFirstSupplier'); }

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
        <div class="stat-card"><div class="stat-card__label">Products Supplied</div><div class="stat-card__value num">${linked.length}</div></div>
        <div class="stat-card"><div class="stat-card__label">Stock Value</div><div class="stat-card__value teal num">${Fmt.money(inventoryValue)}</div></div>
      </div>
      ${s.notes ? `<div class="card mt-16"><div class="text-sm">${escapeHTML(s.notes)}</div></div>` : ''}
      ${linked.length ? `
        <div class="section-title">Products</div>
        <div class="list">
          ${linked.map((p) => `
            <div class="list-row">
              <div class="list-row__icon">${p.image ? `<img src="${p.image}" alt="">` : Icon('package')}</div>
              <div class="list-row__body"><div class="list-row__title">${escapeHTML(p.name)}</div><div class="list-row__subtitle">${p.quantity} ${escapeHTML(p.unit || 'pcs')} in stock</div></div>
              <div class="list-row__trailing"><div class="list-row__amount num">${Fmt.money(p.sellingPrice)}</div></div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
    const footerHTML = `
      <div class="flex gap-8">
        <button class="btn btn-secondary tappable" id="editSupplierBtn">Edit</button>
        <button class="btn btn-danger tappable" id="deleteSupplierBtn" style="max-width:60px;">${Icon('trash')}</button>
      </div>`;
    const sheetEl = Sheet.open({ title: 'Supplier', bodyHTML, footerHTML });

    sheetEl.querySelector('#editSupplierBtn').addEventListener('click', () => {
      Sheet.close();
      setTimeout(() => openForm(s), 260);
    });
    sheetEl.querySelector('#deleteSupplierBtn').addEventListener('click', async (e) => {
      Icon.shake(e.currentTarget.querySelector('.icon-svg'));
      if (!confirm(`Delete "${s.name}"? Linked products keep their supplier name as text.`)) return;
      await DB.delete('suppliers', s.id);
      Toast.success('Supplier deleted');
      Sheet.close();
      if (Router.current === 'suppliers') renderList(listContainer);
    });
  }

  return { render };
})();

Router.register('suppliers', Suppliers.render);
window.Suppliers = Suppliers;
