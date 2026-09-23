/* ==========================================================================
   hardwareScan.js — physical barcode scanner support.

   Two very different kinds of "Bluetooth barcode scanner" exist:

     - Keyboard-wedge (the overwhelming majority of cheap scanner "guns"):
       pairs at the OS level exactly like a Bluetooth keyboard, and needs
       NO app code to receive anything — it just types the barcode,
       followed by Enter, into whatever has focus. HardwareScan.init()
       below is a global keydown listener that tells a scan like this
       apart from a person typing (scanners fire characters far faster
       than any human can) and, whenever nothing is already focused to
       receive it, decides what a scanned code should do on the current
       screen. This part works immediately for any keyboard-wedge
       scanner, wired or Bluetooth, with nothing to pair in-app.
     - Serial (SPP), which streams raw data over a Bluetooth socket the
       way the receipt printer sends it — this needs its own native
       connect-and-listen support the printer's plugin doesn't have yet,
       so it isn't handled here.

   settingsRowHTML()/openSetup() below just let someone pick which paired
   device is their scanner, for their own confidence/reference — reusing
   the receipt printer's plugin purely for its generic "list/pair
   Bluetooth devices" methods, since pairing itself is otherwise invisible
   to the app for a keyboard-wedge device. Picking one here doesn't
   change what HardwareScan does; it's a label, not a connection.
   ========================================================================== */

