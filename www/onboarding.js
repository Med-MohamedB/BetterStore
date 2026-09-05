/* ==========================================================================
   Onboarding — a joyful, hands-on first-launch walkthrough.
   Two parts:
     1. A tiny interactive "toy" (tap coins into the register) — pure
        delight, no points/XP/progress tracking of any kind.
     2. A spring-animated spotlight tour of the REAL bottom nav — the
        cutout and caption glide between actual nav buttons with Motion's
        spring physics, and tapping the real (still-functional) nav button
        advances the tour, so it's a hands-on walkthrough of the actual
        app rather than a slideshow describing it.
   Everything here uses window.Motion (vendor/motion.min.js) for the
   spring/stagger physics — see https://motion.dev.
   ========================================================================== */

const Onboarding = (() => {
  const FLAG = 'sa_onboarding_complete';
  const SPRING = { type: 'spring', stiffness: 300, damping: 26 };
  const BOUNCE = { type: 'spring', stiffness: 400, damping: 15 };

  let overlayEl = null;

  function hasSeenIt() {
    return !!localStorage.getItem(FLAG);
  }
  function markSeen() {
    localStorage.setItem(FLAG, '1');
  }

  async function maybeStart() {
    if (hasSeenIt()) return;
    // Give the dashboard + bottom nav a couple of frames to lay out for
    // real before we start measuring element positions.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    start();
  }

  /** Callable any time (e.g. "Replay tour" in More) to see it again. */
  function replay() {
    if (overlayEl) return;
    start();
  }

  function animate(el, keyframes, opts) {
    return Fx.animate(el, keyframes, opts);
  }

  function start() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'onboard-overlay';
    document.body.appendChild(overlayEl);

    animate(overlayEl, { opacity: [0, 1] }, { duration: 0.25 });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'onboard-skip-corner tappable';
    skipBtn.textContent = '✕';
    skipBtn.addEventListener('click', finish);
    overlayEl.appendChild(skipBtn);

    runWelcomeStep();
  }

  function finish() {
    if (!overlayEl) return;
    const el = overlayEl;
    overlayEl = null;
    if (tourTapHandler) { document.removeEventListener('click', tourTapHandler, true); tourTapHandler = null; }
    spotlightEl = ringEl = captionEl = null;
    markSeen();
    // A fresh install that just finished onboarding is already on the
    // latest version by definition — don't also pop the changelog right
    // behind it.
    if (window.WhatsNew) WhatsNew.markSeen();
    animate(el, { opacity: [1, 0] }, { duration: 0.2 }).finished.then(() => el.remove());
    // Ask for the notification permission right after the tour — so it's
    // already resolved before the first ad ever needs to push one, and it
    // isn't shown mid-tour where it'd interrupt the walkthrough.
    if (window.AdNotify) setTimeout(() => AdNotify.requestPermission(), 600);
    if (window.AdPush) setTimeout(() => AdPush.init(), 700);
  }

  /* ---------------------------------------------------------------- */
  /* Step 1 — tap the coins into the register                          */
  /* ---------------------------------------------------------------- */

  function runWelcomeStep() {
    const card = document.createElement('div');
    card.className = 'onboard-welcome';
    card.innerHTML = `
      <div class="onboard-welcome__title">Hey! Welcome to your store 👋</div>
      <div class="onboard-welcome__sub">Before the tour — go ahead, ring some up.</div>
      <div class="onboard-scene" id="obScene">
        <div class="onboard-register" id="obRegister">🗄️</div>
        <div class="onboard-coin" id="obCoin1" style="left:14%; top:10%;">🪙</div>
        <div class="onboard-coin" id="obCoin2" style="right:10%; top:14%;">🪙</div>
        <div class="onboard-coin" id="obCoin3" style="left:calc(50% - 15px); top:0%;">🪙</div>
      </div>
      <div class="onboard-welcome__hint" id="obHint">Tap each coin</div>
      <button class="onboard-start-btn tappable" id="obStartBtn" style="display:none; margin-top:16px;">Let's go →</button>
    `;
    overlayEl.appendChild(card);
    animate(card, { opacity: [0, 1], scale: [0.85, 1], y: [16, 0] }, BOUNCE);

    const scene = card.querySelector('#obScene');
    const register = card.querySelector('#obRegister');
    const startBtn = card.querySelector('#obStartBtn');
    const hint = card.querySelector('#obHint');
    const coins = [card.querySelector('#obCoin1'), card.querySelector('#obCoin2'), card.querySelector('#obCoin3')];
    let tapped = 0;

    coins.forEach((coin, i) => {
      // A gentle idle bob so the coins read as tappable, not static art.
      animate(coin, { y: [0, -6, 0] }, { duration: 1.6 + i * 0.2, repeat: Infinity, ease: 'easeInOut' });

      coin.addEventListener('click', () => {
        if (coin.dataset.done) return;
        coin.dataset.done = '1';
        if (navigator.vibrate) navigator.vibrate(12);

        const regRect = register.getBoundingClientRect();
        const coinRect = coin.getBoundingClientRect();
        const dx = (regRect.left + regRect.width / 2) - (coinRect.left + coinRect.width / 2);
        const dy = (regRect.top + regRect.height / 2) - (coinRect.top + coinRect.height / 2);

        animate(coin, { x: [0, dx], y: [0, dy], scale: [1, 0.3], opacity: [1, 0] }, { type: 'spring', stiffness: 220, damping: 18 })
          .finished.then(() => coin.remove());

        animate(register, { scale: [1, 1.18, 1], rotate: [0, -6, 6, 0] }, { duration: 0.4 });
        spawnSparkle(scene, regRect, scene.getBoundingClientRect());

        tapped += 1;
        if (tapped === 1) hint.textContent = 'Nice — a couple more';
        if (tapped === 2) hint.textContent = 'Last one!';
        if (tapped === coins.length) {
          hint.textContent = 'That\u2019s the idea \u2014 quick and satisfying.';
          animate(register, { scale: [1, 1.3, 0.95, 1.1, 1], rotate: [0, -10, 10, -6, 0] }, { duration: 0.6 });
          startBtn.style.display = 'block';
          animate(startBtn, { opacity: [0, 1], scale: [0.7, 1], y: [10, 0] }, BOUNCE);
        }
      });
    });

    startBtn.addEventListener('click', () => {
      animate(card, { opacity: [1, 0], scale: [1, 0.92], y: [0, -10] }, { duration: 0.2 })
        .finished.then(() => { card.remove(); runTourStep(0); });
    });
  }

  function spawnSparkle(scene, regRect, sceneRect) {
    const s = document.createElement('div');
    s.className = 'onboard-sparkle';
    s.textContent = '\u2728';
    s.style.left = `${regRect.left - sceneRect.left + regRect.width / 2 - 10}px`;
    s.style.top = `${regRect.top - sceneRect.top - 6}px`;
    scene.appendChild(s);
    animate(s, { opacity: [1, 0], y: [0, -22], scale: [0.6, 1.2] }, { duration: 0.5 })
      .finished.then(() => s.remove());
  }

  /* ---------------------------------------------------------------- */
  /* Step 2 — spring-animated spotlight tour of the real bottom nav    */
  /* ---------------------------------------------------------------- */

  const TOUR_STEPS = [
    { route: 'dashboard', title: 'Home base 👋', sub: 'Today\u2019s sales, revenue, and a quick look at how things are going.' },
    { route: 'products', title: 'Your inventory 📦', sub: 'Add products, adjust stock, scan barcodes \u2014 all in here.' },
    { route: 'pos', title: 'Ring things up ⚡', sub: 'The big one \u2014 tap here any time to start a sale.' },
    { route: 'sales', title: 'Every sale, ever 🧾', sub: 'Receipts, reprints, and refunds \u2014 partial or full.' },
    { route: 'more', title: 'Everything else 🗂️', sub: 'Reports, customers, suppliers, backups, and settings live here.' },
  ];

  let spotlightEl = null, ringEl = null, captionEl = null;
  let tourTapHandler = null;

  function runTourStep(i) {
    if (i >= TOUR_STEPS.length) { runFinale(); return; }
    const step = TOUR_STEPS[i];
    const target = document.querySelector(`.nav-item[data-route="${step.route}"]`);
    if (!target) { runTourStep(i + 1); return; } // graceful skip if layout ever changes

    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = Math.max(rect.width, rect.height) / 2 + 10;

    if (!spotlightEl) {
      spotlightEl = document.createElement('div');
      spotlightEl.className = 'onboard-spotlight';
      overlayEl.insertBefore(spotlightEl, overlayEl.firstChild);
      Object.assign(spotlightEl.style, { left: `${cx - r}px`, top: `${cy - r}px`, width: `${r * 2}px`, height: `${r * 2}px` });
      animate(spotlightEl, { opacity: [0, 1] }, { duration: 0.2 });

      ringEl = document.createElement('div');
      ringEl.className = 'onboard-pulse-ring';
      overlayEl.appendChild(ringEl);
      Object.assign(ringEl.style, { left: `${cx - r}px`, top: `${cy - r}px`, width: `${r * 2}px`, height: `${r * 2}px` });
      animate(ringEl, { scale: [1, 1.18, 1], opacity: [0.9, 0.3, 0.9] }, { duration: 1.4, repeat: Infinity });
    } else {
      animate(spotlightEl, { left: `${cx - r}px`, top: `${cy - r}px`, width: `${r * 2}px`, height: `${r * 2}px` }, SPRING);
      animate(ringEl, { left: `${cx - r}px`, top: `${cy - r}px`, width: `${r * 2}px`, height: `${r * 2}px` }, SPRING);
    }

    renderCaption(i, step);

    if (tourTapHandler) document.removeEventListener('click', tourTapHandler, true);
    tourTapHandler = (e) => {
      if (e.target.closest(`.nav-item[data-route="${step.route}"]`)) {
        document.removeEventListener('click', tourTapHandler, true);
        runTourStep(i + 1);
      }
    };
    document.addEventListener('click', tourTapHandler, true);
  }

  function renderCaption(i, step) {
    const isNew = !captionEl;
    if (isNew) {
      captionEl = document.createElement('div');
      captionEl.className = 'onboard-caption';
      captionEl.style.bottom = 'calc(var(--nav-h) + 28px)';
      overlayEl.appendChild(captionEl);
    }
    captionEl.innerHTML = `
      <div class="onboard-caption__title">${step.title}</div>
      <div class="onboard-caption__sub">${step.sub}</div>
      <div class="onboard-caption__row">
        <button class="onboard-skip-btn tappable" id="obSkip">Skip tour</button>
        <div class="onboard-dots">${TOUR_STEPS.map((_, idx) => `<div class="onboard-dot${idx === i ? ' active' : ''}"></div>`).join('')}</div>
        <button class="onboard-next-btn tappable" id="obNext">${i === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}</button>
      </div>
    `;
    captionEl.querySelector('#obSkip').addEventListener('click', finish);
    captionEl.querySelector('#obNext').addEventListener('click', () => runTourStep(i + 1));

    if (isNew) {
      animate(captionEl, { opacity: [0, 1], y: [14, 0] }, BOUNCE);
    } else {
      animate(captionEl, { scale: [0.97, 1], opacity: [0.6, 1] }, { duration: 0.22 });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Step 3 — confetti finale                                         */
  /* ---------------------------------------------------------------- */

  function runFinale() {
    if (tourTapHandler) document.removeEventListener('click', tourTapHandler, true);
    [spotlightEl, ringEl, captionEl].forEach((el) => {
      if (!el) return;
      animate(el, { opacity: [1, 0] }, { duration: 0.2 }).finished.then(() => el.remove());
    });
    spotlightEl = ringEl = captionEl = null;

    if (window.Fx) Fx.confetti(window.innerHeight * 0.35);

    const card = document.createElement('div');
    card.className = 'onboard-finale';
    card.innerHTML = `
      <div class="onboard-finale__icon">🎉</div>
      <div class="onboard-finale__title">You\u2019re all set!</div>
      <div class="onboard-finale__sub">That\u2019s the whole app. Go make a sale.</div>
      <button class="onboard-start-btn tappable" id="obDoneBtn">Start selling</button>
    `;
    overlayEl.appendChild(card);
    animate(card, { opacity: [0, 1], scale: [0.7, 1], y: [16, 0] }, BOUNCE);
    card.querySelector('#obDoneBtn').addEventListener('click', finish);
  }

  return { maybeStart, replay };
})();
window.Onboarding = Onboarding;
