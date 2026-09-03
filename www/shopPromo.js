/* ==========================================================================
   ShopPromo — a small "spotlight" card (or, in "custom" style, a full
   designed hero banner) shown at the top of every business-data screen.
   Content is fetched at runtime from AD_CONFIG_URL, so it updates without
   an app release — edit via the control panel, publish, pull-to-refresh.

   ad-config.json shape (all fields optional except "active"):
     {
       "active": true,
       "style": "simple",              // "simple" | "custom"
       "url": "https://example.com",
       "expiresAt": null,

       // used when style === "simple"
       "icon": "🎯",
       "image": "https://.../pic.png", // takes priority over icon when present
       "title": "Short punchy title",
       "subtitle": "One short line",

       // used when style === "custom" — a fully designed hero banner
       "custom": {
         "height": 180,
         "background": { "type": "gradient", "from": "#6A3FA0", "to": "#2B1740", "image": null },
         "pattern": "dots",           // "none" | "dots" | "wave"
         "font": "rounded",           // "system" | "rounded" | "bold" | "serif"
         "illustration": { "image": "https://...", "x": 6, "y": 12, "width": 38 },
         "title": { "text": "Check out our\nTelegram Shop", "color": "#FFFFFF", "x": 42, "y": 14, "size": 21 },
         "subtitle": { "text": "Exclusive deals, new arrivals!", "color": "#D8CBE8", "x": 42, "y": 48, "size": 12.5 },
         "button": { "text": "Visit Now", "bg": "#7C4DFF", "color": "#FFFFFF", "x": 42, "y": 72 }
       }
     }
   Set "active": false (or delete the file) to fall back to the default
   Telegram Shop card automatically.

   SECURITY MODEL (unchanged in spirit, extended in scope):
   - The remote JSON is DATA ONLY. Every text field is escaped before it
     ever touches innerHTML.
   - URLs (main link, image, illustration, background image) are only
     ever used where a URL is expected, and only if they start with
     "https://".
   - Colors are validated against a strict hex-color pattern before being
     used in an inline style — never passed through unchecked, which
     would otherwise let a compromised config smuggle arbitrary CSS
     through a style attribute.
   - Fonts are chosen from a fixed local whitelist by keyword — remote
     data can pick one of four known font stacks, never supply its own
     arbitrary font-family string.
   - Numeric layout values (position, size, height) are clamped to sane
     ranges so a bad config can't produce a broken/overflowing layout.
   - No comment/reply mechanism of any kind — tap or dismiss, that's it.
   ========================================================================== */

