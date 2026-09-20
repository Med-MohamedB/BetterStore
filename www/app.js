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

/** Loads an external script on first call and caches the promise so a
 *  second call for the same src reuses it instead of re-injecting a tag.
 *  Used to keep heavy, occasionally-needed vendor libs (jsPDF, ZXing —
 *  744KB combined) OUT of the eager boot path: every one of the 24
 *  <script> tags in index.html has to be fetched through Capacitor's
 *  embedded local web server before boot() can run, which is real,
 *  measurable per-file overhead on a slow device, not a free local-disk
 *  read. Only downloading these two when the feature that needs them is
 *  actually used (PDF export, camera barcode scanning) cuts what every
 *  single launch has to load through by nearly half. */
const _loadedScripts = {};
function loadScriptOnce(src) {
  if (_loadedScripts[src]) return _loadedScripts[src];
  _loadedScripts[src] = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => { delete _loadedScripts[src]; reject(new Error('Failed to load ' + src)); };
    document.body.appendChild(el);
  });
  return _loadedScripts[src];
}
window.loadScriptOnce = loadScriptOnce;

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

    // A doodle hint is `position: fixed` on <body> so it can point at its
    // target from anywhere — which also means a normal screen re-render
    // never removes it on its own. Clear it on every navigation so it
    // can't linger into a tab it doesn't belong to; the new screen's own
    // render puts one back immediately if it's still relevant there.
    if (window.DoodleHint) DoodleHint.hideAll();

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

    // Business-data screens only — never on the app-management ones
    // (More/Settings/About), since a promo there would feel like it's
    // advertising the app to its own owner rather than helping them run
    // their shop.
    const SPOTLIGHT_ROUTES = ['dashboard', 'products', 'pos', 'sales', 'suppliers', 'inventory', 'customers', 'reports'];
    if (window.ShopPromo && SPOTLIGHT_ROUTES.includes(name)) {
      ShopPromo.mountTop(view);
    } else if (window.ShopPromo) {
      ShopPromo.hideEverywhere();
    }
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
        <div class="empty-state__icon">${Icon('settings', { size: 32 })}</div>
        <div class="empty-state__title">${label} is coming in a later build stage</div>
        <div class="empty-state__hint">The dashboard, navigation, and database are live now. This screen gets built next.</div>
      </div>`;
  }

  function errorHTML() {
    return `
      <div class="empty-state">
        <div class="empty-state__icon">${Icon('alert-triangle', { size: 32 })}</div>
        <div class="empty-state__title">Something went wrong loading this screen</div>
        <div class="empty-state__hint">Check the console for details.</div>
      </div>`;
  }

  function getScreenTitle(name) {
    const map = {
      dashboard: I18n.t('screenTitles.dashboard'),
      products: I18n.t('screenTitles.products'),
      pos: I18n.t('screenTitles.pos'),
      inventory: I18n.t('screenTitles.inventory'),
      more: I18n.t('screenTitles.more'),
      sales: I18n.t('screenTitles.sales'),
      reports: I18n.t('screenTitles.reports'),
      customers: I18n.t('screenTitles.customers'),
      suppliers: I18n.t('screenTitles.suppliers'),
      settings: I18n.t('screenTitles.settings'),
      backup: I18n.t('screenTitles.backup'),
      scanner: I18n.t('screenTitles.scanner'),
    };
    return map[name] || name;
  }

  function setTopbar(name) {
    const title = getScreenTitle(name);
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
        <button class="btn btn-secondary tappable num-popup-close">${I18n.t('common.close')}</button>
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
/* DoodleHint — a hand-drawn arrow + note pointing at one real element,    */
/* asking for one real action. Purely tied to the live state of the       */
/* screen that shows it: visible whenever that screen calls show() (i.e.  */
/* its list is empty), gone the moment that screen calls hide()/complete()*/
/* (i.e. something got added), and back again next time the list is      */
/* empty — no permanent "seen it once" dismissal. Because it's rendered   */
/* `position: fixed` on <body> (so it can point at a target no matter     */
/* where that target lives in the DOM), it does NOT get cleaned up by a   */
/* normal screen re-render — Router.renderCurrent calls hideAll() on      */
/* every navigation so a hint never lingers into a tab it doesn't belong  */
/* to. See the .doodle-hint rules in style.css for the visual.            */
/* ---------------------------------------------------------------------- */
const DoodleHint = (() => {
  const ARROW_SVG = `<svg class="doodle-hint__arrow" viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6c10 2 24 8 30 24 2 6 3 14 3 20" /><path d="M32 42c2 5 5 9 9 12" /><path d="M50 46c-3 4-6 8-9 12" /></svg>`;

  /**
   * Shows a doodle hint pointing at `targetEl` (any real element already
   * on screen — a topbar button, a FAB, anything). Position is computed
   * from the target's actual current bounding box, `fixed` to the
   * viewport, so it works no matter where that element physically lives
   * in the DOM (topbar, nav, inside a scrolled list, etc).
   * `corner` says which corner of the target the note sits at: 'tr' (note
   * above-left, arrow curves up-right into the target — for a target near
   * the top of the screen) or 'br' (note above-left, arrow curves down-
   * right — for a target lower down, like the reference screenshot).
   * No-ops silently if one with this id is already showing.
   */
  function show(id, targetEl, text, corner = 'br') {
    if (!id || !targetEl) return null;
    if (document.querySelector(`[data-hint-id="${id}"]`)) return null; // already showing
    const r = targetEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `doodle-hint doodle-hint--${corner}`;
    el.dataset.hintId = id;
    el.style.position = 'fixed';
    el.style.visibility = 'hidden'; // measured below before it's actually placed/shown
    // Targets this points at (FABs) sit at `inset-inline-end`, so they're
    // physically on the right in LTR but the LEFT in RTL — anchoring
    // always from the right edge (as this used to) put the note off-
    // screen to the left of an RTL target instead of hugging it. Anchor
    // from whichever physical edge the target is actually near: right
    // edge sits slightly PAST the target's right edge in LTR (arrow hugs
    // the note's right side, curving into the button); the mirror image
    // in RTL anchors the note's LEFT edge slightly past the target's left
    // edge instead (arrow hugs the note's left side — see the
    // [dir="rtl"] .doodle-hint__arrow rules in style.css for that half).
    const isRTL = document.documentElement.getAttribute('dir') === 'rtl';
    if (isRTL) {
      const leftPos = Math.max(8, r.left - 10);
      el.style.left = `${leftPos}px`;
    } else {
      const rightPos = Math.max(8, window.innerWidth - r.right - 10);
      el.style.right = `${rightPos}px`;
    }
    el.innerHTML = `<div class="doodle-hint__text">${escapeHTML(text)}</div>${ARROW_SVG}`;
    document.body.appendChild(el);
    const noteHeight = el.offsetHeight;

    if (corner === 'tr') {
      // Target is near the top of the screen — note sits below it, arrow
      // curves up into the target's bottom-left corner.
      el.style.top = `${r.bottom + 6}px`;
    } else {
      // Target is lower on screen — note sits above it, arrow curves down.
      // Ideal position points straight at the target, but the content
      // this hint accompanies (an empty-state's own illustration/title/
      // subtitle) can grow taller than usual — e.g. a promo banner
      // pushing everything down — and overlap it. `.empty-state__hint`
      // is that subtitle text; if it's on screen, never render above its
      // bottom edge, even if that means sitting a bit further from the
      // target than the "ideal" spot.
      const idealTop = r.top - 10 - noteHeight;
      const avoidEl = document.querySelector('.empty-state__hint');
      const minTop = avoidEl ? avoidEl.getBoundingClientRect().bottom + 14 : -Infinity;
      el.style.top = `${Math.max(idealTop, minTop)}px`;
    }
    el.style.visibility = '';
    return el;
  }

  /** Removes a hint by id, with a small fade. Call when the real thing it
   *  was pointing at happens (an item gets added) — it's free to show
   *  again later (e.g. that item gets removed and the list is empty
   *  again), it just isn't showing right now. */
  function hide(id) {
    document.querySelectorAll(`[data-hint-id="${id}"]`).forEach((el) => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 340);
    });
  }

  /** Removes every currently-visible hint instantly, no fade — used when
   *  navigating away from the screen that owns it, so a hint never shows
   *  on a tab it doesn't belong to. */
  function hideAll() {
    document.querySelectorAll('[data-hint-id]').forEach((el) => el.remove());
  }

  return { show, hide, complete: hide, hideAll };
})();
window.DoodleHint = DoodleHint;

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
        <button class="icon-btn tappable" id="sheetCloseBtn">${Icon('x')}</button>
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
      const rawY = (e.touches ? e.touches[0].clientY : e.clientY) - startY;
      if (rawY <= 0) {
        // Not a downward pull — this is the user trying to scroll the
        // body content instead. Bail out of the dismiss-gesture entirely
        // for this touch so native scrolling takes over uninterrupted.
        dragging = false;
        el.classList.remove('dragging');
        return;
      }
      if (e.cancelable) e.preventDefault();
      currentY = rawY;
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
    el.addEventListener('touchmove', onMove, { passive: false });
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
/* Confirm — a real themed confirmation dialog, Promise-based so call      */
/* sites read almost exactly like the native confirm() they replace:      */
/*   if (!(await Confirm.show('Delete this?', { danger: true }))) return; */
/* Replaces every window.confirm() in the app (delete/clear/refund/etc.)  */
/* — the native one is an unstyled OS popup that looks nothing like the   */
/* rest of the app and blocks the JS thread synchronously.                */
/* ---------------------------------------------------------------------- */
const Confirm = (() => {
  function show(message, { danger = false, confirmText, cancelText } = {}) {
    const cancelLabel = cancelText || I18n.t('common.cancel');
    const confirmLabel = confirmText || (danger ? I18n.t('common.delete') : I18n.t('common.confirm'));
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      document.body.appendChild(overlay);
      Fx.animate(overlay, { opacity: [0, 1] }, { duration: 0.15 });

      const card = document.createElement('div');
      card.className = `confirm-card${danger ? '' : ' confirm-card--positive'}`;
      card.innerHTML = `
        <div class="confirm-card__icon">${Icon(danger ? 'alert-triangle' : 'check-circle', { size: 26 })}</div>
        <div class="confirm-card__message">${escapeHTML(message)}</div>
        <div class="confirm-card__actions">
          <button class="btn btn-secondary tappable" id="confirmCancelBtn">${escapeHTML(cancelLabel)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} tappable" id="confirmOkBtn">${escapeHTML(confirmLabel)}</button>
        </div>
      `;
      overlay.appendChild(card);
      Fx.animate(card, { opacity: [0, 1], scale: [0.92, 1], y: [10, 0] }, { type: 'spring', stiffness: 420, damping: 22 });

      let done = false;
      const finish = (result) => {
        if (done) return; // backdrop click + button click can both fire on the same tap on some WebViews
        done = true;
        Fx.animate(overlay, { opacity: [1, 0] }, { duration: 0.15 }).finished.then(() => overlay.remove());
        resolve(result);
      };
      card.querySelector('#confirmCancelBtn').addEventListener('click', () => finish(false));
      card.querySelector('#confirmOkBtn').addEventListener('click', () => finish(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
    });
  }
  return { show };
})();
window.Confirm = Confirm;

/* ---------------------------------------------------------------------- */
/* Swipe-to-reveal for list rows (edit / delete actions)                   */
/* Wrap a .list-row in the markup returned by swipeRowHTML(), then call    */
/* enableSwipeRows(container) once after inserting it into the DOM.        */
/* ---------------------------------------------------------------------- */

function swipeRowHTML(innerRowHTML, { editable = true, deletable = true, id } = {}) {
  return `
    <div class="swipe-row" data-swipe-id="${id}">
      <div class="swipe-row__actions">
        ${editable ? `<button class="swipe-row__action swipe-row__action--edit" data-swipe-edit="${id}"><span>${Icon('edit', { size: 16 })}</span>${escapeHTML(I18n.t('common.edit'))}</button>` : ''}
        ${deletable ? `<button class="swipe-row__action swipe-row__action--delete" data-swipe-delete="${id}"><span>${Icon('trash', { size: 16 })}</span>${escapeHTML(I18n.t('common.delete'))}</button>` : ''}
      </div>
      <div class="swipe-row__content">${innerRowHTML}</div>
    </div>`;
}

// Shared with initTabSwipeGesture below: true while a list row's own
// swipe-to-reveal gesture has claimed the current touch as horizontal.
// Row touchmove listeners fire before the ancestor #view listener for
// the same event, so by the time the tab-swipe gesture checks this flag
// it reflects the current touch correctly.
let rowSwipeActive = false;

