/**
 * app.js — App shell: hash router, bottom navigation, theming, dashboard.
 *
 * Routing uses location.hash (#dashboard, #pos, #products/42, ...) so the
 * app works when opened as a plain file or from any static host, with no
 * server-side routing config needed — important since this is edited and
 * served straight from a phone.
 *
 * Each route module (products.js, pos.js, ...) registers itself by calling
 * Router.register('routeName', renderFn) once it has loaded. renderFn
 * receives (container, params) and is responsible for filling #view.
 * Until a module is loaded, its route falls back to a "coming soon" view
 * so navigation is fully clickable from stage 1 onward.
 */

const Router = (() => {
  const routes = {};
  let currentRoute = null;
  let pendingDirection = null; // 'left' | 'right' | null — explicit override from swipe
  let explicitDirectionSet = false;

  // Shared position order for every screen in the app — used to compute a
  // consistent slide direction for ANY navigation (tap, swipe, or a plain
  // link), so moving deeper into the app always slides left and moving
  // back always slides right, like one continuous strip of pages rather
  // than isolated screens.
  const ROUTE_ORDER = [
    'dashboard', 'products', 'pos', 'sales', 'more',
    'inventory', 'reports', 'customers', 'suppliers', 'backup', 'settings',
  ];

  function register(name, renderFn, opts = {}) {
    routes[name] = { renderFn, opts };
  }

  function parseHash() {
    const raw = (location.hash || '#dashboard').slice(1);
    const [name, ...rest] = raw.split('/');
    return { name: name || 'dashboard', params: rest };
  }

  async function renderCurrent() {
    const previousRoute = currentRoute;
    const { name, params } = parseHash();
    currentRoute = name;
    updateNavHighlight(name);

    const view = document.getElementById('view');
    const route = routes[name];

    setTopbar(name, route);

    // Auto-compute a direction for this transition unless the caller (the
    // swipe gesture) already set one explicitly — that always wins since
    // it reflects exactly which way the finger moved.
    if (!explicitDirectionSet) {
      pendingDirection = computeDirection(previousRoute, name);
    }
    explicitDirectionSet = false;

    // Always land at the top of the new screen. #view is now the app's
    // only scroll container (see the html/body rule in style.css), so
    // this resets ITS scroll position, not the document's.
    view.scrollTop = 0;

    if (!route) {
      view.innerHTML = comingSoonHTML(name);
      applyEnterAnimation(view);
      return;
    }

    // Local IndexedDB reads are near-instant almost every time, so
    // swapping to a skeleton placeholder unconditionally just flashes an
    // empty frame between the outgoing and incoming screens and breaks
    // the continuity of the slide. Only fall back to it if a render
    // genuinely takes a moment (a big report calculation, a cold start).
    let skeletonTimer = setTimeout(() => { view.innerHTML = skeletonLoadingHTML(); }, 120);
    try {
      await route.renderFn(view, params);
    } catch (err) {
      console.error(`Error rendering route "${name}":`, err);
      clearTimeout(skeletonTimer);
      view.innerHTML = errorHTML();
      applyEnterAnimation(view);
      return;
    }
    clearTimeout(skeletonTimer);

    compactifyNumbers(view);
    applyEnterAnimation(view);
  }

  function computeDirection(fromRoute, toRoute) {
    if (!fromRoute || fromRoute === toRoute) return null;
    const fromIdx = ROUTE_ORDER.indexOf(fromRoute);
    const toIdx = ROUTE_ORDER.indexOf(toRoute);
    if (fromIdx === -1 || toIdx === -1) return null;
    return toIdx > fromIdx ? 'left' : 'right';
  }

  function applyEnterAnimation(view) {
    view.classList.remove('view-enter', 'view-enter-left', 'view-enter-right');
    void view.offsetWidth; // force reflow so the animation restarts
    if (pendingDirection === 'left') view.classList.add('view-enter-left');
    else if (pendingDirection === 'right') view.classList.add('view-enter-right');
    else view.classList.add('view-enter');
    pendingDirection = null;
  }

  /** A generic content-shaped placeholder shown while a route's data loads
   * from IndexedDB — reads aren't usually slow enough for this to linger,
   * but it avoids a jarring blank flash better than a bare spinner would. */
  function skeletonLoadingHTML() {
    return `
      <div class="stat-grid">
        <div class="skeleton" style="height:78px;"></div>
        <div class="skeleton" style="height:78px;"></div>
      </div>
      <div class="list mt-16">
        ${Array.from({ length: 4 }, () => '<div class="skeleton" style="height:66px;"></div>').join('')}
      </div>
    `;
  }

  function comingSoonHTML(name) {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    return `
      <div class="empty-state">
        <div class="empty-state__icon">🛠️</div>
        <div class="empty-state__title">${label} is coming in a later build stage</div>
        <div class="empty-state__hint">The dashboard, navigation, and database are live now. This screen gets built next.</div>
      </div>`;
  }

  function errorHTML() {
    return `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <div class="empty-state__title">Something went wrong loading this screen</div>
        <div class="empty-state__hint">Check the console for details.</div>
      </div>`;
  }

  const TITLES = {
    dashboard: ['Dashboard', null],
    products: ['Products', null],
    pos: ['New Sale', null],
    inventory: ['Inventory', null],
    more: ['More', null],
    sales: ['Sales History', null],
    reports: ['Reports', null],
    customers: ['Customers', null],
    suppliers: ['Suppliers', null],
    settings: ['Settings', null],
    backup: ['Backup & Restore', null],
    scanner: ['Scan Product', null],
  };

  function setTopbar(name) {
    const [title] = TITLES[name] || [name, null];
    // Rebuilt from scratch every navigation (rather than touching
    // .firstChild.textContent) so it's safe even after a route — like the
    // dashboard's store-branded header — has replaced the title's markup
    // with something other than a plain text node.
    document.getElementById('topbarTitle').innerHTML = `${escapeHTML(title)} <small id="topbarSubtitle">&nbsp;</small>`;
    document.getElementById('topbarActions').innerHTML = '';
  }

  function updateNavHighlight(name) {
    const topLevel = ['dashboard', 'products', 'pos', 'sales'];
    const activeKey = topLevel.includes(name) ? name : 'more';
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.route === activeKey);
    });
    positionNavIndicator(activeKey);
  }

  function positionNavIndicator(activeKey) {
    const indicator = document.getElementById('navIndicator');
    const btn = document.querySelector(`.nav-item[data-route="${activeKey}"]`);
    if (!indicator || !btn || btn.classList.contains('nav-item--fab')) {
      if (indicator) indicator.classList.remove('show');
      return;
    }
    const width = Math.min(64, btn.offsetWidth - 6);
    indicator.style.width = `${width}px`;
    const left = btn.offsetLeft + btn.offsetWidth / 2 - width / 2;
    indicator.style.left = `${left}px`;
    indicator.classList.add('show');
  }

  function goTo(hash, opts = {}) {
    if (opts.direction) {
      pendingDirection = opts.direction;
      explicitDirectionSet = true;
    }
    location.hash = hash;
  }

  function init() {
    window.addEventListener('hashchange', renderCurrent);
    document.getElementById('bottomNav').addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item');
      if (!btn) return;
      if (navigator.vibrate) navigator.vibrate(12);
      goTo(btn.dataset.route);
    });
    renderCurrent();
    window.addEventListener('resize', () => positionNavIndicator(
      ['dashboard', 'products', 'pos', 'sales'].includes(currentRoute) ? currentRoute : 'more'
    ));
  }

  return { register, init, goTo, refresh: renderCurrent, get current() { return currentRoute; } };
})();