const HardwareScan = (() => {
  const MAX_GAP_MS = 60;     // longer than this between keydowns => not a scanner burst
  const MIN_LENGTH = 3;      // shorter bursts are more likely a stray keypress than a real code
  const MAX_TOTAL_MS = 1200; // safety cap on how long one whole code may take to arrive

  let buffer = '';
  let lastKeyTime = 0;
  let startTime = 0;
  let listening = false;
  let busy = false; // guards against a second burst finishing while the first is still being looked up

  const t = (key, vars) => I18n.t(key, vars);

  function isEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function reset() {
    buffer = '';
    startTime = 0;
  }

  /** Route-aware default for a scanned code. POS adds it straight to the
   *  cart (mirrors the on-screen camera scanner's own scan-to-cart
   *  button); everywhere else, it looks the product up or offers to
   *  create it — scanning is fundamentally about products wherever you
   *  are in the app. */
  async function handleCode(code) {
    if (busy) return;
    // A sheet already open with nothing focused (e.g. someone mid-way
    // through a Purchase Order, between picking items) means a scan
    // isn't clearly "for" this screen — safer to do nothing than pop a
    // product lookup on top of whatever they were doing.
    if (window.Sheet && Sheet.el) return;
    busy = true;
    try {
      const route = window.Router ? Router.current : null;
      const product = await DB.getByIndex('products', 'barcode', code);

      if (route === 'pos' && window.POS) {
        if (product) POS.addToCart(product);
        else Toast.error(t('hardwareScan.notFound', { code }));
        return;
      }

      if (window.Products) {
        if (product) Products.openDetail(product);
        else Products.openForm(null, { prefillBarcode: code });
      }
    } finally {
      busy = false;
    }
  }

  function onKeyDown(e) {
    if (isEditable(document.activeElement)) { reset(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) { reset(); return; }

    const now = performance.now();

    if (e.key === 'Enter') {
      const gapOk = (now - lastKeyTime) <= MAX_GAP_MS;
      const totalOk = startTime && (now - startTime) <= MAX_TOTAL_MS;
      if (buffer.length >= MIN_LENGTH && gapOk && totalOk) {
        e.preventDefault();
        const code = buffer;
        reset();
        handleCode(code);
      } else {
        reset();
      }
      return;
    }

    if (e.key.length !== 1) return; // ignore Shift/Tab/arrows/F-keys/etc — a scanner only ever sends printable characters plus Enter

    if (now - lastKeyTime > MAX_GAP_MS) {
      // Gap too long since the last key: whatever's buffered is stale
      // (either this is the start of a fresh scan, or it's a human typing
      // at normal speed), so this key starts a brand new burst.
      buffer = '';
      startTime = now;
    }
    buffer += e.key;
    lastKeyTime = now;
  }

  function init() {
    if (listening) return;
    listening = true;
    document.addEventListener('keydown', onKeyDown, true);
  }

  /* ---------------------------------------------------------------- */
  /* Settings row + setup sheet — labeling only, see file header        */
  /* ---------------------------------------------------------------- */

  function plugin() {
    const cap = window.Capacitor;
    const native = cap && cap.isNativePlatform && cap.isNativePlatform();
    // Reused purely for its generic Bluetooth list/pair methods — nothing
    // scanner- or printer-specific about them. See file header.
    return (native && cap.Plugins && cap.Plugins.ThermalPrinter) || null;
  }

  function subtitleFor(cfg) {
    return cfg.address ? t('hardwareScan.settingsSet', { name: cfg.name || cfg.address }) : t('hardwareScan.settingsNotSet');
  }

  function settingsRowHTML(cfg) {
    return `
      <div class="list-row tappable" id="scannerRow">
        <div class="list-row__icon">${Icon('scan')}</div>
        <div class="list-row__body">
          <div class="list-row__title">${escapeHTML(t('hardwareScan.settingsTitle'))}</div>
          <div class="list-row__subtitle" id="scannerRowSub">${escapeHTML(subtitleFor(cfg))}</div>
        </div>
        <div class="list-row__trailing text-faint disclosure-chevron">\u203a</div>
      </div>`;
  }

  async function openSetup({ onChange } = {}) {
    const P = plugin();
    const S = { cfg: await Settings.get('scanner'), st: null, paired: [], found: [], scanning: false, scanned: false, pairing: null, timer: null, closed: false };

    const footerHTML = `<button class="btn btn-secondary tappable" id="scForgetBtn">${escapeHTML(t('hardwareScan.forgetBtn'))}</button>`;
    const sheetEl = Sheet.open({
      title: t('hardwareScan.sheetTitle'),
      bodyHTML: '<div id="scBody"></div>',
      footerHTML,
      onClose: () => { S.closed = true; stopScan(); if (onChange) onChange(S.cfg); },
    });
    const bodyEl = sheetEl.querySelector('#scBody');
    const forgetBtn = sheetEl.querySelector('#scForgetBtn');

    const save = async (patch) => { S.cfg = await Settings.set('scanner', patch); };
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
          <div class="list-row__trailing">${selected ? `<span class="badge badge--success">${escapeHTML(t('printer.defaultBadge'))}</span>` : '<span class="text-faint disclosure-chevron">\u203a</span>'}</div>
        </div>`;
    };

    const nearbyHTML = () => {
      if (!S.scanned && !S.scanning) return '';
      const known = new Set(S.paired.map((d) => d.address));
      const list = S.found.filter((d) => !known.has(d.address));
      return `
        <div class="section-title">${escapeHTML(t('printer.nearbySection'))}</div>
        ${list.length ? list.map((d) => deviceRow(d, 'found')).join('') : `<div class="text-dim text-sm">${escapeHTML(S.scanning ? t('printer.scanning') : t('printer.scanNothing'))}</div>`}`;
    };

    const mainHTML = () => `
      <div class="text-dim text-sm mb-16">${escapeHTML(t('hardwareScan.intro'))}</div>
      <div class="section-title">${escapeHTML(t('printer.pairedSection'))}</div>
      ${S.paired.length ? S.paired.map((d) => deviceRow(d, 'paired')).join('') : `<div class="text-dim text-sm mb-8">${escapeHTML(t('printer.noPaired'))}</div>`}
      ${btn('scan', S.scanning ? t('printer.scanning') : t('printer.scanBtn'), false, Icon(S.scanning ? 'refresh' : 'search', S.scanning ? { className: 'icon-spin' } : {}))}
      ${btn('btSettings', t('printer.openBtSettings'), false, Icon('bluetooth'))}
      <div id="scNearby" class="mt-16">${nearbyHTML()}</div>`;

    const noticeHTML = (icon, title, body, buttons) => `
      <div class="card" style="text-align:center;">
        <div class="list-row__icon" style="margin:0 auto 10px;">${Icon(icon)}</div>
        ${title ? `<div style="font-weight:700; margin-bottom:4px;">${escapeHTML(title)}</div>` : ''}
        <div class="text-dim text-sm">${escapeHTML(body)}</div>
        <div class="mt-16">${buttons}</div>
      </div>`;

    const paint = () => {
      if (S.closed) return;
      let html;
      if (!P) {
        html = `<div class="text-dim text-sm mb-16">${escapeHTML(t('hardwareScan.intro'))}</div>` + noticeHTML('scan-line', null, t('printer.settingsWebOnly'), '');
      } else if (!S.st) {
        html = `<div class="text-dim text-sm">${escapeHTML(t('common.loading'))}</div>`;
      } else if (!S.st.connectGranted) {
        html = noticeHTML('bluetooth', t('printer.permTitle'), t('printer.permBody'), btn('allow', t('printer.permAllow'), true));
      } else if (!S.st.enabled) {
        html = noticeHTML('bluetooth', t('printer.btOffTitle'), t('printer.btOffBody'), btn('btSettings', t('printer.openBtSettings'), true) + btn('recheck', t('printer.recheck')));
      } else {
        html = mainHTML();
      }
      bodyEl.innerHTML = html;
      forgetBtn.style.display = S.cfg.address ? '' : 'none';
    };
    const paintNearby = () => { const el = bodyEl.querySelector('#scNearby'); if (el && !S.closed) el.innerHTML = nearbyHTML(); };

    async function refresh() {
      if (!P) { paint(); return; }
      try {
        S.st = await P.getState();
        S.paired = S.st.supported && S.st.connectGranted ? ((await P.listPaired()).devices || []) : [];
      } catch (e) {
        S.st = { supported: true, connectGranted: false, enabled: false };
        S.paired = [];
      }
      paint();
    }

    function stopScan() {
      clearTimeout(S.timer);
      S.timer = null;
      if (S.scanning && P) { try { P.stopDiscovery(); } catch (e) { /* nothing to stop */ } }
      S.scanning = false;
    }

    async function pollScan() {
      if (!S.scanning || S.closed) return;
      try {
        const r = await P.getDiscovery();
        S.found = (r.devices || []).filter((d) => !d.bonded);
        if (!r.discovering) { S.scanning = false; S.scanned = true; }
      } catch (e) { S.scanning = false; S.scanned = true; }
      if (S.scanning) { paintNearby(); S.timer = setTimeout(pollScan, 1000); } else paint();
    }

    async function startScan() {
      if (S.scanning || !P) return;
      try {
        const perm = await P.askPermissions({ forScan: true });
        if (!perm.scanGranted || !perm.connectGranted) { Toast.error(t('printer.permDeniedBody')); return; }
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

    async function choose(address, name) {
      await save({ address, name: name || address });
      Toast.success(t('hardwareScan.nowSet', { name: name || address }));
      paint();
    }

    async function pairAndChoose(address, name) {
      if (S.pairing || !P) return;
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
      else if (act === 'scan') await startScan();
      else if (act === 'btSettings') P.openBluetoothSettings();
      else if (act === 'recheck') await refresh();
      else if (act === 'allow') {
        try { await P.askPermissions({}); } catch (e) { /* reflected in refresh() below either way */ }
        await refresh();
      }
    });

    forgetBtn.addEventListener('click', async () => {
      await save({ address: null, name: null });
      Toast.show(t('hardwareScan.removed'));
      paint();
    });

    paint();
    await refresh();
  }

  return { init, settingsRowHTML, subtitleFor, openSetup };
})();
window.HardwareScan = HardwareScan;
