/* ==========================================================================
   ShopPromo — a small "spotlight" card shown at the top of every
   business-data screen (see the SPOTLIGHT_ROUTES allowlist in app.js's
   Router.renderCurrent). Its content is fetched at runtime from a JSON
   file the developer controls, so it can be changed any time WITHOUT an
   app update — no rebuild, no re-publish, no user action needed.

   HOW TO USE THIS:
   1. Set AD_CONFIG_URL below to a raw HTTPS URL you control (e.g. a file
      in your own GitHub repo, served via raw.githubusercontent.com).
   2. Add a file there with this shape:
        {
          "active": true,
          "icon": "🎯",
          "title": "Short punchy title",
          "subtitle": "One short line",
          "url": "https://example.com",
          "expiresAt": null
        }
      Set "active": false (or just delete the file) to fall back to the
      default Telegram Shop card automatically.
   3. To "preview" a change: push it, then pull-to-refresh the Dashboard
      in the app — that forces a fresh fetch (bypassing any cache) so you
      see exactly what users will see, in seconds.

   SECURITY MODEL — this matters, read it before changing it:
   - The remote JSON is treated as plain DATA ONLY. Every text field is
     escaped (escapeHTML) before it ever touches innerHTML — it can never
     inject HTML or run script, even if the hosting source were somehow
     compromised.
   - "url" is only ever used as a navigation target, and only if it starts
     with "https://" — never eval'd, never rendered as a raw href string.
   - There is no way for anyone to comment, reply, or otherwise interact
     with this beyond tapping it or dismissing it.
   - Access control is just "who can push to your repo" — the same access
     control you already trust for the app's source code.
   - No ad-network domains, no ad-network-shaped markup (no class/id with
     "ad", "banner", "sponsor" in it) — this is indistinguishable from any
     other first-party content to both domain-based and cosmetic-filter
     ad blockers.
   ========================================================================== */

const ShopPromo = (() => {
  // TODO: point this at a raw JSON file in a repo you control, e.g.
  // 'https://raw.githubusercontent.com/<your-username>/BetterStore/main/ad-config.json'
  const AD_CONFIG_URL = '';

  const CACHE_KEY = 'sa_spotlight_cache';
  const DISMISS_KEY = 'sa_spotlight_dismissed_session';

  const DEFAULT_CONFIG = {
    icon: '🛍️',
    title: 'Check out our Telegram Shop',
    subtitle: 't.me/RwmShop',
    url: 'https://t.me/RwmShop',
  };

  let cachedConfig; // undefined = not resolved yet this session
  let inFlight = null;

  function isSafeUrl(url) {
    return typeof url === 'string' && /^https:\/\//i.test(url);
  }

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function persist(remote) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(remote)); } catch (e) { /* ignore */ }
  }

  async function fetchRemote() {
    if (!AD_CONFIG_URL) return null; // not configured yet — silently use the default
    try {
      const res = await fetch(`${AD_CONFIG_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null; // offline, DNS failure, bad JSON, etc.
    }
  }

  /** Turns raw remote JSON (untrusted data) into a safe, bounded display
   *  config — or falls back to the Telegram Shop default if the remote
   *  is missing, inactive, expired, or was never successfully fetched. */
  function resolve(remote) {
    const expired = remote && remote.expiresAt && new Date(remote.expiresAt).getTime() < Date.now();
    if (remote && remote.active && !expired) {
      return {
        icon: (typeof remote.icon === 'string' && remote.icon.trim()) ? remote.icon.slice(0, 8) : '🎯',
        title: typeof remote.title === 'string' ? remote.title.slice(0, 80) : '',
        subtitle: typeof remote.subtitle === 'string' ? remote.subtitle.slice(0, 120) : '',
        url: isSafeUrl(remote.url) ? remote.url : null,
      };
    }
    return DEFAULT_CONFIG;
  }

  async function getConfig() {
    if (cachedConfig !== undefined) return cachedConfig;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const remote = await fetchRemote();
      if (remote) {
        persist(remote);
        cachedConfig = resolve(remote);
      } else {
        cachedConfig = resolve(loadPersisted());
      }
      inFlight = null;
      return cachedConfig;
    })();
    return inFlight;
  }

  /** Forces the next getConfig() to hit the network again — used by
   *  pull-to-refresh so a developer can push a change and see it live
   *  within seconds instead of waiting out any cache. */
  function invalidateCache() {
    cachedConfig = undefined;
    inFlight = null;
  }

  async function mountTop(container) {
    if (!container) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    const slot = document.createElement('div');
    slot.className = 'feature-spotlight-slot';
    container.insertBefore(slot, container.firstChild);

    const config = await getConfig();
    // The route may have navigated away again while we were waiting on
    // the network — don't render into a slot that's no longer on screen.
    if (!config || !slot.isConnected || sessionStorage.getItem(DISMISS_KEY)) return;

    renderCard(slot, config);
  }

  function renderCard(slot, config) {
    slot.innerHTML = `
      <a href="#" class="feature-spotlight tappable">
        <span class="feature-spotlight__icon">${escapeHTML(config.icon)}</span>
        <span class="feature-spotlight__body">
          <span class="feature-spotlight__title">${escapeHTML(config.title)}</span>
          <span class="feature-spotlight__sub">${escapeHTML(config.subtitle)}</span>
        </span>
        <button class="feature-spotlight__dismiss tappable" aria-label="Dismiss">✕</button>
      </a>
    `;
    const card = slot.querySelector('.feature-spotlight');
    if (window.Fx) Fx.animate(card, { opacity: [0, 1], y: [-8, 0] }, { type: 'spring', stiffness: 300, damping: 22 });

    card.addEventListener('click', (e) => {
      e.preventDefault();
      if (e.target.closest('.feature-spotlight__dismiss')) return;
      if (config.url && window.openExternal) openExternal(config.url);
    });

    slot.querySelector('.feature-spotlight__dismiss').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sessionStorage.setItem(DISMISS_KEY, '1');
      const done = () => slot.remove();
      if (window.Fx) Fx.animate(card, { opacity: [1, 0], x: [0, 24] }, { duration: 0.18 }).finished.then(done);
      else done();
    });
  }

  return { mountTop, invalidateCache };
})();
window.ShopPromo = ShopPromo;
