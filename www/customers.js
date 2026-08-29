/**
 * customers.js — Customer Management.
 *
 * Registers the "customers" route (list + add/edit) and exposes
 * Customers.openPicker(onPick) for pos.js to let a cashier attach a
 * customer to the current sale. Totals (total purchases, transaction
 * count, last purchase) are derived live from `sales` records that carry
 * a customerId, rather than stored/duplicated on the customer record —
 * so they can never drift out of sync.
 */

const Customers = (() => {
  let searchQuery = '';

  async function render(container) {
    const actions = document.getElementById('topbarActions');
    actions.innerHTML = `<button class="icon-btn tappable" id="addCustomerBtn">➕</button>`;
    actions.querySelector('#addCustomerBtn').addEventListener('click', () => openForm());
    await renderList(container);
  }

  async function renderList(container) {
    const [customers, sales] = await Promise.all([DB.getAll('customers'), DB.getAll('sales')]);

    const filtered = customers.filter((c) => {
      if (!searchQuery) return true;
      return [c.name, c.phone, c.email].filter(Boolean).some((f) => f.toLowerCase().includes(searchQuery.toLowerCase()));
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    container.innerHTML = `
      <div class="search-bar">
        <span class="search-bar__icon">🔍</span>
        <input type="text" id="customerSearch" placeholder="Search name, phone, email..." value="${escapeHTML(searchQuery)}">
        ${searchQuery ? `<button class="search-bar__clear tappable" id="clearCustomerSearch">✕</button>` : ''}
      </div>

      ${filtered.length ? `
        <div class="list stagger" id="customerList">
          ${filtered.map((c) => customerRowHTML(c, sales)).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-state__icon">👤</div>
          <div class="empty-state__title">${customers.length ? 'No customers match' : 'No customers yet'}</div>
          <div class="empty-state__hint">${customers.length ? 'Try a different search.' : 'Tap + to add your first customer.'}</div>
        </div>
      `}
    `;

    const searchInput = container.querySelector('#customerSearch');
    searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; renderList(container); });
    const clearBtn = container.querySelector('#clearCustomerSearch');
    if (clearBtn) clearBtn.addEventListener('click', () => { searchQuery = ''; renderList(container); });

    container.querySelectorAll('[data-customer-row]').forEach((row) => {
      row.addEventListener('click', async () => {
        const c = await DB.get('customers', Number(row.dataset.customerRow));
        if (c) openDetail(c, sales, container);
      });
    });
  }

  function statsFor(customerId, sales) {
    const theirSales = sales.filter((s) => s.customerId === customerId && s.status !== 'refunded');
    const total = theirSales.reduce((s, sale) => s + sale.total, 0);
    const count = theirSales.length;
    const last = theirSales.length ? theirSales.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b).date : null;
    return { total, count, last };
  }

  function customerRowHTML(c, sales) {
    const { total, count } = statsFor(c.id, sales);
    return `
      <div class="list-row tappable" data-customer-row="${c.id}">
        <div class="list-row__icon">👤</div>
        <div class="list-row__body">
          <div class="list-row__title">${escapeHTML(c.name)}</div>
          <div class="list-row__subtitle">${escapeHTML(c.phone || 'No phone')} · ${count} order${count !== 1 ? 's' : ''}</div>
        </div>
        <div class="list-row__trailing"><div class="list-row__amount num">${Fmt.money(total)}</div></div>
      </div>`;
  }

  function openForm(existing = null) {
    const isEdit = !!existing;
    const c = existing || { name: '', phone: '', email: '', notes: '' };

    const bodyHTML = `
      <div class="field"><label>Name *</label><input type="text" id="f_name" value="${escapeHTML(c.name)}" placeholder="Customer name"></div>
      <div class="field"><label>Phone</label><input type="tel" id="f_phone" value="${escapeHTML(c.phone)}" placeholder="Optional"></div>
      <div class="field"><label>Email</label><input type="text" id="f_email" value="${escapeHTML(c.email)}" placeholder="Optional"></div>
      <div class="field"><label>Notes</label><textarea id="f_notes" placeholder="Optional">${escapeHTML(c.notes || '')}</textarea></div>
    `;
    const footerHTML = `<button class="btn btn-primary tappable" id="saveCustomerBtn">${isEdit ? 'Save Changes' : 'Add Customer'}</button>`;
    const sheetEl = Sheet.open({ title: isEdit ? 'Edit Customer' : 'Add Customer', bodyHTML, footerHTML });

    sheetEl.querySelector('#saveCustomerBtn').addEventListener('click', async () => {
      const name = sheetEl.querySelector('#f_name').value.trim();
      if (!name) { Toast.error('Customer name is required'); return; }

      const record = {
        name,
        phone: sheetEl.querySelector('#f_phone').value.trim(),
        email: sheetEl.querySelector('#f_email').value.trim(),
        notes: sheetEl.querySelector('#f_notes').value.trim(),
      };
      if (isEdit) { record.id = c.id; await DB.put('customers', record); Toast.success('Customer updated'); }
      else { await DB.add('customers', record); Toast.success('Customer added'); }

      Sheet.close();
      if (Router.current === 'customers') renderList(document.getElementById('view'));
    });
  }

  async function openDetail(c, sales, listContainer) {
    const { total, count, last } = statsFor(c.id, sales);
    const bodyHTML = `
      <div style="text-align:center;">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 10px;">👤</div>
        <div style="font-weight:700; font-size:17px;">${escapeHTML(c.name)}</div>
        ${c.phone ? `<div class="text-dim text-sm mt-8">${escapeHTML(c.phone)}</div>` : ''}
        ${c.email ? `<div class="text-dim text-sm">${escapeHTML(c.email)}</div>` : ''}
      </div>
      <div class="stat-grid mt-16">
        <div class="stat-card"><div class="stat-card__label">Total Purchases</div><div class="stat-card__value accent num">${Fmt.money(total)}</div></div>
        <div class="stat-card"><div class="stat-card__label">Orders</div><div class="stat-card__value num">${count}</div></div>
      </div>
      ${last ? `<div class="text-dim text-sm mt-16">Last purchase: ${Fmt.dateTime(last)}</div>` : ''}
      ${c.notes ? `<div class="card mt-16"><div class="text-sm">${escapeHTML(c.notes)}</div></div>` : ''}
    `;
    const footerHTML = `
      <div class="flex gap-8">
        <button class="btn btn-secondary tappable" id="editCustomerBtn">Edit</button>
        <button class="btn btn-danger tappable" id="deleteCustomerBtn" style="max-width:60px;">🗑️</button>
      </div>`;
    const sheetEl = Sheet.open({ title: 'Customer', bodyHTML, footerHTML });

    sheetEl.querySelector('#editCustomerBtn').addEventListener('click', () => {
      Sheet.close();
      setTimeout(() => openForm(c), 260);
    });
    sheetEl.querySelector('#deleteCustomerBtn').addEventListener('click', async () => {
      if (!confirm(`Delete "${c.name}"? Their past sales stay on record.`)) return;
      await DB.delete('customers', c.id);
      Toast.success('Customer deleted');
      Sheet.close();
      if (Router.current === 'customers') renderList(listContainer);
    });
  }

  /** Reusable picker for pos.js: lets the cashier attach a customer to the current sale. */
  function openPicker(onPick) {
    const bodyHTML = `
      <div class="search-bar">
        <span class="search-bar__icon">🔍</span>
        <input type="text" id="custPickerSearch" placeholder="Search or add a customer...">
      </div>
      <div id="custPickerResults" class="list"></div>
    `;
    const sheetEl = Sheet.open({ title: 'Attach Customer', bodyHTML });
    const resultsEl = sheetEl.querySelector('#custPickerResults');
    const searchEl = sheetEl.querySelector('#custPickerSearch');

    async function runSearch(q) {
      const all = await DB.getAll('customers');
      const filtered = !q ? all : all.filter((c) => [c.name, c.phone].filter(Boolean).some((f) => f.toLowerCase().includes(q.toLowerCase())));
      resultsEl.innerHTML = `
        ${q ? `<div class="list-row tappable" data-new-customer="1"><div class="list-row__icon">➕</div><div class="list-row__body"><div class="list-row__title">Add "${escapeHTML(q)}" as new customer</div></div></div>` : ''}
        ${filtered.map((c) => `
          <div class="list-row tappable" data-pick-customer="${c.id}">
            <div class="list-row__icon">👤</div>
            <div class="list-row__body"><div class="list-row__title">${escapeHTML(c.name)}</div><div class="list-row__subtitle">${escapeHTML(c.phone || '')}</div></div>
          </div>
        `).join('')}
      `;
      const newBtn = resultsEl.querySelector('[data-new-customer]');
      if (newBtn) newBtn.addEventListener('click', async () => {
        const id = await DB.add('customers', { name: q, phone: '', email: '', notes: '' });
        Sheet.close();
        onPick({ id, name: q });
      });
      resultsEl.querySelectorAll('[data-pick-customer]').forEach((row) => {
        row.addEventListener('click', async () => {
          const c = await DB.get('customers', Number(row.dataset.pickCustomer));
          Sheet.close();
          onPick(c);
        });
      });
    }

    searchEl.addEventListener('input', (e) => runSearch(e.target.value));
    runSearch('');
    setTimeout(() => searchEl.focus(), 300);
  }

  return { render, openPicker };
})();

Router.register('customers', Customers.render);
window.Customers = Customers;
