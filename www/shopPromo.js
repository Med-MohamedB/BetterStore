/* ==========================================================================
   ShopPromo — a small "spotlight" card shown at the top of every
   business-data screen. Content is fetched at runtime from AD_CONFIG_URL,
   so it updates without an app release — edit via the control panel,
   publish, pull-to-refresh the Dashboard.

   ad-config.json shape:
     {
       "active": true,
       "style": "simple",              // "simple" | "image"
       "url": "https://example.com",
       "expiresAt": null,

       // style === "simple"
       "icon": "🎯",
       "image": "https://.../pic.png", // takes priority over icon when present
       "title": "Short punchy title",
       "subtitle": "One short line",

       // style === "image" — one full custom banner graphic, already
       // fully designed (background + text baked in) — no separate text
       // fields needed at all.
       "bannerImage": "https://.../banner.jpg",
       "bannerHeight": 160
     }
   Set "active": false (or delete the file) to fall back to the default
   Telegram Shop card automatically.

   SECURITY MODEL:
   - The remote JSON is DATA ONLY. Every text field is escaped before it
     ever touches innerHTML.
   - URLs (link, image, banner image) are only ever used where a URL is
     expected, and only if they start with "https://".
   - No comment/reply mechanism of any kind — tap or dismiss, that's it.
   ========================================================================== */

const ShopPromo = (() => {
  const AD_CONFIG_URL = 'https://raw.githubusercontent.com/med-mohamedb/BetterStore/main/ad-config.json';

  const CACHE_KEY = 'sa_spotlight_cache';
  const DISMISS_KEY = 'sa_spotlight_dismissed_session';

  const DEFAULT_CONFIG = {
    style: 'simple',
    icon: '🛍️',
    image: null,
    title: 'Check out our Telegram Shop',
    subtitle: 't.me/RwmShop',
    url: 'https://t.me/RwmShop',
  };

  let cachedConfig;
  let inFlight = null;

  function isSafeUrl(url) {
    return typeof url === 'string' && /^https:\/\//i.test(url);
  }
  function clamp(n, min, max, fallback) {
    const v = Number(n);
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
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
      return null;
    }
  }

  function resolve(remote) {
    const expired = remote && remote.expiresAt && new Date(remote.expiresAt).getTime() < Date.now();
    if (!remote || !remote.active || expired) return DEFAULT_CONFIG;

    const url = isSafeUrl(remote.url) ? remote.url : null;

    if (remote.style === 'image') {
      // A misconfigured image ad (bad/missing URL) falls all the way back
      // to the Telegram Shop default rather than rendering a half-broken
      // "simple" card with no icon/title/subtitle to show.
      if (!isSafeUrl(remote.bannerImage)) return DEFAULT_CONFIG;
      return {
        style: 'image',
        url,
        bannerImage: remote.bannerImage,
        bannerHeight: clamp(remote.bannerHeight, 90, 320, 160),
      };
    }

    return {
      style: 'simple',
      url,
      icon: (typeof remote.icon === 'string' && remote.icon.trim()) ? remote.icon.slice(0, 8) : '🎯',
      image: isSafeUrl(remote.image) ? remote.image : null,
      title: typeof remote.title === 'string' ? remote.title.slice(0, 80) : '',
      subtitle: typeof remote.subtitle === 'string' ? remote.subtitle.slice(0, 120) : '',
    };
  }

  async function getConfig() {
    if (cachedConfig !== undefined) return cachedConfig;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const remote = await fetchRemote();
      if (remote) {
        persist(remote);
        cachedConfig = resolve(remote);
        if (window.AdNotify) AdNotify.checkAndNotify(cachedConfig);
      } else {
        cachedConfig = resolve(loadPersisted());
      }
      inFlight = null;
      return cachedConfig;
    })();
    return inFlight;
  }

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
    if (!config || !slot.isConnected || sessionStorage.getItem(DISMISS_KEY)) return;

    if (config.style === 'image') renderImageBanner(slot, config);
    else renderCompact(slot, config);
  }

  function attachDismiss(slot, card) {
    const btn = slot.querySelector('.feature-spotlight__dismiss');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sessionStorage.setItem(DISMISS_KEY, '1');
      const done = () => slot.remove();
      if (window.Fx) Fx.animate(card, { opacity: [1, 0], x: [0, 24] }, { duration: 0.18 }).finished.then(done);
      else done();
    });
  }

  function attachTap(card, url) {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      if (e.target.closest('.feature-spotlight__dismiss')) return;
      if (window.Fx) Fx.animate(card, { scale: [1, 0.97, 1] }, { duration: 0.22 });
      if (url && window.openExternal) openExternal(url);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Compact card — small icon + text banner                          */
  /* ---------------------------------------------------------------- */
  function renderCompact(slot, config) {
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

    const img = card.querySelector('.feature-spotlight__media img');
    if (img) {
      img.addEventListener('error', () => {
        const media = card.querySelector('.feature-spotlight__media');
        media.classList.add('feature-spotlight__media--emoji');
        media.innerHTML = escapeHTML(config.icon);
      });
    }

    if (window.Fx) Fx.animate(card, { opacity: [0, 1], y: [-10, 0], scale: [0.97, 1] }, { type: 'spring', stiffness: 320, damping: 24 });
    attachTap(card, config.url);
    attachDismiss(slot, card);
  }

  /* ---------------------------------------------------------------- */
  /* Image banner — one full custom graphic, nothing else needed       */
  /* ---------------------------------------------------------------- */
  function renderImageBanner(slot, config) {
    slot.innerHTML = `
      <a href="#" class="image-spotlight tappable" style="height:${config.bannerHeight}px;">
        <img src="${config.bannerImage}" alt="" referrerpolicy="no-referrer" loading="lazy">
        <span class="image-spotlight__sheen"></span>
        <button class="feature-spotlight__dismiss image-spotlight__dismiss tappable" aria-label="Dismiss">✕</button>
      </a>
    `;
    const card = slot.querySelector('.image-spotlight');
    const img = card.querySelector('img');

    // If the banner image itself fails to load, there's nothing sensible
    // left to show — pull the whole card rather than leave a broken box.
    img.addEventListener('error', () => slot.remove());

    if (window.Fx) Fx.animate(card, { opacity: [0, 1], y: [-10, 0], scale: [0.97, 1] }, { type: 'spring', stiffness: 320, damping: 24 });
    attachTap(card, config.url);
    attachDismiss(slot, card);
  }

  return { mountTop, invalidateCache };
})();
window.ShopPromo = ShopPromo;