function enableSwipeRows(container, { onEdit, onDelete } = {}) {
  // The reveal-actions panel is anchored to a physical edge (see
  // .swipe-row__actions in style.css, mirrored there for [dir="rtl"]) —
  // in RTL it sits on the left and a rightward drag reveals it (the
  // "swipe toward reading-start" convention this app already uses for
  // the tab-swipe and the bottom nav), the mirror image of the LTR
  // left-swipe-reveals-right behavior.
  const isRTL = document.documentElement.getAttribute('dir') === 'rtl';
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
      rowSwipeActive = false;
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
          // Only actually claim the gesture if it's a direction that DOES
          // something for this row — toward-reveal, or the opposite way
          // to close an already-open one (mirrored in RTL — see isRTL
          // above). A drag that closes a closed row is a no-op below (dx
          // gets clamped to 0), so don't grab it just to do nothing with
          // it — leave it alone so it's free to become a tab-swipe
          // instead (that's the same gesture used to go back a tab, and
          // it should work even starting on a row).
          const relevant = isRTL ? (deltaX > 0 || (open && deltaX < 0)) : (deltaX < 0 || (open && deltaX > 0));
          dragging = isHorizontal && relevant;
          // Tell the tab-swipe gesture (bound on an ancestor, so it sees
          // this same touchmove after we do) whether this row is claiming
          // the horizontal drag for its own reveal-actions animation. If
          // it isn't, the tab gesture is free to decide for itself from
          // the same dx/dy — nothing changes for it.
          rowSwipeActive = dragging;
        }
      }
      if (!dragging) return;

      e.preventDefault();
      if (isRTL) {
        let base = open ? actionsWidth : 0;
        dx = base + deltaX;
        dx = Math.max(0, Math.min(actionsWidth + 12, dx));
      } else {
        let base = open ? -actionsWidth : 0;
        dx = base + deltaX;
        dx = Math.max(-actionsWidth - 12, Math.min(0, dx));
      }
      content.style.transform = `translateX(${dx}px)`;
    }
    function onEnd() {
      content.classList.remove('dragging');
      content.classList.add('settling');
      if (dragging) {
        open = isRTL ? dx > actionsWidth / 2 : dx < -actionsWidth / 2;
        const openTx = isRTL ? actionsWidth : -actionsWidth;
        content.style.transform = open ? `translateX(${openTx}px)` : 'translateX(0)';
      }
      dragging = false;
      rowSwipeActive = false;
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
/* Receipt — single source of truth for what a receipt looks like. Used   */
/* by both the POS post-sale screen and the Sales history detail sheet,   */
/* so the on-screen HTML, the shared plain-text, and the printed PDF can  */
/* never drift out of sync with each other or with the store's info.      */
/* ---------------------------------------------------------------------- */

/* ---------------------------------------------------------------------- */
/* Barcode128 — a real, scannable Code128 (Set B) barcode generator, used */
/* on receipts so a sale's receipt number can be scanned back up later    */
/* (see Sales' "Scan to Find" and the receiptNumber field in Ids.js).     */
/* Set B covers ASCII 32-126 — uppercase, digits, hyphens, everything     */
/* Ids.receiptNumber() actually produces — so there's no need for the     */
/* full auto-switching-between-sets complexity a general-purpose library  */
/* would have. The bar-pattern table below is copied verbatim from        */
/* JsBarcode's own constants.js (MIT-licensed, github.com/lindell/        */
/* JsBarcode) rather than transcribed from memory, and the output was     */
/* round-trip verified (encoded here, decoded with a real Code128 reader, */
/* got the exact input back) before shipping — a broken barcode is worse  */
/* than no barcode at all.                                                */
/* ---------------------------------------------------------------------- */
const Barcode128 = (() => {
  // Each entry is a symbol's bar/space pattern, written as a decimal
  // literal whose digits only ever happen to be 0/1 — .toString() on it
  // gives the pattern directly ('1' = one bar-width module, '0' = one
  // space-width module). Index 104 = START (Set B), 106 = STOP.
  const BARS = [
    11011001100, 11001101100, 11001100110, 10010011000, 10010001100,
    10001001100, 10011001000, 10011000100, 10001100100, 11001001000,
    11001000100, 11000100100, 10110011100, 10011011100, 10011001110,
    10111001100, 10011101100, 10011100110, 11001110010, 11001011100,
    11001001110, 11011100100, 11001110100, 11101101110, 11101001100,
    11100101100, 11100100110, 11101100100, 11100110100, 11100110010,
    11011011000, 11011000110, 11000110110, 10100011000, 10001011000,
    10001000110, 10110001000, 10001101000, 10001100010, 11010001000,
    11000101000, 11000100010, 10110111000, 10110001110, 10001101110,
    10111011000, 10111000110, 10001110110, 11101110110, 11010001110,
    11000101110, 11011101000, 11011100010, 11011101110, 11101011000,
    11101000110, 11100010110, 11101101000, 11101100010, 11100011010,
    11101111010, 11001000010, 11110001010, 10100110000, 10100001100,
    10010110000, 10010000110, 10000101100, 10000100110, 10110010000,
    10110000100, 10011010000, 10011000010, 10000110100, 10000110010,
    11000010010, 11001010000, 11110111010, 11000010100, 10001111010,
    10100111100, 10010111100, 10010011110, 10111100100, 10011110100,
    10011110010, 11110100100, 11110010100, 11110010010, 11011011110,
    11011110110, 11110110110, 10101111000, 10100011110, 10001011110,
    10111101000, 10111100010, 11110101000, 11110100010, 10111011110,
    10111101110, 11101011110, 11110101110, 11010000100, 11010010000,
    11010011100, 1100011101011,
  ];
  const START_B = 104;
  const STOP = 106;

  /** Encodes `text` into the full module pattern as a string of '1'/'0'
   *  characters. Returns null (never a malformed barcode) if `text` has
   *  a character outside ASCII 32-126. */
  function encode(text) {
    if (!/^[\x20-\x7E]+$/.test(text)) return null;
    const codes = [START_B];
    for (let i = 0; i < text.length; i++) codes.push(text.charCodeAt(i) - 32);
    let checksum = codes[0];
    for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
    codes.push(checksum % 103);
    codes.push(STOP);
    return codes.map((c) => BARS[c].toString()).join('');
  }

  /** Renders `text` as an inline SVG barcode (bars only — callers add
   *  their own human-readable text label below if wanted). Width scales
   *  with text length automatically via the viewBox. Returns '' rather
   *  than a broken-looking barcode if `text` can't be encoded. */
  function svg(text, { moduleWidth = 2, height = 50 } = {}) {
    const pattern = encode(text);
    if (!pattern) return '';
    let x = 0;
    let bars = '';
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === '1') bars += `<rect x="${x}" y="0" width="${moduleWidth}" height="${height}" />`;
      x += moduleWidth;
    }
    return `<svg viewBox="0 0 ${x} ${height}" width="100%" height="${height}px" preserveAspectRatio="none" fill="currentColor" style="display:block;">${bars}</svg>`;
  }

  /** Draws the same barcode directly onto a jsPDF document (mm units) at
   *  (x, y). Returns the total width drawn, so the caller can center
   *  it or place a label under it. */
  function drawOnPDF(doc, text, x, y, { moduleWidth = 0.32, height = 12 } = {}) {
    const pattern = encode(text);
    if (!pattern) return 0;
    let cx = x;
    doc.setFillColor(0, 0, 0);
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === '1') doc.rect(cx, y, moduleWidth, height, 'F');
      cx += moduleWidth;
    }
    return cx - x;
  }

  return { encode, svg, drawOnPDF };
})();
window.Barcode128 = Barcode128;

const Receipt = (() => {
  /* On-screen / on-paper HTML block, rendered inside a Sheet and also    */
  /* dropped into #printArea for the browser fallback print path. Column  */
  /* layout (Qty / Item / Price) with a scannable barcode at the bottom —  */
  /* see Barcode128 above and Sales' "Scan to Find" (looks a real sale    */
  /* back up by decoding this same receiptNumber).                        */
  function html(sale, store, lang) {
    const refunded = sale.status === 'refunded';
    const partial = sale.status === 'partially_refunded';
    const footerText = store.receiptFooter !== '' ? (store.receiptFooter || I18n.t('receipt.defaultFooter', null, lang)) : '';
    const itemCount = sale.items.reduce((s, it) => s + it.qty, 0);
    const barcodeSvg = Barcode128.svg(sale.receiptNumber, { moduleWidth: 1.6, height: 44 });
    const dashedRow = '<div style="border-top:1px dashed var(--border); margin:10px 0;"></div>';
    const dir = (I18n.LANGUAGES.find((l) => l.code === lang) || { dir: 'ltr' }).dir;

    return `
      <div class="receipt-print" dir="${dir}">
        <div style="text-align:center;">
          ${store.logo ? `<img src="${store.logo}" style="width:56px;height:56px;object-fit:cover;border-radius:12px;margin-bottom:8px;">` : ''}
          <div style="font-weight:700; font-size:16px; color:var(--accent);">${escapeHTML(store.name || I18n.t('dashboard.defaultStoreName', null, lang))}</div>
          ${store.address ? `<div class="text-dim text-sm">${escapeHTML(store.address)}</div>` : ''}
          ${store.phone ? `<div class="text-dim text-sm">${escapeHTML(store.phone)}</div>` : ''}
        </div>
        ${refunded ? `<div class="mt-8" style="text-align:center;"><span class="badge badge--danger">${I18n.t('receipt.refundedBadge', null, lang)}</span></div>`
          : partial ? `<div class="mt-8" style="text-align:center;"><span class="badge badge--danger">${I18n.t('receipt.partiallyRefundedBadge', null, lang)}</span></div>` : ''}
        ${dashedRow}
        <div class="flex-between text-sm text-dim" style="font-weight:700; text-transform:uppercase; letter-spacing:0.02em;">
          <span>${I18n.t('receipt.colQtyItem', null, lang)}</span><span>${I18n.t('receipt.colPrice', null, lang)}</span>
        </div>
        ${dashedRow}
        ${sale.items.map((it) => `
          <div class="flex-between text-sm" style="margin-bottom:3px;">
            <span>${it.qty}\u00d7&nbsp;&nbsp;${escapeHTML(it.name)}</span>
            <span class="num">${Fmt.money(it.price * it.qty)}</span>
          </div>
          ${it.discount ? `<div class="flex-between text-sm text-dim" style="margin-bottom:6px; margin-top:-2px;"><span>&nbsp;&nbsp;&nbsp;&nbsp;*** ${I18n.t('receipt.itemDiscountLabel', null, lang)}</span><span class="num">\u2212 ${Fmt.money(it.discount)}</span></div>` : ''}
        `).join('')}
        <div class="text-center text-dim text-sm mt-8" style="text-align:center;">${I18n.t('receipt.itemsSoldSuffix', { count: itemCount, plural: itemCount !== 1 ? 's' : '' }, lang)}</div>
        ${dashedRow}
        <div class="flex-between text-sm"><span class="text-dim">${I18n.t('receipt.subtotalLabel', null, lang)}</span><span class="num">${Fmt.money(sale.subtotal)}</span></div>
        ${sale.itemDiscounts ? `<div class="flex-between text-sm"><span class="text-dim">${I18n.t('receipt.itemDiscountsLabel', null, lang)}</span><span class="num">\u2212 ${Fmt.money(sale.itemDiscounts)}</span></div>` : ''}
        ${sale.discount ? `<div class="flex-between text-sm"><span class="text-dim">${I18n.t('receipt.orderDiscountLabel', null, lang)}</span><span class="num">\u2212 ${Fmt.money(sale.discount)}</span></div>` : ''}
        ${sale.tax ? `<div class="flex-between text-sm"><span class="text-dim">${I18n.t('receipt.taxLabel', null, lang)}</span><span class="num">${Fmt.money(sale.tax)}</span></div>` : ''}
        ${dashedRow}
        <div class="flex-between" style="font-weight:800; color:var(--accent); font-size:17px;"><span>${I18n.t('receipt.totalLabel', null, lang)}</span><span class="num">${Fmt.money(sale.total)}</span></div>
        <div class="flex-between text-sm mt-8"><span class="text-dim">${I18n.t('receipt.paymentLabel', null, lang)}</span><span>${escapeHTML(paymentMethodLabel(sale.paymentMethod, lang))}</span></div>
        ${sale.paymentMethod === 'cash' && sale.amountReceived != null ? `
          <div class="flex-between text-sm"><span class="text-dim">${I18n.t('receipt.tenderedLabel', null, lang)}</span><span class="num">${Fmt.money(sale.amountReceived)}</span></div>
          <div class="flex-between text-sm"><span class="text-dim">${I18n.t('receipt.changeLabel', null, lang)}</span><span class="num">${Fmt.money(sale.change)}</span></div>
        ` : ''}
        ${dashedRow}
        <div class="text-center" style="text-align:center; font-weight:700; letter-spacing:0.04em; margin-bottom:10px;">${I18n.t('receipt.thankYou', null, lang)}</div>
        ${barcodeSvg ? `<div style="color:var(--text); padding:0 8px;">${barcodeSvg}</div>` : ''}
        <div class="text-center text-dim text-sm" style="text-align:center; letter-spacing:0.08em; margin-top:4px;">${sale.receiptNumber}</div>
        ${footerText ? `<div class="text-center text-dim text-sm mt-16" style="text-align:center;">${escapeHTML(footerText)}</div>` : ''}
        ${dashedRow}
        <div class="flex-between text-dim" style="font-size:11px;">
          <span class="num">${sale.receiptNumber}</span><span class="num">${Fmt.dateTime(sale.date)}</span>
        </div>
      </div>
    `;
  }

  /* Plain-text version for the Share button — a real formatted receipt,   */
  /* not just an item list, so it reads fine dropped into WhatsApp/SMS.    */
  function text(sale, store, lang) {
    const lines = [];
    lines.push(store.name || I18n.t('dashboard.defaultStoreName', null, lang));
    if (store.address) lines.push(store.address);
    if (store.phone) lines.push(store.phone);
    lines.push('');
    lines.push(I18n.t('receipt.receiptLinePrefix', { number: sale.receiptNumber }, lang));
    lines.push(I18n.t('receipt.dateLinePrefix', { date: Fmt.dateTime(sale.date) }, lang));
    if (sale.status === 'refunded') lines.push(`*** ${I18n.t('receipt.refundedBanner', null, lang)} ***`);
    else if (sale.status === 'partially_refunded') lines.push(`*** ${I18n.t('receipt.partiallyRefundedBanner', null, lang)} ***`);
    lines.push('--------------------------------');
    let itemCount = 0;
    sale.items.forEach((it) => {
      itemCount += it.qty;
      lines.push(`${it.qty}x ${it.name} @ ${Fmt.money(it.price)}  =  ${Fmt.money(it.price * it.qty)}`);
      if (it.discount) lines.push(`    *** ${I18n.t('receipt.itemDiscountLabel', null, lang)}: -${Fmt.money(it.discount)}`);
    });
    lines.push(I18n.t('receipt.itemsSoldSuffix', { count: itemCount, plural: itemCount !== 1 ? 's' : '' }, lang));
    lines.push('--------------------------------');
    lines.push(`${I18n.t('receipt.subtotalLabel', null, lang)}: ${Fmt.money(sale.subtotal)}`);
    if (sale.itemDiscounts) lines.push(`${I18n.t('receipt.itemDiscountsLabel', null, lang)}: -${Fmt.money(sale.itemDiscounts)}`);
    if (sale.discount) lines.push(`${I18n.t('receipt.orderDiscountLabel', null, lang)}: -${Fmt.money(sale.discount)}`);
    if (sale.tax) lines.push(`${I18n.t('receipt.taxLabel', null, lang)}: ${Fmt.money(sale.tax)}`);
    lines.push(`${I18n.t('receipt.totalLabel', null, lang)}: ${Fmt.money(sale.total)}`);
    lines.push(`${I18n.t('receipt.paymentLabel', null, lang)}: ${paymentMethodLabel(sale.paymentMethod, lang)}`);
    if (sale.paymentMethod === 'cash' && sale.amountReceived != null) {
      lines.push(`${I18n.t('receipt.tenderedLabel', null, lang)}: ${Fmt.money(sale.amountReceived)}`);
      lines.push(`${I18n.t('receipt.changeLabel', null, lang)}: ${Fmt.money(sale.change)}`);
    }
    const footerText = store.receiptFooter !== '' ? (store.receiptFooter || I18n.t('receipt.defaultFooter', null, lang)) : '';
    if (footerText) { lines.push(''); lines.push(footerText); }
    return lines.join('\n');
  }

  return { html, text };
})();
window.Receipt = Receipt;

