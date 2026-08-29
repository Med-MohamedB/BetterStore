/**
 * inventory.js — Dedicated Inventory view.
 *
 * Product Management already lets you view/edit a single product's stock;
 * this screen is the store-wide view: every product's stock status at a
 * glance, low-stock/out-of-stock filtering, total inventory value, and the
 * full adjustment history log (every manual adjustment + every sale that
 * touched stock, from inventoryLog).
 */

const Inventory = (() => {
  let statusFilter = 'all'; // 'all' | 'low' | 'out'

  async function render(container) {
    const actions = document.getElementById('topbarActions');
    actions.innerHTML = `<button class="icon-btn tappable" id="historyBtn" title="Adjustment history">🕘</button>`;
    actions.querySelector('#historyBtn').addEventListener('click', openHistory);

    await renderList(container);
  }

  function statusOf(p) {
    if ((p.quantity ?? 0) <= 0) return 'out';
    if ((p.quantity ?? 0) <= (p.minStock ?? 0)) return 'low';
    return 'ok';
  }

  async function renderList(container) {
    const products = await DB.getAll('products');

    const counts = { all: products.length, low: 0, out: 0 };
    products.forEach((p) => {
      const s = statusOf(p);
      if (s === 'low') counts.low++;
      if (s === 'out') counts.out++;
    });

    const filtered = products.filter((p) => {
      if (statusFilter === 'all') return true;
      return statusOf(p) === statusFilter;
    }).sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0));

    const totalValue = products.reduce((s, p) => s + (p.quantity || 0) * (p.purchasePrice || 0), 0);
    const potentialRevenue = products.reduce((s, p) => s + (p.quantity || 0) * (p.sellingPrice || 0), 0);

    container.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-card__label">Inventory Value</div>
          <div class="stat-card__value teal num">${Fmt.money(totalValue)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Potential Revenue</div>
          <div class="stat-card__value accent num">${Fmt.money(potentialRevenue)}</div>
        </div>
      </div>

      <div class="chip-row mt-16">
        <button class="chip tappable${statusFilter === 'all' ? ' active' : ''}" data-filter="all">All · ${counts.all}</button>
        <button class="chip tappable${statusFilter === 'low' ? ' active' : ''}" data-filter="low">⚠️ Low · ${counts.low}</button>
        <button class="chip tappable${statusFilter === 'out' ? ' active' : ''}" data-filter="out">⛔ Out · ${counts.out}</button>
      </div>

      ${filtered.length ? `
        <div class="list stagger" id="invList">
          ${filtered.map(invRowHTML).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-state__icon">📊</div>
          <div class="empty-state__title">Nothing here</div>
          <div class="empty-state__hint">${products.length ? 'No products match this filter.' : 'Add products to start tracking inventory.'}</div>
        </div>
      `}
    `;

    container.querySelectorAll('[data-filter]').forEach((chip) => {
      chip.addEventListener('click', () => { statusFilter = chip.dataset.filter; renderList(container); });
    });

    container.querySelectorAll('[data-inv-row]').forEach((row) => {
      row.addEventListener('click', async () => {
        const p = await DB.get('products', Number(row.dataset.invRow));
        if (p) Products.openDetail(p);
      });
    });
  }

  function invRowHTML(p) {
    const status = statusOf(p);
    const badge = status === 'out'
      ? `<span class="badge badge--danger">Out of stock</span>`
      : status === 'low'
        ? `<span class="badge badge--warn">Low stock</span>`
        : `<span class="badge badge--success">In stock</span>`;

    return `
      <div class="list-row tappable" data-inv-row="${p.id}">
        <div class="list-row__icon">${p.image ? `<img src="${p.image}" alt="">` : '📦'}</div>
        <div class="list-row__body">
          <div class="list-row__title">${escapeHTML(p.name)}</div>
          <div class="list-row__subtitle">Min ${p.minStock ?? 0} · ${Fmt.money(p.sellingPrice)}</div>
        </div>
        <div class="list-row__trailing">
          <div class="list-row__amount num">${p.quantity ?? 0} ${escapeHTML(p.unit || 'pcs')}</div>
          <div class="mt-8">${badge}</div>
        </div>
      </div>`;
  }

  async function openHistory() {
    const log = (await DB.getAll('inventoryLog')).sort((a, b) => new Date(b.date) - new Date(a.date));
    const bodyHTML = log.length ? `
      <div class="list stagger">
        ${log.slice(0, 100).map((entry) => `
          <div class="list-row">
            <div class="list-row__icon">${entry.change > 0 ? '📈' : '📉'}</div>
            <div class="list-row__body">
              <div class="list-row__title">${escapeHTML(entry.productName)}</div>
              <div class="list-row__subtitle">${escapeHTML(entry.reason)} · ${Fmt.dateTime(entry.date)}</div>
            </div>
            <div class="list-row__trailing">
              <div class="list-row__amount num" style="color:${entry.change > 0 ? 'var(--teal)' : 'var(--coral)'};">${entry.change > 0 ? '+' : ''}${entry.change}</div>
              <div class="text-dim text-sm mt-8">→ ${entry.newQuantity}</div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-state__icon">🕘</div>
        <div class="empty-state__title">No adjustments yet</div>
        <div class="empty-state__hint">Stock changes from sales and manual adjustments will show up here.</div>
      </div>
    `;
    Sheet.open({ title: 'Adjustment History', bodyHTML });
  }

  return { render };
})();

Router.register('inventory', Inventory.render);
window.Inventory = Inventory;