/* ---------------------------------------------------------------------- */
/* Ripple — tap feedback on any element with class "tappable"              */
/* ---------------------------------------------------------------------- */

document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.tappable, .icon-btn, .btn, .quick-action, .chip, .list-row, .num-auto');
  if (!el) return;
  // A subtle universal tap-tick, layered under the stronger, more
  // deliberate haptics already fired for specific confirmed actions
  // (completing a sale, a scan hit, etc.) elsewhere in the app.
  if (navigator.vibrate) navigator.vibrate(8);
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.4;
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  el.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
});

// A light tick on any toggle switch / radio choice app-wide (settings
// toggles, POS option switches, etc.) — distinct from the tap-tick above
// since these fire on the resulting state change, not the touch itself.
document.addEventListener('change', (e) => {
  if (e.target.matches && e.target.matches('input[type="checkbox"], input[type="radio"]')) {
    if (navigator.vibrate) navigator.vibrate(10);
  }
});

/* ---------------------------------------------------------------------- */
/* Big numbers — auto-detected, everywhere, no per-screen wiring needed.   */
/* Any element carrying the existing ".num" class (already used app-wide  */
/* for prices/totals/quantities) gets scanned after every render. If its  */
/* value is more than 4 digits, the display is shortened (12,450 -> 12k,  */
/* 2,300,000 -> 2.3M) and becomes tappable — tapping opens a small popup  */
/* with the exact full number, rather than growing/wrapping in place.     */
/* Identifiers that happen to look numeric (barcodes) opt out via         */
/* ".num-id" so they're never mistaken for a quantity or amount.          */
/* ---------------------------------------------------------------------- */

function compactifyNumbers(root) {
  if (!root) return;
  const candidates = root.querySelectorAll('.num:not(.num-id)');
  candidates.forEach((el) => {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
    if (el.dataset.numFull) return; // already processed
    const raw = el.textContent;
    const match = raw.match(/^(-?[\d][\d,]*(?:\.\d+)?)/);
    if (!match) return;
    const numeric = parseFloat(match[1].replace(/,/g, ''));
    if (!isFinite(numeric) || Math.abs(numeric) < 10000) return;

    const prefix = match[1];
    const suffix = raw.slice(match[1].length); // e.g. " DZD"
    const compact = Fmt.compactNumber(numeric) + suffix;

    el.dataset.numFull = raw;
    el.textContent = compact;
    el.classList.add('num-auto');
  });
}
window.compactifyNumbers = compactifyNumbers;

document.addEventListener('click', (e) => {
  const el = e.target.closest('.num-auto');
  if (!el) return;
  e.stopPropagation(); // don't also trigger a parent row's own tap
  NumberPopup.show(el.dataset.numFull);
});

const NumberPopup = (() => {
  function show(fullText, opts = {}) {
    const backdrop = document.createElement('div');
    backdrop.className = 'num-popup-backdrop';
    const style = opts.small ? ' style="font-size:14px; font-weight:500; text-align:left;"' : '';
    backdrop.innerHTML = `
      <div class="num-popup-card">
        <div class="num-popup-value num"${style}>${escapeHTML(fullText)}</div>
        <button class="btn btn-secondary tappable num-popup-close">Close</button>
      </div>
    `;
    document.body.appendChild(backdrop);
    if (navigator.vibrate) navigator.vibrate(10);

    const close = () => {
      backdrop.classList.add('out');
      setTimeout(() => backdrop.remove(), 160);
    };
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.num-popup-close').addEventListener('click', close);
  }
  return { show };
})();

/* ---------------------------------------------------------------------- */
/* Toast                                                                    */
/* ---------------------------------------------------------------------- */

