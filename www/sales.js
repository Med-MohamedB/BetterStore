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

    const totalRevenue = filtered.filter((s) => s.status !== 'refunded').reduce((sum, s) => sum + s.total, 0);

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
    return `
      <div class="list-row tappable" data-sale-row="${s.id}" style="${refunded ? 'opacity:0.55;' : ''}">
        <div class="list-row__icon">${refunded ? '↩️' : '🧾'}</div>
        <div class="list-row__body">
          <div class="list-row__title">${s.receiptNumber}</div>
          <div class="list-row__subtitle">${Fmt.dateTime(s.date)} · ${s.paymentMethod}</div>
        </div>
        <div class="list-row__trailing">
          <div class="list-row__amount num">${Fmt.money(s.total)}</div>
          ${refunded ? `<div class="mt-8"><span class="badge badge--danger">Refunded</span></div>` : ''}
        </div>
      </div>`;
  }

  async function openDetail(sale, listContainer) {
    const store = await Settings.get('store');
    const refunded = sale.status === 'refunded';

    const bodyHTML = Receipt.html(sale, store);

    const footerHTML = `
      <div class="flex gap-8">
        <button class="btn btn-secondary tappable" id="reprintBtn">🖨️ Reprint</button>
        <button class="btn btn-secondary tappable" id="shareSaleBtn">📤 Share</button>
      </div>
      ${!refunded ? `<button class="btn btn-danger mt-8 tappable" id="refundBtn">Refund This Sale</button>` : ''}
    `;

    const sheetEl = Sheet.open({ title: 'Sale Detail', bodyHTML, footerHTML });

    sheetEl.querySelector('#reprintBtn').addEventListener('click', () => printReceipt(sale, store));
    sheetEl.querySelector('#shareSaleBtn').addEventListener('click', () => shareReceipt(sale, store));

    const refundBtn = sheetEl.querySelector('#refundBtn');
    if (refundBtn) {
      refundBtn.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        if (!confirm(`Refund sale ${sale.receiptNumber} for ${Fmt.money(sale.total)}? This restores the sold stock.`)) return;
        btn.disabled = true;
        btn.textContent = 'Refunding\u2026';
        try {
          await refundSale(sale);
        } catch (err) {
          console.error('Refund failed:', err);
          Toast.error('Something went wrong \u2014 the refund was not applied');
          btn.disabled = false;
          btn.textContent = 'Refund This Sale';
          return;
        }
        Sheet.close();
        Toast.success('Sale refunded and stock restored');
        renderList(listContainer);
      });
    }
  }

  async function refundSale(sale) {
    // Same atomicity guarantee as completing a sale: restoring stock,
    // logging the restoration, and flipping the sale to 'refunded' either
    // all commit together or none do.
    await DB.runTx(['sales', 'products', 'inventoryLog'], 'readwrite', async (tx) => {
      const productsStore = tx.objectStore('products');
      const logStore = tx.objectStore('inventoryLog');
      const salesStore = tx.objectStore('sales');

      for (const item of sale.items) {
        const product = await DB.reqToPromise(productsStore.get(item.productId));
        if (!product) continue;
        const newQty = product.quantity + item.qty;
        await DB.reqToPromise(productsStore.put({ ...product, quantity: newQty, lastUpdated: new Date() }));
        await DB.reqToPromise(logStore.add({
          productId: product.id,
          productName: product.name,
          change: item.qty,
          newQuantity: newQty,
          reason: `Refund ${sale.receiptNumber}`,
          date: new Date(),
        }));
      }
      await DB.reqToPromise(salesStore.put({ ...sale, status: 'refunded', refundedAt: new Date() }));
    });
  }

  return { render };
})();

Router.register('sales', Sales.render);
window.Sales = Sales;
