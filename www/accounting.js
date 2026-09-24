/**
 * accounting.js — Accounting Export.
 *
 * A dedicated date-range export meant for handing off to an accountant or
 * bookkeeper: an itemized CSV (one row per transaction, refunds netted out
 * explicitly rather than hidden) plus an optional one-page summary PDF.
 * Reached from a row on Reports; Backup also points here since that's
 * historically where people go looking for "export" features.
 *
 * Profit/COGS math here deliberately MIRRORS Reports' own per-sale
 * item-level calculation (effective qty after refunds, per-unit discount,
 * purchase price frozen at sale time) rather than importing it, to keep
 * this screen self-contained — see reports.js's renderReport() for the
 * original if the two ever need to be reconciled.
 *
 * A credit sale is real revenue (inventory left the shop) but not real
 * cash yet — every total here is "gross/net revenue" in the usual sense,
 * with a separate Cash Collected vs Outstanding (On Credit) split so an
 * accountant can see the difference between booked and collected.
 */

const Accounting = (() => {
  let rangeMode = 'thisMonth'; // 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom'
  let customStart = null; // 'YYYY-MM-DD'
  let customEnd = null;

  async function render(container) {
    document.getElementById('topbarActions').innerHTML = '';
    await renderScreen(container);
  }

  function rangeDates() {
    const now = new Date();
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

    if (rangeMode === 'thisMonth') {
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
    }
    if (rangeMode === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start, end: endOfDay(end) };
    }
    if (rangeMode === 'thisYear') {
      return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now) };
    }
    if (rangeMode === 'custom' && customStart && customEnd) {
      return { start: startOfDay(new Date(customStart)), end: endOfDay(new Date(customEnd)) };
    }
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
  }

  /** Mirrors reports.js's per-sale item loop exactly (see file header). */
  function computeFinancials(sales, productMap) {
    let cogs = 0, profit = 0, discounts = 0, tax = 0, gross = 0, refunded = 0;
    let collected = 0, outstanding = 0;
    const paymentTotals = new Map(); // method -> { count, revenue }
    const rows = [];

    for (const sale of sales) {
      const net = saleNetTotal(sale);
      gross += sale.total || 0;
      refunded += sale.totalRefunded || 0;
      discounts += (sale.itemDiscounts || 0) + (sale.discount || 0);
      tax += sale.tax || 0;

      const method = sale.paymentMethod || 'other';
      const pm = paymentTotals.get(method) || { count: 0, revenue: 0 };
      pm.count += 1; pm.revenue += net;
      paymentTotals.set(method, pm);

      const saleOutstanding = method === 'credit' ? Math.max(0, (sale.creditAmount || 0) - (sale.totalRefunded || 0)) : 0;
      outstanding += saleOutstanding;
      collected += net - saleOutstanding;

      let saleCogs = 0, saleProfit = 0;
      const itemSummary = [];
      for (const item of sale.items) {
        const effectiveQty = item.qty - (item.refundedQty || 0);
        itemSummary.push(`${item.qty}\u00d7 ${item.name}`);
        if (effectiveQty <= 0) continue;
        const unitDiscount = (item.discount || 0) / item.qty;
        const lineRevenue = item.price * effectiveQty - unitDiscount * effectiveQty;
        const product = productMap.get(item.productId);
        const purchasePrice = item.purchasePrice != null ? item.purchasePrice : (product ? product.purchasePrice : 0);
        saleCogs += purchasePrice * effectiveQty;
        saleProfit += lineRevenue - purchasePrice * effectiveQty;
      }
      cogs += saleCogs;
      profit += saleProfit;

      rows.push({
        date: new Date(sale.date),
        receiptNumber: sale.receiptNumber || '',
        paymentMethod: method,
        customerName: sale.customerName || '',
        items: itemSummary.join('; '),
        subtotal: sale.subtotal || 0,
        discounts: (sale.itemDiscounts || 0) + (sale.discount || 0),
        tax: sale.tax || 0,
        total: sale.total || 0,
        refunded: sale.totalRefunded || 0,
        netTotal: net,
        collected: net - saleOutstanding,
        outstanding: saleOutstanding,
        cogs: saleCogs,
        profit: saleProfit,
      });
    }

    const netRevenue = gross - refunded;
    const paymentRows = [...paymentTotals.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
    return { gross, refunded, netRevenue, discounts, tax, cogs, profit, collected, outstanding, txCount: sales.length, paymentRows, rows };
  }

  async function renderScreen(container) {
    const { start, end } = rangeDates();
    const [allSales, allProducts, store] = await Promise.all([DB.getAll('sales'), DB.getAll('products'), Settings.get('store')]);
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const sales = allSales.filter((s) => {
      const d = new Date(s.date);
      return d >= start && d <= end && s.status !== 'refunded';
    });
    const fin = computeFinancials(sales, productMap);

    container.innerHTML = `
      <div class="chip-row">
        ${[['thisMonth', I18n.t('accounting.rangeThisMonth')], ['lastMonth', I18n.t('accounting.rangeLastMonth')], ['thisYear', I18n.t('accounting.rangeThisYear')], ['custom', I18n.t('accounting.rangeCustom')]].map(([k, label]) => `
          <button class="chip tappable${rangeMode === k ? ' active' : ''}" data-range="${k}">${label}</button>
        `).join('')}
      </div>

      ${rangeMode === 'custom' ? `
        <div class="field-row">
          <div class="field"><label>${I18n.t('accounting.fromLabel')}</label><input type="date" id="customStartInput" value="${customStart || ''}"></div>
          <div class="field"><label>${I18n.t('accounting.toLabel')}</label><input type="date" id="customEndInput" value="${customEnd || ''}"></div>
        </div>
      ` : ''}

      ${fin.txCount ? `
        <div class="section-title">${I18n.t('accounting.summaryTitle')}</div>
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-card__label">${I18n.t('accounting.grossRevenue')}</div><div class="stat-card__value accent num">${Fmt.money(fin.gross)}</div></div>
          <div class="stat-card"><div class="stat-card__label">${I18n.t('accounting.transactionCount')}</div><div class="stat-card__value num">${fin.txCount}</div></div>
          <div class="stat-card"><div class="stat-card__label">${I18n.t('accounting.estProfit')}</div><div class="stat-card__value teal num">${Fmt.money(fin.profit)}</div></div>
          <div class="stat-card"><div class="stat-card__label">${I18n.t('accounting.amountOutstanding')}</div><div class="stat-card__value num" style="color:var(--coral);">${Fmt.money(fin.outstanding)}</div></div>
        </div>

        <div class="card mt-16">
          <div class="flex-between"><span class="text-dim text-sm">${I18n.t('accounting.grossRevenue')}</span><span class="num text-sm">${Fmt.money(fin.gross)}</span></div>
          <div class="flex-between mt-8"><span class="text-dim text-sm">${I18n.t('accounting.refundsLabel')}</span><span class="num text-sm">\u2212 ${Fmt.money(fin.refunded)}</span></div>
          <div class="flex-between mt-8" style="padding-top:8px; border-top:1px solid var(--border);"><span class="text-sm" style="font-weight:700;">${I18n.t('accounting.netRevenue')}</span><span class="num text-sm" style="font-weight:700;">${Fmt.money(fin.netRevenue)}</span></div>
          <div class="flex-between mt-16"><span class="text-dim text-sm">${I18n.t('accounting.discountsGiven')}</span><span class="num text-sm">\u2212 ${Fmt.money(fin.discounts)}</span></div>
          <div class="flex-between mt-8"><span class="text-dim text-sm">${I18n.t('accounting.taxCollected')}</span><span class="num text-sm">${Fmt.money(fin.tax)}</span></div>
          <div class="flex-between mt-8"><span class="text-dim text-sm">${I18n.t('accounting.costOfGoods')}</span><span class="num text-sm">\u2212 ${Fmt.money(fin.cogs)}</span></div>
          <div class="flex-between mt-16"><span class="text-dim text-sm">${I18n.t('accounting.amountCollected')}</span><span class="num text-sm">${Fmt.money(fin.collected)}</span></div>
          <div class="flex-between mt-8"><span class="text-dim text-sm" style="color:var(--coral);">${I18n.t('accounting.amountOutstanding')}</span><span class="num text-sm" style="color:var(--coral);">${Fmt.money(fin.outstanding)}</span></div>
        </div>

        ${fin.paymentRows.length ? `
          <div class="section-title">${I18n.t('accounting.byPaymentMethodTitle')}</div>
          <div class="card">
            ${fin.paymentRows.map(([method, data]) => `
              <div class="flex-between text-sm mt-8" style="margin-top:10px;">
                <span style="text-transform:capitalize;">${escapeHTML(paymentMethodLabel(method))} (${data.count})</span>
                <span class="num">${Fmt.money(data.revenue)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="text-dim text-sm mt-16" style="text-align:center;">${I18n.t('accounting.currencyNote', { currency: store.currency || 'DZD' })}</div>

        <button class="btn btn-primary mt-16 tappable" id="exportCsvBtn">${Icon('download')} ${I18n.t('accounting.exportCsvBtn')}</button>
        <button class="btn btn-secondary mt-8 tappable" id="exportPdfBtn">${Icon('receipt')} ${I18n.t('accounting.exportPdfBtn')}</button>
      ` : `
        <div class="empty-state">
          <div class="empty-state__icon">${Icon('receipt', { size: 32 })}</div>
          <div class="empty-state__title">${I18n.t('accounting.noSalesInRange')}</div>
        </div>
      `}
    `;

    container.querySelectorAll('[data-range]').forEach((chip) => {
      chip.addEventListener('click', () => { rangeMode = chip.dataset.range; renderScreen(container); });
    });
    const startInput = container.querySelector('#customStartInput');
    const endInput = container.querySelector('#customEndInput');
    if (startInput) startInput.addEventListener('change', (e) => { customStart = e.target.value; if (customStart && customEnd) renderScreen(container); });
    if (endInput) endInput.addEventListener('change', (e) => { customEnd = e.target.value; if (customStart && customEnd) renderScreen(container); });

    const csvBtn = container.querySelector('#exportCsvBtn');
    if (csvBtn) csvBtn.addEventListener('click', () => exportCSV(fin, store, start, end));
    const pdfBtn = container.querySelector('#exportPdfBtn');
    if (pdfBtn) pdfBtn.addEventListener('click', (e) => exportPDF(e.currentTarget, fin, store, start, end));
  }

  /* ---------------------------------------------------------------- */
  /* CSV export                                                        */
  /* ---------------------------------------------------------------- */

  function toCSVValue(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(headers, rows) {
    return [headers.join(','), ...rows.map((r) => r.map(toCSVValue).join(','))].join('\n');
  }

  async function exportCSV(fin, store, start, end) {
    const headers = ['date', 'receiptNumber', 'paymentMethod', 'customerName', 'items', 'subtotal', 'discounts', 'tax', 'total', 'refunded', 'netTotal', 'collected', 'outstanding', 'costOfGoods', 'profit', 'currency'];
    const rows = fin.rows.map((r) => [
      r.date.toISOString(), r.receiptNumber, r.paymentMethod, r.customerName, r.items,
      r.subtotal.toFixed(2), r.discounts.toFixed(2), r.tax.toFixed(2), r.total.toFixed(2),
      r.refunded.toFixed(2), r.netTotal.toFixed(2), r.collected.toFixed(2), r.outstanding.toFixed(2),
      r.cogs.toFixed(2), r.profit.toFixed(2), store.currency || 'DZD',
    ]);
    const csv = toCSV(headers, rows);
    const filename = `accounting-${dateStamp(start)}-to-${dateStamp(end)}.csv`;
    try {
      await saveTextFile(csv, filename, 'text/csv');
      Toast.success(I18n.t('accounting.csvExported'));
    } catch (e) {
      Toast.error(I18n.t('accounting.exportFailedToast', { msg: (e && e.message) || String(e) }));
    }
  }

  function dateStamp(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  /* ---------------------------------------------------------------- */
  /* PDF summary — same per-language branching every other printed     */
  /* surface in this app uses: Arabic goes through the canvas kit (so  */
  /* it shapes/bidi-orders correctly), English/French use jsPDF's own  */
  /* vector text directly. See createCanvasReceiptKit's own comments.  */
  /* ---------------------------------------------------------------- */

  async function exportPDF(btn, fin, store, start, end) {
    const origLabel = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = I18n.t('accounting.generatingPdf');
    try {
      if (!window.jspdf) await loadScriptOnce('vendor/jspdf.umd.min.js');
      const { jsPDF } = window.jspdf;
      const lang = I18n.locale;
      const doc = lang === 'ar' ? await buildSummaryPDFFromCanvas(jsPDF, fin, store, start, end, lang) : buildSummaryPDFVector(jsPDF, fin, store, start, end, lang);
      const filename = `accounting-summary-${dateStamp(start)}-to-${dateStamp(end)}.pdf`;
      await savePdfFile(doc, filename);
      Toast.success(I18n.t('accounting.pdfExported'));
    } catch (e) {
      Toast.error(I18n.t('accounting.exportFailedToast', { msg: (e && e.message) || String(e) }));
    } finally {
      btn.disabled = false;
      btn.innerHTML = origLabel;
    }
  }

  /** Shared list of (label, value, opts) rows so the vector and canvas
   *  paths draw the exact same content in the exact same order. */
  function summaryLines(fin, store, lang) {
    const t = (k, vars) => I18n.t(`accounting.${k}`, vars, lang);
    return [
      { label: t('grossRevenue'), value: Fmt.money(fin.gross) },
      { label: t('refundsLabel'), value: `\u2212 ${Fmt.money(fin.refunded)}` },
      { label: t('netRevenue'), value: Fmt.money(fin.netRevenue), bold: true, divider: true },
      { label: t('discountsGiven'), value: `\u2212 ${Fmt.money(fin.discounts)}` },
      { label: t('taxCollected'), value: Fmt.money(fin.tax) },
      { label: t('costOfGoods'), value: `\u2212 ${Fmt.money(fin.cogs)}` },
      { label: t('estProfit'), value: Fmt.money(fin.profit), bold: true, divider: true },
      { label: t('amountCollected'), value: Fmt.money(fin.collected) },
      { label: t('amountOutstanding'), value: Fmt.money(fin.outstanding), coral: true, divider: true },
      { label: t('transactionCount'), value: String(fin.txCount) },
    ];
  }

  function buildSummaryPDFVector(jsPDF, fin, store, start, end, lang) {
    const pageWidth = 210, margin = 16, lineH = 6.5;
    const accentRgb = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#2F5233');
    const coralRgb = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--coral') || '#D9506B');
    const lines = summaryLines(fin, store, lang);

    let h = margin + 10 + 6 + 8; // store name + subtitle + range
    lines.forEach((l) => { h += lineH; if (l.divider) h += 4; });
    h += 10; // spacing before payment table
    h += lineH; // payment table title
    h += fin.paymentRows.length * lineH;
    h += margin;

    const doc = new jsPDF({ unit: 'mm', format: [pageWidth, Math.max(120, h)] });
    let y = margin;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...accentRgb);
    doc.text(store.name || 'BetterStore', pageWidth / 2, y, { align: 'center' });
    y += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(120);
    doc.text(I18n.t('reports.accountingExportTitle', null, lang), pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.setFontSize(9);
    doc.text(`${Fmt.date(start)} \u2013 ${Fmt.date(end)}`, pageWidth / 2, y, { align: 'center' });
    y += 10;

    const row = (left, right, opts = {}) => {
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      doc.setFontSize(opts.bold ? 11 : 10);
      if (opts.coral) doc.setTextColor(...coralRgb); else doc.setTextColor(opts.bold ? 25 : 90);
      doc.text(String(left), margin, y);
      doc.text(String(right), pageWidth - margin, y, { align: 'right' });
      doc.setTextColor(25);
      y += lineH;
      if (opts.divider) {
        doc.setDrawColor(210); doc.line(margin, y - lineH / 2 + 1, pageWidth - margin, y - lineH / 2 + 1);
        y += 4;
      }
    };
    lines.forEach((l) => row(l.label, l.value, l));

    if (fin.paymentRows.length) {
      y += 4;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(25);
      doc.text(I18n.t('accounting.byPaymentMethodTitle', null, lang), margin, y);
      y += lineH;
      fin.paymentRows.forEach(([method, data]) => {
        row(`${paymentMethodLabel(method, lang)} (${data.count})`, Fmt.money(data.revenue), {});
      });
    }

    doc.setFontSize(7.5); doc.setTextColor(160);
    doc.text(`BetterStore \u00b7 ${new Date().toLocaleString()}`, pageWidth / 2, Math.max(120, h) - 8, { align: 'center' });

    return doc;
  }

  async function buildSummaryPDFFromCanvas(jsPDF, fin, store, start, end, lang) {
    const pageWidth = 210, margin = 16, lineH = 7;
    const lines = summaryLines(fin, store, lang);
    let h = margin + 10 + 6 + 8;
    lines.forEach((l) => { h += lineH; if (l.divider) h += 4; });
    h += 10 + lineH + fin.paymentRows.length * lineH + margin;
    const pageHeight = Math.max(120, h);

    const kit = createCanvasReceiptKit(pageWidth, pageHeight);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2F5233';
    const coral = getComputedStyle(document.documentElement).getPropertyValue('--coral').trim() || '#D9506B';
    let y = margin + 6;

    kit.setFont(16, true);
    kit.text(store.name || 'BetterStore', pageWidth / 2, y, { align: 'center', color: accent, dir: 'rtl' });
    y += 8;
    kit.setFont(10, false);
    kit.text(I18n.t('reports.accountingExportTitle', null, lang), pageWidth / 2, y, { align: 'center', color: '#787878', dir: 'rtl' });
    y += 6;
    kit.setFont(9, false);
    kit.text(`${Fmt.date(start)} \u2013 ${Fmt.date(end)}`, pageWidth / 2, y, { align: 'center', color: '#787878', dir: 'ltr' });
    y += 10;

    const row = (left, right, opts = {}) => {
      kit.setFont(opts.bold ? 11 : 10, !!opts.bold);
      const color = opts.coral ? coral : (opts.bold ? '#232323' : '#5a5a5a');
      kit.text(String(left), margin, y, { align: 'right', color, dir: 'rtl' });
      kit.text(String(right), pageWidth - margin, y, { align: 'left', color, dir: 'ltr' });
      y += lineH;
      if (opts.divider) { kit.dividerLine(margin, pageWidth - margin, y - lineH / 2 + 1); y += 4; }
    };
    lines.forEach((l) => row(l.label, l.value, l));

    if (fin.paymentRows.length) {
      y += 4;
      kit.setFont(11, true);
      kit.text(I18n.t('accounting.byPaymentMethodTitle', null, lang), margin, y, { align: 'right', color: '#232323', dir: 'rtl' });
      y += lineH;
      fin.paymentRows.forEach(([method, data]) => {
        row(`${paymentMethodLabel(method, lang)} (${data.count})`, Fmt.money(data.revenue), {});
      });
    }

    kit.setFont(7.5, false);
    kit.text(`BetterStore \u00b7 ${new Date().toLocaleString()}`, pageWidth / 2, pageHeight - 8, { align: 'center', color: '#a0a0a0', dir: 'ltr' });

    const doc = new jsPDF({ unit: 'mm', format: [pageWidth, pageHeight] });
    doc.addImage(kit.canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight);
    return doc;
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [35, 35, 35];
  }

  /* ---------------------------------------------------------------- */
  /* File saving — same native-Filesystem-then-Share / web-download     */
  /* pattern used everywhere else in the app (backup.js, receipt print) */
  /* ---------------------------------------------------------------- */

  async function saveTextFile(content, filename, type) {
    const cap = window.Capacitor;
    const isNative = cap && cap.isNativePlatform && cap.isNativePlatform();
    const plugins = cap && cap.Plugins;
    if (isNative && plugins && plugins.Filesystem) {
      const written = await plugins.Filesystem.writeFile({ path: filename, data: content, directory: 'CACHE', encoding: 'utf8' });
      if (plugins.Share) await plugins.Share.share({ title: filename, url: written.uri, dialogTitle: I18n.t('backup.saveDialogTitle', { filename }) });
      return;
    }
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function savePdfFile(doc, filename) {
    const cap = window.Capacitor;
    const isNative = cap && cap.isNativePlatform && cap.isNativePlatform();
    const plugins = cap && cap.Plugins;
    if (isNative && plugins && plugins.Filesystem) {
      const base64 = doc.output('datauristring').split(',')[1];
      const written = await plugins.Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
      if (plugins.Share) await plugins.Share.share({ title: filename, url: written.uri, dialogTitle: I18n.t('backup.saveDialogTitle', { filename }) });
      return;
    }
    doc.save(filename);
  }

  return { render, computeFinancials, rangeDates };
})();

Router.register('accounting-export', Accounting.render);
window.Accounting = Accounting;