const Toast = (() => {
  let stack = null;

  function ensureStack() {
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  function show(message, opts = {}) {
    const { type = 'default', duration = 2200 } = opts;
    const el = document.createElement('div');
    el.className = `toast${type !== 'default' ? ` toast--${type}` : ''}`;
    el.textContent = message;
    ensureStack().appendChild(el);

    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
  }

  return {
    show,
    success: (msg, opts) => show(msg, { ...opts, type: 'success' }),
    error: (msg, opts) => show(msg, { ...opts, type: 'danger' }),
  };
})();
window.Toast = Toast;

/* ---------------------------------------------------------------------- */
/* Sheet — draggable bottom sheet used for forms, product detail, etc.     */
/* ---------------------------------------------------------------------- */

const Sheet = (() => {
  let backdropEl = null;
  let sheetEl = null;
  let onCloseCb = null;

  function open({ title, bodyHTML, footerHTML = '', onClose = null }) {
    close(true); // close any existing sheet instantly first

    onCloseCb = onClose;

    backdropEl = document.createElement('div');
    backdropEl.className = 'sheet-backdrop';

    sheetEl = document.createElement('div');
    sheetEl.className = 'sheet';
    sheetEl.innerHTML = `
      <div class="sheet__handle"></div>
      <div class="sheet__header">
        <div class="sheet__title">${title}</div>
        <button class="icon-btn tappable" id="sheetCloseBtn">✕</button>
      </div>
      <div class="sheet__body">${bodyHTML}</div>
      ${footerHTML ? `<div class="sheet__footer">${footerHTML}</div>` : ''}
    `;

    document.body.appendChild(backdropEl);
    document.body.appendChild(sheetEl);
    compactifyNumbers(sheetEl);

    requestAnimationFrame(() => {
      backdropEl.classList.add('open');
      sheetEl.classList.add('open');
    });

    backdropEl.addEventListener('click', () => close());
    sheetEl.querySelector('#sheetCloseBtn').addEventListener('click', () => close());

    attachDragToDismiss(sheetEl);

    return sheetEl;
  }

  function attachDragToDismiss(el) {
    const handle = el.querySelector('.sheet__handle');
    const header = el.querySelector('.sheet__header');
    let startY = 0, currentY = 0, dragging = false;

    function onStart(e) {
      // Only start a drag from the handle/header, or when the body is
      // already scrolled to the top (so it doesn't fight normal scrolling).
      const body = el.querySelector('.sheet__body');
      const fromHandleArea = e.target === handle || header.contains(e.target);
      if (!fromHandleArea && body.scrollTop > 0) return;
      dragging = true;
      startY = (e.touches ? e.touches[0].clientY : e.clientY);
      el.classList.add('dragging');
    }
    function onMove(e) {
      if (!dragging) return;
      currentY = (e.touches ? e.touches[0].clientY : e.clientY) - startY;
      if (currentY < 0) currentY = 0;
      el.style.transform = `translateY(${currentY}px)`;
    }
    function onEnd() {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      if (currentY > 110) {
        close();
      } else {
        el.style.transform = '';
      }
      currentY = 0;
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    handle.addEventListener('mousedown', onStart);
    header.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  }

  function close(instant = false) {
    if (!sheetEl) return;
    const cb = onCloseCb;
    onCloseCb = null;

    if (instant) {
      sheetEl.remove();
      backdropEl.remove();
      sheetEl = null;
      backdropEl = null;
      return;
    }

    sheetEl.classList.remove('open');
    backdropEl.classList.remove('open');
    const s = sheetEl, b = backdropEl;
    sheetEl = null;
    backdropEl = null;
    setTimeout(() => { s.remove(); b.remove(); }, 260);
    if (cb) cb();
  }

  return { open, close, get el() { return sheetEl; } };
})();
window.Sheet = Sheet;

/* ---------------------------------------------------------------------- */
/* Swipe-to-reveal for list rows (edit / delete actions)                   */
/* Wrap a .list-row in the markup returned by swipeRowHTML(), then call    */
/* enableSwipeRows(container) once after inserting it into the DOM.        */
/* ---------------------------------------------------------------------- */

function swipeRowHTML(innerRowHTML, { editable = true, deletable = true, id } = {}) {
  return `
    <div class="swipe-row" data-swipe-id="${id}">
      <div class="swipe-row__actions">
        ${editable ? `<button class="swipe-row__action swipe-row__action--edit" data-swipe-edit="${id}"><span>✏️</span>Edit</button>` : ''}
        ${deletable ? `<button class="swipe-row__action swipe-row__action--delete" data-swipe-delete="${id}"><span>🗑️</span>Delete</button>` : ''}
      </div>
      <div class="swipe-row__content">${innerRowHTML}</div>
    </div>`;
}

function enableSwipeRows(container, { onEdit, onDelete } = {}) {
  container.querySelectorAll('.swipe-row').forEach((row) => {
    const content = row.querySelector('.swipe-row__content');
    const actions = row.querySelector('.swipe-row__actions');
    const actionsWidth = actions.offsetWidth || 64 * actions.children.length;
    let startX = 0, startY = 0, dx = 0, dragging = false, decided = false, isHorizontal = false;
    let open = false;

    function onStart(e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0; decided = false; isHorizontal = false;
      content.classList.add('dragging');
    }
    function onMove(e) {
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const deltaX = x - startX;
      const deltaY = y - startY;

      if (!decided) {
        if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
          decided = true;
          isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
          dragging = isHorizontal;
        }
      }
      if (!dragging) return;

      e.preventDefault();
      let base = open ? -actionsWidth : 0;
      dx = base + deltaX;
      dx = Math.max(-actionsWidth - 12, Math.min(0, dx));
      content.style.transform = `translateX(${dx}px)`;
    }
    function onEnd() {
      content.classList.remove('dragging');
      content.classList.add('settling');
      if (dragging) {
        open = dx < -actionsWidth / 2;
        content.style.transform = open ? `translateX(-${actionsWidth}px)` : 'translateX(0)';
      }
      dragging = false;
      setTimeout(() => content.classList.remove('settling'), 240);
    }

    content.addEventListener('touchstart', onStart, { passive: true });
    content.addEventListener('touchmove', onMove, { passive: false });
    content.addEventListener('touchend', onEnd);

    // Tapping the content while actions are open just closes it again.
    content.addEventListener('click', (e) => {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        open = false;
        content.classList.add('settling');
        content.style.transform = 'translateX(0)';
        setTimeout(() => content.classList.remove('settling'), 240);
      }
    }, true);
  });

  if (onEdit) {
    container.querySelectorAll('[data-swipe-edit]').forEach((btn) => {
      btn.addEventListener('click', () => onEdit(btn.dataset.swipeEdit));
    });
  }
  if (onDelete) {
    container.querySelectorAll('[data-swipe-delete]').forEach((btn) => {
      btn.addEventListener('click', () => onDelete(btn.dataset.swipeDelete));
    });
  }
}
window.swipeRowHTML = swipeRowHTML;
window.enableSwipeRows = enableSwipeRows;