const ShopPromo = (() => {
  const AD_CONFIG_URL = 'https://raw.githubusercontent.com/med-mohamedb/BetterStore/main/ad-config.json';

  const CACHE_KEY = 'sa_spotlight_cache';
  const DISMISS_KEY = 'sa_spotlight_dismissed_session';

  const FONT_STACKS = {
    system: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
    rounded: `"Baloo 2", "Varela Round", -apple-system, sans-serif`,
    bold: `"Poppins", "Arial Black", -apple-system, sans-serif`,
    serif: `Georgia, "Times New Roman", serif`,
  };

  const DEFAULT_CONFIG = {
    style: 'simple',
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
  function isSafeColor(c) {
    return typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c.trim());
  }
  function clamp(n, min, max, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
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

  /** Sanitizes the "custom" hero sub-object field by field — every value
   *  is validated or clamped, nothing passes through unchecked. */
  function resolveCustom(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const bg = raw.background || {};
    const bgType = ['solid', 'gradient', 'image'].includes(bg.type) ? bg.type : 'gradient';
    const background = {
      type: bgType,
      from: isSafeColor(bg.from) ? bg.from : '#6A3FA0',
      to: isSafeColor(bg.to) ? bg.to : '#2B1740',
      image: isSafeUrl(bg.image) ? bg.image : null,
    };

    const pattern = ['none', 'dots', 'wave'].includes(raw.pattern) ? raw.pattern : 'none';
    const font = FONT_STACKS[raw.font] ? raw.font : 'system';

    const illu = raw.illustration || {};
    const illustration = isSafeUrl(illu.image) ? {
      image: illu.image,
      x: clamp(illu.x, 0, 85, 6),
      y: clamp(illu.y, 0, 80, 10),
      width: clamp(illu.width, 10, 65, 38),
    } : null;

    const t = raw.title || {};
    const title = {
      text: typeof t.text === 'string' ? t.text.slice(0, 100) : '',
      color: isSafeColor(t.color) ? t.color : '#FFFFFF',
      x: clamp(t.x, 0, 90, 42),
      y: clamp(t.y, 0, 85, 14),
      size: clamp(t.size, 12, 30, 20),
    };

    const s = raw.subtitle || {};
    const subtitle = {
      text: typeof s.text === 'string' ? s.text.slice(0, 140) : '',
      color: isSafeColor(s.color) ? s.color : '#E5DCEF',
      x: clamp(s.x, 0, 90, 42),
      y: clamp(s.y, 0, 90, 46),
      size: clamp(s.size, 10, 20, 12.5),
    };

    const b = raw.button || {};
    const button = (typeof b.text === 'string' && b.text.trim()) ? {
      text: b.text.slice(0, 30),
      bg: isSafeColor(b.bg) ? b.bg : '#7C4DFF',
      color: isSafeColor(b.color) ? b.color : '#FFFFFF',
      x: clamp(b.x, 0, 85, 42),
      y: clamp(b.y, 0, 90, 70),
    } : null;

    return {
      height: clamp(raw.height, 130, 280, 180),
      background, pattern, font, illustration, title, subtitle, button,
    };
  }

  function resolve(remote) {
    const expired = remote && remote.expiresAt && new Date(remote.expiresAt).getTime() < Date.now();
    if (!remote || !remote.active || expired) return DEFAULT_CONFIG;

    const style = remote.style === 'custom' ? 'custom' : 'simple';
    const base = {
      style,
      url: isSafeUrl(remote.url) ? remote.url : null,
    };

    if (style === 'custom') {
      const custom = resolveCustom(remote.custom);
      if (!custom) return DEFAULT_CONFIG; // malformed custom payload — don't render a broken banner
      return { ...base, custom };
    }

    return {
      ...base,
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

    if (config.style === 'custom' && config.custom) renderHero(slot, config);
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
  /* Compact card — the original small banner                         */
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
  /* Hero card — the fully custom, larger designed banner              */
  /* ---------------------------------------------------------------- */
  function renderHero(slot, config) {
    const c = config.custom;

    const bgStyle = c.background.type === 'image' && c.background.image
      ? `background-image: linear-gradient(0deg, rgba(0,0,0,0.15), rgba(0,0,0,0.15)), url('${c.background.image}'); background-size: cover; background-position: center;`
      : c.background.type === 'solid'
        ? `background: ${c.background.from};`
        : `background: linear-gradient(135deg, ${c.background.from}, ${c.background.to});`;

    const illuHTML = c.illustration
      ? `<img class="hero-spotlight__illu" src="${c.illustration.image}" alt="" referrerpolicy="no-referrer" loading="lazy"
           style="left:${c.illustration.x}%; top:${c.illustration.y}%; width:${c.illustration.width}%;">`
      : '';

    const buttonHTML = c.button
      ? `<span class="hero-spotlight__button" style="left:${c.button.x}%; top:${c.button.y}%; background:${c.button.bg}; color:${c.button.color};">${escapeHTML(c.button.text)} ›</span>`
      : '';

    const patternHTML = c.pattern === 'dots'
      ? `<svg class="hero-spotlight__pattern" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><pattern id="hspDots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="1.2" fill="rgba(255,255,255,0.35)"/></pattern></defs><rect x="55" width="45" height="100" fill="url(#hspDots)"/></svg>`
      : c.pattern === 'wave'
        ? `<svg class="hero-spotlight__pattern" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M60,0 C75,25 45,45 65,65 C80,80 70,100 100,100 L100,0 Z" fill="rgba(255,255,255,0.06)"/></svg>`
        : '';

    slot.innerHTML = `
      <a href="#" class="hero-spotlight tappable" style="height:${c.height}px; ${bgStyle}">
        ${patternHTML}
        ${illuHTML}
        <span class="hero-spotlight__title" style="left:${c.title.x}%; top:${c.title.y}%; color:${c.title.color}; font-size:${c.title.size}px; font-family:${FONT_STACKS[c.font]};">${escapeHTML(c.title.text)}</span>
        <span class="hero-spotlight__subtitle" style="left:${c.subtitle.x}%; top:${c.subtitle.y}%; color:${c.subtitle.color}; font-size:${c.subtitle.size}px; font-family:${FONT_STACKS[c.font]};">${escapeHTML(c.subtitle.text)}</span>
        ${buttonHTML}
        <button class="feature-spotlight__dismiss hero-spotlight__dismiss tappable" aria-label="Dismiss">✕</button>
      </a>
    `;
    const card = slot.querySelector('.hero-spotlight');

    const illuEl = card.querySelector('.hero-spotlight__illu');
    if (illuEl) illuEl.addEventListener('error', () => illuEl.remove());

    if (window.Fx) Fx.animate(card, { opacity: [0, 1], y: [-12, 0], scale: [0.96, 1] }, { type: 'spring', stiffness: 300, damping: 24 });
    attachTap(card, config.url);
    attachDismiss(slot, card);
  }

  return { mountTop, invalidateCache };
})();
window.ShopPromo = ShopPromo;
