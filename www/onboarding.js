/* ==========================================================================
   Onboarding — a short, swipeable illustrated intro (4 screens), then a
   direct handoff into the real app. No simulated "toy" interactions and
   no forced tour of the nav — once this closes, DoodleHint (see app.js)
   picks up with real, dismiss-on-completion callouts pointing at actual
   buttons as they're needed (starting with "add your first product").
   The swipe between screens uses the same direct-manipulation pattern as
   the real tab-swipe (see initTabSwipeGesture in app.js): the track
   follows the finger 1:1 via touchmove, not a swipe-then-animate.
   ========================================================================== */

const Onboarding = (() => {
  const FLAG = 'sa_onboarding_complete';

  const SLIDES = [
    {
      img: 'img/onboarding/onboard-welcome.webp',
      title: 'Run your store from your pocket',
      sub: 'Sell, track stock, and see what\u2019s selling \u2014 all in one place.',
    },
    {
      type: 'storename',
      img: 'img/onboarding/onboard-storename.webp',
      title: 'What\u2019s your store called?',
      sub: 'Shows on receipts and the dashboard \u2014 you can change it later in Settings.',
    },
    {
      img: 'img/onboarding/onboard-scan.webp',
      title: 'Scan instead of typing',
      sub: 'Point the camera at any barcode to add or sell an item in one tap.',
    },
    {
      img: 'img/onboarding/onboard-restock.webp',
      title: 'Always know what\u2019s low',
      sub: 'Get a nudge before you run out of anything.',
    },
  ];

  let overlayEl = null;
  let trackEl = null;
  let index = 0;
  let storeNameValue = '';

  function hasSeenIt() { return !!localStorage.getItem(FLAG); }
  function markSeen() { localStorage.setItem(FLAG, '1'); }

  async function maybeStart() {
    if (hasSeenIt()) return;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    start();
  }

  /** Callable any time (e.g. "Replay tour" in More) to see it again. */
  function replay() {
    if (overlayEl) return;
    start();
  }

  async function start() {
    index = 0;
    let store = { name: '' };
    try { store = await Settings.get('store'); } catch { /* fresh install, defaults are fine */ }
    storeNameValue = store.name || '';

    overlayEl = document.createElement('div');
    overlayEl.className = 'onboard-overlay';
    overlayEl.innerHTML = `
      <button class="onboard-skip-corner tappable" id="obSkip">${Icon('x')}</button>
      <div class="onboard-track" id="obTrack">
        ${SLIDES.map((s, i) => slideHTML(s, i)).join('')}
      </div>
      <div class="onboard-footer">
        <div class="onboard-dots">${SLIDES.map((_, i) => `<div class="onboard-dot${i === 0 ? ' active' : ''}"></div>`).join('')}</div>
        <button class="onboard-next-btn tappable" id="obNext">Next</button>
      </div>
    `;
    document.body.appendChild(overlayEl);
    Fx.animate(overlayEl, { opacity: [0, 1] }, { duration: 0.25 });

    trackEl = overlayEl.querySelector('#obTrack');
    overlayEl.querySelector('#obSkip').addEventListener('click', finish);
    overlayEl.querySelector('#obNext').addEventListener('click', () => goTo(index + 1));

    const nameInput = overlayEl.querySelector('#obStoreName');
    if (nameInput) {
      nameInput.addEventListener('input', () => { storeNameValue = nameInput.value; });
    }

    initDrag();
    layout(false);
  }

  function slideHTML(s, i) {
    return `
      <div class="onboard-slide" data-slide="${i}">
        <div class="onboard-slide__art"><img src="${s.img}" alt="" class="onboard-slide__img" data-parallax></div>
        <div class="onboard-slide__title">${escapeHTML(s.title)}</div>
        <div class="onboard-slide__sub">${escapeHTML(s.sub)}</div>
        ${s.type === 'storename' ? `
          <input type="text" id="obStoreName" class="onboard-slide__input" placeholder="My Store" maxlength="60" value="${escapeHTML(storeNameValue)}">
        ` : ''}
      </div>
    `;
  }

  /* ---------------------------------------------------------------- */
  /* Direct-manipulation swipe between slides — same pattern as the    */
  /* real tab-swipe: track the finger every frame via touchmove and    */
  /* move the track exactly with it, only snapping (with a spring)     */
  /* once the finger lifts. Not a "detect swipe, then animate" gesture. */
  /* ---------------------------------------------------------------- */
  function initDrag() {
    let startX = 0, dx = 0, dragging = false, width = 1;

    trackEl.addEventListener('touchstart', (e) => {
      dragging = true;
      dx = 0;
      startX = e.touches[0].clientX;
      width = trackEl.getBoundingClientRect().width || window.innerWidth;
      trackEl.style.transition = 'none';
    }, { passive: true });

    trackEl.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      dx = e.touches[0].clientX - startX;
      // Resist dragging past the first or last slide instead of stopping
      // dead — a small give makes the boundary feel physical, not broken.
      if ((index === 0 && dx > 0) || (index === SLIDES.length - 1 && dx < 0)) dx *= 0.3;
      if (e.cancelable) e.preventDefault();
      const pct = -(index * 100) + (dx / width) * 100;
      trackEl.style.transform = `translate3d(${pct}%, 0, 0)`;
      applyParallax(dx / width);
    }, { passive: false });

    trackEl.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      const threshold = width * 0.18;
      if (dx < -threshold && index < SLIDES.length - 1) index += 1;
      else if (dx > threshold && index > 0) index -= 1;
      layout(true);
    });
  }

  function applyParallax(progress) {
    // The illustration drifts slightly slower than the finger — a cheap
    // but effective sense of depth/motion while dragging between slides.
    trackEl.querySelectorAll('[data-parallax]').forEach((img) => {
      img.style.transform = `translateX(${progress * -14}px)`;
    });
  }

  function goTo(i) {
    if (i >= SLIDES.length) { finish(); return; }
    index = Math.max(0, i);
    layout(true);
  }

  function layout(animated) {
    trackEl.style.transition = animated ? 'transform 360ms cubic-bezier(0.34,1.56,0.64,1)' : 'none';
    trackEl.style.transform = `translate3d(${-index * 100}%, 0, 0)`;
    applyParallax(0);

    overlayEl.querySelectorAll('.onboard-dot').forEach((d, i) => d.classList.toggle('active', i === index));
    const nextBtn = overlayEl.querySelector('#obNext');
    nextBtn.textContent = index === SLIDES.length - 1 ? 'Get Started' : 'Next';
  }

  function finish() {
    if (!overlayEl) return;
    const el = overlayEl;
    overlayEl = null;
    markSeen();

    if (storeNameValue.trim() && window.Settings) {
      Settings.set('store', { name: storeNameValue.trim() }).then(() => { if (window.Fmt) Fmt.init(); });
    }

    // A fresh install that just finished onboarding is already on the
    // latest version by definition — don't also pop the changelog right
    // behind it.
    if (window.WhatsNew) WhatsNew.markSeen();
    Fx.animate(el, { opacity: [1, 0] }, { duration: 0.2 }).finished.then(() => el.remove());
    // Ask for the notification permission right after onboarding — so
    // it's already resolved before the first ad ever needs to push one.
    if (window.AdNotify) setTimeout(() => AdNotify.requestPermission(), 600);
    if (window.AdPush) setTimeout(() => AdPush.init(), 700);
    if (window.Stats) setTimeout(() => Stats.reportIfDue(), 4000);
  }

  return { maybeStart, replay };
})();
window.Onboarding = Onboarding;