/* ---------------------------------------------------------------------- */
/* Printing — routes receipt HTML through the top-level #printArea so the  */
/* browser's print pagination isn't fighting a Sheet's own positioning.    */
/* ---------------------------------------------------------------------- */

/** A brief full-screen checkmark confirmation — used after completing a
 * sale, where a toast alone under-communicates "this money is now
 * recorded." Resolves once the animation finishes so callers can chain
 * into it (e.g. opening the receipt right after). */
function showSuccessCheck(message = 'Sale Complete') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'success-check-overlay';
    overlay.innerHTML = `
      <div class="success-check-circle">
        <svg viewBox="0 0 52 52" width="64" height="64">
          <circle class="success-check-ring" cx="26" cy="26" r="23" fill="none" stroke-width="3"/>
          <path class="success-check-mark" fill="none" stroke-width="4" d="M14 27l7 7 17-17"/>
        </svg>
      </div>
      <div class="success-check-label">${escapeHTML(message)}</div>
    `;
    document.body.appendChild(overlay);
    if (navigator.vibrate) navigator.vibrate(25);
    setTimeout(() => {
      overlay.classList.add('out');
      setTimeout(() => { overlay.remove(); resolve(); }, 200);
    }, 900);
  });
}
window.showSuccessCheck = showSuccessCheck;

function printReceiptHTML(html) {
  const area = document.getElementById('printArea');
  if (area) area.innerHTML = html;

  const cap = window.Capacitor;
  const isNative = cap && cap.isNativePlatform && cap.isNativePlatform();

  if (!isNative) {
    // Real browser tab — the actual print dialog works here.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    return;
  }

  // Inside the app, window.print() doesn't exist, and the custom native
  // print plugin isn't reliably registering (still investigating why —
  // see Diagnostics). Rather than leave printing broken while that's
  // unresolved, route it through the Share plugin instead, which IS
  // confirmed working: a plain-text version of the receipt goes to
  // Android's share sheet, where Print is one of the standard options
  // (along with saving as PDF, sending to a printer app, etc.).
  const textVersion = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(div|p|tr)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

  shareText({ title: 'Receipt', text: textVersion }).then((shared) => {
    if (shared) Toast.show('Choose "Print" from the share menu if your device offers it');
  });
}
window.printReceiptHTML = printReceiptHTML;

/* ---------------------------------------------------------------------- */
/* Sharing — navigator.share() doesn't work inside Capacitor's WebView    */
/* (only real Chrome tabs implement it), so this routes through the       */
/* native @capacitor/share plugin when running in the app.                */
/* ---------------------------------------------------------------------- */

async function shareText({ title, text }) {
  const cap = window.Capacitor;
  if (!cap) {
    Toast.error('Diagnostic: window.Capacitor is missing entirely');
    return false;
  }
  const isNative = cap.isNativePlatform && cap.isNativePlatform();
  if (isNative) {
    if (!cap.Plugins || !cap.Plugins.Share) {
      Toast.error('Diagnostic: Share plugin not registered');
      return false;
    }
    try {
      await cap.Plugins.Share.share({ title, text, dialogTitle: title });
      return true;
    } catch (e) {
      const msg = (e && e.message) || String(e);
      Toast.error(`Share failed: ${msg}`);
      return false;
    }
  }
  if (navigator.share) {
    try { await navigator.share({ title, text }); return true; }
    catch (e) { return false; }
  }
  Toast.error('Diagnostic: not native and no navigator.share available');
  return false;
}
window.shareText = shareText;

/* Opens a URL in the system browser natively (external links inside a
   Capacitor WebView would otherwise just navigate the app itself away
   from the app, or silently fail depending on the WebView build). */
async function openExternal(url) {
  const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
    try { await window.Capacitor.Plugins.Browser.open({ url }); return; }
    catch (e) { console.warn('Native browser open failed:', e); }
  }
  window.open(url, '_blank');
}
window.openExternal = openExternal;

/* Copies text to the clipboard with a legacy execCommand fallback for
   WebView builds where the async Clipboard API misbehaves. */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch (e2) {
      return false;
    }
  }
}
window.copyToClipboard = copyToClipboard;

/* Bump this alongside versionName/versionCode in android/app/build.gradle
   every time a new build goes out — there's no native "build date" field
   to read this from automatically, so it's tracked by hand here. */
const APP_BUILD_DATE = '2026-08-30';
window.APP_BUILD_DATE = APP_BUILD_DATE;

/* Real installed app version, read from the native package itself via
   @capacitor/app — not a hand-maintained JS string that can drift out of
   sync with what's actually in build.gradle. Falls back to a fixed label
   when running as a plain web page (no native package to ask). */
async function getAppVersionLabel() {
  const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    try {
      const info = await window.Capacitor.Plugins.App.getInfo();
      return `v${info.version} (build ${info.build}) · ${APP_BUILD_DATE}`;
    } catch (e) {
      console.warn('Could not read native app info:', e);
    }
  }
  return `Web version · ${APP_BUILD_DATE}`;
}
window.getAppVersionLabel = getAppVersionLabel;

/* ---------------------------------------------------------------------- */
/* Cart badge on the POS nav icon                                          */
/* ---------------------------------------------------------------------- */

