/* ==========================================================================
   ShopPromo — a small, always-optional banner promoting the Telegram
   Shop, rendered into the Dashboard. Dismissing hides it for the rest of
   this app session (sessionStorage) — it comes back next time the app is
   opened rather than being gone forever, since this is meant to be an
   ongoing low-key promotion, not a one-time announcement.
   ========================================================================== */

const ShopPromo = (() => {
  const DISMISS_KEY = 'sa_shop_promo_dismissed_session';

  function renderInto(slot) {
    if (!slot) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    slot.innerHTML = `
      <a href="#" id="shopPromoBanner" class="shop-promo tappable">
        <span class="shop-promo__icon">🛍️</span>
        <span class="shop-promo__body">
          <span class="shop-promo__title">Check out our Telegram Shop</span>
          <span class="shop-promo__sub">t.me/RwmShop</span>
        </span>
        <button class="shop-promo__dismiss tappable" id="shopPromoDismiss" aria-label="Dismiss">✕</button>
      </a>
    `;

    const banner = slot.querySelector('#shopPromoBanner');
    if (window.Fx) Fx.animate(banner, { opacity: [0, 1], y: [-8, 0] }, { type: 'spring', stiffness: 300, damping: 22 });

    banner.addEventListener('click', (e) => {
      e.preventDefault();
      if (e.target.closest('#shopPromoDismiss')) return;
      if (window.openExternal) openExternal('https://t.me/RwmShop');
    });

    slot.querySelector('#shopPromoDismiss').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sessionStorage.setItem(DISMISS_KEY, '1');
      const done = () => { slot.innerHTML = ''; };
      if (window.Fx) Fx.animate(banner, { opacity: [1, 0], x: [0, 24] }, { duration: 0.18 }).finished.then(done);
      else done();
    });
  }

  return { renderInto };
})();
window.ShopPromo = ShopPromo;
