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
  // Two sources, tried in order:
  //   1. The GitHub API's "raw" media type — reflects a fresh commit almost
  //      immediately, because it isn't behind the aggressive edge cache
  //      below.
  //   2. raw.githubusercontent.com — sits behind a CDN that can lag a few
  //      minutes behind a brand-new commit REGARDLESS of cache-busting
  //      query params (its edge cache ignores them for this host), which
  //      is exactly what caused a push notification to arrive before the
  //      app could actually see the new ad it was announcing. Kept only
  //      as a fallback for when the API is unreachable/rate-limited.
  const AD_CONFIG_API_URL = 'https://api.github.com/repos/med-mohamedb/BetterStore/contents/ad-config.json?ref=main';
  const AD_CONFIG_RAW_URL = 'https://raw.githubusercontent.com/med-mohamedb/BetterStore/main/ad-config.json';

  const CACHE_KEY = 'sa_spotlight_cache';
  const DISMISS_KEY = 'sa_spotlight_dismissed_session';
  const AD_ROTATION_KEY = 'sa_ad_rotation_counter';
  const VALID_AD_MODES = ['personal', 'admob', 'both'];

  const DEFAULT_CONFIG = {
    style: 'simple',
    icon: '🛍️',
    image: null,
    title: 'Check out our Telegram Shop',
    subtitle: 't.me/RwmShop',
    url: 'https://t.me/RwmShop',
  };

  let cachedConfig;
  let cachedAdMode = 'personal';
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
    // Primary: GitHub's API, asked for the raw file body directly (no
    // base64 wrapper to decode) via the special Accept header — this is
    // the fast-to-update path.
    try {
      const res = await fetch(`${AD_CONFIG_API_URL}&_=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github.raw+json' },
      });
      if (res.ok) return await res.json();
    } catch (e) { /* fall through to the CDN mirror below */ }

    // Fallback: the CDN mirror — slower to reflect a brand-new commit, but
    // still correct once its cache catches up, and doesn't need GitHub's
    // API to be reachable.
    try {
      const res = await fetch(`${AD_CONFIG_RAW_URL}?t=${Date.now()}`, { cache: 'no-store' });
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

  function readAdMode(remote) {
    return remote && VALID_AD_MODES.includes(remote.adMode) ? remote.adMode : 'personal';
  }

  async function getConfig() {
    if (cachedConfig !== undefined) return cachedConfig;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const remote = await fetchRemote();
      if (remote) {
        persist(remote);
        cachedConfig = resolve(remote);
        cachedAdMode = readAdMode(remote);
        if (window.AdNotify) AdNotify.checkAndNotify(cachedConfig);
      } else {
        const persisted = loadPersisted();
        cachedConfig = resolve(persisted);
        cachedAdMode = readAdMode(persisted);
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

  // adMode is independent of the personal ad's own active/inactive state
  // — AdMob keeps running even if the personal promo is switched off, and
  // vice versa, since they're two separate revenue/marketing channels.
  function nextTurnIsAdMob() {
    const n = (parseInt(localStorage.getItem(AD_ROTATION_KEY), 10) || 0) + 1;
    localStorage.setItem(AD_ROTATION_KEY, String(n));
    return n % 2 === 0;
  }

  function signatureFor(config) {
    if (!config) return '';
    if (config.style === 'image') return `image:${config.bannerImage}:${config.url}`;
    return `simple:${config.title}:${config.subtitle}:${config.image}:${config.url}`;
  }

  async function mountTop(container) {
    if (!container) return;

    const config = await getConfig();
    if (!config) return;

    const showAdMobThisTurn = cachedAdMode === 'admob' || (cachedAdMode === 'both' && nextTurnIsAdMob());

    if (showAdMobThisTurn) {
      // The native AdMob banner is an overlay drawn by Android itself, not
      // an element inside `container` — nothing to insert into the DOM
      // this turn, just trigger it and get out of the way.
      if (window.AdMobBridge) window.AdMobBridge.showBanner();
      return;
    }
    if (window.AdMobBridge) window.AdMobBridge.hideBannerIfShown();

    // The dismiss flag is tied to THIS specific ad's content, not "any ad
    // this session" — so dismissing today's offer hides today's offer, but
    // the moment a genuinely different one is published (including via an
    // instant push while the app is open), it shows up on its own instead
    // of staying hidden until the next app restart.
    if (sessionStorage.getItem(DISMISS_KEY) === signatureFor(config)) return;

    const slot = document.createElement('div');
    slot.className = 'feature-spotlight-slot';
    container.insertBefore(slot, container.firstChild);

    if (!slot.isConnected || sessionStorage.getItem(DISMISS_KEY) === signatureFor(config)) return;

    if (config.style === 'image') renderImageBanner(slot, config);
    else renderCompact(slot, config);
  }

  /** Called from the router for any screen that ISN'T a promo-eligible
   *  screen, so a native AdMob banner from a previous screen doesn't
   *  linger as a stray overlay somewhere it was never meant to appear. */
  function hideEverywhere() {
    if (window.AdMobBridge) window.AdMobBridge.hideBannerIfShown();
  }

  function attachDismiss(slot, card, config) {
    const btn = slot.querySelector('.feature-spotlight__dismiss');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sessionStorage.setItem(DISMISS_KEY, signatureFor(config));
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
    attachDismiss(slot, card, config);
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
    attachDismiss(slot, card, config);
  }

  /** For the on-device diagnostics screen — surfaces what ShopPromo
   *  currently believes about the ad source, without needing a computer
   *  to inspect it. */
  function getDebugInfo() {
    return {
      adModeLoaded: cachedConfig !== undefined,
      adMode: cachedAdMode,
      rotationCount: parseInt(localStorage.getItem(AD_ROTATION_KEY), 10) || 0,
    };
  }

  return { mountTop, invalidateCache, hideEverywhere, getDebugInfo };
})();
window.ShopPromo = ShopPromo;