/* A second, self-contained receipt for a refund event — shown right
   after a refund is confirmed (see openRefundSheet's confirm handler in
   sales.js). Deliberately generated on the fly rather than stored: this
   app treats a sale record as immutable except for its cumulative
   status/refundedQty fields (see the comment atop sales.js), so there's
   nowhere to persist a list of discrete past refund events — this
   documents THIS refund, right when it happens, referencing the
   original sale's receiptNumber (so its barcode still round-trips
   through Sales' "Scan to Find") rather than minting a new one. */
const RefundReceipt = (() => {
  function html(sale, refundInfo, store, lang) {
    const barcodeSvg = Barcode128.svg(sale.receiptNumber, { moduleWidth: 1.6, height: 44 });
    const dashedRow = '<div style="border-top:1px dashed var(--border); margin:10px 0;"></div>';
    const dir = (I18n.LANGUAGES.find((l) => l.code === lang) || { dir: 'ltr' }).dir;

    return `
      <div class="receipt-print" dir="${dir}">
        <div style="text-align:center;">
          ${store.logo ? `<img src="${store.logo}" style="width:56px;height:56px;object-fit:cover;border-radius:12px;margin-bottom:8px;">` : ''}
          <div style="font-weight:700; font-size:16px; color:var(--accent);">${escapeHTML(store.name || I18n.t('dashboard.defaultStoreName', null, lang))}</div>
        </div>
        <div class="mt-8" style="text-align:center;"><span class="badge badge--danger">${I18n.t('refundReceipt.title', null, lang)}</span></div>
        <div class="text-center text-dim text-sm mt-8 ltr-code" style="text-align:center;">${I18n.t('refundReceipt.originalReceiptPrefix', null, lang)}: ${sale.receiptNumber} \u00b7 ${Fmt.dateTime(sale.date)}</div>
        ${dashedRow}
        <div class="text-sm" style="font-weight:700; text-transform:uppercase; letter-spacing:0.02em;">${I18n.t('refundReceipt.purchasedSectionTitle', null, lang)}</div>
        ${sale.items.map((it) => `
          <div class="flex-between text-sm" style="margin-bottom:3px; margin-top:6px;">
            <span>${it.qty}\u00d7&nbsp;&nbsp;${escapeHTML(it.name)}</span>
            <span class="num">${Fmt.money(it.price * it.qty)}</span>
          </div>
        `).join('')}
        <div class="flex-between text-sm mt-8" style="font-weight:700;"><span>${I18n.t('refundReceipt.originalTotalLabel', null, lang)}</span><span class="num">${Fmt.money(sale.total)}</span></div>
        ${dashedRow}
        <div class="text-sm" style="font-weight:700; text-transform:uppercase; letter-spacing:0.02em; color:var(--coral);">${I18n.t('refundReceipt.refundedSectionTitle', null, lang)}</div>
        ${refundInfo.items.map((it) => `
          <div class="flex-between text-sm" style="margin-bottom:3px; margin-top:6px;">
            <span>${it.qty}\u00d7&nbsp;&nbsp;${escapeHTML(it.name)}</span>
            <span class="num" style="color:var(--coral);">\u2212 ${Fmt.money(it.unitNet * it.qty)}</span>
          </div>
        `).join('')}
        <div class="flex-between mt-8" style="font-weight:800; color:var(--coral); font-size:17px;"><span>${I18n.t('refundReceipt.refundTotalLabel', null, lang)}</span><span class="num">\u2212 ${Fmt.money(refundInfo.total)}</span></div>
        ${dashedRow}
        ${barcodeSvg ? `<div style="color:var(--text); padding:0 8px;">${barcodeSvg}</div>` : ''}
        <div class="text-center text-dim text-sm ltr-code" style="text-align:center; letter-spacing:0.08em; margin-top:4px;">${sale.receiptNumber}</div>
        ${dashedRow}
        <div class="flex-between text-dim" style="font-size:11px;">
          <span>${I18n.t('refundReceipt.refundDateLabel', null, lang)}</span><span class="num">${Fmt.dateTime(refundInfo.date)}</span>
        </div>
      </div>
    `;
  }

  function text(sale, refundInfo, store, lang) {
    const lines = [];
    lines.push(store.name || I18n.t('dashboard.defaultStoreName', null, lang));
    lines.push('');
    lines.push(`*** ${I18n.t('refundReceipt.title', null, lang)} ***`);
    lines.push(`${I18n.t('refundReceipt.originalReceiptPrefix', null, lang)}: ${sale.receiptNumber} \u00b7 ${Fmt.dateTime(sale.date)}`);
    lines.push('--------------------------------');
    lines.push(I18n.t('refundReceipt.purchasedSectionTitle', null, lang));
    sale.items.forEach((it) => {
      lines.push(`${it.qty}x ${it.name}  =  ${Fmt.money(it.price * it.qty)}`);
    });
    lines.push(`${I18n.t('refundReceipt.originalTotalLabel', null, lang)}: ${Fmt.money(sale.total)}`);
    lines.push('--------------------------------');
    lines.push(I18n.t('refundReceipt.refundedSectionTitle', null, lang));
    refundInfo.items.forEach((it) => {
      lines.push(`${it.qty}x ${it.name}  =  -${Fmt.money(it.unitNet * it.qty)}`);
    });
    lines.push(`${I18n.t('refundReceipt.refundTotalLabel', null, lang)}: -${Fmt.money(refundInfo.total)}`);
    lines.push('--------------------------------');
    lines.push(`${I18n.t('refundReceipt.refundDateLabel', null, lang)}: ${Fmt.dateTime(refundInfo.date)}`);
    return lines.join('\n');
  }

  return { html, text };
})();
window.RefundReceipt = RefundReceipt;

/* Builds a clean, professional 80mm-roll-style receipt PDF straight from  */
/* sale + store data (not scraped from the on-screen HTML), so spacing,    */
/* wrapping, and the logo all come out crisp instead of dumped monospace.  */
/* Page height is computed with a throwaway measuring doc first, so the    */
/* real PDF is trimmed tight to its content — no blank trailing space.     */
/* Arabic text has no shaping or bidi support in jsPDF — see the comment
   inside for what that actually breaks and how this fixes it. Shared by
   buildReceiptPDF() and buildRefundReceiptPDF() so the ~450KB of
   font/shaping/reordering assets (loaded lazily, only for Arabic
   receipts) and the logic around them live in exactly one place. */
async function createArabicPdfSupport(lang) {
  // Every non-Arabic receipt gets these no-op passthroughs and never
  // touches the lazy-loaded assets below at all.
  let arabicText = (s) => String(s);
  let wrapArabic = null; // (measureDoc, txt, contentWidth) => string[] — set below when lang === 'ar'
  if (lang === 'ar') {
    if (!window.ArabicShaper) await loadScriptOnce('vendor/arabicShaper.js');
    if (!window.bidi_js) await loadScriptOnce('vendor/bidi.min.js');
    if (!window.NOTO_NASKH_ARABIC_REGULAR_B64) await loadScriptOnce('vendor/fonts/notoNaskhArabicRegularBase64.js');
    if (!window.NOTO_NASKH_ARABIC_BOLD_B64) await loadScriptOnce('vendor/fonts/notoNaskhArabicBoldBase64.js');
    const bidi = window.bidi_js();
    const ISO_RE = /[\u2066-\u2069]/g;
    // Any string with no Arabic letters in it (a money amount, a date, a
    // receipt number, a phone number) is treated as one opaque
    // left-to-right unit and wrapped in Unicode isolate marks before
    // reordering — otherwise the bidi algorithm can still reshuffle it
    // internally purely for sitting inside an RTL paragraph. E.g.
    // "+213 555 123 456" (two space-separated digit groups) actually
    // comes back "456 123 555 213+" without this, and "12/09/2026 14:30"
    // comes back with the date and time swapped. A string that DOES
    // contain Arabic (a translated sentence with a number worked into
    // it, e.g. "12 items sold") is left alone — that\u2019s the case the bidi
    // algorithm is actually designed for, and isolating the whole thing
    // would be wrong since the number is meant to flow with the sentence.
    const hasArabicChars = (s) => /[\u0600-\u06FF\u0750-\u077F]/.test(s);
    const reorder = (s, isolate) => {
      const wrapped = isolate ? `\u2066${s}\u2069` : s;
      const embed = bidi.getEmbeddingLevels(wrapped, 'rtl');
      return bidi.getReorderedString(wrapped, embed).replace(ISO_RE, '');
    };
    arabicText = (str) => {
      const s = String(str);
      const shaped = window.ArabicShaper.convertArabic(s);
      return reorder(shaped, !hasArabicChars(s));
    };
    wrapArabic = (measureDoc, txt, contentWidth) => {
      const s = String(txt);
      const isolate = !hasArabicChars(s);
      const shaped = window.ArabicShaper.convertArabic(s);
      return measureDoc.splitTextToSize(shaped, contentWidth).map((line) => reorder(line, isolate));
    };
  }
  const registerArabicFont = (docInstance) => {
    docInstance.addFileToVFS('NotoNaskhArabic-Regular.ttf', window.NOTO_NASKH_ARABIC_REGULAR_B64);
    docInstance.addFont('NotoNaskhArabic-Regular.ttf', 'NotoNaskhArabic', 'normal');
    docInstance.addFileToVFS('NotoNaskhArabic-Bold.ttf', window.NOTO_NASKH_ARABIC_BOLD_B64);
    docInstance.addFont('NotoNaskhArabic-Bold.ttf', 'NotoNaskhArabic', 'bold');
  };
  const setFont = (docInstance, bold) => {
    docInstance.setFont(lang === 'ar' ? 'NotoNaskhArabic' : 'helvetica', bold ? 'bold' : 'normal');
  };
  return { arabicText, wrapArabic, registerArabicFont, setFont };
}

