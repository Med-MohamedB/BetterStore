/* ==========================================================================
   What's New — a changelog card shown once per version bump, to existing
   users only (fresh installs get the interactive onboarding instead — see
   app.js boot() for how the two are kept mutually exclusive). Purely a
   localStorage flag; never reads or touches IndexedDB data.
   ========================================================================== */

const WhatsNew = (() => {
  const KEY = 'sa_last_seen_version';

  // Add a new entry here each release; oldest-first doesn't matter since
  // only the current version's list is ever shown.
  const ITEMS = [
    { icon: '🖨️', text: 'Print now opens Android\u2019s real print dialog directly \u2014 no more Share-sheet detour.' },
    { icon: '📤', text: 'Share actually works now, and sends a clean text receipt.' },
    { icon: '🎨', text: '8 new theme packs that re-skin the whole app \u2014 not just the accent color.' },
    { icon: '\u21a9\ufe0f', text: 'Partial refunds \u2014 pick exactly which items, and how many, to return.' },
    { icon: '\ud83d\udcbe', text: 'Fixed backup export crashing on newer Android versions.' },
    { icon: '\u2728', text: 'A friendlier first-run tour and noticeably smoother motion everywhere.' },
  ];

  function markSeen() {
    localStorage.setItem(KEY, CURRENT_VERSION);
  }

  /** Returns true if it actually showed something, so callers (boot())
   *  can avoid also popping the donation prompt in the same session. */
  function maybeShow() {
    const last = localStorage.getItem(KEY);
    if (last === CURRENT_VERSION) return false;
    show();
    return true;
  }

  function show() {
    const overlay = document.createElement('div');
    overlay.className = 'onboard-overlay';
    overlay.style.pointerEvents = 'auto'; // a real modal, not a spotlight-through overlay
    document.body.appendChild(overlay);
    Fx.animate(overlay, { opacity: [0, 1] }, { duration: 0.2 });

    const card = document.createElement('div');
    card.className = 'onboard-finale whatsnew-card';
    card.innerHTML = `
      <div class="onboard-finale__icon">\u2728</div>
      <div class="onboard-finale__title">What\u2019s new</div>
      <div class="onboard-finale__sub" style="margin-bottom:14px;">v${CURRENT_VERSION}</div>
      <div class="whatsnew-list stagger">
        ${ITEMS.map((it) => `
          <div class="whatsnew-row">
            <span class="whatsnew-row__icon">${it.icon}</span>
            <span class="whatsnew-row__text">${it.text}</span>
          </div>
        `).join('')}
      </div>
      <button class="onboard-start-btn tappable" id="whatsNewDoneBtn" style="margin-top:18px;">Got it</button>
    `;
    overlay.appendChild(card);
    Fx.animate(card, { opacity: [0, 1], scale: [0.85, 1], y: [16, 0] }, { type: 'spring', stiffness: 400, damping: 15 });

    card.querySelector('#whatsNewDoneBtn').addEventListener('click', () => {
      markSeen();
      Fx.animate(overlay, { opacity: [1, 0] }, { duration: 0.2 }).finished.then(() => overlay.remove());
    });
  }

  return { maybeShow, markSeen };
})();
window.WhatsNew = WhatsNew;
