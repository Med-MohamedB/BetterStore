/* ==========================================================================
   Donate — a rare, easy-to-dismiss reminder that the app is made by one
   person and donations are welcome. Deliberately NOT a nag:
     - Only ever considered for someone who's actually used the app (a
       real sales history), never a brand new install.
     - Cooldown of several weeks between appearances even if it qualifies.
     - A random roll on top of that cooldown, so it doesn't arrive on a
       predictable schedule.
     - A permanent "Don't ask again" that's actually respected forever.
   ========================================================================== */

const Donate = (() => {
  const LAST_SHOWN_KEY = 'sa_donate_last_shown';
  const NEVER_KEY = 'sa_donate_never';
  const MIN_SALES = 15;       // only people getting real use out of it
  const COOLDOWN_DAYS = 21;   // at most once every three weeks
  const SHOW_CHANCE = 0.15;   // and even then, only a 1-in-~7 chance

  async function maybeShow() {
    if (localStorage.getItem(NEVER_KEY)) return;

    const lastShown = parseInt(localStorage.getItem(LAST_SHOWN_KEY) || '0', 10);
    if (lastShown && (Date.now() - lastShown) / 86400000 < COOLDOWN_DAYS) return;

    let salesCount = 0;
    try { salesCount = await DB.count('sales'); } catch (e) { return; }
    if (salesCount < MIN_SALES) return;

    if (Math.random() > SHOW_CHANCE) return;

    show();
  }

  function show() {
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));

    const overlay = document.createElement('div');
    overlay.className = 'onboard-overlay';
    overlay.style.pointerEvents = 'auto';
    document.body.appendChild(overlay);
    Fx.animate(overlay, { opacity: [0, 1] }, { duration: 0.2 });

    const card = document.createElement('div');
    card.className = 'onboard-finale';
    card.innerHTML = `
      <div class="onboard-finale__icon">\ud83d\udc9c</div>
      <div class="onboard-finale__title">Enjoying Better Store?</div>
      <div class="onboard-finale__sub">It\u2019s built and maintained by one person. If it\u2019s genuinely been useful for your business, a donation \u2014 big or small \u2014 helps keep it going. Completely optional, no pressure.</div>
      <button class="onboard-start-btn tappable" id="donateShowMeBtn">See how</button>
      <button class="onboard-skip-btn tappable" id="donateLaterBtn" style="margin-top:10px; width:100%;">Maybe later</button>
      <button class="onboard-skip-btn tappable" id="donateNeverBtn" style="margin-top:2px; width:100%; opacity:0.55; font-size:11.5px;">Don\u2019t ask again</button>
    `;
    overlay.appendChild(card);
    Fx.animate(card, { opacity: [0, 1], scale: [0.85, 1], y: [16, 0] }, { type: 'spring', stiffness: 380, damping: 16 });

    const close = () => Fx.animate(overlay, { opacity: [1, 0] }, { duration: 0.2 }).finished.then(() => overlay.remove());

    card.querySelector('#donateShowMeBtn').addEventListener('click', () => {
      close();
      if (window.openAboutSheet) openAboutSheet();
    });
    card.querySelector('#donateLaterBtn').addEventListener('click', close);
    card.querySelector('#donateNeverBtn').addEventListener('click', () => {
      localStorage.setItem(NEVER_KEY, '1');
      close();
    });
  }

  return { maybeShow };
})();
window.Donate = Donate;