/* Builds a clean, professional 80mm-roll-style receipt PDF straight from  */
/* sale + store data (not scraped from the on-screen HTML), so spacing,    */
/* wrapping, and the logo all come out crisp instead of dumped monospace.  */
/* Page height is computed with a throwaway measuring doc first, so the    */
/* real PDF is trimmed tight to its content — no blank trailing space.     */
async function buildReceiptPDF(sale, store, lang) {
  // jsPDF is lazy-loaded (see loadScriptOnce above) — not present until
  // the first thing that needs it actually runs.
  if (!window.jspdf) await loadScriptOnce('vendor/jspdf.umd.min.js');
  const { jsPDF } = window.jspdf;
  const { arabicText, wrapArabic, registerArabicFont, setFont } = await createArabicPdfSupport(lang);

  const pageWidth = 80;
  const margin = 5;
  const contentWidth = pageWidth - margin * 2;
  const lineH = 5;
  const footerText = store.receiptFooter !== '' ? (store.receiptFooter || I18n.t('receipt.defaultFooter', null, lang)) : '';
  const itemCount = sale.items.reduce((s, it) => s + it.qty, 0);
  // Module width is computed from the actual pattern length further down
  // (barcodePattern/barcodeModule) rather than a fixed value — a fixed
  // width would overflow this 80mm-wide receipt's printable area once
  // the receiptNumber (source of the encoded text) gets much past ~15
  // characters, silently cutting the barcode off mid-scan.
  const barcodePattern = Barcode128.encode(sale.receiptNumber);
  const barcodeModule = barcodePattern ? Math.min(0.42, contentWidth / barcodePattern.length) : 0.32;
  const barcodeHeight = 11;
  const logoFormat = (dataUrl) => {
    if (/^data:image\/png/i.test(dataUrl)) return 'PNG';
    if (/^data:image\/webp/i.test(dataUrl)) return 'WEBP';
    return 'JPEG';
  };

  // Pull the live theme accent so the receipt actually matches whichever
  // pack is active in the app, instead of being permanently plain gray —
  // falls back to a neutral ink if for some reason the CSS var isn't
  // available (e.g. this ever runs before the stylesheet is applied).
  const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [35, 35, 35];
  };
  const accentRgb = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#2F5233');

  // --- Pass 1: measure. A throwaway doc just for splitTextToSize, whose
  // wrapping depends only on font metrics, not on final page height. ---
  const measure = new jsPDF({ unit: 'mm', format: [pageWidth, 200] });
  if (lang === 'ar') registerArabicFont(measure);
  const wrap = (txt, size, font = 'normal') => {
    setFont(measure, font === 'bold');
    measure.setFontSize(size);
    if (wrapArabic) return wrapArabic(measure, txt, contentWidth);
    return measure.splitTextToSize(String(txt), contentWidth);
  };

  let h = margin;
  if (store.logo) h += 22;
  h += 6.5;
  const addrLines = store.address ? wrap(store.address, 8.5) : [];
  const phoneLines = store.phone ? wrap(store.phone, 8.5) : [];
  h += (addrLines.length + phoneLines.length) * 4;
  h += 5; // spacing after header
  if (sale.status === 'refunded' || sale.status === 'partially_refunded') h += lineH + 1;
  h += 5; // divider before column header
  h += lineH; // "Qty Item / Price" column header row
  h += 5; // divider after column header

  const itemLines = sale.items.map((it) => {
    const left = wrap(`${it.qty}\u00d7 ${it.name}`, 9);
    return { rows: left.length, hasDiscount: !!it.discount };
  });
  itemLines.forEach((it) => { h += it.rows * lineH; if (it.hasDiscount) h += lineH; });
  h += lineH; // "N items sold" line

  h += 5; // divider
  h += lineH; // subtotal
  if (sale.itemDiscounts) h += lineH;
  if (sale.discount) h += lineH;
  if (sale.tax) h += lineH;
  h += lineH + 2; // total
  h += lineH; // payment
  if (sale.paymentMethod === 'cash' && sale.amountReceived != null) h += lineH * 2;
  h += 5; // divider
  h += lineH + 2; // "THANK YOU"
  h += barcodeHeight + 3; // barcode graphic
  h += lineH; // receiptNumber text under barcode
  if (footerText) { h += 6; h += wrap(footerText, 8).length * 4; }
  h += 5; // divider
  h += lineH; // bottom footer row (receipt# + date/time)
  h += 6; // torn-edge strip
  h += margin;

  // --- Pass 2: draw for real, on a doc sized exactly to fit. ---
  const doc = new jsPDF({ unit: 'mm', format: [pageWidth, Math.max(60, h)] });
  if (lang === 'ar') registerArabicFont(doc);
  const cx = pageWidth / 2;
  let y = margin;

  const row = (left, right, opts = {}) => {
    const { size = 9, bold = false, dim = false, indent = 0, color = null } = opts;
    setFont(doc, bold);
    doc.setFontSize(size);
    if (color) doc.setTextColor(...color);
    else doc.setTextColor(dim ? 140 : 25);
    if (left !== undefined) doc.text(arabicText(left), margin + indent, y);
    if (right !== undefined) doc.text(arabicText(right), pageWidth - margin, y, { align: 'right' });
    doc.setTextColor(25);
  };
  const divider = () => {
    doc.setDrawColor(190);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(margin, y, pageWidth - margin, y);
    doc.setLineDashPattern([], 0);
    y += 5;
  };

  if (store.logo) {
    try {
      const size = 18;
      doc.addImage(store.logo, logoFormat(store.logo), cx - size / 2, y, size, size, undefined, 'FAST');
      y += size + 4;
    } catch (e) { /* bad image data — skip the logo rather than fail the whole receipt */ }
  }
  setFont(doc, true);
  doc.setFontSize(13.5);
  doc.setTextColor(...accentRgb);
  doc.text(arabicText(store.name || I18n.t('dashboard.defaultStoreName', null, lang)), cx, y, { align: 'center' });
  y += 6.5;

  setFont(doc, false);
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  [...addrLines, ...phoneLines].forEach((l) => { doc.text(l, cx, y, { align: 'center' }); y += 4; });
  doc.setTextColor(25);
  y += 5;

  if (sale.status === 'refunded' || sale.status === 'partially_refunded') {
    setFont(doc, true);
    doc.setFontSize(9);
    doc.setTextColor(200, 60, 90);
    doc.text(arabicText(sale.status === 'refunded' ? I18n.t('receipt.refundedBanner', null, lang) : I18n.t('receipt.partiallyRefundedBanner', null, lang)), cx, y, { align: 'center' });
    doc.setTextColor(25);
    y += lineH + 1;
  }
  divider();

  row(I18n.t('receipt.colQtyItem', null, lang), I18n.t('receipt.colPrice', null, lang), { size: 8, bold: true, dim: true });
  y += lineH;
  divider();

  sale.items.forEach((it) => {
    const left = wrap(`${it.qty}\u00d7 ${it.name}`, 9);
    left.forEach((l, i) => {
      row(l, i === 0 ? Fmt.money(it.price * it.qty) : undefined, { size: 9 });
      y += lineH;
    });
    if (it.discount) {
      row(`    *** ${I18n.t('receipt.itemDiscountLabel', null, lang)}`, `\u2212 ${Fmt.money(it.discount)}`, { size: 8, dim: true });
      y += lineH;
    }
  });
  setFont(doc, false);
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(arabicText(I18n.t('receipt.itemsSoldSuffix', { count: itemCount, plural: itemCount !== 1 ? 's' : '' }, lang)), cx, y, { align: 'center' });
  doc.setTextColor(25);
  y += lineH;
  divider();

  row(I18n.t('receipt.subtotalLabel', null, lang), Fmt.money(sale.subtotal), { dim: true });
  y += lineH;
  if (sale.itemDiscounts) { row(I18n.t('receipt.itemDiscountsLabel', null, lang), `\u2212 ${Fmt.money(sale.itemDiscounts)}`, { dim: true }); y += lineH; }
  if (sale.discount) { row(I18n.t('receipt.orderDiscountLabel', null, lang), `\u2212 ${Fmt.money(sale.discount)}`, { dim: true }); y += lineH; }
  if (sale.tax) { row(I18n.t('receipt.taxLabel', null, lang), Fmt.money(sale.tax), { dim: true }); y += lineH; }
  y += 1;
  row(I18n.t('receipt.totalLabel', null, lang), Fmt.money(sale.total), { size: 11, bold: true, color: accentRgb });
  y += lineH + 1;
  row(I18n.t('receipt.paymentLabel', null, lang), paymentMethodLabel(sale.paymentMethod, lang), { dim: true });
  y += lineH;
  if (sale.paymentMethod === 'cash' && sale.amountReceived != null) {
    row(I18n.t('receipt.tenderedLabel', null, lang), Fmt.money(sale.amountReceived), { dim: true }); y += lineH;
    row(I18n.t('receipt.changeLabel', null, lang), Fmt.money(sale.change), { dim: true }); y += lineH;
  }
  divider();

  setFont(doc, true);
  doc.setFontSize(10);
  doc.setTextColor(25);
  doc.text(arabicText(I18n.t('receipt.thankYou', null, lang)), cx, y, { align: 'center' });
  y += lineH + 2;

  // Real, scannable Code128 barcode of this sale's receipt number — see
  // Barcode128 above and Sales' "Scan to Find".
  if (barcodePattern) {
    const barcodeWidth = barcodePattern.length * barcodeModule;
    Barcode128.drawOnPDF(doc, sale.receiptNumber, cx - barcodeWidth / 2, y, { moduleWidth: barcodeModule, height: barcodeHeight });
    y += barcodeHeight + 3;
  }
  setFont(doc, false);
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(arabicText(sale.receiptNumber), cx, y, { align: 'center' });
  doc.setTextColor(25);
  y += lineH;

  if (footerText) {
    y += 1;
    setFont(doc, false);
    doc.setFontSize(8);
    doc.setTextColor(140);
    wrap(footerText, 8).forEach((l) => { doc.text(l, cx, y, { align: 'center' }); y += 4; });
  }
  y += 1;
  divider();
  setFont(doc, false);
  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text(arabicText(sale.receiptNumber), margin, y);
  doc.text(arabicText(Fmt.dateTime(sale.date)), pageWidth - margin, y, { align: 'right' });
  doc.setTextColor(25);
  y += lineH;

  // Torn-edge zigzag — echoes tearing the receipt off a thermal roll.
  y += 4;
  doc.setDrawColor(190);
  doc.setLineWidth(0.3);
  const teeth = Math.round(contentWidth / 3.2);
  const toothW = contentWidth / teeth;
  const zig = [];
  for (let i = 0; i <= teeth; i++) {
    zig.push([margin + i * toothW, y + (i % 2 === 0 ? 0 : 1.6)]);
  }
  for (let i = 0; i < zig.length - 1; i++) {
    doc.line(zig[i][0], zig[i][1], zig[i + 1][0], zig[i + 1][1]);
  }

  return doc;
}
window.buildReceiptPDF = buildReceiptPDF;

/* PDF counterpart to RefundReceipt.html() — same 80mm-roll layout logic
   and the same Arabic text support (see createArabicPdfSupport above) as
   buildReceiptPDF, for a refund event instead of the original sale. */