function updateCartBadge(count) {
  const badge = document.getElementById('cartBadge');
  const fab = document.querySelector('.nav-item--fab');
  if (!badge || !fab) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.add('show');
    fab.classList.add('has-items');
  } else {
    badge.classList.remove('show');
    fab.classList.remove('has-items');
  }
}
window.updateCartBadge = updateCartBadge;

/* ---------------------------------------------------------------------- */
/* Navigation gesture: horizontal swipe between top-level tabs             */
/* ---------------------------------------------------------------------- */

function initTabSwipeGesture() {
  const view = document.getElementById('view');
  const tabOrder = ['dashboard', 'products', 'pos', 'sales', 'more'];
  const EDGE = 28; // px from either screen edge that always starts a tab-swipe,
                    // even over a swipe-row or chip-row — otherwise a screen
                    // whose content is mostly swipe-rows (e.g. Products) would
                    // have nowhere "safe" left to swipe from.
  let startX = 0, startY = 0, dx = 0, dy = 0, tracking = false, decided = false, horizontal = false, fromEdge = false;

  const blockedTarget = (target) =>
    target.closest('.swipe-row, .chip-row, input, textarea, select, .search-bar, .scanner-overlay');

  view.addEventListener('touchstart', (e) => {
    if (Sheet.el || document.querySelector('.scanner-overlay')) return;
    const x = e.touches[0].clientX;
    fromEdge = x < EDGE || x > window.innerWidth - EDGE;
    if (!fromEdge && blockedTarget(e.target)) return;
    startX = x;
    startY = e.touches[0].clientY;
    dx = 0; dy = 0; decided = false; horizontal = false; tracking = true;
  }, { passive: true });

  view.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    dx = e.touches[0].clientX - startX;
    dy = e.touches[0].clientY - startY;

    if (!decided) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        decided = true;
        horizontal = fromEdge || Math.abs(dx) > Math.abs(dy) * 1.3;
        if (horizontal) {
          view.classList.add('swipe-tracking');
          // The dozens of blurred glass cards on screen are expensive to
          // recomposite every frame while the whole view translates —
          // dropping backdrop-filter for the duration of the drag is what
          // keeps this at 60fps; it snaps back the instant the finger lifts,
          // which reads as instantaneous since it happens mid-motion.
          document.body.classList.add('swipe-active');
        }
      }
    }
    if (!horizontal) return;

    // Direct 1:1 tracking every frame — the view moves exactly with the
    // finger, not after it. translate3d promotes this to its own GPU layer.
    const idx = tabOrder.indexOf(Router.current);
    if (idx === -1) { tracking = false; return; }
    const atStart = idx === 0 && dx > 0;
    const atEnd = idx === tabOrder.length - 1 && dx < 0;
    const followDx = dx * (atStart || atEnd ? 0.25 : 1);
    view.style.transform = `translate3d(${followDx}px, 0, 0)`;
  }, { passive: true });

  view.addEventListener('touchend', () => {
    if (!tracking) return;
    tracking = false;
    view.classList.remove('swipe-tracking');

    if (!horizontal) { view.style.transform = ''; document.body.classList.remove('swipe-active'); return; }

    const idx = tabOrder.indexOf(Router.current);
    const passed = Math.abs(dx) > 68;
    const canAdvance = idx !== -1 && passed &&
      ((dx < 0 && idx < tabOrder.length - 1) || (dx > 0 && idx > 0));

    if (canAdvance) {
      const nextIdx = dx < 0 ? idx + 1 : idx - 1;
      const direction = dx < 0 ? 'left' : 'right';
      if (navigator.vibrate) navigator.vibrate(12);

      // Finish the motion from exactly where the finger left off — no
      // reset, no restart — straight on to fully off-screen, then hand off
      // to the router, which slides the incoming screen in from the
      // opposite edge at the same distance so the two halves read as one
      // continuous motion instead of a drag followed by a separate jump.
      const w = view.offsetWidth || window.innerWidth;
      view.style.transition = 'transform 150ms var(--ease-out)';
      view.style.transform = `translate3d(${dx < 0 ? -w : w}px, 0, 0)`;

      const proceed = () => {
        view.style.transition = '';
        view.style.transform = '';
        document.body.classList.remove('swipe-active');
        Router.goTo(tabOrder[nextIdx], { direction });
      };
      view.addEventListener('transitionend', proceed, { once: true });
      setTimeout(proceed, 170); // fallback in case transitionend never fires
    } else {
      view.style.transition = 'transform var(--dur-fast) var(--ease-spring)';
      view.style.transform = 'translate3d(0, 0, 0)';
      setTimeout(() => {
        view.style.transition = '';
        document.body.classList.remove('swipe-active');
      }, 200);
    }
    horizontal = false;
  });
}

/* ---------------------------------------------------------------------- */
/* Navigation gesture: pull-to-refresh                                     */
/* ---------------------------------------------------------------------- */

