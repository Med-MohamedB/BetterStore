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
    { icon: '🎯', text: 'Fixed a race condition where the push notification could arrive before the app was actually able to see the new ad it was announcing.' },
    { icon: '🔄', text: 'Opening the app (including from a new-offer notification) now always shows the latest ad right away, instead of a stale cached one.' },
    { icon: '⚡', text: 'New offers now push to your phone the instant they\u2019re published \u2014 even if the app is closed.' },
    { icon: '🔔', text: 'The app now asks for notification permission up front, so new-offer alerts are ready to go from the start.' },
    { icon: '🖼️', text: 'Offer notifications always show your app logo, and now pop up properly instead of landing silently.' },
    { icon: '💎', text: 'Custom image banners now get the same glowing themed border and light sweep as other offer cards.' },
    { icon: '🛠️', text: 'Fixed a bug where updates could silently fail to apply until app data was cleared.' },
    { icon: '🎨', text: 'New Standard theme \u2014 clean black/white/grey with formal line icons instead of emoji.' },
    { icon: '↩️', text: 'Partial refunds \u2014 pick exactly which items, and how many, to return.' },
    { icon: '📜', text: 'Added Terms of Use \u2014 readable any time from More.' },
    { icon: '✨', text: 'A friendlier first-run tour and noticeably smoother motion everywhere.' },
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
