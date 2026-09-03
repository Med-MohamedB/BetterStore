/* ==========================================================================
   ShopPromo — a small "spotlight" card shown at the top of every
   business-data screen (see the SPOTLIGHT_ROUTES allowlist in app.js's
   Router.renderCurrent). Its content is fetched at runtime from a JSON
   file at AD_CONFIG_URL, so it can be changed any time WITHOUT an app
   update — edit it via the control panel (docs/panel-036912c2.html),
   publish, then pull-to-refresh the Dashboard to see it live in seconds.

   ad-config.json shape:
     {
       "active": true,
       "icon": "🎯",
       "image": "https://.../pic.png",   // optional — takes priority over icon when present
       "title": "Short punchy title",
       "subtitle": "One short line",
       "url": "https://example.com",
       "expiresAt": null
     }
   Set "active": false (or delete the file) to fall back to the default
   Telegram Shop card automatically.

   SECURITY MODEL:
   - The remote JSON is treated as plain DATA ONLY. Every text field is
     escaped (escapeHTML) before it ever touches innerHTML — it can never
     inject HTML or run script, even if the hosting source were somehow
     compromised.
   - "url" and "image" are only ever used where a URL is expected (a nav
     target / an <img src>), and only if they start with "https://" —
     never eval'd, never built into a raw HTML string.
   - No comment/reply mechanism of any kind — tap or dismiss, that's it.
   - Access control is just "who can push to the repo" — same trust
     boundary as the app's source code itself.
   - No ad-network domains, no ad-network-shaped markup (no "ad",
     "banner", "sponsor" in any class/id) — indistinguishable from any
     other first-party content to both domain- and cosmetic-filter
     ad blockers.
   ========================================================================== */

const ShopPromo = (() => {
  const AD_CONFIG_URL = 'https://raw.githubusercontent.com/med-mohamedb/BetterStore/main/ad-config.json';

  const CACHE_KEY = 'sa_spotlight_cache';
  const DISMISS_KEY = 'sa_spotlight_dismissed_session';

  const DEFAULT_CONFIG = {
    icon: '🛍️',
    image: null,
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
    if (!AD_CONFIG_URL) return null;
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
        image: isSafeUrl(remote.image) ? remote.image : null,
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
    const mediaHTML = config.image
      ? `<span class="feature-spotlight__media"><img src="${config.image}" alt="" referrerpolicy="no-referrer" loading="lazy"></span>`
      : `<span class="feature-spotlight__media feature-spotlight__media--emoji">${escapeHTML(config.icon)}</span>`;

    slot.innerHTML = `
      <a href="#" class="feature-spotlight tappable">
        <span class="feature-spotlight__sheen"></span>
        ${mediaHTML}
        <span class="feature-spotlight__body">
          <span class="feature-spotlight__title">${escapeHTML(config.title)}</span>
          <span class="feature-spotlight__sub">${escapeHTML(config.subtitle)}</span>
        </span>
        <span class="feature-spotlight__chevron">›</span>
        <button class="feature-spotlight__dismiss tappable" aria-label="Dismiss">✕</button>
      </a>
    `;
    const card = slot.querySelector('.feature-spotlight');

    // If a custom image fails to load (bad URL, host went down, etc.),
    // fall back to the emoji icon rather than showing a broken-image box.
    const img = card.querySelector('.feature-spotlight__media img');
    if (img) {
      img.addEventListener('error', () => {
        const media = card.querySelector('.feature-spotlight__media');
        media.classList.add('feature-spotlight__media--emoji');
        media.innerHTML = escapeHTML(config.icon);
      });
    }

    if (window.Fx) Fx.animate(card, { opacity: [0, 1], y: [-10, 0], scale: [0.97, 1] }, { type: 'spring', stiffness: 320, damping: 24 });

    card.addEventListener('click', (e) => {
      e.preventDefault();
      if (e.target.closest('.feature-spotlight__dismiss')) return;
      if (window.Fx) Fx.animate(card, { scale: [1, 0.97, 1] }, { duration: 0.22 });
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
