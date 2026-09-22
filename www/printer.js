/* ==========================================================================
   printer.js — Bluetooth thermal receipt printers (ESC/POS).

   The native half is ThermalPrinterPlugin.kt (Bluetooth Classic / SPP):
   it only lists, pairs and moves raw bytes. Everything about WHAT gets
   printed lives here:

     - Text mode: real ESC/POS commands — bold / double-size text, the
       printer's own CODE128 barcode command, paper cut. Small, fast,
       and crisp. Only used when every character on the receipt is plain
       ASCII, because cheap printers disagree wildly about code pages and
       many have no Arabic glyphs at all.
     - Image mode: the receipt is drawn on a <canvas> by the phone's own
       text engine (the same buildReceiptCanvas the Arabic PDF uses, so
       Arabic shaping/bidi is already right), converted to 1-bit, and sent
       as ESC/POS raster bands (GS v 0). Works for any language and any
       printer that can print bitmaps. Used for Arabic, for anything with
       accents or symbols, for refund receipts, and always when the person
       picks "Always as image".

   Printing is additive: with no printer set up, printSale()/printRefund()
   return false and app.js carries on down the original PDF / system-print
   path untouched.
   ========================================================================== */

const ThermalPrinter = (() => {
  // Printable width in dots (203 dpi heads: 8 dots per mm) and characters
  // per line in the printer's default 12x24 font.
  const DOTS = { 58: 384, 80: 576 };
  const CPL = { 58: 32, 80: 48 };
  // A pixel prints black when its luminance is below this. Deliberately on
  // the generous side: thermal heads under-print thin grey strokes (the
  // receipt's dotted dividers, anti-aliased text edges), so this leans dark.
  const INK_THRESHOLD = 200;
  // Rows per GS v 0 command. Cheap printers have small receive buffers, so
  // a tall receipt is sent as several back-to-back bands rather than one.
  const BAND_ROWS = 256;
  const KNOWN_ERRORS = ['BT_OFF', 'NO_PERMISSION', 'CONNECT_FAILED', 'WRITE_FAILED', 'BT_UNSUPPORTED'];

  const t = (key, vars) => I18n.t(key, vars);

  function plugin() {
    const cap = window.Capacitor;
    const native = cap && cap.isNativePlatform && cap.isNativePlatform();
    return (native && cap.Plugins && cap.Plugins.ThermalPrinter) || null;
  }

  /* ---------------------------------------------------------------------- */
  /* Bytes                                                                    */
  /* ---------------------------------------------------------------------- */

  function ByteBuf() {
    let a = new Uint8Array(4096);
    let n = 0;
    const need = (k) => {
      if (n + k <= a.length) return;
      let m = a.length * 2;
      while (m < n + k) m *= 2;
      const b = new Uint8Array(m);
      b.set(a.subarray(0, n));
      a = b;
    };
    return {
      byte(...v) { need(v.length); for (const x of v) a[n++] = x & 255; return this; },
      bytes(u8) { need(u8.length); a.set(u8, n); n += u8.length; return this; },
      // Only ever printable ASCII goes out as text; anything else becomes
      // '?' rather than a stray control code or a garbled code-page glyph.
      ascii(s) {
        const str = String(s);
        need(str.length);
        for (let i = 0; i < str.length; i++) {
          const c = str.charCodeAt(i);
          a[n++] = c >= 0x20 && c <= 0x7e ? c : 0x3f;
        }
        return this;
      },
      out() { return a.slice(0, n); },
    };
  }

  function toBase64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  /* ---------------------------------------------------------------------- */
  /* ESC/POS primitives                                                       */
  /* ---------------------------------------------------------------------- */

  const init = (b) => b.byte(0x1b, 0x40); // ESC @
  const align = (b, n) => b.byte(0x1b, 0x61, n); // ESC a  0 left / 1 centre / 2 right
  const bold = (b, on) => b.byte(0x1b, 0x45, on ? 1 : 0); // ESC E
  const size = (b, n) => b.byte(0x1d, 0x21, n); // GS !  0x00 normal / 0x01 tall / 0x11 double
  const lf = (b) => b.byte(0x0a);
  const feedAndCut = (b) => { b.byte(0x1b, 0x64, 3); b.byte(0x1d, 0x56, 66, 0); }; // ESC d 3, GS V 66 0 (partial cut; ignored by printers without a cutter)

  function style(b, { bold: bd = false, size: sz = 0 } = {}) { bold(b, bd); size(b, sz); }
  function resetStyle(b) { bold(b, false); size(b, 0); }

  /** GS v 0 raster bands from 8-bit RGBA pixels. Bit set = black dot. */
  function rasterBands(rgba, w, h) {
    const wb = Math.ceil(w / 8);
    const out = ByteBuf();
    for (let y0 = 0; y0 < h; y0 += BAND_ROWS) {
      const rows = Math.min(BAND_ROWS, h - y0);
      const data = new Uint8Array(wb * rows);
      for (let r = 0; r < rows; r++) {
        for (let x = 0; x < w; x++) {
          const i = ((y0 + r) * w + x) * 4;
          const a = rgba[i + 3] / 255;
          // Composite over white so a transparent pixel reads as paper.
          const lum = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a + 255 * (1 - a);
          if (lum < INK_THRESHOLD) data[r * wb + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
      out.byte(0x1d, 0x76, 0x30, 0, wb & 255, wb >> 8, rows & 255, rows >> 8).bytes(data);
    }
    return out.out();
  }

  function canvasBands(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    const out = ByteBuf();
    // Read the pixels band by band so a long receipt never needs one giant
    // ImageData in memory.
    for (let y0 = 0; y0 < h; y0 += BAND_ROWS) {
      const rows = Math.min(BAND_ROWS, h - y0);
      out.bytes(rasterBands(ctx.getImageData(0, y0, w, rows).data, w, rows));
    }
    return out.out();
  }

  /** A CODE128 barcode drawn as one raster band, one module = `moduleDots`
   *  printed dots, centred across the full printable width. Used when the
   *  printer's own barcode command couldn't fit the code on the paper. */
  function barcodeRasterBands(pattern, dots, moduleDots, heightDots) {
    const wb = Math.ceil(dots / 8);
    const row = new Uint8Array(wb);
    const left = Math.max(0, Math.floor((dots - pattern.length * moduleDots) / 2));
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] !== '1') continue;
      for (let d = 0; d < moduleDots; d++) {
        const x = left + i * moduleDots + d;
        if (x < dots) row[x >> 3] |= 0x80 >> (x & 7);
      }
    }
    const data = new Uint8Array(wb * heightDots);
    for (let r = 0; r < heightDots; r++) data.set(row, r * wb);
    return ByteBuf()
      .byte(0x1d, 0x76, 0x30, 0, wb & 255, wb >> 8, heightDots & 255, heightDots >> 8)
      .bytes(data)
      .out();
  }

  /** Prints `text` as a CODE128 barcode: natively when the printer's
   *  module width (2 dots, the smallest most firmware accepts) fits the
   *  paper, otherwise as a 1-dot-per-module raster so it always fits. */
  function barcode(b, text, paperMm) {
    const pattern = Barcode128.encode(text);
    if (!pattern) return false;
    const dots = DOTS[paperMm] || DOTS[58];
    const total = pattern.length + 20; // 10-module quiet zone each side
    align(b, 1);
    if (total * 2 <= dots && text.length <= 40) {
      const payload = `{B${text}`; // CODE128 subset B, same as Barcode128
      b.byte(0x1d, 0x48, 0); // GS H 0  — no built-in number, the receipt prints its own
      b.byte(0x1d, 0x68, 64); // GS h    — bar height in dots
      b.byte(0x1d, 0x77, 2); //  GS w    — module width
      b.byte(0x1d, 0x6b, 73, payload.length).ascii(payload); // GS k 73 n d1..dn
      lf(b);
    } else {
      const moduleDots = Math.max(1, Math.min(3, Math.floor(dots / total)));
      b.bytes(barcodeRasterBands(pattern, dots, moduleDots, 64));
    }
    align(b, 0);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Text receipts                                                            */
  /* ---------------------------------------------------------------------- */

  const ASCII_MAP = {
    '\u00d7': 'x', '\u2212': '-', '\u2013': '-', '\u2014': '-', '\u00b7': '-',
    '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"',
    '\u21a9': '<', '\u2026': '...',
    // Spaces: no-break, narrow no-break (fr grouping), thin — all just a space.
    '\u00a0': ' ', '\u202f': ' ', '\u2009': ' ',
    // Direction marks Intl sometimes inserts around numbers.
    '\u200e': '', '\u200f': '', '\u061c': '',
  };
  const toAscii = (s) => String(s).replace(/[\u00a0\u00b7\u00d7\u2009\u200e\u200f\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u202f\u2212\u21a9\u061c]/g, (c) => ASCII_MAP[c]);
  const isPlain = (s) => /^[\x20-\x7e]*$/.test(toAscii(s));

  /** Greedy word wrap that keeps a leading indent on every line. */
  function wrapText(str, width) {
    const s = toAscii(str);
    const indent = (s.match(/^ */) || [''])[0];
    const room = Math.max(4, width - indent.length);
    const lines = [];
    let cur = '';
    s.trim().split(/\s+/).filter(Boolean).forEach((word) => {
      let w = word;
      while (w.length > room) { // one unbroken word longer than the line
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, room));
        w = w.slice(room);
      }
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= room) cur += ` ${w}`;
      else { lines.push(cur); cur = w; }
    });
    if (cur || !lines.length) lines.push(cur);
    return lines.map((l) => indent + l);
  }

  /** The sale receipt as a list of rows, in the same order and with the
   *  same wording as Receipt.html / buildReceiptCanvas (labels come from
   *  I18n in the receipt's own language). Kept separate from the ESC/POS
   *  output so one model can be both checked for "is this all plain ASCII"
   *  and rendered. */
  function saleModel(sale, store, lang) {
    const T = (k, v) => I18n.t(k, v, lang);
    const money = (n) => Fmt.money(n);
    const minus = (n) => `\u2212 ${Fmt.money(n)}`;
    const m = [];
    const itemCount = sale.items.reduce((s, it) => s + it.qty, 0);
    const footerText = store.receiptFooter !== '' ? (store.receiptFooter || T('receipt.defaultFooter')) : '';

    m.push({ k: 'big', s: store.name || T('dashboard.defaultStoreName') });
    if (store.address) m.push({ k: 'c', s: store.address });
    if (store.phone) m.push({ k: 'c', s: store.phone });
    if (sale.status === 'refunded') m.push({ k: 'c', s: `*** ${T('receipt.refundedBanner')} ***`, bold: true });
    else if (sale.status === 'partially_refunded') m.push({ k: 'c', s: `*** ${T('receipt.partiallyRefundedBanner')} ***`, bold: true });
    m.push({ k: 'rule' });
    m.push({ k: 'lr', l: T('receipt.colQtyItem'), r: T('receipt.colPrice'), bold: true });
    m.push({ k: 'rule' });

    sale.items.forEach((it) => {
      m.push({ k: 'lr', l: `${it.qty}\u00d7 ${it.name}`, r: money(it.price * it.qty) });
      if (it.discount) m.push({ k: 'lr', l: `  *** ${T('receipt.itemDiscountLabel')}`, r: minus(it.discount) });
      if (it.refundedQty) {
        const back = ((it.price * it.qty - (it.discount || 0)) / it.qty) * it.refundedQty;
        m.push({ k: 'lr', l: `  \u21a9 ${T('receipt.itemRefundedLabel', { qty: it.refundedQty })}`, r: minus(back) });
      }
    });
    m.push({ k: 'c', s: T('receipt.itemsSoldSuffix', { count: itemCount, plural: itemCount !== 1 ? 's' : '' }) });
    m.push({ k: 'rule' });

    m.push({ k: 'lr', l: T('receipt.subtotalLabel'), r: money(sale.subtotal) });
    if (sale.itemDiscounts) m.push({ k: 'lr', l: T('receipt.itemDiscountsLabel'), r: minus(sale.itemDiscounts) });
    if (sale.discount) m.push({ k: 'lr', l: T('receipt.orderDiscountLabel'), r: minus(sale.discount) });
    if (sale.tax) m.push({ k: 'lr', l: T('receipt.taxLabel'), r: money(sale.tax) });
    m.push({ k: 'lr', l: T('receipt.totalLabel'), r: money(sale.total), bold: true, tall: true });
    if (sale.totalRefunded) {
      m.push({ k: 'lr', l: T('receipt.totalRefundedLabel'), r: minus(sale.totalRefunded) });
      m.push({ k: 'lr', l: T('receipt.netTotalLabel'), r: money(sale.total - sale.totalRefunded), bold: true });
    }
    m.push({ k: 'lr', l: T('receipt.paymentLabel'), r: paymentMethodLabel(sale.paymentMethod, lang) });
    if (sale.paymentMethod === 'cash' && sale.amountReceived != null) {
      m.push({ k: 'lr', l: T('receipt.tenderedLabel'), r: money(sale.amountReceived) });
      m.push({ k: 'lr', l: T('receipt.changeLabel'), r: money(sale.change) });
    }
    m.push({ k: 'rule' });
    m.push({ k: 'c', s: T('receipt.thankYou'), bold: true });
    m.push({ k: 'barcode', s: sale.receiptNumber });
    m.push({ k: 'c', s: sale.receiptNumber });
    if (footerText) { m.push({ k: 'gap' }); m.push({ k: 'c', s: footerText }); }
    m.push({ k: 'rule' });
    m.push({ k: 'lr', l: sale.receiptNumber, r: Fmt.dateTime(sale.date) });
    return m;
  }

  const modelIsPlain = (model) => model.every((r) => [r.s, r.l, r.r].every((x) => x == null || isPlain(x)));

  function renderText(model, paperMm) {
    const cpl = CPL[paperMm] || CPL[58];
    const b = ByteBuf();
    init(b);
    model.forEach((r) => {
      switch (r.k) {
        case 'big': // double width + height + bold: half as many characters fit
          align(b, 1); style(b, { bold: true, size: 0x11 });
          wrapText(r.s, cpl >> 1).forEach((l) => { b.ascii(l); lf(b); });
          resetStyle(b); align(b, 0);
          break;
        case 'c':
          align(b, 1); style(b, { bold: !!r.bold });
          wrapText(r.s, cpl).forEach((l) => { b.ascii(l); lf(b); });
          resetStyle(b); align(b, 0);
          break;
        case 'lr': {
          const right = toAscii(r.r || '');
          const lines = wrapText(r.l || '', Math.max(4, cpl - right.length - 1));
          style(b, { bold: !!r.bold, size: r.tall ? 0x01 : 0 });
          lines.forEach((l, i) => {
            const rr = i === 0 ? right : '';
            b.ascii(l + ' '.repeat(Math.max(1, cpl - l.length - rr.length)) + rr);
            lf(b);
          });
          resetStyle(b);
          break;
        }
        case 'rule': b.ascii('-'.repeat(cpl)); lf(b); break;
        case 'gap': lf(b); break;
        case 'barcode': barcode(b, r.s, paperMm); break;
        default: break;
      }
    });
    feedAndCut(b);
    return b.out();
  }

  /* ---------------------------------------------------------------------- */
  /* Image receipts                                                           */
  /* ---------------------------------------------------------------------- */

  // Options the two canvas builders in app.js accept for the thermal path:
  // the page is exactly as wide as the printer's dots (1 canvas px = 1 dot),
  // ink is black, no logo / torn-edge decoration, barcode modules snapped to
  // whole dots, and long item names wrap short of their own price.
  const thermalOpts = (dots) => ({
    pageWidthMm: dots / 8, marginMm: 1.5, dotAlign: true, noTornEdge: true, mono: true, noLogo: true, reserveMoney: true,
  });

  function imageJob(canvas) {
    const b = ByteBuf();
    init(b);
    b.bytes(canvasBands(canvas));
    feedAndCut(b);
    return b.out();
  }

  async function buildSaleBytes(sale, store, lang, cfg) {
    const paper = DOTS[cfg.paperMm] ? cfg.paperMm : 58;
    if (cfg.mode !== 'image') {
      const model = saleModel(sale, store, lang);
      if (modelIsPlain(model)) return renderText(model, paper);
    }
    const built = await buildReceiptCanvas(sale, store, lang, thermalOpts(DOTS[paper]));
    return imageJob(built.canvas);
  }

  // Refunds are rare and carry more layout than the sale receipt, so they
  // always go out as the image — identical to what the PDF shows.
  async function buildRefundBytes(sale, refundInfo, store, lang, cfg) {
    const paper = DOTS[cfg.paperMm] ? cfg.paperMm : 58;
    const built = await buildRefundReceiptCanvas(sale, refundInfo, store, lang, thermalOpts(DOTS[paper]));
    return imageJob(built.canvas);
  }

  /** Test page: exercises every path so the first print tells you what this
   *  particular printer can do — text sizes, native barcode, and a bitmap
   *  with Arabic and accented text (the part cheap firmware can't do as text). */
  function buildTestBytes(cfg) {
    const paper = DOTS[cfg.paperMm] ? cfg.paperMm : 58;
    const dots = DOTS[paper];
    const cpl = CPL[paper];
    const b = ByteBuf();
    init(b);
    align(b, 1); style(b, { bold: true, size: 0x11 }); b.ascii('BETTER STORE'); lf(b); resetStyle(b);
    style(b, { bold: true }); b.ascii('Printer test'); lf(b); resetStyle(b); align(b, 0);
    b.ascii('-'.repeat(cpl)); lf(b);
    const pair = (l, r) => { b.ascii(l + ' '.repeat(Math.max(1, cpl - l.length - r.length)) + r); lf(b); };
    pair('Paper width', `${paper} mm`);
    pair('Print width', `${dots} dots`);
    pair('Print style', cfg.mode === 'image' ? 'image' : 'auto');
    b.ascii('Normal text 0123456789'); lf(b);
    style(b, { bold: true }); b.ascii('Bold text 0123456789'); lf(b);
    style(b, { bold: true, size: 0x01 }); b.ascii('Tall bold text'); lf(b); resetStyle(b);
    b.ascii('-'.repeat(cpl)); lf(b);
    barcode(b, 'TEST-0123456789', paper);
    align(b, 1); b.ascii('TEST-0123456789'); lf(b); align(b, 0);
    b.ascii('-'.repeat(cpl)); lf(b);
    b.ascii('Bitmap test (Arabic / accents):'); lf(b);
    const c = document.createElement('canvas');
    c.width = dots; c.height = 120;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.direction = 'rtl'; ctx.font = '700 34px sans-serif';
    ctx.fillText('\u0627\u062e\u062a\u0628\u0627\u0631 \u0627\u0644\u0637\u0628\u0627\u0639\u0629', dots / 2, 48);
    ctx.direction = 'ltr'; ctx.font = '400 24px sans-serif';
    ctx.fillText('Qt\u00e9 \u00e0 \u00e7 \u00e9 \u00e8 \u2014 12345', dots / 2, 96);
    b.bytes(canvasBands(c));
    feedAndCut(b);
    return b.out();
  }

  /* ---------------------------------------------------------------------- */
  /* Sending + errors                                                         */
  /* ---------------------------------------------------------------------- */

  function errorText(e) {
    const code = e && e.code;
    if (KNOWN_ERRORS.includes(code)) return t(`printer.err.${code}`);
    return t('printer.err.GENERIC', { msg: (e && e.message) || String(e) });
  }

  async function send(cfg, bytes) {
    const P = plugin();
    if (!P) { const err = new Error('no plugin'); err.code = 'BT_UNSUPPORTED'; throw err; }
    const opts = { address: cfg.address, data: toBase64(bytes), chunkSize: 512, chunkDelayMs: 10 };
    try {
      return await P.print(opts);
    } catch (e) {
      // First print after install on Android 12+: ask for the Bluetooth
      // permission right here and retry once, instead of failing outright.
      if (e && e.code === 'NO_PERMISSION') {
        const res = await P.askPermissions({});
        if (res && res.connectGranted) return P.print(opts);
      }
      throw e;
    }
  }

  /** Themed failure dialog (same card as Confirm) with three outcomes.
   *  Confirm.show only has two buttons, and "try again" matters here: the
   *  usual cause is a printer that's switched off. */
  function failureDialog(reason) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      document.body.appendChild(overlay);
      Fx.animate(overlay, { opacity: [0, 1] }, { duration: 0.15 });
      const card = document.createElement('div');
      card.className = 'confirm-card';
      card.innerHTML = `
        <div class="confirm-card__icon">${Icon('alert-triangle', { size: 26 })}</div>
        <div class="confirm-card__message">${escapeHTML(reason)}</div>
        <div class="confirm-card__actions confirm-card__actions--stack">
          <button class="btn btn-primary tappable" data-r="retry">${escapeHTML(t('common.retry'))}</button>
          <button class="btn btn-secondary tappable" data-r="system">${escapeHTML(t('printer.useSystemPrint'))}</button>
          <button class="btn btn-secondary tappable" data-r="cancel">${escapeHTML(t('common.cancel'))}</button>
        </div>`;
      overlay.appendChild(card);
      Fx.animate(card, { opacity: [0, 1], scale: [0.92, 1], y: [10, 0] }, { type: 'spring', stiffness: 420, damping: 22 });
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        Fx.animate(overlay, { opacity: [1, 0] }, { duration: 0.15 }).finished.then(() => overlay.remove());
        resolve(r);
      };
      card.querySelectorAll('[data-r]').forEach((btn) => btn.addEventListener('click', () => finish(btn.dataset.r)));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) finish('cancel'); });
    });
  }

  let busy = false;

  /** Runs one print job. Resolves true when the job is dealt with (printed,
   *  or the person chose to stop) and false when the caller should fall back
   *  to the system print path. */
  async function runJob(cfg, build) {
    if (busy) { Toast.show(t('printer.busy')); return true; }
    busy = true;
    try {
      for (;;) {
        try {
          Toast.show(t('printer.printing'), { duration: 1400 });
          await send(cfg, await build());
          Toast.success(t('printer.printed'));
          return true;
        } catch (e) {
          const choice = await failureDialog(errorText(e));
          if (choice === 'retry') continue;
          return choice !== 'system';
        }
      }
    } finally {
      busy = false;
    }
  }

  async function printSale(sale, store, lang) {
    if (!plugin()) return false;
    const cfg = await Settings.get('printer');
    if (!cfg.address) return false;
    return runJob(cfg, () => buildSaleBytes(sale, store, lang, cfg));
  }

  async function printRefund(sale, refundInfo, store, lang) {
    if (!plugin()) return false;
    const cfg = await Settings.get('printer');
    if (!cfg.address) return false;
    return runJob(cfg, () => buildRefundBytes(sale, refundInfo, store, lang, cfg));
  }

  /* ---------------------------------------------------------------------- */
  /* Settings row + setup sheet                                               */
  /* ---------------------------------------------------------------------- */

  function subtitleFor(cfg) {
    if (!plugin()) return t('printer.settingsWebOnly');
    return cfg.address
      ? t('printer.settingsSet', { name: cfg.name || cfg.address, mm: cfg.paperMm })
      : t('printer.settingsNotSet');
  }

  function settingsRowHTML(cfg) {
    return `
      <div class="list-row tappable" id="printerRow">
        <div class="list-row__icon">${Icon('printer')}</div>
        <div class="list-row__body">
          <div class="list-row__title">${escapeHTML(t('printer.settingsTitle'))}</div>
          <div class="list-row__subtitle" id="printerRowSub">${escapeHTML(subtitleFor(cfg))}</div>
        </div>
        <div class="list-row__trailing text-faint disclosure-chevron">›</div>
      </div>`;
  }

  // A printer is much more likely than a headset or a watch to be what the
  // person is looking for, so those float to the top of the paired list.
  const IMAGING_CLASS = 0x0600;
  const looksLikePrinter = (d) => d.majorClass === IMAGING_CLASS
    || /print|pos|rpp|mtp|mpt|pt-?\d|thermal|receipt|bluetooth ?printer|^bt\b|^spp/i.test(d.name || '');

  async function openSetup({ onChange } = {}) {
    const P = plugin();
    if (!P) { Toast.show(t('printer.settingsWebOnly')); return; }

    const S = {
      cfg: await Settings.get('printer'),
      st: null,
      paired: [],
      found: [],
      scanning: false,
      scanned: false,
      pairing: null,
      permDenied: false,
      timer: null,
      closed: false,
    };

    const footerHTML = `
      <button class="btn btn-primary tappable" id="prTestBtn">${Icon('printer')} ${escapeHTML(t('printer.testBtn'))}</button>
      <button class="btn btn-secondary mt-8 tappable" id="prForgetBtn">${escapeHTML(t('printer.forgetBtn'))}</button>`;

    const sheetEl = Sheet.open({
      title: t('printer.sheetTitle'),
      bodyHTML: '<div id="prBody"></div>',
      footerHTML,
      onClose: () => {
        S.closed = true;
        stopScan();
        document.removeEventListener('visibilitychange', onVisible);
        if (onChange) onChange(S.cfg);
      },
    });
    const bodyEl = sheetEl.querySelector('#prBody');
    const testBtn = sheetEl.querySelector('#prTestBtn');
    const forgetBtn = sheetEl.querySelector('#prForgetBtn');

    const save = async (patch) => { S.cfg = await Settings.set('printer', patch); };

    /* ---- rendering ---- */

    const noticeHTML = (icon, title, body, buttons) => `
      <div class="card" style="text-align:center;">
        <div class="list-row__icon" style="margin:0 auto 10px;">${Icon(icon)}</div>
        ${title ? `<div style="font-weight:700; margin-bottom:4px;">${escapeHTML(title)}</div>` : ''}
        <div class="text-dim text-sm">${escapeHTML(body)}</div>
        <div class="mt-16">${buttons}</div>
      </div>`;

    const btn = (act, label, primary = false, icon = '') =>
      `<button class="btn ${primary ? 'btn-primary' : 'btn-secondary'} tappable" style="width:100%; margin-top:8px;" data-act="${act}">${icon} ${escapeHTML(label)}</button>`;

    const deviceRow = (d, kind) => {
      const selected = kind === 'paired' && S.cfg.address === d.address;
      const pairing = S.pairing === d.address;
      return `
        <div class="list-row tappable" role="button" data-act="${kind === 'paired' ? 'pick' : 'pair'}" data-addr="${escapeHTML(d.address)}" data-name="${escapeHTML(d.name || '')}"
             style="margin-bottom:8px;${selected ? ' border-color:var(--accent);' : ''}">
          <div class="list-row__icon">${Icon('bluetooth')}</div>
          <div class="list-row__body">
            <div class="list-row__title">${escapeHTML(d.name || t('printer.unnamed'))}</div>
            <div class="list-row__subtitle">${pairing ? escapeHTML(t('printer.pairing')) : `<span class="ltr-code">${escapeHTML(d.address)}</span>`}</div>
          </div>
          <div class="list-row__trailing">${selected ? `<span class="badge badge--success">${escapeHTML(t('printer.defaultBadge'))}</span>` : '<span class="text-faint disclosure-chevron">›</span>'}</div>
        </div>`;
    };

    const nearbyHTML = () => {
      if (!S.scanned && !S.scanning) return '';
      const known = new Set(S.paired.map((d) => d.address));
      const list = S.found.filter((d) => !known.has(d.address));
      return `
        <div class="section-title">${escapeHTML(t('printer.nearbySection'))}</div>
        ${list.length
          ? list.map((d) => deviceRow(d, 'found')).join('')
          : `<div class="text-dim text-sm">${escapeHTML(S.scanning ? t('printer.scanning') : t('printer.scanNothing'))}</div>`}`;
    };

    const mainHTML = () => {
      const paired = S.paired.slice().sort((a, b) => Number(looksLikePrinter(b)) - Number(looksLikePrinter(a)));
      const chip = (act, attr, val, label, on) =>
        `<button type="button" class="chip tappable${on ? ' active' : ''}" data-act="${act}" data-${attr}="${val}">${escapeHTML(label)}</button>`;
      return `
        <div class="section-title">${escapeHTML(t('printer.paperSection'))}</div>
        <div class="chip-row">
          ${[58, 80].map((mm) => chip('paper', 'mm', mm, t('printer.paperMm', { mm }), S.cfg.paperMm === mm)).join('')}
        </div>
        <div class="section-title">${escapeHTML(t('printer.styleSection'))}</div>
        <div class="chip-row" style="margin-bottom:6px;">
          ${chip('style', 'mode', 'auto', t('printer.styleAuto'), S.cfg.mode !== 'image')}
          ${chip('style', 'mode', 'image', t('printer.styleImage'), S.cfg.mode === 'image')}
        </div>
        <div class="text-dim text-sm mb-16">${escapeHTML(t('printer.styleHint'))}</div>

        <div class="section-title">${escapeHTML(t('printer.pairedSection'))}</div>
        ${paired.length ? paired.map((d) => deviceRow(d, 'paired')).join('') : `<div class="text-dim text-sm mb-8">${escapeHTML(t('printer.noPaired'))}</div>`}
        ${btn('scan', S.scanning ? t('printer.scanning') : t('printer.scanBtn'), false, Icon(S.scanning ? 'refresh' : 'search', S.scanning ? { className: 'icon-spin' } : {}))}
        ${btn('btSettings', t('printer.openBtSettings'), false, Icon('bluetooth'))}
        <div id="prNearby" class="mt-16">${nearbyHTML()}</div>`;
    };

    const paint = () => {
      if (S.closed) return;
      let html = `<div class="text-dim text-sm mb-16">${escapeHTML(t('printer.intro'))}</div>`;
      if (!S.st) {
        html += `<div class="text-dim text-sm">${escapeHTML(t('common.loading'))}</div>`;
      } else if (!S.st.supported) {
        html += noticeHTML('alert-triangle', null, t('printer.unsupported'), '');
      } else if (!S.st.connectGranted) {
        html += noticeHTML('bluetooth', t('printer.permTitle'), S.permDenied ? t('printer.permDeniedBody') : t('printer.permBody'),
          S.permDenied ? btn('appSettings', t('printer.openAppSettings'), true) + btn('recheck', t('printer.recheck'))
            : btn('allow', t('printer.permAllow'), true));
      } else if (!S.st.enabled) {
        html += noticeHTML('bluetooth', t('printer.btOffTitle'), t('printer.btOffBody'),
          btn('btSettings', t('printer.openBtSettings'), true) + btn('recheck', t('printer.recheck')));
      } else {
        html += mainHTML();
      }
      bodyEl.innerHTML = html;
      const ready = !!(S.st && S.st.supported && S.st.connectGranted && S.st.enabled);
      testBtn.disabled = !S.cfg.address || !ready;
      forgetBtn.style.display = S.cfg.address ? '' : 'none';
    };

    const paintNearby = () => {
      const el = bodyEl.querySelector('#prNearby');
      if (el && !S.closed) el.innerHTML = nearbyHTML();
    };

    /* ---- state ---- */

    async function refresh() {
      try {
        S.st = await P.getState();
        if (S.st.connectGranted) S.permDenied = false;
        S.paired = S.st.supported && S.st.connectGranted ? ((await P.listPaired()).devices || []) : [];
      } catch (e) {
        S.st = { supported: true, connectGranted: false, enabled: false };
        S.paired = [];
      }
      paint();
    }

    function onVisible() {
      // Back from Bluetooth / app settings: pick up a newly paired printer,
      // a granted permission, or Bluetooth having been switched on.
      if (!document.hidden && !S.closed && !S.scanning) refresh();
    }
    document.addEventListener('visibilitychange', onVisible);

    /* ---- scanning ---- */

    function stopScan() {
      clearTimeout(S.timer);
      S.timer = null;
      if (S.scanning) { try { P.stopDiscovery(); } catch (e) { /* nothing to stop */ } }
      S.scanning = false;
    }

    async function pollScan() {
      if (!S.scanning || S.closed) return;
      try {
        const r = await P.getDiscovery();
        S.found = (r.devices || []).filter((d) => !d.bonded);
        if (!r.discovering) { S.scanning = false; S.scanned = true; }
      } catch (e) {
        S.scanning = false; S.scanned = true;
      }
      if (S.scanning) { paintNearby(); S.timer = setTimeout(pollScan, 1000); } else paint();
    }

    async function startScan() {
      if (S.scanning) return;
      try {
        const perm = await P.askPermissions({ forScan: true });
        if (!perm.scanGranted || !perm.connectGranted) {
          Toast.error(t('printer.permDeniedBody'));
          return;
        }
        S.found = [];
        await P.startDiscovery();
        S.scanning = true;
        paint();
        S.timer = setTimeout(pollScan, 1000);
      } catch (e) {
        Toast.error(e && e.code === 'BT_OFF' ? t('printer.err.BT_OFF') : t('printer.scanFailed'));
        refresh();
      }
    }

    /* ---- actions ---- */

    async function choose(address, name) {
      await save({ address, name: name || address });
      Toast.success(t('printer.nowDefault', { name: name || address }));
      paint();
    }

    async function pairAndChoose(address, name) {
      if (S.pairing) return;
      S.pairing = address;
      stopScan();
      paint();
      try {
        await P.pair({ address });
        S.paired = ((await P.listPaired()).devices || []);
        S.pairing = null;
        await choose(address, name);
      } catch (e) {
        S.pairing = null;
        Toast.error(t('printer.pairFailed', { name: name || address }));
        paint();
      }
    }

    bodyEl.addEventListener('click', async (ev) => {
      const el = ev.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      if (act === 'pick') await choose(el.dataset.addr, el.dataset.name);
      else if (act === 'pair') await pairAndChoose(el.dataset.addr, el.dataset.name);
      else if (act === 'paper') { await save({ paperMm: Number(el.dataset.mm) === 80 ? 80 : 58 }); paint(); }
      else if (act === 'style') { await save({ mode: el.dataset.mode === 'image' ? 'image' : 'auto' }); paint(); }
      else if (act === 'scan') await startScan();
      else if (act === 'btSettings') P.openBluetoothSettings();
      else if (act === 'appSettings') P.openAppSettings();
      else if (act === 'recheck') await refresh();
      else if (act === 'allow') {
        try {
          const res = await P.askPermissions({});
          S.permDenied = !res.connectGranted;
        } catch (e) { S.permDenied = true; }
        await refresh();
      }
    });

    testBtn.addEventListener('click', async () => {
      if (busy || !S.cfg.address) return;
      busy = true;
      testBtn.disabled = true;
      try {
        Toast.show(t('printer.printing'), { duration: 1400 });
        await send(S.cfg, buildTestBytes(S.cfg));
        Toast.success(t('printer.testSent'));
      } catch (e) {
        Toast.error(errorText(e));
      } finally {
        busy = false;
        if (!S.closed) testBtn.disabled = false;
      }
    });

    forgetBtn.addEventListener('click', async () => {
      await save({ address: null, name: null });
      Toast.show(t('printer.removed'));
      paint();
    });

    paint();
    await refresh();
  }

  return {
    printSale,
    printRefund,
    settingsRowHTML,
    subtitleFor,
    openSetup,
    isAvailable: () => !!plugin(),
    // Exposed for the Node-side verification script only.
    _internals: { ByteBuf, saleModel, modelIsPlain, renderText, rasterBands, barcodeRasterBands, barcode, wrapText, toAscii, isPlain, toBase64, buildTestBytes, DOTS, CPL },
  };
})();
window.ThermalPrinter = ThermalPrinter;