async function buildRefundReceiptPDF(sale, refundInfo, store, lang) {
  if (!window.jspdf) await loadScriptOnce('vendor/jspdf.umd.min.js');
  const { jsPDF } = window.jspdf;
  const { arabicText, registerArabicFont, setFont } = await createArabicPdfSupport(lang);

  const pageWidth = 80;
  const margin = 5;
  const contentWidth = pageWidth - margin * 2;
  const lineH = 5;
  const barcodePattern = Barcode128.encode(sale.receiptNumber);
  const barcodeModule = barcodePattern ? Math.min(0.42, contentWidth / barcodePattern.length) : 0.32;
  const barcodeHeight = 11;
  const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [35, 35, 35];
  };
  const coralRgb = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--coral') || '#D9506B');

  // --- Pass 1: measure. ---
  const measure = new jsPDF({ unit: 'mm', format: [pageWidth, 200] });
  if (lang === 'ar') registerArabicFont(measure);
  const wrap = (txt, size) => {
    setFont(measure, false);
    measure.setFontSize(size);
    return measure.splitTextToSize(arabicText(String(txt)), contentWidth);
  };

  let h = margin;
  if (store.logo) h += 22;
  h += 6.5 + 5; // store name + spacing
  h += lineH + 3; // "REFUND RECEIPT" badge line
  h += wrap(`${I18n.t('refundReceipt.originalReceiptPrefix', null, lang)}: ${sale.receiptNumber} \u00b7 ${Fmt.dateTime(sale.date)}`, 8).length * 4 + 5;
  h += 5; // divider
  h += lineH; // "Originally Purchased" header
  sale.items.forEach((it) => { h += wrap(`${it.qty}\u00d7 ${it.name}`, 9).length * lineH; });
  h += lineH + 1; // original total row
  h += 5; // divider
  h += lineH; // "Refunded Now" header
  refundInfo.items.forEach((it) => { h += wrap(`${it.qty}\u00d7 ${it.name}`, 9).length * lineH; });
  h += lineH + 3; // refund total row
  h += 5; // divider
  h += barcodeHeight + 3;
  h += lineH; // receiptNumber under barcode
  h += 5; // divider
  h += lineH; // refund date row
  h += 6; // torn-edge strip
  h += margin;

  // --- Pass 2: draw for real. ---
  const doc = new jsPDF({ unit: 'mm', format: [pageWidth, Math.max(60, h)] });
  if (lang === 'ar') registerArabicFont(doc);
  const cx = pageWidth / 2;
  let y = margin;

  const row = (left, right, opts = {}) => {
    const { size = 9, bold = false, color = null } = opts;
    setFont(doc, bold);
    doc.setFontSize(size);
    if (color) doc.setTextColor(...color);
    else doc.setTextColor(25);
    if (left !== undefined) doc.text(arabicText(left), margin, y);
    if (right !== undefined) doc.text(arabicText(right), pageWidth - margin, y, { align: 'right' });
    doc.setTextColor(25);
  };
  const divider = () => {
    doc.setDrawColor(190);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(margin, y, pageWidth - margin, y);
    doc.setLineDashPattern([], 0);
    y += 5;
  };

  if (store.logo) {
    try {
      const size = 18;
      const fmt = /^data:image\/png/i.test(store.logo) ? 'PNG' : /^data:image\/webp/i.test(store.logo) ? 'WEBP' : 'JPEG';
      doc.addImage(store.logo, fmt, cx - size / 2, y, size, size, undefined, 'FAST');
      y += size + 4;
    } catch (e) { /* bad image data — skip the logo rather than fail the whole receipt */ }
  }
  setFont(doc, true);
  doc.setFontSize(13.5);
  doc.setTextColor(...coralRgb);
  doc.text(arabicText(store.name || I18n.t('dashboard.defaultStoreName', null, lang)), cx, y, { align: 'center' });
  y += 6.5;
  doc.setFontSize(10);
  doc.text(arabicText(I18n.t('refundReceipt.title', null, lang)), cx, y, { align: 'center' });
  doc.setTextColor(25);
  y += lineH + 3;

  setFont(doc, false);
  doc.setFontSize(8);
  doc.setTextColor(140);
  wrap(`${I18n.t('refundReceipt.originalReceiptPrefix', null, lang)}: ${sale.receiptNumber} \u00b7 ${Fmt.dateTime(sale.date)}`, 8).forEach((l) => { doc.text(l, cx, y, { align: 'center' }); y += 4; });
  doc.setTextColor(25);
  y += 1;
  divider();

  setFont(doc, true);
  doc.setFontSize(8);
  doc.text(arabicText(I18n.t('refundReceipt.purchasedSectionTitle', null, lang)), margin, y);
  y += lineH;
  sale.items.forEach((it) => {
    wrap(`${it.qty}\u00d7 ${it.name}`, 9).forEach((l, i) => {
      row(l, i === 0 ? Fmt.money(it.price * it.qty) : undefined, { size: 9 });
      y += lineH;
    });
  });
  row(I18n.t('refundReceipt.originalTotalLabel', null, lang), Fmt.money(sale.total), { bold: true });
  y += lineH + 1;
  divider();

  setFont(doc, true);
  doc.setFontSize(8);
  doc.setTextColor(...coralRgb);
  doc.text(arabicText(I18n.t('refundReceipt.refundedSectionTitle', null, lang)), margin, y);
  doc.setTextColor(25);
  y += lineH;
  refundInfo.items.forEach((it) => {
    wrap(`${it.qty}\u00d7 ${it.name}`, 9).forEach((l, i) => {
      row(l, i === 0 ? `\u2212 ${Fmt.money(it.unitNet * it.qty)}` : undefined, { size: 9, color: i === 0 ? coralRgb : null });
      y += lineH;
    });
  });
  row(I18n.t('refundReceipt.refundTotalLabel', null, lang), `\u2212 ${Fmt.money(refundInfo.total)}`, { size: 11, bold: true, color: coralRgb });
  y += lineH + 2;
  divider();

  if (barcodePattern) {
    const barcodeWidth = barcodePattern.length * barcodeModule;
    Barcode128.drawOnPDF(doc, sale.receiptNumber, cx - barcodeWidth / 2, y, { moduleWidth: barcodeModule, height: barcodeHeight });
    y += barcodeHeight + 3;
  }
  setFont(doc, false);
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(arabicText(sale.receiptNumber), cx, y, { align: 'center' });
  doc.setTextColor(25);
  y += lineH + 1;
  divider();

  row(I18n.t('refundReceipt.refundDateLabel', null, lang), Fmt.dateTime(refundInfo.date), { size: 7 });
  doc.setTextColor(25);
  y += lineH;

  // Torn-edge zigzag — matches buildReceiptPDF's.
  y += 4;
  doc.setDrawColor(190);
  doc.setLineWidth(0.3);
  const teeth = Math.round(contentWidth / 3.2);
  const toothW = contentWidth / teeth;
  const zig = [];
  for (let i = 0; i <= teeth; i++) {
    zig.push([margin + i * toothW, y + (i % 2 === 0 ? 0 : 1.6)]);
  }
  for (let i = 0; i < zig.length - 1; i++) {
    doc.line(zig[i][0], zig[i][1], zig[i + 1][0], zig[i + 1][1]);
  }

  return doc;
}
window.buildRefundReceiptPDF = buildRefundReceiptPDF;

/* ---------------------------------------------------------------------- */
/* Printing — routes receipt HTML through the top-level #printArea so the  */
/* browser's print pagination isn't fighting a Sheet's own positioning.    */
/* ---------------------------------------------------------------------- */

/** A brief full-screen checkmark confirmation — used after completing a
 * sale, where a toast alone under-communicates "this money is now
 * recorded." Resolves once the animation finishes so callers can chain
 * into it (e.g. opening the receipt right after). */
/** Shared visual-effects helpers built on Motion (motion.dev) — kept in
 *  one place so onboarding, sale completion, and anywhere else that wants
 *  a moment of delight all share the same physics instead of each
 *  reinventing it slightly differently. */
const Fx = (() => {
  function animate(el, keyframes, opts) {
    if (window.Motion && window.Motion.animate) {
      return window.Motion.animate(el, keyframes, opts);
    }
    const end = {};
    Object.keys(keyframes).forEach((k) => {
      const v = keyframes[k];
      end[k] = Array.isArray(v) ? v[v.length - 1] : v;
    });
    Object.assign(el.style, end);
    return { finished: Promise.resolve() };
  }

  /** A confetti burst from roughly the upper-middle of the screen —
   *  spring-flung outward and slightly upward before falling, rather than
   *  a plain straight drop, so it reads as a little celebratory pop. */
  function confetti(originY = window.innerHeight * 0.35) {
    const colors = ['--accent', '--teal', '--coral', '--blue'];
    const cx = window.innerWidth / 2;
    for (let i = 0; i < 26; i++) {
      const piece = document.createElement('div');
      piece.className = 'onboard-confetti-piece';
      piece.style.background = `var(${colors[i % colors.length]})`;
      piece.style.left = `${cx}px`;
      piece.style.top = `${originY}px`;
      document.body.appendChild(piece);

      const angle = (Math.PI * 2 * i) / 26 + (Math.random() - 0.5);
      const dist = 90 + Math.random() * 140;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 60;
      const rot = (Math.random() - 0.5) * 720;

      animate(piece, {
        x: [0, dx * 0.4, dx],
        y: [0, dy, dy + 180],
        rotate: [0, rot],
        opacity: [1, 1, 0],
      }, { duration: 1.1 + Math.random() * 0.4, ease: 'easeOut' })
        .finished.then(() => piece.remove());
    }
  }

  return { animate, confetti };
})();
window.Fx = Fx;

