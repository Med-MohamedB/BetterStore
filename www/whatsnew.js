/* ==========================================================================
   What's New — a changelog card shown once per version bump, to existing
   users only (fresh installs get the interactive onboarding instead — see
   app.js boot() for how the two are kept mutually exclusive). Purely a
   localStorage flag; never reads or touches IndexedDB data.
   ========================================================================== */

const WhatsNew = (() => {
  const KEY = 'sa_last_seen_version';

  // Add new entries at the top of the most recent group each release (or
  // start a new group when this release's purpose is genuinely different
  // from the one above it — see the version-numbering rule this file
  // follows below). Newest group first; within a group, newest entry
  // first.
  //
  // Each group is either:
  //   { version: '1.2.3', items: [...] }                     — one release
  //   { versionRange: ['1.2.3', '1.2.6'], items: [...] }      — several
  //     consecutive releases that all served the same overall purpose
  //     (e.g. a multi-patch translation sweep), collapsed under one header
  //   { label: 'Earlier — ...', items: [...] }                — for older
  //     history where the exact original version number per entry isn't
  //     reliably known (this codebase has no version-tagged commit
  //     history to recover it from) — grouped by theme instead of by a
  //     fabricated version number.
  const CHANGELOG = [
    {
      version: '1.9.9.29',
      items: [
        { icon: Icon('globe'), text: 'The language picker now pre-highlights whichever of the 3 languages matches your phone\u2019s own system language (you can still tap a different one \u2014 this is just a smart default, never automatic). That same detection also decides which language the app briefly starts in before the picker finishes loading, instead of always defaulting to English.' },
        { icon: Icon('palette'), text: 'Redesigned the update screen and this changelog to actually match the rest of the app: no more emoji anywhere in either one (real icons throughout, including two new ones \u2014 for translation/language and theme/design entries), the update screen\u2019s icon now genuinely animates through checking \u2192 downloading \u2192 ready instead of sitting static, and this list is now grouped by version instead of one long undifferentiated scroll.' },
      ],
    },
    {
      versionRange: ['1.9.9.26', '1.9.9.28'],
      items: [
        { icon: Icon('check-circle'), text: 'A full RTL audit pass for Arabic: the "add your first item" hint on Products/Customers/Suppliers no longer lands off-screen, swipe-to-reveal (Edit/Delete on a row) now opens from the correct side and those buttons are translated (they weren\u2019t before, in any language), and Cancel/Delete on every confirmation popup are translated too (also weren\u2019t before). Prices, dates and receipt numbers are now guaranteed to show as 0-9 digits regardless of phone language \u2014 previously an Arabic phone could silently switch them to Eastern Arabic-Indic numerals. Barcodes, SKUs and receipt numbers are now protected from getting visually reordered next to Arabic text. Also translated four screens that were missed entirely: the More menu, the Terms of Use screen\u2019s buttons and labels (the legal text itself stays English \u2014 that\u2019s deliberate), the Donate prompt, and this What\u2019s New popup.' },
        { icon: Icon('check-circle'), text: 'Fixed onboarding breaking in Arabic \u2014 the swipe track\u2019s position math didn\u2019t account for RTL flex layout, which could show a blank slide or a stuck/inverted swipe. Also finished translating the About This App sheet (Contact & Shop, Support/Donate, Troubleshooting) \u2014 that was the one screen still missed by the translation sweep.' },
        { icon: Icon('refresh'), text: 'Arabic layout got a real RTL pass: swiping between tabs now advances in the correct direction for Arabic (swipe right to go forward, matching how Android itself handles RTL paging), the little \u203a arrows that show a row opens something now flip to point the right way, the undo icon on refunded sales mirrors too, and a few corner elements (the onboarding skip button, the add-record + button) now relocate to the correct corner in Arabic instead of staying pinned to English\u2019s side.' },
      ],
    },
    {
      version: '1.9.9.25',
      items: [
        { icon: Icon('receipt'), text: 'You can now set a Receipt Language independent of the app\u2019s own language (Settings \u2192 Point of Sale), and every receipt preview has a language switcher right there so you can flip it and see the change before you print or share. Heads up: printed PDFs on-device can\u2019t render Arabic script yet (a font limitation, not new to this release) \u2014 the on-screen preview and the text-share option both show Arabic correctly in the meantime.' },
      ],
    },
    {
      versionRange: ['1.9.9.14', '1.9.9.24'],
      items: [
        { icon: Icon('bar-chart'), text: 'Inventory is now fully translated \u2014 stock-status filters, the low/out-of-stock badges, and the full adjustment history log, in all 3 languages. That\u2019s every main screen done: Products, POS, Sales, Settings, Customers, Suppliers, Backup, Dashboard, Scanner, Reports, and Inventory. Left on the list: the receipt print/share text, a legal-text pass on Terms, and an RTL layout audit (including flipping the swipe direction for Arabic).' },
        { icon: Icon('trending-up'), text: 'Reports is now fully translated \u2014 the date-range chips, stat cards, best sellers, category and payment breakdowns, and the cost summary, in all 3 languages. That\u2019s Products, POS, Sales, Settings, Customers, Suppliers, Backup, Dashboard, Scanner, and Reports all done \u2014 Inventory is next, then a few smaller cleanup passes.' },
        { icon: Icon('camera'), text: 'The barcode Scanner is now fully translated \u2014 hints, camera picker, torch and error messages, all in 3 languages. That\u2019s Products, POS, Sales, Settings, Customers, Suppliers, Backup, Dashboard, and Scanner all done \u2014 Reports and Inventory are next.' },
        { icon: Icon('home'), text: 'The Dashboard is now fully translated \u2014 the greeting, revenue card, quick stats, low-stock alerts, quick actions, and recent sales list, plus every screen\u2019s topbar title, in all 3 languages. That\u2019s Products, POS, Sales, Settings, Customers, Suppliers, Backup, and Dashboard all done \u2014 Scanner, Reports, and Inventory are next.' },
        { icon: Icon('database'), text: 'Backup & Restore is now fully translated \u2014 the data summary, export/import, CSV export, and the danger-zone data-clearing flow, in all 3 languages. That\u2019s Products, POS, Sales, Settings, Customers, Suppliers, and Backup all done \u2014 Scanner, Reports, and Inventory are next.' },
        { icon: Icon('truck'), text: 'Suppliers is now fully translated \u2014 the list, add/edit form, and supplier details (including linked products), in all 3 languages. That\u2019s Products, POS, Sales, Settings, Customers, and Suppliers all done \u2014 Backup, Scanner, Reports, and Inventory are next.' },
        { icon: Icon('users'), text: 'Customers is now fully translated \u2014 the list, add/edit form, customer details, and the POS customer picker, in all 3 languages. That\u2019s Products, POS, Sales, Settings, and Customers all done \u2014 Suppliers, Inventory, Reports, and Backup are next.' },
        { icon: Icon('settings'), text: 'Settings is now fully translated \u2014 store info, appearance, Point of Sale, inventory, and the PIN/biometric lock screens, in all 3 languages. That\u2019s Products, POS, Sales, and Settings all done \u2014 Customers, Suppliers, Inventory, Reports, and Backup are next.' },
        { icon: Icon('cart'), text: 'POS and Sales are now fully translated too \u2014 cart, checkout, payment, receipts, refunds, and the receipt scanner, in all 3 languages. That\u2019s Products, POS, and Sales all done \u2014 Customers, Suppliers, Inventory, Reports, Settings, and Backup are next.' },
        { icon: Icon('package'), text: 'Products is now fully translated \u2014 every label, button, form field, and message across adding/editing products, categories, barcodes, and stock adjustments, in all 3 languages.' },
        { icon: Icon('globe'), text: 'Started adding multiple languages \u2014 English, Arabic (with the Algerian flag), and French. New language picker is the very first screen on a fresh install, and reachable anytime from More \u2192 Language. Navigation, onboarding, and common buttons are translated so far; more screens are being translated in the next few updates.' },
      ],
    },
    {
      label: 'Earlier \u2014 receipts, confirmations & UI polish',
      items: [
        { icon: Icon('scan'), text: 'Every receipt now has a real, scannable barcode (both on-screen and in the printed PDF), and Sales has a new scan icon in the top bar \u2014 scan any past receipt\u2019s barcode to jump straight to that sale, no searching needed.' },
        { icon: Icon('receipt'), text: 'Redesigned the receipt layout to match a classic itemized paper receipt \u2014 Qty/Item/Price columns, item discounts shown as their own line, an items-sold count, and a proper footer with the receipt number, date, and time.' },
        { icon: Icon('check-circle'), text: 'Flipped the direction of the empty-state hint arrow \u2014 let me know if it should go back or point somewhere else entirely.' },
        { icon: Icon('check-circle'), text: 'Fixed the "add your first..." hint arrow overlapping the empty-state text when the promo banner is showing (it pushes everything down, which the hint wasn\u2019t accounting for) \u2014 it now checks for that and keeps clear.' },
        { icon: Icon('shield'), text: 'Every "delete this?" / "clear everything?" / "refund?" confirmation across the app now uses a real themed dialog instead of the browser\u2019s plain native popup \u2014 covers Products, Categories, Customers, Suppliers, Sales refunds, POS cart/checkout, and backup restore/wipe.' },
        { icon: Icon('edit'), text: 'The empty-state hint arrows now use a real handwriting font instead of a generic system fallback \u2014 should look meaningfully more like an actual note, not just slanted text.' },
        { icon: Icon('gift'), text: 'Removed the "Don\u2019t ask again" option from the donate prompt.' },
        { icon: Icon('gift'), text: 'Added a "Preview Popups" spot in More \u2192 About This App \u2192 Troubleshooting \u2014 lets you see the What\u2019s New card and the donate prompt on demand (the donate one only shows up naturally very rarely: 15+ sales, random chance, weeks apart).' },
        { icon: Icon('palette'), text: 'Found the real source of the leftover green: several UI elements \u2014 the revenue trend badge, the promo banner\u2019s glowing border, success badges/toasts, and even the update-download progress bar \u2014 were quietly using a hardcoded green regardless of your theme pack instead of actually following it. All switched to follow the active pack now.' },
        { icon: Icon('zap'), text: 'Faster launches, especially on older phones \u2014 scripts now load in parallel instead of one at a time, and the barcode scanner / PDF export libraries (744KB combined) only load when you actually use those features instead of on every single launch.' },
        { icon: Icon('palette'), text: 'Fixed a few stray lime-green highlights that were slipping through the theme recolor on every illustration, and made the notification icon neutral so it stops clashing with non-green theme packs.' },
        { icon: Icon('palette'), text: 'Theme packs now actually recolor every illustration \u2014 empty states AND onboarding \u2014 including the pale background/shadow tints that were still stubbornly green before.' },
        { icon: Icon('zap'), text: 'Tab swiping feels a lot more direct now \u2014 including on Products/Sales/Inventory, where it used to get eaten by the list rows\u2019 own swipe-to-delete.' },
        { icon: Icon('image'), text: 'Sales now has its own empty-state illustration, matching Products/Customers/Suppliers/POS.' },
        { icon: Icon('palette'), text: 'New app icon and logo \u2014 home-screen icon, notifications, and the splash screen all updated.' },
        { icon: Icon('check-circle'), text: 'Fixed the \u201cadd your first...\u201d hint arrow sticking around after switching tabs, and not coming back after you delete everything again.' },
        { icon: Icon('star'), text: 'Smoothed out a stray outline that was showing up on some buttons, most noticeably onboarding and the + buttons.' },
        { icon: Icon('check-circle'), text: 'Fixed this What\u2019s New card (and the donate prompt) appearing pinned to the top of the screen instead of centered.' },
        { icon: Icon('refresh'), text: 'Sales box is back on the Dashboard, alongside the new revenue hero card.' },
      ],
    },
    {
      label: 'Earlier \u2014 live offers, notifications & the update system',
      items: [
        { icon: Icon('upload'), text: 'Forced update system \u2014 the admin can now push a required update that the app can download and install without leaving the app.' },
        { icon: Icon('bar-chart'), text: 'Anonymous, aggregate-only usage counters (sales made, products/customers/suppliers entered) now report to the developer \u2014 see the updated Terms of Use for exactly what\u2019s included.' },
        { icon: Icon('shield'), text: 'Terms of Use clarified: the App is offered globally, not tied to any single country.' },
        { icon: Icon('stethoscope'), text: 'AdMob status is now visible in More \u2192 About This App \u2192 Run Diagnostics \u2014 no computer needed to see what\u2019s happening with ads.' },
        { icon: Icon('lock'), text: 'Fixed a missing consent step that was silently blocking every AdMob ad request.' },
        { icon: Icon('settings'), text: 'Control panel rebuilt \u2014 tabs, auto-loads what\u2019s currently live, a connection test button, and a raw JSON preview.' },
        { icon: Icon('bell'), text: 'New "Ad Source" control in the panel \u2014 run your own ad, real AdMob ads, or alternate between both, from one switch.' },
        { icon: Icon('zap'), text: 'Fixed a race condition where the push notification could arrive before the app was actually able to see the new ad it was announcing.' },
        { icon: Icon('refresh'), text: 'Opening the app (including from a new-offer notification) now always shows the latest ad right away, instead of a stale cached one.' },
        { icon: Icon('zap'), text: 'New offers now push to your phone the instant they\u2019re published \u2014 even if the app is closed.' },
        { icon: Icon('bell'), text: 'The app now asks for notification permission up front, so new-offer alerts are ready to go from the start.' },
        { icon: Icon('image'), text: 'Offer notifications always show your app logo, and now pop up properly instead of landing silently.' },
        { icon: Icon('star'), text: 'Custom image banners now get the same glowing themed border and light sweep as other offer cards.' },
        { icon: Icon('settings'), text: 'Fixed a bug where updates could silently fail to apply until app data was cleared.' },
      ],
    },
    {
      label: 'Earliest releases',
      items: [
        { icon: Icon('tag'), text: 'New Standard theme \u2014 clean black/white/grey with formal line icons instead of emoji.' },
        { icon: Icon('undo'), text: 'Partial refunds \u2014 pick exactly which items, and how many, to return.' },
        { icon: Icon('scroll'), text: 'Added Terms of Use \u2014 readable any time from More.' },
        { icon: Icon('star'), text: 'A friendlier first-run tour and noticeably smoother motion everywhere.' },
      ],
    },
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

  function groupHeaderLabel(group) {
    if (group.label) return group.label;
    if (group.versionRange) return `v${group.versionRange[0]} \u2013 v${group.versionRange[1]}`;
    return `v${group.version}`;
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
      <div class="onboard-finale__title">${I18n.t('whatsnew.title')}</div>
      <div class="onboard-finale__sub" style="margin-bottom:14px;">v${CURRENT_VERSION}</div>
      <div class="whatsnew-list stagger">
        ${CHANGELOG.map((group) => `
          <div>
            <div class="whatsnew-group__header">
              <span class="whatsnew-group__version">${escapeHTML(groupHeaderLabel(group))}</span>
              <span class="whatsnew-group__rule"></span>
            </div>
            <div class="whatsnew-group__rows">
              ${group.items.map((it) => `
                <div class="whatsnew-row">
                  <span class="whatsnew-row__icon">${it.icon}</span>
                  <span class="whatsnew-row__text">${it.text}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
      <button class="onboard-start-btn tappable" id="whatsNewDoneBtn" style="margin-top:18px;">${I18n.t('whatsnew.doneBtn')}</button>
    `;
    overlay.appendChild(card);
    Fx.animate(card, { opacity: [0, 1], scale: [0.85, 1], y: [16, 0] }, { type: 'spring', stiffness: 400, damping: 15 });

    card.querySelector('#whatsNewDoneBtn').addEventListener('click', () => {
      markSeen();
      Fx.animate(overlay, { opacity: [1, 0] }, { duration: 0.2 }).finished.then(() => overlay.remove());
    });
  }

  return { maybeShow, markSeen, show };
})();
window.WhatsNew = WhatsNew;
