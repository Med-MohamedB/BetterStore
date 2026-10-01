/* ==========================================================================
   Privacy Policy — a plain-text viewer, reachable from Profile. Unlike
   Terms of Use there's no acceptance gate here (nothing here is a
   condition of using the App) — just Privacy.show() to display it,
   mirroring terms.js's own overlay pattern exactly for visual
   consistency. Kept English-only for the same reason as the Terms (see
   terms.js) — a legal document should say exactly one thing, not three
   slightly-different translations of it.
   ========================================================================== */

const Privacy = (() => {
  const PRIVACY_TEXT = `
Last updated: September 29, 2026

1. WHAT THIS COVERS
This Privacy Policy explains what data Better Store ("the App") collects
and why. It's a companion to the Terms of Use, not a replacement for it —
see Terms for the full terms governing your use of the App.

2. YOUR BUSINESS DATA
Products, sales, customers, suppliers, and everything else you enter to
run your shop stays on your device. The developer cannot see it, does not
collect it, and does not store a copy of it anywhere.

3. IF YOU SIGN IN WITH GOOGLE
Signing in is entirely optional — the App works fully without it. If you
choose to sign in, Google shares your name, email address, profile photo,
and a Google account identifier with the App, via Firebase Authentication
(a Google service). This is used only to show who's signed in, and as the
foundation for staff accounts and Google Drive backup. That information
is kept locally on your device and in your Firebase Authentication
account — never added to the anonymous usage counters described below.
Google's own handling of your account data is governed by Google's
Privacy Policy, not this one.

Once Drive backup is available, backups are written to a private,
app-only storage area in your own Google Drive (called "appdata") that
isn't visible in your regular Drive files and that no app other than this
one can read. Turning that feature on will be a separate, clearly-labeled
choice from signing in itself.

4. ANONYMOUS USAGE COUNTERS
As described in the Terms of Use, the App may periodically report a small
set of anonymous, aggregate counters (e.g. how many sales/products exist,
last-opened date, app version) tied only to a random on-device identifier
— never your name, email, or account. You can opt out of this at any time
from Profile > Opt Out of Analytics; doing so stops this device from
being included, and does not affect anything else about the App.

5. WHAT THE APP DOES NOT DO
The App does not sell your data or your shop's data to anyone. It does
not share Your Data (business records) with third parties. It does not
use your business data to train any model.

6. DELETING YOUR ACCOUNT
Profile > Delete Account permanently deletes your Google sign-in link
(the Firebase Authentication account itself) — it does not touch your
shop's products, sales, or any other business data, which you manage
separately via Backup > Clear All Data if you ever want that gone too.
Account deletion cannot be undone.

7. CHILDREN
The App is intended for business use and is not directed at children.

8. CHANGES TO THIS POLICY
The developer may update this Privacy Policy from time to time. Material
changes will be reflected here with an updated date above.

9. CONTACT
Questions about this policy can be sent via Telegram: @rwgmo
`.trim();

  function show() {
    const overlay = document.createElement('div');
    overlay.className = 'terms-gate';
    overlay.innerHTML = `
      <div class="terms-gate__header">
        <div class="terms-gate__title">${I18n.t('privacy.title')}</div>
      </div>
      <div class="text-faint text-sm" style="padding:0 20px 8px;">${I18n.t('terms.englishOnlyNote')}</div>
      <div class="terms-gate__body" dir="ltr">${escapeHTML(PRIVACY_TEXT)}</div>
      <div class="terms-gate__footer">
        <button class="onboard-start-btn tappable" id="privacyCloseBtn">${I18n.t('terms.closeBtn')}</button>
      </div>
    `;
    document.body.appendChild(overlay);
    if (window.Fx) Fx.animate(overlay, { opacity: [0, 1] }, { duration: 0.2 });
    overlay.querySelector('#privacyCloseBtn').addEventListener('click', () => overlay.remove());
  }

  return { show };
})();
window.Privacy = Privacy;
