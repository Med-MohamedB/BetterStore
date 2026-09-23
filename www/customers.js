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
    actions.innerHTML = '';
    await renderList(container);
  }

  async function renderList(container) {
    const [customers, sales, payments] = await Promise.all([DB.getAll('customers'), DB.getAll('sales'), DB.getAll('customerPayments')]);

    const filtered = customers.filter((c) => {
      if (!searchQuery) return true;
      return [c.name, c.phone, c.email].filter(Boolean).some((f) => f.toLowerCase().includes(searchQuery.toLowerCase()));
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    container.innerHTML = `
      <div class="search-bar">
        <span class="search-bar__icon">${Icon('search')}</span>
        <input type="text" id="customerSearch" placeholder="${I18n.t('customers.searchPlaceholder')}" value="${escapeHTML(searchQuery)}">
        ${searchQuery ? `<button class="search-bar__clear tappable" id="clearCustomerSearch">${Icon('x', { size: 14 })}</button>` : ''}
      </div>

      ${filtered.length ? `
        <div class="list stagger" id="customerList">
          ${filtered.map((c) => customerRowHTML(c, sales, payments)).join('')}
        </div>
      ` : `
        <div class="empty-state${customers.length ? '' : ' empty-state--illustrated'}">
          ${customers.length
            ? `<div class="empty-state__icon">${Icon('user', { size: 32 })}</div>`
            : `<img class="empty-state__illustration" src="${themedIllustration('empty-customers')}" alt="">`}
          <div class="empty-state__title">${customers.length ? I18n.t('customers.noCustomersMatch') : I18n.t('customers.noCustomersYet')}</div>
          <div class="empty-state__hint">${customers.length ? I18n.t('customers.tryDifferentSearch') : I18n.t('customers.tapToAddFirst')}</div>
        </div>
      `}
      <button class="screen-fab tappable" id="customerFab" title="${I18n.t('customers.addCustomer')}">${Icon('plus')}</button>
    `;
    container.querySelector('#customerFab').addEventListener('click', () => openForm());
    if (!filtered.length && !customers.length) {
      DoodleHint.show('addFirstCustomer', container.querySelector('#customerFab'), I18n.t('customers.addFirstCustomerHint'), 'br');
    }

    const searchInput = container.querySelector('#customerSearch');
    searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; renderList(container); });
    const clearBtn = container.querySelector('#clearCustomerSearch');
    if (clearBtn) clearBtn.addEventListener('click', () => { searchQuery = ''; renderList(container); });

    container.querySelectorAll('[data-customer-row]').forEach((row) => {
      row.addEventListener('click', async () => {
        const c = await DB.get('customers', Number(row.dataset.customerRow));
        if (c) openDetail(c, sales, payments, container);
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

  /** How much of a credit sale is still unpaid, after its own refunds (a
   *  refund on a credit sale reduces what's owed on it, same logic a
   *  refund on a cash sale would apply to its own total). */
  function creditOutstanding(sale) {
    if (sale.paymentMethod !== 'credit') return 0;
    return Math.max(0, (sale.creditAmount || 0) - (sale.totalRefunded || 0));
  }

  /** A customer's current balance owed: every credit sale's still-unpaid
   *  amount, minus every payment they've made — derived fresh each time
   *  rather than stored, so it can never drift out of sync (same approach
   *  as statsFor's lifetime totals above). */
  function balanceFor(customerId, sales, payments) {
    const owed = sales.filter((s) => s.customerId === customerId).reduce((sum, s) => sum + creditOutstanding(s), 0);
    const paid = payments.filter((p) => p.customerId === customerId).reduce((sum, p) => sum + p.amount, 0);
    return Math.max(0, owed - paid);
  }

  function customerRowHTML(c, sales, payments) {
    const { total, count } = statsFor(c.id, sales);
    const balance = balanceFor(c.id, sales, payments);
    return `
      <div class="list-row tappable" data-customer-row="${c.id}">
        <div class="list-row__icon${balance ? ' warn' : ''}">${Icon(balance ? 'wallet' : 'user')}</div>
        <div class="list-row__body">
          <div class="list-row__title">${escapeHTML(c.name)}</div>
          <div class="list-row__subtitle">${escapeHTML(c.phone || I18n.t('customers.noPhone'))} · ${I18n.t('customers.orderCount', { count, plural: count !== 1 ? 's' : '' })}</div>
        </div>
        <div class="list-row__trailing">
          <div class="list-row__amount num">${Fmt.money(total)}</div>
          ${balance ? `<div class="text-sm num" style="color:var(--coral); margin-top:2px;">${I18n.t('customers.owes', { amount: Fmt.money(balance) })}</div>` : ''}
        </div>
      </div>`;
  }

  function openForm(existing = null) {
    const isEdit = !!existing;
    const c = existing || { name: '', phone: '', email: '', notes: '' };

    const bodyHTML = `
      <div class="field"><label>${I18n.t('customers.form.nameLabel')}</label><input type="text" id="f_name" value="${escapeHTML(c.name)}" placeholder="${I18n.t('customers.form.namePlaceholder')}"></div>
      <div class="field"><label>${I18n.t('customers.form.phoneLabel')}</label><input type="tel" id="f_phone" value="${escapeHTML(c.phone)}" placeholder="${I18n.t('customers.form.optional')}"></div>
      <div class="field"><label>${I18n.t('customers.form.emailLabel')}</label><input type="text" id="f_email" value="${escapeHTML(c.email)}" placeholder="${I18n.t('customers.form.optional')}"></div>
      <div class="field"><label>${I18n.t('customers.form.notesLabel')}</label><textarea id="f_notes" placeholder="${I18n.t('customers.form.optional')}">${escapeHTML(c.notes || '')}</textarea></div>
    `;
    const footerHTML = `<button class="btn btn-primary tappable" id="saveCustomerBtn">${isEdit ? I18n.t('customers.form.saveChanges') : I18n.t('customers.form.addTitle')}</button>`;
    const sheetEl = Sheet.open({ title: isEdit ? I18n.t('customers.form.editTitle') : I18n.t('customers.form.addTitle'), bodyHTML, footerHTML });

    sheetEl.querySelector('#saveCustomerBtn').addEventListener('click', async () => {
      const name = sheetEl.querySelector('#f_name').value.trim();
      if (!name) { Toast.error(I18n.t('customers.form.nameRequired')); return; }

      const record = {
        name,
        phone: sheetEl.querySelector('#f_phone').value.trim(),
        email: sheetEl.querySelector('#f_email').value.trim(),
        notes: sheetEl.querySelector('#f_notes').value.trim(),
      };
      if (isEdit) { record.id = c.id; await DB.put('customers', record); Toast.success(I18n.t('customers.form.updated')); }
      else { await DB.add('customers', record); Toast.success(I18n.t('customers.form.added')); DoodleHint.complete('addFirstCustomer'); }

      Sheet.close();
      if (Router.current === 'customers') renderList(document.getElementById('view'));
    });
  }

  async function openDetail(c, sales, payments, listContainer) {
    const { total, count, last } = statsFor(c.id, sales);
    const balance = balanceFor(c.id, sales, payments);
    const bodyHTML = `
      <div style="text-align:center;">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 10px;">${Icon('user', { size: 26 })}</div>
        <div style="font-weight:700; font-size:17px;">${escapeHTML(c.name)}</div>
        ${c.phone ? `<div class="text-dim text-sm mt-8">${escapeHTML(c.phone)}</div>` : ''}
        ${c.email ? `<div class="text-dim text-sm">${escapeHTML(c.email)}</div>` : ''}
      </div>
      <div class="stat-grid mt-16">
        <div class="stat-card"><div class="stat-card__label">${I18n.t('customers.detail.totalPurchases')}</div><div class="stat-card__value accent num">${Fmt.money(total)}</div></div>
        <div class="stat-card"><div class="stat-card__label">${I18n.t('customers.detail.orders')}</div><div class="stat-card__value num">${count}</div></div>
      </div>
      ${balance ? `
        <div class="card mt-16" style="border-color:var(--coral);">
          <div class="flex-between">
            <span class="text-sm" style="font-weight:700; color:var(--coral);">${I18n.t('customers.detail.balanceOwed')}</span>
            <span class="num" style="font-weight:700; font-size:16px; color:var(--coral);">${Fmt.money(balance)}</span>
          </div>
        </div>
      ` : ''}
      ${last ? `<div class="text-dim text-sm mt-16">${I18n.t('customers.detail.lastPurchase', { date: Fmt.dateTime(last) })}</div>` : ''}
      ${c.notes ? `<div class="card mt-16"><div class="text-sm">${escapeHTML(c.notes)}</div></div>` : ''}
    `;
    const footerHTML = `
      ${balance ? `<button class="btn btn-primary tappable" id="recordPaymentBtn">${Icon('banknote')} ${I18n.t('customers.detail.recordPayment')}</button>` : ''}
      <div class="flex gap-8 ${balance ? 'mt-8' : ''}">
        <button class="btn btn-secondary tappable" id="editCustomerBtn">${I18n.t('customers.detail.edit')}</button>
        <button class="btn btn-danger tappable" id="deleteCustomerBtn" style="max-width:60px;">${Icon('trash')}</button>
      </div>`;
    const sheetEl = Sheet.open({ title: I18n.t('customers.detail.title'), bodyHTML, footerHTML });

    const recordBtn = sheetEl.querySelector('#recordPaymentBtn');
    if (recordBtn) recordBtn.addEventListener('click', () => {
      Sheet.close();
      setTimeout(() => openRecordPayment(c, balance, listContainer), 260);
    });
    sheetEl.querySelector('#editCustomerBtn').addEventListener('click', () => {
      Sheet.close();
      setTimeout(() => openForm(c), 260);
    });
    sheetEl.querySelector('#deleteCustomerBtn').addEventListener('click', async (e) => {
      Icon.shake(e.currentTarget.querySelector('.icon-svg'));
      if (!(await Confirm.show(I18n.t('customers.detail.deleteConfirm', { name: c.name }), { danger: true }))) return;
      await DB.delete('customers', c.id);
      Toast.success(I18n.t('customers.detail.deleted'));
      Sheet.close();
      if (Router.current === 'customers') renderList(listContainer);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Record Payment — pays down a customer's credit balance             */
  /* ---------------------------------------------------------------- */

  function openRecordPayment(c, balance, listContainer) {
    const bodyHTML = `
      <div class="flex-between">
        <span class="text-dim text-sm">${I18n.t('customers.paymentSheet.currentBalance')}</span>
        <span class="num" style="font-weight:700; font-size:18px; color:var(--coral);">${Fmt.money(balance)}</span>
      </div>
      <div class="field mt-16">
        <label>${I18n.t('customers.paymentSheet.amountLabel')}</label>
        <input type="number" inputmode="decimal" id="paymentAmount" value="${balance}" min="0.01" max="${balance}" step="0.01">
      </div>
      <div class="text-dim text-sm" id="paymentRemainingHint"></div>
    `;
    const footerHTML = `<button class="btn btn-primary tappable" id="confirmPaymentBtn">${I18n.t('customers.paymentSheet.confirmBtn')}</button>`;
    const sheetEl = Sheet.open({ title: I18n.t('customers.paymentSheet.title'), bodyHTML, footerHTML });

    const input = sheetEl.querySelector('#paymentAmount');
    const hint = sheetEl.querySelector('#paymentRemainingHint');
    const updateHint = () => {
      const amt = Math.min(balance, Math.max(0, parseFloat(input.value) || 0));
      const remaining = balance - amt;
      hint.textContent = remaining > 0
        ? I18n.t('customers.paymentSheet.remainingAfter', { amount: Fmt.money(remaining) })
        : I18n.t('customers.paymentSheet.paidInFull');
    };
    input.addEventListener('input', updateHint);
    updateHint();
    setTimeout(() => input.focus(), 300);

    sheetEl.querySelector('#confirmPaymentBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return; // guards against a rapid double-tap recording the payment twice
      const amount = Math.round((parseFloat(input.value) || 0) * 100) / 100;
      if (amount <= 0) { Toast.error(I18n.t('customers.paymentSheet.amountRequired')); return; }
      if (amount > balance + 0.001) { Toast.error(I18n.t('customers.paymentSheet.amountExceedsBalance')); return; }

      btn.disabled = true;
      const payment = {
        customerId: c.id,
        customerName: c.name,
        amount,
        balanceBefore: balance,
        date: new Date(),
        receiptNumber: Ids.paymentNumber(),
      };
      payment.id = await DB.add('customerPayments', payment);

      await showSuccessCheck(I18n.t('customers.paymentSheet.recorded'), true);
      Sheet.close();
      if (Router.current === 'customers') renderList(listContainer);
      setTimeout(() => openPaymentReceipt(payment, c), 100);
    });
  }

  /** Shows the just-recorded payment as its own printable/shareable
   *  receipt — same language-switcher + print/share/done pattern as
   *  Sales' openRefundReceiptSheet, for PaymentReceipt instead of
   *  RefundReceipt. */
  async function openPaymentReceipt(payment, c) {
    const store = await Settings.get('store');
    const pos = await Settings.get('pos');
    const lang = resolveReceiptLanguage(pos);

    const bodyHTML = `
      ${receiptLangChipsHTML(lang)}
      <div class="receipt-preview-body">${PaymentReceipt.html(payment, store, lang)}</div>
    `;
    const footerHTML = `
      <div class="flex gap-8">
        <button class="btn btn-secondary tappable" id="printPaymentBtn">${Icon('printer')} ${I18n.t('paymentReceipt.printBtn')}</button>
        <button class="btn btn-secondary tappable" id="sharePaymentBtn">${Icon('share')} ${I18n.t('paymentReceipt.shareBtn')}</button>
      </div>
      <button class="btn btn-primary mt-8 tappable" id="paymentReceiptDoneBtn">${I18n.t('paymentReceipt.doneBtn')}</button>
    `;
    const sheetEl = Sheet.open({ title: I18n.t('paymentReceipt.title'), bodyHTML, footerHTML });

    let currentLang = lang;
    const bodyEl = sheetEl.querySelector('.receipt-preview-body');
    const chipsEl = sheetEl.querySelector('.receipt-lang-chips');
    if (bodyEl && chipsEl) {
      chipsEl.querySelectorAll('[data-lang]').forEach((chip) => {
        chip.addEventListener('click', () => {
          currentLang = chip.dataset.lang;
          chipsEl.querySelectorAll('[data-lang]').forEach((cEl) => cEl.classList.toggle('active', cEl === chip));
          bodyEl.innerHTML = PaymentReceipt.html(payment, store, currentLang);
        });
      });
    }

    sheetEl.querySelector('#printPaymentBtn').addEventListener('click', () => printPaymentReceipt(payment, store, currentLang));
    sheetEl.querySelector('#sharePaymentBtn').addEventListener('click', () => sharePaymentReceipt(payment, store, currentLang));
    sheetEl.querySelector('#paymentReceiptDoneBtn').addEventListener('click', () => Sheet.close());
  }

  /** Reusable picker for pos.js: lets the cashier attach a customer to the current sale. */
  function openPicker(onPick) {
    const bodyHTML = `
      <div class="search-bar">
        <span class="search-bar__icon">${Icon('search')}</span>
        <input type="text" id="custPickerSearch" placeholder="${I18n.t('customers.picker.searchPlaceholder')}">
      </div>
      <div id="custPickerResults" class="list"></div>
    `;
    // stacked: true — this is commonly opened from inside another sheet
    // (e.g. the POS payment sheet); layer on top instead of destroying it.
    const sheetEl = Sheet.open({ title: I18n.t('customers.picker.title'), bodyHTML, stacked: true });
    const resultsEl = sheetEl.querySelector('#custPickerResults');
    const searchEl = sheetEl.querySelector('#custPickerSearch');

    async function runSearch(q) {
      const all = await DB.getAll('customers');
      const filtered = !q ? all : all.filter((c) => [c.name, c.phone].filter(Boolean).some((f) => f.toLowerCase().includes(q.toLowerCase())));
      resultsEl.innerHTML = `
        ${q ? `<div class="list-row tappable" data-new-customer="1"><div class="list-row__icon">${Icon('plus')}</div><div class="list-row__body"><div class="list-row__title">${I18n.t('customers.picker.addNew', { query: escapeHTML(q) })}</div></div></div>` : ''}
        ${filtered.map((c) => `
          <div class="list-row tappable" data-pick-customer="${c.id}">
            <div class="list-row__icon">${Icon('user')}</div>
            <div class="list-row__body"><div class="list-row__title">${escapeHTML(c.name)}</div><div class="list-row__subtitle">${escapeHTML(c.phone || '')}</div></div>
          </div>
        `).join('')}
      `;
      const newBtn = resultsEl.querySelector('[data-new-customer]');
      if (newBtn) newBtn.addEventListener('click', async () => {
        const id = await DB.add('customers', { name: q, phone: '', email: '', notes: '' });
        DoodleHint.complete('addFirstCustomer');
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