function initPullToRefresh() {
  const view = document.getElementById('view');
  const indicator = document.createElement('div');
  indicator.className = 'ptr-indicator';
  indicator.innerHTML = `<div class="ptr-indicator__spinner" id="ptrSpinner">⟳</div>`;
  document.body.appendChild(indicator);
  const spinner = indicator.querySelector('#ptrSpinner');

  // #view is now the app's own scroll container (overflow-y:auto — see
  // style.css), so its real scroll position lives on view.scrollTop
  // directly. This used to read window/document scroll instead, back
  // when the whole document scrolled; that's no longer the case.
  const pageScrollTop = () => view.scrollTop || 0;

  let startY = 0, dy = 0, tracking = false, armed = false;

  view.addEventListener('touchstart', (e) => {
    if (Sheet.el || document.querySelector('.scanner-overlay')) return;
    if (e.target.closest('.swipe-row, input, textarea, select')) return;
    if (pageScrollTop() > 0) return;
    startY = e.touches[0].clientY;
    dy = 0; tracking = true; armed = false;
  }, { passive: true });

  view.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    dy = e.touches[0].clientY - startY;
    if (dy > 0 && pageScrollTop() <= 0) {
      const pulled = Math.min(dy * 0.5, 74);
      spinner.style.opacity = String(Math.min(1, pulled / 30));
      spinner.style.transform = `translateY(${pulled - 50}px) rotate(${pulled * 4}deg)`;
      armed = pulled > 54;
    } else if (dy <= 0) {
      // The finger moved back up past the start point (or the page
      // itself started scrolling) — snap the indicator fully away rather
      // than leaving it part-visible.
      spinner.style.opacity = '0';
      spinner.style.transform = 'translateY(-50px)';
      armed = false;
    }
  }, { passive: true });

  view.addEventListener('touchend', async () => {
    if (!tracking) return;
    tracking = false;
    if (armed) {
      if (navigator.vibrate) navigator.vibrate(15);
      spinner.classList.add('spin');
      spinner.style.opacity = '1';
      spinner.style.transform = 'translateY(6px)';
      await Router.refresh();
      await new Promise((r) => setTimeout(r, 280));
      spinner.classList.remove('spin');
      Toast.show('Refreshed');
    }
    spinner.style.opacity = '0';
    spinner.style.transform = 'translateY(-50px)';
    armed = false;
  });

  // Safety net: if a touch gets interrupted (a call comes in, the browser
  // cancels the gesture, the app loses focus mid-drag) there's no
  // touchend to hide the spinner — touchcancel covers that gap.
  view.addEventListener('touchcancel', () => {
    tracking = false;
    armed = false;
    spinner.classList.remove('spin');
    spinner.style.opacity = '0';
    spinner.style.transform = 'translateY(-50px)';
  });
}

/* ---------------------------------------------------------------------- */
/* Theming                                                                 */
/* ---------------------------------------------------------------------- */

async function applyTheme() {
  const appearance = await Settings.get('appearance');
  let theme = appearance.theme;
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.setProperty('--accent', appearance.accentColor);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#12161A';
  }
}

/* ---------------------------------------------------------------------- */
/* Formatting helpers shared across every module                          */
/* ---------------------------------------------------------------------- */

const Fmt = {
  _currency: 'DZD',

  async init() {
    const store = await Settings.get('store');
    Fmt._currency = store.currency || 'DZD';
  },

  money(amount) {
    const n = Number(amount) || 0;
    const formatted = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return `${formatted} ${Fmt._currency}`;
  },

  /* Compact form of a plain number: 10,000+ -> "10k", 1,000,000+ -> "1.2M".
     Numbers below 10,000 are left as full, normally-formatted numbers —
     abbreviating e.g. "8,500" as "8.5k" saves almost no space and just
     costs clarity, so the shortening only kicks in once it actually
     starts to matter for layout. */
  compactNumber(amount) {
    const n = Number(amount) || 0;
    const abs = Math.abs(n);
    const trim = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ''));
    if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
    if (abs >= 10_000) return `${trim(n / 1_000)}k`;
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  },

  /* Compact money: same shortening as compactNumber, with the currency
     code appended — used anywhere a running total could grow large
     over time (inventory value, revenue, totals) but NOT for exact
     transactional amounts like a POS charge/change, which always need
     full precision on screen. */
  moneyCompact(amount) {
    return `${Fmt.compactNumber(amount)} ${Fmt._currency}`;
  },

  date(d) {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  },

  time(d) {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  },

  dateTime(d) {
    return `${Fmt.date(d)} · ${Fmt.time(d)}`;
  },

  startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  },
};

/* ---------------------------------------------------------------------- */
/* Dashboard view                                                          */
/* ---------------------------------------------------------------------- */