function showSuccessCheck(message, celebrate = false) {
  const label = message ?? I18n.t('pos.saleComplete');
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
      <div class="success-check-label">${escapeHTML(label)}</div>
    `;
    document.body.appendChild(overlay);
    if (navigator.vibrate) navigator.vibrate(25);
    if (celebrate && window.Fx) Fx.confetti(window.innerHeight * 0.4);
    setTimeout(() => {
      overlay.classList.add('out');
      setTimeout(() => { overlay.remove(); resolve(); }, 200);
    }, 900);
  });
}
window.showSuccessCheck = showSuccessCheck;

/** Print a receipt. Three tiers, best available wins:
 *  1. Native platform + a registered NativePrint plugin -> hands the PDF
 *     straight to Android's system Print framework (PrintManager), which
 *     opens the real print picker — any paired roll/receipt printer whose
 *     manufacturer app installs a Print Service shows up there directly,
 *     no Share-sheet detour needed.
 *  2. Native platform, no NativePrint plugin (e.g. plugin not synced into
 *     this build yet) -> falls back to generating the PDF and handing it
 *     to the Share sheet, where Print still shows up as a real option.
 *  3. Not native (a real browser tab) -> the actual window.print() dialog.
 */
async function printReceipt(sale, store, lang) {
  const cap = window.Capacitor;
  const isNative = cap && cap.isNativePlatform && cap.isNativePlatform();

  if (!isNative) {
    const area = document.getElementById('printArea');
    if (area) area.innerHTML = Receipt.html(sale, store, lang);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    return;
  }

  let doc;
  try {
    doc = await buildReceiptPDF(sale, store, lang);
  } catch (e) {
    Toast.error(I18n.t('receipt.pdfFailed', { msg: (e && e.message) || e }));
    return;
  }
  const base64 = doc.output('datauristring').split(',')[1];
  const plugins = cap.Plugins || {};

  if (plugins.NativePrint) {
    try {
      await plugins.NativePrint.printPdf({ base64, jobName: I18n.t('receipt.jobTitle', { number: sale.receiptNumber }) });
      return;
    } catch (e) {
      // Fall through to the Share-based fallback below rather than dead-end.
      Toast.show(I18n.t('receipt.printDialogFallback'));
    }
  }

  if (!plugins.Filesystem || !plugins.Share) {
    Toast.error(I18n.t('receipt.diagPrintMissing'));
    return;
  }
  try {
    const filename = `receipt-${sale.receiptNumber}-${Date.now()}.pdf`;
    const written = await plugins.Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
    await plugins.Share.share({ title: I18n.t('receipt.printDialogTitle'), url: written.uri, dialogTitle: I18n.t('receipt.printDialogTitle') });
  } catch (e) {
    Toast.error(I18n.t('receipt.printFailed', { msg: (e && e.message) || e }));
  }
}
window.printReceipt = printReceipt;

/** Share a receipt as plain text — via the native @capacitor/share plugin
 *  when running in the app (navigator.share doesn't exist in Capacitor's
 *  WebView, only in real Chrome tabs, which is why this was silently
 *  doing nothing before). */
async function shareReceipt(sale, store, lang) {
  const body = Receipt.text(sale, store, lang);
  const title = I18n.t('receipt.jobTitle', { number: sale.receiptNumber });
  const cap = window.Capacitor;
  const isNative = cap && cap.isNativePlatform && cap.isNativePlatform();

  if (isNative) {
    if (!cap.Plugins || !cap.Plugins.Share) {
      Toast.error(I18n.t('receipt.diagShareMissing'));
      return;
    }
    try {
      await cap.Plugins.Share.share({ title, text: body, dialogTitle: title });
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (!/cancel/i.test(msg)) Toast.error(I18n.t('receipt.shareFailed', { msg }));
    }
    return;
  }
  if (navigator.share) {
    try { await navigator.share({ title, text: body }); return; }
    catch (e) { return; }
  }
  const copied = await copyToClipboard(body);
  Toast.show(copied ? I18n.t('receipt.sharingUnavailableCopied') : I18n.t('receipt.sharingUnsupported'));
}
window.shareReceipt = shareReceipt;

/** Print/share counterparts to printReceipt/shareReceipt above, for a
 *  RefundReceipt instead of the original sale's Receipt — same
 *  NativePrint -> Share-with-PDF -> window.print() fallback chain. */
async function printRefundReceipt(sale, refundInfo, store, lang) {
  const cap = window.Capacitor;
  const isNative = cap && cap.isNativePlatform && cap.isNativePlatform();

  if (!isNative) {
    const area = document.getElementById('printArea');
    if (area) area.innerHTML = RefundReceipt.html(sale, refundInfo, store, lang);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    return;
  }

  let doc;
  try {
    doc = await buildRefundReceiptPDF(sale, refundInfo, store, lang);
  } catch (e) {
    Toast.error(I18n.t('receipt.pdfFailed', { msg: (e && e.message) || e }));
    return;
  }
  const base64 = doc.output('datauristring').split(',')[1];
  const plugins = cap.Plugins || {};
  const jobTitle = I18n.t('refundReceipt.jobTitle', { number: sale.receiptNumber });

  if (plugins.NativePrint) {
    try {
      await plugins.NativePrint.printPdf({ base64, jobName: jobTitle });
      return;
    } catch (e) {
      Toast.show(I18n.t('receipt.printDialogFallback'));
    }
  }

  if (!plugins.Filesystem || !plugins.Share) {
    Toast.error(I18n.t('receipt.diagPrintMissing'));
    return;
  }
  try {
    const filename = `refund-${sale.receiptNumber}-${Date.now()}.pdf`;
    const written = await plugins.Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
    await plugins.Share.share({ title: I18n.t('receipt.printDialogTitle'), url: written.uri, dialogTitle: I18n.t('receipt.printDialogTitle') });
  } catch (e) {
    Toast.error(I18n.t('receipt.printFailed', { msg: (e && e.message) || e }));
  }
}
window.printRefundReceipt = printRefundReceipt;

async function shareRefundReceipt(sale, refundInfo, store, lang) {
  const body = RefundReceipt.text(sale, refundInfo, store, lang);
  const title = I18n.t('refundReceipt.jobTitle', { number: sale.receiptNumber });
  const cap = window.Capacitor;
  const isNative = cap && cap.isNativePlatform && cap.isNativePlatform();

  if (isNative) {
    if (!cap.Plugins || !cap.Plugins.Share) {
      Toast.error(I18n.t('receipt.diagShareMissing'));
      return;
    }
    try {
      await cap.Plugins.Share.share({ title, text: body, dialogTitle: title });
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (!/cancel/i.test(msg)) Toast.error(I18n.t('receipt.shareFailed', { msg }));
    }
    return;
  }
  if (navigator.share) {
    try { await navigator.share({ title, text: body }); return; }
    catch (e) { return; }
  }
  const copied = await copyToClipboard(body);
  Toast.show(copied ? I18n.t('receipt.sharingUnavailableCopied') : I18n.t('receipt.sharingUnsupported'));
}
window.shareRefundReceipt = shareRefundReceipt;

/* ---------------------------------------------------------------------- */
/* Generic HTML print / plain-text share — used for non-receipt content   */
/* like barcode labels, where there's no structured sale/store data to    */
/* build a real PDF from, just an HTML snippet to print as-is.            */
/* ---------------------------------------------------------------------- */

async function printGenericHTML(html) {
  const area = document.getElementById('printArea');
  if (area) area.innerHTML = html;

  const cap = window.Capacitor;
  const isNative = cap && cap.isNativePlatform && cap.isNativePlatform();

  if (!isNative) {
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    return;
  }

  if (!window.jspdf) {
    try { await loadScriptOnce('vendor/jspdf.umd.min.js'); }
    catch (e) { Toast.error('Could not load the PDF exporter — check your storage isn\u2019t full and try again.'); return; }
  }
  const textLines = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(div|p|tr)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .split('\n').map((l) => l.trim()).filter(Boolean);

  const plugins = cap.Plugins || {};
  try {
    const { jsPDF } = window.jspdf;
    const lineHeight = 5;
    const pageHeight = Math.max(60, textLines.length * lineHeight + 24);
    const doc = new jsPDF({ unit: 'mm', format: [80, pageHeight] });
    let y = 10;
    textLines.forEach((line, i) => {
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
      doc.setFontSize(i === 0 ? 13 : 9);
      doc.splitTextToSize(line, 72).forEach((wl) => { doc.text(wl, 4, y); y += lineHeight; });
    });
    const base64 = doc.output('datauristring').split(',')[1];

    if (plugins.NativePrint) {
      try {
        await plugins.NativePrint.printPdf({ base64, jobName: 'Print' });
        return;
      } catch (e) { /* fall through to Share below */ }
    }
    if (!plugins.Filesystem || !plugins.Share) {
      Toast.error('Diagnostic: Filesystem/Share plugin missing');
      return;
    }
    const filename = `print-${Date.now()}.pdf`;
    const written = await plugins.Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
    await plugins.Share.share({ title: 'Print', url: written.uri });
  } catch (e) {
    Toast.error(`PDF generation failed: ${(e && e.message) || e}`);
  }
}
window.printGenericHTML = printGenericHTML;

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
      if (!/cancel/i.test(msg)) Toast.error(`Share failed: ${msg}`);
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
const APP_BUILD_DATE = '2026-09-12';
window.APP_BUILD_DATE = APP_BUILD_DATE;
// Kept in sync by hand with android/app/build.gradle's versionName on
// every release — used by WhatsNew to detect "this device just updated"
// without depending on the native App plugin (which isn't available on
// every platform this runs on).
//
// VERSION SCHEME — ALWAYS EXACTLY FOUR DOT-SEPARATED NUMBERS, NEVER THREE:
//   MAJOR.MINOR.FEATURE.PATCH
// FEATURE bumps for a genuine new feature (PATCH resets to 0 alongside it).
// PATCH bumps (0→99) for literally any other change, however tiny — never
// skip this, never ship three-number versions like "1.9.8" again.
const CURRENT_VERSION = '1.9.9.30';
window.CURRENT_VERSION = CURRENT_VERSION;

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

/* Whenever the app comes back to the foreground — tapping an ad
   notification, switching back from another app, unlocking the phone,
   anything — re-fetch ad-config.json before showing the current screen
   again. Without this, a push notification can arrive and the ad
   genuinely changes on GitHub, but the screen you land on still shows
   whatever was cached from before you left, until some other action
   (like pulling to refresh) happens to invalidate it. This makes
   "notification arrived" and "the app already shows the new ad the
   moment you open it" the same instant, every time. */
function watchAppResumeForFreshAds() {
  const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (!isNative || !window.Capacitor.Plugins || !window.Capacitor.Plugins.App) return;
  window.Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) return;
    if (window.ShopPromo) ShopPromo.invalidateCache();
    Router.refresh();
    // A forced update can be published while the app is already open in
    // the background — re-check every time it's brought back to front,
    // not just at cold boot, so it can never be dodged by just not fully
    // closing the app.
    if (window.SelfUpdate) SelfUpdate.checkForUpdate();
  });
}

/* ---------------------------------------------------------------------- */
/* Cart badge on the POS nav icon                                          */
/* ---------------------------------------------------------------------- */

function updateCartBadge(count) {
  const badge = document.getElementById('cartBadge');
  const fab = document.querySelector('.nav-item--fab');
  if (!badge || !fab) return;
  if (count > 0) {
    const wasVisible = badge.classList.contains('show');
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.add('show');
    fab.classList.add('has-items');
    // The badge already pops in via CSS the first time it appears
    // (display:none -> flex retriggers its animation); this covers every
    // *subsequent* quantity change too, so each add-to-cart still gets a
    // little tick of feedback instead of only the very first item.
    if (wasVisible) {
      Fx.animate(badge, { scale: [1, 1.35, 1] }, { type: 'spring', stiffness: 500, damping: 12 });
      Icon.bump(fab.querySelector('.icon-svg'));
    }
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
  const EDGE = 44; // px from either screen edge that always starts a tab-swipe,
                    // even over a swipe-row or chip-row — a forward (leftward)
                    // swipe still can't be told apart from a row's own reveal
                    // gesture when it starts mid-row (see enableSwipeRows), so
                    // this edge corridor is the guaranteed-to-work fallback for
                    // that direction on a screen that's mostly rows.
  let startX = 0, startY = 0, dx = 0, dy = 0, tracking = false, decided = false, horizontal = false, fromEdge = false;

  // .swipe-row is deliberately NOT in this list — a touch starting on a
  // list row is allowed to become a tab-swipe. Whether it actually does
  // is arbitrated live in touchmove via rowSwipeActive, so it only backs
  // off when that specific row claims the drag for its own reveal-actions
  // animation. Chip strips, text inputs, and the search bar have their
  // own native/horizontal-scroll behavior with no such arbitration point,
  // so those still require an edge-swipe to start a tab change.
  const blockedTarget = (target) =>
    target.closest('.chip-row, input, textarea, select, .search-bar, .scanner-overlay');

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
      // A row under this touch already decided this is ITS horizontal
      // drag (swipe-to-reveal) — yield instead of also grabbing the
      // gesture, unless it's an edge-swipe (that always wins, same as
      // Android's own edge-swipe-back).
      if (!fromEdge && rowSwipeActive) {
        tracking = false;
        return;
      }
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        decided = true;
        horizontal = fromEdge || Math.abs(dx) > Math.abs(dy) * 1.1;
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

    // Once this is a horizontal tab-swipe, take exclusive control of the
    // gesture — without this, Android's own edge-swipe-back gesture (which
    // shares the same 28px EDGE zone this feature starts from) competes
    // with the transform below for the same touch, which is what makes a
    // technically-correct direct-manipulation drag still feel broken or
    // laggy on-device.
    if (e.cancelable) e.preventDefault();

    // Direct 1:1 tracking every frame — the view moves exactly with the
    // finger, not after it. translate3d promotes this to its own GPU layer.
    const idx = tabOrder.indexOf(Router.current);
    if (idx === -1) { tracking = false; return; }
    // In RTL, tabOrder[idx+1] sits visually to the LEFT of the current tab
    // (the bottom nav's flex row is mirrored by the browser under
    // dir="rtl"), so a rightward drag is what should reveal it — the
    // opposite of LTR. forwardDx normalizes for that: positive always
    // means "toward idx+1" no matter which raw finger direction produced
    // it. The actual translate3d below still uses the raw dx, since the
    // view must always track the physical finger 1:1 regardless of RTL.
    const isRTL = document.documentElement.getAttribute('dir') === 'rtl';
    const forwardDx = isRTL ? dx : -dx;
    const atStart = idx === 0 && forwardDx < 0;
    const atEnd = idx === tabOrder.length - 1 && forwardDx > 0;
    const followDx = dx * (atStart || atEnd ? 0.25 : 1);
    view.style.transform = `translate3d(${followDx}px, 0, 0)`;
  }, { passive: false });

  view.addEventListener('touchend', () => {
    if (!tracking) return;
    tracking = false;
    view.classList.remove('swipe-tracking');

    if (!horizontal) { view.style.transform = ''; document.body.classList.remove('swipe-active'); return; }

    const idx = tabOrder.indexOf(Router.current);
    const passed = Math.abs(dx) > 68;
    const isRTL = document.documentElement.getAttribute('dir') === 'rtl';
    const forwardDx = isRTL ? dx : -dx;
    const canAdvance = idx !== -1 && passed &&
      ((forwardDx > 0 && idx < tabOrder.length - 1) || (forwardDx < 0 && idx > 0));

    if (canAdvance) {
      const nextIdx = forwardDx > 0 ? idx + 1 : idx - 1;
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
    // No transition while actively dragging — the spinner should track
    // the finger with zero lag. The spring only kicks in on release.
    spinner.style.transition = 'none';
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
    spinner.style.transition = 'transform 340ms var(--ease-spring), opacity 180ms ease-out';
    if (armed) {
      if (navigator.vibrate) navigator.vibrate(15);
      spinner.classList.add('spin');
      spinner.style.opacity = '1';
      spinner.style.transform = 'translateY(6px)';
      if (window.ShopPromo) ShopPromo.invalidateCache();
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
    spinner.style.transition = 'transform 260ms var(--ease-spring), opacity 180ms ease-out';
    spinner.style.opacity = '0';
    spinner.style.transform = 'translateY(-50px)';
  });
}

/* ---------------------------------------------------------------------- */
/* Theming                                                                 */
/* ---------------------------------------------------------------------- */

/* Curated theme packs — the "Stockroom" identity (kraft-paper / charcoal
   tag cards, see style.css) stays fixed across every pack; a pack only
   swaps --accent / --accent-dim / --accent-ink, matching the [data-pack]
   selectors already defined in style.css exactly. Danger/success/warn are
   fixed semantic hues shared by every pack (also in style.css) so alerts
   never depend on which pack is active. */
const THEME_PACKS = {
  standard: { name: 'Standard',  accent: '#2F5233', accentDim: '#24402A', accentInk: '#FBF7EF' },
  orchid:   { name: 'Orchid',    accent: '#6B4C7A', accentDim: '#543A61', accentInk: '#FBF7EF' },
  ocean:    { name: 'Ocean',     accent: '#1F5F63', accentDim: '#17494C', accentInk: '#FBF7EF' },
  sunset:   { name: 'Sunset',    accent: '#C1502C', accentDim: '#9C3F22', accentInk: '#FBF7EF' },
  forest:   { name: 'Forest',    accent: '#24402A', accentDim: '#1A2F1F', accentInk: '#FBF7EF' },
  rosegold: { name: 'Rose Gold', accent: '#8C5A66', accentDim: '#6E4550', accentInk: '#FBF7EF' },
  midnight: { name: 'Midnight',  accent: '#5A6FD8', accentDim: '#4658B0', accentInk: '#14151B' },
  amber:    { name: 'Amber',     accent: '#A6741B', accentDim: '#825A14', accentInk: '#FBF7EF' },
  cherry:   { name: 'Cherry',    accent: '#8C2A3A', accentDim: '#6E202D', accentInk: '#FBF7EF' },
};
window.THEME_PACKS = THEME_PACKS;

/** Path to an illustration recolored to match the current theme pack (see
 *  tools/recolor-illustration.py — these are pre-generated at build time,
 *  not recolored live). `name` is the base illustration name (e.g.
 *  'empty-products', 'onboard-welcome'); `folder` is which img/ subfolder
 *  it lives in. Standard reuses the original file (it IS the standard-
 *  green source); every other pack has its own `-<pack>` variant
 *  generated from it. */
function themedIllustration(name, folder = 'empty-states') {
  const pack = document.documentElement.getAttribute('data-pack') || 'standard';
  const suffix = pack === 'standard' ? '' : `-${pack}`;
  return `img/${folder}/${name}${suffix}.webp`;
}
window.themedIllustration = themedIllustration;

async function applyTheme() {
  const appearance = await Settings.get('appearance');
  let theme = appearance.theme;
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-pack', appearance.themePack || 'standard');

  const pack = THEME_PACKS[appearance.themePack] || THEME_PACKS.standard;
  const root = document.documentElement.style;
  root.setProperty('--accent', pack.accent);
  root.setProperty('--accent-dim', pack.accentDim);
  root.setProperty('--accent-ink', pack.accentInk);

  // Every icon in the app is now a single animated line-icon set (see
  // icons.js) — emoji-as-icon is gone entirely, so this is unconditional.
  document.documentElement.setAttribute('data-icon-style', 'line');

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#EFE6D8';
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
    // numberingSystem: 'latn' pins this to plain 0-9 always — the device's
    // own locale (undefined here, so this already follows it) can default
    // an 'ar' locale to Eastern Arabic-Indic digits, which this app never
    // wants: prices/quantities/dates/receipt numbers all stay Western
    // numerals regardless of app or device language (see the ar locale
    // notes in the RTL audit).
    const formatted = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2, numberingSystem: 'latn' });
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
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2, numberingSystem: 'latn' });
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
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', numberingSystem: 'latn' });
  },

  time(d) {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', numberingSystem: 'latn' });
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
    ${store.logo ? `<img src="${store.logo}" alt="" style="width:24px;height:24px;border-radius:7px;object-fit:cover;vertical-align:-6px;margin-right:7px;">` : ''}${escapeHTML(store.name || I18n.t('dashboard.defaultStoreName'))}
    <small id="topbarSubtitle">${I18n.t('screenTitles.dashboard')}</small>
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

  // --- Yesterday, for the trend badge on the hero card ---
  const yesterdayStart = todayStart - 86400000;
  const yesterdaysRevenue = sales
    .filter((s) => { const t = new Date(s.date).getTime(); return t >= yesterdayStart && t < todayStart; })
    .reduce((sum, s) => sum + saleNetTotal(s), 0);
  const trendPct = yesterdaysRevenue > 0
    ? Math.round(((todaysRevenue - yesterdaysRevenue) / yesterdaysRevenue) * 100)
    : (todaysRevenue > 0 ? 100 : 0);
  const trendUp = trendPct >= 0;

  // --- Last 7 days, for the sparkline under the hero card ---
  const dailyTotals = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = todayStart - i * 86400000;
    const dayEnd = dayStart + 86400000;
    const total = sales
      .filter((s) => { const t = new Date(s.date).getTime(); return t >= dayStart && t < dayEnd; })
      .reduce((sum, s) => sum + saleNetTotal(s), 0);
    dailyTotals.push(total);
  }
  const sparklineSvg = renderSparkline(dailyTotals);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return I18n.t('dashboard.greetingMorning');
    if (h < 18) return I18n.t('dashboard.greetingAfternoon');
    return I18n.t('dashboard.greetingEvening');
  })();

  container.innerHTML = `
    <div class="dash-greeting">
      <div class="dash-greeting__text">${greeting}</div>
      <div class="dash-greeting__date">${Fmt.date(new Date())}</div>
    </div>

    <div class="hero-card">
      <div class="hero-card__top">
        <div class="hero-card__label">${I18n.t('dashboard.todaysRevenue')}</div>
        <div class="hero-card__trend ${trendUp ? 'up' : 'down'}">
          ${trendUp ? '▲' : '▼'} ${Math.abs(trendPct)}%
        </div>
      </div>
      <div class="hero-card__value num">${Fmt.money(todaysRevenue)}</div>
      <div class="hero-card__sub">${I18n.t('dashboard.saleCount', { count: transactionCount, plural: transactionCount === 1 ? '' : 's' })}</div>
      <div class="hero-card__spark">${sparklineSvg}</div>
      <div class="hero-card__spark-label">${I18n.t('dashboard.last7Days')}</div>
    </div>

    <div class="stat-grid stat-grid--secondary">
      <div class="stat-card">
        <div class="stat-card__icon-badge coral">${Icon('cart')}</div>
        <div class="stat-card__label">${I18n.t('dashboard.statSales')}</div>
        <div class="stat-card__value coral num">${transactionCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__icon-badge">${Icon('package')}</div>
        <div class="stat-card__label">${I18n.t('dashboard.statProducts')}</div>
        <div class="stat-card__value num">${productCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__icon-badge teal">${Icon('bar-chart')}</div>
        <div class="stat-card__label">${I18n.t('dashboard.statInventoryValue')}</div>
        <div class="stat-card__value teal num">${Fmt.money(inventoryValue)}</div>
      </div>
    </div>

    ${lowStock.length ? `
      <div class="section-title">${I18n.t('dashboard.lowStockTitle')}</div>
      <div class="list stagger">
        ${lowStock.slice(0, 5).map((p) => `
          <div class="list-row">
            <div class="list-row__icon warn">${Icon('alert-triangle')}</div>
            <div class="list-row__body">
              <div class="list-row__title">${escapeHTML(p.name)}</div>
              <div class="list-row__subtitle">${I18n.t('dashboard.minimumLabel', { min: p.minStock ?? 0 })}</div>
            </div>
            <div class="list-row__trailing">
              <span class="badge badge--danger">${I18n.t('dashboard.leftBadge', { qty: p.quantity })}</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="section-title">${I18n.t('dashboard.quickActionsTitle')}</div>
    <div class="quick-actions">
      ${quickAction('scanner', Icon('camera'), I18n.t('dashboard.qaScan'))}
      ${quickAction('pos', Icon('cart'), I18n.t('dashboard.qaNewSale'))}
      ${quickAction('products/new', Icon('plus-circle'), I18n.t('dashboard.qaAddProduct'))}
      ${quickAction('products', Icon('package'), I18n.t('dashboard.qaProducts'))}
      ${quickAction('inventory', Icon('bar-chart'), I18n.t('dashboard.qaInventory'))}
      ${quickAction('sales', Icon('history'), I18n.t('dashboard.qaSalesHistory'))}
      ${quickAction('customers', Icon('users'), I18n.t('dashboard.qaCustomers'))}
      ${quickAction('reports', Icon('trending-up'), I18n.t('dashboard.qaReports'))}
    </div>

    <div class="section-title-row">
      <div class="section-title" style="margin:0;">${I18n.t('dashboard.recentSalesTitle')}</div>
      ${recentSales.length ? `<a href="#sales" class="section-title-row__link">${I18n.t('dashboard.viewAll')}</a>` : ''}
    </div>
    ${recentSales.length ? `
      <div class="list stagger">
        ${recentSales.map((s) => `
          <div class="list-row">
            <div class="list-row__icon">${Icon('receipt')}</div>
            <div class="list-row__body">
              <div class="list-row__title ltr-code">${s.receiptNumber}</div>
              <div class="list-row__subtitle">${Fmt.dateTime(s.date)} · ${paymentMethodLabel(s.paymentMethod)}</div>
            </div>
            <div class="list-row__trailing">
              <div class="list-row__amount num">${Fmt.money(s.total)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-state__icon">${Icon('receipt', { size: 32 })}</div>
        <div class="empty-state__title">${I18n.t('dashboard.noSalesYet')}</div>
        <div class="empty-state__hint">${I18n.t('dashboard.noSalesHint')}</div>
      </div>
    `}
  `;
}

/** A tiny inline SVG line chart — no charting library needed for 7 data
 *  points. Flat/zero data still renders a sensible flat line instead of
 *  collapsing to nothing. */
function renderSparkline(values) {
  const W = 300, H = 56, PAD = 4;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = (W - PAD * 2) / (values.length - 1 || 1);
  const points = values.map((v, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
    return [x, y];
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${H} L${points[0][0].toFixed(1)},${H} Z`;
  return `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="sparkline-svg">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#sparkFill)" stroke="none"/>
      <path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

function quickAction(route, icon, label) {
  return `
    <a class="quick-action" href="#${route}">
      <span class="quick-action__icon">${icon}</span>
      <span>${label}</span>
    </a>`;
}

/** Translates a stored payment-method value ('cash', 'card', 'bank
 *  transfer', 'other') into the current language's display label. The
 *  stored value itself stays English since it's compared against
 *  elsewhere (filters, defaults) — only the rendered text changes. */
/** Markup for the small language-switcher chip row shown atop a receipt
 *  preview sheet (pos.js / sales.js) — lets the person override the
 *  configured receipt language for this one print/share without
 *  touching the Settings default. */
function receiptLangChipsHTML(currentLang) {
  return `
    <div class="text-dim text-sm mb-8">${I18n.t('receipt.previewLanguage')}</div>
    <div class="chip-row receipt-lang-chips mb-16">
      ${I18n.LANGUAGES.map((l) => `<button type="button" class="chip tappable${l.code === currentLang ? ' active' : ''}" data-lang="${l.code}">${l.flag} ${l.nativeName}</button>`).join('')}
    </div>
  `;
}
window.receiptLangChipsHTML = receiptLangChipsHTML;

/** Wires the chip row above to live-redraw `.receipt-preview-body` in
 *  the chosen language. Returns { getLang() } so the caller's
 *  print/share handlers use whatever language is currently selected. */
function wireReceiptPreview(sheetEl, sale, store, initialLang) {
  sheetEl.dataset.receiptLang = initialLang;
  const bodyEl = sheetEl.querySelector('.receipt-preview-body');
  const chipsEl = sheetEl.querySelector('.receipt-lang-chips');
  if (bodyEl && chipsEl) {
    chipsEl.querySelectorAll('[data-lang]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const lang = chip.dataset.lang;
        sheetEl.dataset.receiptLang = lang;
        chipsEl.querySelectorAll('[data-lang]').forEach((c) => c.classList.toggle('active', c === chip));
        bodyEl.innerHTML = Receipt.html(sale, store, lang);
      });
    });
  }
  return { getLang: () => sheetEl.dataset.receiptLang };
}
window.wireReceiptPreview = wireReceiptPreview;

/** Resolves the actual language code to render a receipt in, given the
 *  stored `pos.receiptLanguage` preference ('app' tracks the live UI
 *  language; a specific code pins the receipt regardless of what
 *  language the app itself is currently showing). */
function resolveReceiptLanguage(posSettings) {
  const pref = posSettings && posSettings.receiptLanguage;
  return (pref && pref !== 'app') ? pref : I18n.locale;
}
window.resolveReceiptLanguage = resolveReceiptLanguage;

function paymentMethodLabel(method, lang) {
  const map = {
    cash: I18n.t('common.paymentMethods.cash', null, lang),
    card: I18n.t('common.paymentMethods.card', null, lang),
    'bank transfer': I18n.t('common.paymentMethods.bankTransfer', null, lang),
    other: I18n.t('common.paymentMethods.other', null, lang),
  };
  return map[method] || method;
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
    ['inventory', Icon('bar-chart'), I18n.t('more.inventoryTitle'), I18n.t('more.inventorySub')],
    ['reports', Icon('trending-up'), I18n.t('more.reportsTitle'), I18n.t('more.reportsSub')],
    ['customers', Icon('users'), I18n.t('more.customersTitle'), I18n.t('more.customersSub')],
    ['suppliers', Icon('truck'), I18n.t('more.suppliersTitle'), I18n.t('more.suppliersSub')],
    ['backup', Icon('database'), I18n.t('more.backupTitle'), I18n.t('more.backupSub')],
    ['settings', Icon('settings'), I18n.t('more.settingsTitle'), I18n.t('more.settingsSub')],
  ];
  container.innerHTML = `
    <div class="list stagger">
      <div class="list-row tappable" id="aboutAppRow">
        <div class="list-row__icon"><img src="img/profile.jpg" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover;" onerror="this.replaceWith('ℹ️'); Toast.error('Diagnostic: img/profile.jpg failed to load');"></div>
        <div class="list-row__body">
          <div class="list-row__title">${I18n.t('more.aboutTitle')}</div>
          <div class="list-row__subtitle">${I18n.t('more.aboutSub')}</div>
        </div>
        <div class="list-row__trailing text-faint disclosure-chevron">›</div>
      </div>
      <div class="list-row tappable" id="replayTourRow">
        <div class="list-row__icon">${Icon('play-circle')}</div>
        <div class="list-row__body">
          <div class="list-row__title">${I18n.t('more.replayTourTitle')}</div>
          <div class="list-row__subtitle">${I18n.t('more.replayTourSub')}</div>
        </div>
        <div class="list-row__trailing text-faint disclosure-chevron">›</div>
      </div>
      <div class="list-row tappable" id="languageRow">
        <div class="list-row__icon" style="font-size:20px;">${(I18n.LANGUAGES.find((l) => l.code === I18n.locale) || I18n.LANGUAGES[0]).flag}</div>
        <div class="list-row__body">
          <div class="list-row__title">${I18n.t('language.rowTitle')}</div>
          <div class="list-row__subtitle">${I18n.t('language.rowSubtitle')}</div>
        </div>
        <div class="list-row__trailing text-faint disclosure-chevron">›</div>
      </div>
      <div class="list-row tappable" id="viewTermsRow">
        <div class="list-row__icon">${Icon('scroll')}</div>
        <div class="list-row__body">
          <div class="list-row__title">${I18n.t('more.termsTitle')}</div>
          <div class="list-row__subtitle">${I18n.t('more.termsSub')}</div>
        </div>
        <div class="list-row__trailing text-faint disclosure-chevron">›</div>
      </div>
      ${items.map(([route, icon, title, subtitle]) => `
        <a class="list-row tappable" href="#${route}">
          <div class="list-row__icon">${icon}</div>
          <div class="list-row__body">
            <div class="list-row__title">${escapeHTML(title)}</div>
            <div class="list-row__subtitle">${escapeHTML(subtitle)}</div>
          </div>
          <div class="list-row__trailing text-faint disclosure-chevron">›</div>
        </a>
      `).join('')}
    </div>
    <div class="text-faint text-sm" style="text-align:center; margin-top:20px;" id="moreVersionFooter">${I18n.t('about.appName')}</div>
  `;
  container.querySelector('#aboutAppRow').addEventListener('click', openAboutSheet);
  container.querySelector('#languageRow').addEventListener('click', () => {
    if (window.Language) Language.openFromMenu();
  });
  container.querySelector('#replayTourRow').addEventListener('click', () => {
    if (window.Onboarding) Onboarding.replay();
  });
  container.querySelector('#viewTermsRow').addEventListener('click', () => {
    if (window.Terms) Terms.show();
  });
  getAppVersionLabel().then((label) => {
    const el = container.querySelector('#moreVersionFooter');
    if (el) el.textContent = `${I18n.t('about.appName')} · ${label}`;
  });
}

function aboutCopyRow(label, value) {
  return `
    <div class="list-row tappable" data-copy-value="${escapeHTML(value)}" style="margin-bottom:8px;">
      <div class="list-row__body">
        <div class="list-row__title">${escapeHTML(label)}</div>
        <div class="list-row__subtitle">${escapeHTML(value)}</div>
      </div>
      <div class="list-row__trailing text-faint">${Icon('copy', { size: 16 })}</div>
    </div>
  `;
}

function openAboutSheet() {
  const t = (k, v) => I18n.t(`about.${k}`, v);
  const bodyHTML = `
    <div style="text-align:center; padding: 8px 0 24px;">
      <img src="img/profile.jpg" alt="" style="width:104px; height:104px; border-radius:50%; object-fit:cover; border:2px solid var(--border);" onerror="this.style.display='none'; Toast.error('Diagnostic: img/profile.jpg failed to load');">
      <div style="font-weight:700; font-size:18px; margin-top:16px;">${t('appName')}</div>
      <div class="text-dim text-sm" style="margin-top:8px;">${t('madeByPrefix')} <a href="#" id="aboutOwnerLink" style="color:var(--accent);">@rwgmo</a> ${t('madeBySuffix')}</div>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <div class="text-sm" style="line-height:1.6;">© ${t('copyright')}</div>
    </div>

    <div class="section-title" style="margin-bottom:12px;">${t('contactShop')}</div>
    <a class="list-row tappable" id="aboutTelegramLink" href="#" style="margin-bottom:8px;">
      <div class="list-row__icon">${Icon('send')}</div>
      <div class="list-row__body"><div class="list-row__title">${t('telegram')}</div><div class="list-row__subtitle">t.me/rwgmo</div></div>
      <div class="list-row__trailing text-faint disclosure-chevron">›</div>
    </a>
    <a class="list-row tappable" id="aboutShopLink" href="#" style="margin-bottom:24px;">
      <div class="list-row__icon">${Icon('gift')}</div>
      <div class="list-row__body"><div class="list-row__title">${t('telegramShop')}</div><div class="list-row__subtitle">t.me/RwmShop</div></div>
      <div class="list-row__trailing text-faint disclosure-chevron">›</div>
    </a>

    <div class="card" style="margin-bottom:24px;">
      <div class="text-sm" style="line-height:1.6;">${t('devPitch')}</div>
    </div>

    <div class="section-title" style="margin-bottom:12px;">${t('supportDonate')}</div>
    <div class="list" id="aboutDonateList" style="margin-bottom:8px;">
      ${aboutCopyRow(t('ccpAccount'), '007 99999 0042725714 28')}
      ${aboutCopyRow(t('binanceId'), '814491654')}
    </div>

    <div class="section-title" style="margin-bottom:12px;">${t('troubleshooting')}</div>
    <div class="list-row tappable" id="aboutDiagnosticsRow" style="margin-bottom:8px;">
      <div class="list-row__icon">${Icon('stethoscope')}</div>
      <div class="list-row__body">
        <div class="list-row__title">${t('runDiagnostics')}</div>
        <div class="list-row__subtitle">${t('runDiagnosticsSub')}</div>
      </div>
      <div class="list-row__trailing text-faint disclosure-chevron">›</div>
    </div>
    <div class="list" style="margin-bottom:24px;">
      <div class="list-row tappable" id="previewWhatsNewRow">
        <div class="list-row__icon">${Icon('star')}</div>
        <div class="list-row__body">
          <div class="list-row__title">${t('previewWhatsNew')}</div>
          <div class="list-row__subtitle">${t('previewWhatsNewSub')}</div>
        </div>
        <div class="list-row__trailing text-faint disclosure-chevron">›</div>
      </div>
      <div class="list-row tappable" id="previewDonateRow">
        <div class="list-row__icon">${Icon('gift')}</div>
        <div class="list-row__body">
          <div class="list-row__title">${t('previewDonate')}</div>
          <div class="list-row__subtitle">${t('previewDonateSub')}</div>
        </div>
        <div class="list-row__trailing text-faint disclosure-chevron">›</div>
      </div>
    </div>

    <div class="text-faint text-sm" style="text-align:center; margin-top:28px;" id="aboutVersionFooter">${t('appName')}</div>
  `;

  const sheetEl = Sheet.open({ title: t('sheetTitle'), bodyHTML });
  sheetEl.querySelector('#aboutDiagnosticsRow').addEventListener('click', showDiagnostics);
  sheetEl.querySelector('#previewWhatsNewRow').addEventListener('click', () => {
    if (window.WhatsNew) WhatsNew.show();
  });
  sheetEl.querySelector('#previewDonateRow').addEventListener('click', () => {
    if (window.Donate) Donate.preview();
  });
  getAppVersionLabel().then((label) => {
    const el = sheetEl.querySelector('#aboutVersionFooter');
    if (el) el.textContent = `${t('appName')} · ${label}`;
  });

  const goTelegram = () => openExternal('https://t.me/rwgmo');
  sheetEl.querySelector('#aboutOwnerLink').addEventListener('click', (e) => { e.preventDefault(); goTelegram(); });
  sheetEl.querySelector('#aboutTelegramLink').addEventListener('click', (e) => { e.preventDefault(); goTelegram(); });
  sheetEl.querySelector('#aboutShopLink').addEventListener('click', (e) => { e.preventDefault(); openExternal('https://t.me/RwmShop'); });

  sheetEl.querySelectorAll('[data-copy-value]').forEach((row) => {
    row.addEventListener('click', async () => {
      const ok = await copyToClipboard(row.dataset.copyValue);
      Toast.show(ok ? t('copied') : t('copyFailed'));
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
    lines.push(`Plugins.AdMob: ${plugins.AdMob ? 'yes' : 'MISSING'}`);
    lines.push(`Plugins.PushNotifications: ${plugins.PushNotifications ? 'yes' : 'MISSING'}`);
    lines.push(`Plugins.LocalNotifications: ${plugins.LocalNotifications ? 'yes' : 'MISSING'}`);
  }

  lines.push('');
  lines.push('--- Ad Source ---');
  if (window.ShopPromo && ShopPromo.getDebugInfo) {
    const s = ShopPromo.getDebugInfo();
    lines.push(`Config loaded: ${s.adModeLoaded ? 'yes' : 'not yet'}`);
    lines.push(`Ad mode: ${s.adMode}`);
    lines.push(`Rotation count: ${s.rotationCount} (even=personal, odd=admob for "both")`);
  } else {
    lines.push('ShopPromo: MISSING');
  }

  lines.push('');
  lines.push('--- AdMob ---');
  if (window.AdMobBridge && AdMobBridge.getDebugInfo) {
    const a = AdMobBridge.getDebugInfo();
    lines.push(`Native platform: ${a.isNative ? 'yes' : 'no (web preview — AdMob never shows here)'}`);
    lines.push(`SDK initialized: ${a.initialized ? 'yes' : 'no'}`);
    lines.push(`Consent checked: ${a.consentChecked ? 'yes' : 'no'}`);
    lines.push(`Consent status: ${a.lastConsentStatus || 'unknown'}`);
    lines.push(`Can request ads: ${a.canRequestAds ? 'yes' : 'NO \u2014 this blocks every ad request'}`);
    lines.push(`Ad request ever attempted this session: ${a.everAttemptedThisSession ? 'yes' : 'NOT YET \u2014 visit Dashboard/Products/POS etc. first'}`);
    lines.push(`Ad ever loaded successfully this session: ${a.everShownThisSession ? 'yes' : 'no'}`);
    lines.push(`Ad ever failed to load this session: ${a.everFailedThisSession ? 'yes' : 'no'}`);
    lines.push(`Banner on screen RIGHT NOW: ${a.bannerVisible ? 'yes' : 'no (expected \u2014 this screen isn\u2019t an ad screen)'}`);
    lines.push(`Last error: ${a.lastError || 'none'}`);
    if (!a.pluginPresent) lines.push('\u26a0\ufe0f AdMob plugin not found \u2014 the installed build may predate this feature.');
  } else {
    lines.push('AdMobBridge: MISSING');
  }
  NumberPopup.show(lines.join('\n'), { small: true });
}
window.showDiagnostics = showDiagnostics;

/* ---------------------------------------------------------------------- */
/* Boot                                                                     */
/* ---------------------------------------------------------------------- */

(async function boot() {
  // A no-op touchstart listener anywhere in the ancestor chain is what
  // makes Android WebView actually apply CSS :active on tap at all — the
  // existing touchstart listeners in this file are all scoped to specific
  // elements (sheet drag handles, swipe rows), so most buttons/icons never
  // had :active fire on this device. This is what every press-feedback
  // animation on every icon in the app depends on.
  document.documentElement.addEventListener('touchstart', () => {}, { passive: true });

  await DB.openDB();
  await applyTheme();
  if (window.I18n) { await I18n.init(); I18n.applyStaticDOM(); }
  await Fmt.init();

  // Language picker runs before Terms/Onboarding — "the first onboarding
  // screen" — and no-ops instantly once a language's actually been
  // chosen, so it's safe to call on every single launch.
  if (window.Language) await Language.maybeGate();

  if (window.Terms) await Terms.requireAcceptance();

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
  watchAppResumeForFreshAds();
  // Checked once here at cold boot too (not just on resume) — a fresh
  // launch is also a moment someone could be behind on a forced update.
  // Runs in parallel with the rest of boot rather than blocking it; if
  // it turns out an update IS required, the blocking screen appears the
  // moment that's confirmed, over whatever's already on screen.
  if (window.SelfUpdate) SelfUpdate.checkForUpdate();

  // Onboarding is for a genuinely empty, fresh install only — gating on
  // the flag alone would wrongly trigger it for an existing user who's
  // upgrading straight into this version (their flag was never set,
  // simply because this feature didn't exist yet, but they already have
  // real data). Existing users get the What's New changelog instead, and
  // never lose anything — this whole block only ever reads/writes a
  // couple of localStorage flags, never touches IndexedDB.
  try {
    const hasData = (await DB.count('products')) > 0 || (await DB.count('sales')) > 0;
    const seenOnboarding = localStorage.getItem('sa_onboarding_complete');

    if (!seenOnboarding && !hasData) {
      if (window.Onboarding) Onboarding.maybeStart();
    } else {
      if (!seenOnboarding) localStorage.setItem('sa_onboarding_complete', '1');
      const shownWhatsNew = window.WhatsNew ? WhatsNew.maybeShow() : false;
      if (!shownWhatsNew && window.Donate) {
        setTimeout(() => Donate.maybeShow(), 1400);
      }
      // Existing users skip onboarding entirely, so this is their only
      // chance to be asked for the notification permission proactively
      // (rather than the first time an ad happens to change).
      if (window.AdNotify) setTimeout(() => AdNotify.requestPermission(), 1200);
      if (window.AdPush) setTimeout(() => AdPush.init(), 1300);
      if (window.Stats) setTimeout(() => Stats.reportIfDue(), 4000);
    }
  } catch (e) {
    console.warn('Onboarding/What\u2019s New check failed:', e);
  }
})();
