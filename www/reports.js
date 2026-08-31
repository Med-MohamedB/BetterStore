/**
 * reports.js — Reports & Statistics.
 *
 * All figures are derived from the immutable `sales` records (never from
 * current product prices), so a report for last month stays accurate even
 * after prices change today. Charts are hand-drawn on <canvas> — no
 * charting library — to keep the app dependency-free and fast on mobile.
 */

const Reports = (() => {
  let rangeMode = 'week'; // 'today' | 'yesterday' | 'week' | 'month' | 'custom'
  let customStart = null;
  let customEnd = null;

  async function render(container) {
    document.getElementById('topbarActions').innerHTML = '';
    await renderReport(container);
  }

  function rangeDates() {
    const now = new Date();
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

    if (rangeMode === 'today') return { start: startOfDay(now), end: endOfDay(now) };
    if (rangeMode === 'yesterday') {
      const y = new Date(now); y.setDate(now.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    if (rangeMode === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 6);
      return { start: startOfDay(start), end: endOfDay(now) };
    }
    if (rangeMode === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: startOfDay(start), end: endOfDay(now) };
    }
    if (rangeMode === 'custom' && customStart && customEnd) {
      return { start: startOfDay(new Date(customStart)), end: endOfDay(new Date(customEnd)) };
    }
    return { start: startOfDay(now), end: endOfDay(now) };
  }

  async function renderReport(container) {
    const { start, end } = rangeDates();
    const [allSales, allProducts] = await Promise.all([DB.getAll('sales'), DB.getAll('products')]);
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    const sales = allSales.filter((s) => {
      const d = new Date(s.date);
      return d >= start && d <= end && s.status !== 'refunded';
    });

    const revenue = sales.reduce((s, sale) => s + saleNetTotal(sale), 0);
    const discounts = sales.reduce((s, sale) => s + (sale.itemDiscounts || 0) + (sale.discount || 0), 0);
    const txCount = sales.length;
    const avgTx = txCount ? revenue / txCount : 0;

    let cogs = 0, profit = 0;
    const productTotals = new Map(); // productId -> { name, qty, revenue }
    const categoryTotals = new Map(); // category -> revenue
    const paymentTotals = new Map(); // method -> { count, revenue }

    for (const sale of sales) {
      const method = sale.paymentMethod || 'other';
      const pm = paymentTotals.get(method) || { count: 0, revenue: 0 };
      pm.count += 1; pm.revenue += saleNetTotal(sale);
      paymentTotals.set(method, pm);

      for (const item of sale.items) {
        // Net out any refunded units on this line — a partially refunded
        // sale still counts, but not for the units that came back.
        const effectiveQty = item.qty - (item.refundedQty || 0);
        if (effectiveQty <= 0) continue;
        const unitDiscount = (item.discount || 0) / item.qty;
        const lineRevenue = item.price * effectiveQty - unitDiscount * effectiveQty;
        const product = productMap.get(item.productId);
        // Use the purchase price FROZEN on the sale item at checkout time —
        // never the product's current cost, which may have changed since.
        // Older sales recorded before this field existed fall back to the
        // live product cost as the closest available estimate.
        const purchasePrice = item.purchasePrice != null ? item.purchasePrice : (product ? product.purchasePrice : 0);
        cogs += purchasePrice * effectiveQty;
        profit += lineRevenue - purchasePrice * effectiveQty;

        const pt = productTotals.get(item.productId) || { name: item.name, qty: 0, revenue: 0 };
        pt.qty += effectiveQty; pt.revenue += lineRevenue;
        productTotals.set(item.productId, pt);

        const cat = (product && product.category) || 'Uncategorized';
        categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + lineRevenue);
      }
    }

    const bestSellers = [...productTotals.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
    const categoryRows = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
    const paymentRows = [...paymentTotals.entries()].sort((a, b) => b[1].revenue - a[1].revenue);

    const dailySeries = buildDailySeries(sales, start, end);

    container.innerHTML = `
      <div class="chip-row">
        ${[['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This Week'], ['month', 'This Month'], ['custom', 'Custom']].map(([k, label]) => `
          <button class="chip tappable${rangeMode === k ? ' active' : ''}" data-range="${k}">${label}</button>
        `).join('')}
      </div>

      ${rangeMode === 'custom' ? `
        <div class="field-row">
          <div class="field"><label>From</label><input type="date" id="customStartInput" value="${customStart || ''}"></div>
          <div class="field"><label>To</label><input type="date" id="customEndInput" value="${customEnd || ''}"></div>
        </div>
      ` : ''}

      <div class="stat-grid">
        <div class="stat-card"><div class="stat-card__label">Revenue</div><div class="stat-card__value accent num">${Fmt.money(revenue)}</div></div>
        <div class="stat-card"><div class="stat-card__label">Sales</div><div class="stat-card__value num">${txCount}</div></div>
        <div class="stat-card"><div class="stat-card__label">Avg. Transaction</div><div class="stat-card__value num">${Fmt.money(avgTx)}</div></div>
        <div class="stat-card"><div class="stat-card__label">Est. Profit</div><div class="stat-card__value teal num">${Fmt.money(profit)}</div></div>
      </div>

      <div class="section-title">Revenue by Day</div>
      <div class="card">
        <canvas id="dailyChart" style="width:100%; height:120px; display:block;"></canvas>
      </div>

      <div class="section-title">Best Sellers</div>
      ${bestSellers.length ? `
        <div class="list">
          ${bestSellers.map((p, i) => `
            <div class="list-row">
              <div class="list-row__icon">${['🥇','🥈','🥉','🏅','🏅'][i] || '🏅'}</div>
              <div class="list-row__body">
                <div class="list-row__title">${escapeHTML(p.name)}</div>
                <div class="list-row__subtitle">${p.qty} sold</div>
              </div>
              <div class="list-row__trailing"><div class="list-row__amount num">${Fmt.money(p.revenue)}</div></div>
            </div>
          `).join('')}
        </div>
      ` : `<div class="empty-state"><div class="empty-state__icon">🏅</div><div class="empty-state__title">No sales in this period</div></div>`}

      ${categoryRows.length ? `
        <div class="section-title">By Category</div>
        <div class="card">
          ${categoryRows.map(([cat, rev]) => barRow(cat, rev, categoryRows[0][1], 'var(--accent)')).join('')}
        </div>
      ` : ''}

      ${paymentRows.length ? `
        <div class="section-title">Payment Methods</div>
        <div class="card">
          ${paymentRows.map(([method, data]) => barRow(`${method} (${data.count})`, data.revenue, paymentRows[0][1].revenue, 'var(--teal)')).join('')}
        </div>
      ` : ''}

      <div class="section-title">Cost Breakdown</div>
      <div class="card">
        <div class="flex-between"><span class="text-dim text-sm">Gross Revenue</span><span class="num text-sm">${Fmt.money(revenue)}</span></div>
        <div class="flex-between mt-8"><span class="text-dim text-sm">Cost of Goods</span><span class="num text-sm">− ${Fmt.money(cogs)}</span></div>
        <div class="flex-between mt-8"><span class="text-dim text-sm">Discounts Given</span><span class="num text-sm">− ${Fmt.money(discounts)}</span></div>
        <div class="flex-between mt-16" style="padding-top:12px; border-top:1px solid var(--border);">
          <span style="font-weight:700;">Est. Profit</span>
          <span class="num" style="font-weight:700; color:var(--teal);">${Fmt.money(profit)}</span>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-range]').forEach((chip) => {
      chip.addEventListener('click', () => { rangeMode = chip.dataset.range; renderReport(container); });
    });
    const startInput = container.querySelector('#customStartInput');
    const endInput = container.querySelector('#customEndInput');
    if (startInput) startInput.addEventListener('change', (e) => { customStart = e.target.value; if (customStart && customEnd) renderReport(container); });
    if (endInput) endInput.addEventListener('change', (e) => { customEnd = e.target.value; if (customStart && customEnd) renderReport(container); });

    drawBarChart(container.querySelector('#dailyChart'), dailySeries);
  }

  function barRow(label, value, maxValue, color) {
    const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
    return `
      <div class="mt-8" style="margin-top:10px;">
        <div class="flex-between text-sm" style="margin-bottom:5px;">
          <span style="text-transform:capitalize;">${escapeHTML(label)}</span>
          <span class="num">${Fmt.money(value)}</span>
        </div>
        <div style="height:6px; background:var(--surface-2); border-radius:999px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:${color}; border-radius:999px;"></div>
        </div>
      </div>`;
  }

  function buildDailySeries(sales, start, end) {
    const days = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      days.push({ label: cursor.toLocaleDateString(undefined, { weekday: 'short' }), date: new Date(cursor), total: 0 });
      cursor.setDate(cursor.getDate() + 1);
      if (days.length > 31) break; // safety cap for very wide custom ranges
    }
    for (const sale of sales) {
      const d = new Date(sale.date);
      const bucket = days.find((day) => day.date.toDateString() === d.toDateString());
      if (bucket) bucket.total += saleNetTotal(sale);
    }
    return days;
  }

  /** Minimal dependency-free bar chart on a <canvas>, DPR-aware. */
  function drawBarChart(canvas, series) {
    if (!canvas || !series.length) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.parentElement.clientWidth - 28; // account for card padding
    const cssHeight = 120;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#AC5FDB';
    const dim = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim() || '#93A1AB';
    const max = Math.max(...series.map((d) => d.total), 1);

    const barGap = 8;
    const barWidth = (cssWidth - barGap * (series.length - 1)) / series.length;
    const chartHeight = cssHeight - 20;

    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';

    series.forEach((d, i) => {
      const x = i * (barWidth + barGap);
      const barHeight = Math.max(2, (d.total / max) * chartHeight);
      const y = chartHeight - barHeight;

      ctx.fillStyle = d.total > 0 ? accent : 'rgba(147,161,171,0.25)';
      const r = Math.min(4, barWidth / 2);
      roundRect(ctx, x, y, barWidth, barHeight, r);
      ctx.fill();

      ctx.fillStyle = dim;
      ctx.fillText(d.label, x + barWidth / 2, cssHeight - 4);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { render };
})();

Router.register('reports', Reports.render);
window.Reports = Reports;