async function renderDashboard(container) {
  const [products, sales, store] = await Promise.all([
    DB.getAll('products'),
    DB.getAll('sales'),
    Settings.get('store'),
  ]);

  const titleEl = document.getElementById('topbarTitle');
  titleEl.innerHTML = `
    ${store.logo ? `<img src="${store.logo}" alt="" style="width:24px;height:24px;border-radius:7px;object-fit:cover;vertical-align:-6px;margin-right:7px;">` : ''}${escapeHTML(store.name || 'My Store')}
    <small id="topbarSubtitle">Dashboard</small>
  `;

  const todayStart = Fmt.startOfToday().getTime();
  const todaysSales = sales.filter((s) => new Date(s.date).getTime() >= todayStart);

  const todaysRevenue = todaysSales.reduce((sum, s) => sum + saleNetTotal(s), 0);
  const transactionCount = todaysSales.filter((s) => s.status !== 'refunded').length;
  const productCount = products.length;

  const lowStock = products.filter((p) => p.quantity <= (p.minStock ?? 0));
  const inventoryValue = products.reduce((sum, p) => sum + (p.quantity || 0) * (p.purchasePrice || 0), 0);

  const recentSales = [...sales]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  container.innerHTML = `
    <div class="section-title">Today</div>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card__label">Sales</div>
        <div class="stat-card__value num">${transactionCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Revenue</div>
        <div class="stat-card__value accent num">${Fmt.money(todaysRevenue)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Products</div>
        <div class="stat-card__value num">${productCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Inventory Value</div>
        <div class="stat-card__value teal num">${Fmt.money(inventoryValue)}</div>
      </div>
    </div>

    ${lowStock.length ? `
      <div class="section-title">Low Stock</div>
      <div class="list stagger">
        ${lowStock.slice(0, 5).map((p) => `
          <div class="list-row">
            <div class="list-row__icon">⚠️</div>
            <div class="list-row__body">
              <div class="list-row__title">${escapeHTML(p.name)}</div>
              <div class="list-row__subtitle">Minimum: ${p.minStock ?? 0}</div>
            </div>
            <div class="list-row__trailing">
              <span class="badge badge--danger">${p.quantity} left</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="section-title">Quick Actions</div>
    <div class="quick-actions">
      ${quickAction('scanner', '📷', 'Scan')}
      ${quickAction('pos', '🧾', 'New Sale')}
      ${quickAction('products/new', '➕', 'Add Product')}
      ${quickAction('products', '📦', 'Products')}
      ${quickAction('inventory', '📊', 'Inventory')}
      ${quickAction('sales', '🧮', 'Sales History')}
      ${quickAction('customers', '👤', 'Customers')}
      ${quickAction('reports', '📈', 'Reports')}
    </div>

    <div class="section-title">Recent Sales</div>
    ${recentSales.length ? `
      <div class="list stagger">
        ${recentSales.map((s) => `
          <div class="list-row">
            <div class="list-row__icon">🧾</div>
            <div class="list-row__body">
              <div class="list-row__title">${s.receiptNumber}</div>
              <div class="list-row__subtitle">${Fmt.dateTime(s.date)} · ${s.paymentMethod}</div>
            </div>
            <div class="list-row__trailing">
              <div class="list-row__amount num">${Fmt.money(s.total)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-state__icon">🧾</div>
        <div class="empty-state__title">No sales yet</div>
        <div class="empty-state__hint">Sales will show up here as soon as you make one.</div>
      </div>
    `}
  `;
}

function quickAction(route, icon, label) {
  return `
    <a class="quick-action" href="#${route}">
      <span class="quick-action__icon">${icon}</span>
      <span>${label}</span>
    </a>`;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/* A sale's actual net revenue after any item-level returns are
   subtracted — used everywhere revenue is totaled instead of raw
   `sale.total`, so a partially-returned sale doesn't overstate income. */
function saleNetTotal(sale) {
  return (sale.total || 0) - (sale.totalRefunded || 0);
}
window.saleNetTotal = saleNetTotal;

/* ---------------------------------------------------------------------- */
/* More menu                                                                */
/* ---------------------------------------------------------------------- */

function renderMore(container) {
  const items = [
    ['inventory', '📊', 'Inventory', 'Stock levels & adjustments'],
    ['reports', '📈', 'Reports & Statistics', 'Revenue, best sellers, profit'],
    ['customers', '👤', 'Customers', 'Customer directory & purchase history'],
    ['suppliers', '🚚', 'Suppliers', 'Supplier directory'],
    ['backup', '💾', 'Backup & Restore', 'Export/import your data'],
    ['settings', '⚙️', 'Settings', 'Store, appearance, POS, security'],
  ];
  container.innerHTML = `
    <div class="list stagger">
      <div class="list-row tappable" id="aboutAppRow">
        <div class="list-row__icon"><img src="img/profile.jpg" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover;" onerror="this.replaceWith('ℹ️'); Toast.error('Diagnostic: img/profile.jpg failed to load');"></div>
        <div class="list-row__body">
          <div class="list-row__title">About This App</div>
          <div class="list-row__subtitle">Credits, contact & support</div>
        </div>
        <div class="list-row__trailing text-faint">›</div>
      </div>
      ${items.map(([route, icon, title, subtitle]) => `
        <a class="list-row tappable" href="#${route}">
          <div class="list-row__icon">${icon}</div>
          <div class="list-row__body">
            <div class="list-row__title">${title}</div>
            <div class="list-row__subtitle">${subtitle}</div>
          </div>
          <div class="list-row__trailing text-faint">›</div>
        </a>
      `).join('')}
    </div>
    <div class="text-faint text-sm" style="text-align:center; margin-top:20px;" id="moreVersionFooter">Better Store</div>
  `;
  container.querySelector('#aboutAppRow').addEventListener('click', openAboutSheet);
  getAppVersionLabel().then((label) => {
    const el = container.querySelector('#moreVersionFooter');
    if (el) el.textContent = `Better Store · ${label}`;
  });
}

function aboutCopyRow(label, value) {
  return `
    <div class="list-row tappable" data-copy-value="${escapeHTML(value)}" style="margin-bottom:8px;">
      <div class="list-row__body">
        <div class="list-row__title">${escapeHTML(label)}</div>
        <div class="list-row__subtitle num num-id">${escapeHTML(value)}</div>
      </div>
      <div class="list-row__trailing text-faint">📋</div>
    </div>
  `;
}

function openAboutSheet() {
  const bodyHTML = `
    <div style="text-align:center; padding: 8px 0 24px;">
      <img src="img/profile.jpg" alt="" style="width:104px; height:104px; border-radius:50%; object-fit:cover; border:2px solid var(--border);" onerror="this.style.display='none'; Toast.error('Diagnostic: img/profile.jpg failed to load');">
      <div style="font-weight:700; font-size:18px; margin-top:16px;">Better Store</div>
      <div class="text-dim text-sm" style="margin-top:8px;">Made by <a href="#" id="aboutOwnerLink" style="color:var(--accent);">@rwgmo</a> on Telegram</div>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <div class="text-sm" style="line-height:1.6;">
        © All rights reserved. This app may not be resold or redistributed.
        Use is permitted only for parties explicitly approved by the owner.
      </div>
    </div>

    <div class="section-title" style="margin-bottom:12px;">Contact & Shop</div>
    <a class="list-row tappable" id="aboutTelegramLink" href="#" style="margin-bottom:8px;">
      <div class="list-row__icon">💬</div>
      <div class="list-row__body"><div class="list-row__title">Telegram</div><div class="list-row__subtitle">t.me/rwgmo</div></div>
      <div class="list-row__trailing text-faint">›</div>
    </a>
    <a class="list-row tappable" id="aboutShopLink" href="#" style="margin-bottom:24px;">
      <div class="list-row__icon">🛍️</div>
      <div class="list-row__body"><div class="list-row__title">Telegram Shop</div><div class="list-row__subtitle">t.me/RwmShop</div></div>
      <div class="list-row__trailing text-faint">›</div>
    </a>

    <div class="card" style="margin-bottom:24px;">
      <div class="text-sm" style="line-height:1.6;">Open for app development and custom projects at affordable rates — reach out on Telegram.</div>
    </div>

    <div class="section-title" style="margin-bottom:12px;">Support / Donate</div>
    <div class="list" id="aboutDonateList" style="margin-bottom:8px;">
      ${aboutCopyRow('CCP Account', '007 99999 0042725714 28')}
      ${aboutCopyRow('Binance ID', '814491654')}
    </div>

    <div class="section-title" style="margin-bottom:12px;">Troubleshooting</div>
    <div class="list-row tappable" id="aboutDiagnosticsRow" style="margin-bottom:24px;">
      <div class="list-row__icon">🩺</div>
      <div class="list-row__body">
        <div class="list-row__title">Run Diagnostics</div>
        <div class="list-row__subtitle">Check native features are working</div>
      </div>
      <div class="list-row__trailing text-faint">›</div>
    </div>

    <div class="text-faint text-sm" style="text-align:center; margin-top:28px;" id="aboutVersionFooter">Better Store</div>
  `;

  const sheetEl = Sheet.open({ title: 'About This App', bodyHTML });
  sheetEl.querySelector('#aboutDiagnosticsRow').addEventListener('click', showDiagnostics);
  getAppVersionLabel().then((label) => {
    const el = sheetEl.querySelector('#aboutVersionFooter');
    if (el) el.textContent = `Better Store · ${label}`;
  });

  const goTelegram = () => openExternal('https://t.me/rwgmo');
  sheetEl.querySelector('#aboutOwnerLink').addEventListener('click', (e) => { e.preventDefault(); goTelegram(); });
  sheetEl.querySelector('#aboutTelegramLink').addEventListener('click', (e) => { e.preventDefault(); goTelegram(); });
  sheetEl.querySelector('#aboutShopLink').addEventListener('click', (e) => { e.preventDefault(); openExternal('https://t.me/RwmShop'); });

  sheetEl.querySelectorAll('[data-copy-value]').forEach((row) => {
    row.addEventListener('click', async () => {
      const ok = await copyToClipboard(row.dataset.copyValue);
      Toast.show(ok ? 'Copied' : 'Couldn\u2019t copy \u2014 long-press to select manually');
    });
  });
}

/* Dumps the exact state of the native bridge and each plugin this app
   relies on (Share, Filesystem, Print, Biometric) straight into a popup.
   Point of this: when a native feature silently does nothing, there's no
   way to see why without a PC/chrome://inspect — this makes the failure
   visible on the phone itself, in one tap. */
async function showDiagnostics() {
  const lines = [];
  const cap = window.Capacitor;
  lines.push(`Capacitor bridge: ${cap ? 'present' : 'MISSING'}`);
  if (cap) {
    lines.push(`Platform: ${cap.getPlatform ? cap.getPlatform() : 'unknown'}`);
    lines.push(`isNativePlatform(): ${cap.isNativePlatform ? cap.isNativePlatform() : 'no such method'}`);
    const plugins = cap.Plugins || {};
    lines.push(`Plugins.Share: ${plugins.Share ? 'yes' : 'MISSING'}`);
    lines.push(`Plugins.Filesystem: ${plugins.Filesystem ? 'yes' : 'MISSING'}`);
    lines.push(`Plugins.NativePrint: ${plugins.NativePrint ? 'yes' : 'MISSING'}`);
    lines.push(`Plugins.BiometricAuth: ${plugins.BiometricAuth ? 'yes' : 'MISSING'}`);
    lines.push(`Plugins.App: ${plugins.App ? 'yes' : 'MISSING'}`);
    lines.push(`Plugins.Browser: ${plugins.Browser ? 'yes' : 'MISSING'}`);
  }
  NumberPopup.show(lines.join('\n'), { small: true });
}
window.showDiagnostics = showDiagnostics;

/* ---------------------------------------------------------------------- */
/* Boot                                                                     */
/* ---------------------------------------------------------------------- */

(async function boot() {
  await DB.openDB();
  await applyTheme();
  await Fmt.init();

  // Reflect the store's own logo in the browser tab / "add to home screen"
  // icon prompt where the platform allows updating it after page load.
  // (Once a PWA is actually installed, its home-screen icon is fixed from
  // manifest.json at install time — this can't retroactively change an
  // already-installed icon, only the in-browser tab/install-prompt icon.)
  const store = await Settings.get('store');
  if (store.logo) {
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
      link.href = store.logo;
    });
  }

  if (window.Security) await Security.checkLock();

  Router.register('dashboard', renderDashboard);
  Router.register('more', renderMore);

  Router.init();
  initTabSwipeGesture();
  initPullToRefresh();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Show "connect to internet" banner until the service worker has
      // fully taken control of this page (i.e. first-time offline cache
      // is complete). Never shows again after that, on this device.
      if (!navigator.serviceWorker.controller) {
        showFirstRunBanner();
      }

      navigator.serviceWorker.register('service-worker.js').then(() => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          hideFirstRunBanner();
        });
      }).catch((err) => {
        console.warn('Service worker registration failed:', err);
        showFirstRunBanner('offline-setup-failed');
      });
    });
  }

  function showFirstRunBanner(mode) {
    if (document.getElementById('first-run-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'first-run-banner';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;' +
      'background:#c0392b;color:#fff;padding:10px 16px;font-size:13px;' +
      'text-align:center;font-family:sans-serif;';
    bar.textContent = mode === 'offline-setup-failed'
      ? 'Setup failed — please connect to the internet and reopen the app once.'
      : 'First time setup: please stay connected to the internet until this message disappears.';
    document.body.appendChild(bar);
  }

  function hideFirstRunBanner() {
    const bar = document.getElementById('first-run-banner');
    if (bar) bar.remove();
  }
})();
