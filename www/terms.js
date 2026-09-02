/* ==========================================================================
   Terms of Use — a mandatory, one-time acceptance gate. Bumping
   TERMS_VERSION forces re-acceptance on everyone's next launch (use this
   when the terms text materially changes, e.g. adding the analytics
   clause below once that's wired up for real).
   Only ever reads/writes a single localStorage key — never touches
   IndexedDB, so this has zero interaction with a shop's actual data.
   ========================================================================== */

const Terms = (() => {
  const KEY = 'sa_terms_accepted';
  const TERMS_VERSION = '1';

  const TERMS_TEXT = `
Last updated: September 2, 2026

1. ACCEPTANCE OF TERMS
By installing, accessing, or using Better Store ("the App"), you agree to be
bound by these Terms of Use ("Terms"). If you do not agree, do not use the
App.

2. LICENSE GRANT
Subject to your compliance with these Terms, the developer grants you a
limited, non-exclusive, non-transferable, revocable license to install and
use the App for your own business's point-of-sale and inventory management.

3. RESTRICTIONS
You may not, and may not permit anyone else to:
  (a) sell, resell, rent, lease, sublicense, distribute, or otherwise make
      the App available to any third party without the developer's prior
      written permission;
  (b) copy, modify, adapt, translate, or create derivative works of the
      App;
  (c) reverse engineer, decompile, disassemble, or otherwise attempt to
      derive the source code of the App, except to the extent such
      restriction is prohibited by applicable law;
  (d) remove, obscure, or alter any proprietary notices on the App;
  (e) use the App for any unlawful purpose or in any way that violates
      applicable law.
Any use outside the scope of this license automatically terminates it.

4. YOUR DATA
Products, sales, customers, suppliers, and other business records you enter
into the App ("Your Data") belong to you. Your Data is stored locally on
your device. The developer does not access, view, or claim ownership of
Your Data.

5. USAGE DATA WE COLLECT
Separately from Your Data described above, the App may collect limited,
aggregate, non-identifying usage statistics — for example, that a sale or
refund occurred and its amount, or that the App was opened — for the sole
purpose of understanding overall app usage and improving the App. This
data is collected in aggregate form, is not linked to your name, your
customers, or the specific contents of Your Data, and is not sold to third
parties. See the in-app "Privacy" section for the current, specific list
of what is collected.

6. NO WARRANTY
THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, OR
NON-INFRINGEMENT. YOU USE THE APP AT YOUR OWN RISK, INCLUDING FOR ANY
BUSINESS DECISIONS, CALCULATIONS, OR RECORDS PRODUCED BY THE APP.

7. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE DEVELOPER SHALL NOT BE LIABLE
FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
OR ANY LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS, ARISING FROM OR
RELATED TO YOUR USE OF (OR INABILITY TO USE) THE APP, EVEN IF ADVISED OF
THE POSSIBILITY OF SUCH DAMAGES. YOU ARE SOLELY RESPONSIBLE FOR
MAINTAINING YOUR OWN BACKUPS OF YOUR DATA.

8. TERMINATION
The developer may terminate or suspend your license to use the App at any
time if you violate these Terms. Sections 3, 4, 6, 7, and 9 survive
termination.

9. GOVERNING LAW
These Terms are governed by the laws of [Your Jurisdiction], without
regard to its conflict-of-law provisions.

10. CHANGES TO THESE TERMS
The developer may update these Terms from time to time. If changes are
material, you will be asked to accept the updated Terms again before
continuing to use the App.

11. CONTACT
Questions about these Terms can be sent via Telegram: @rwgmo
`.trim();

  function alreadyAccepted() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return parsed.version === TERMS_VERSION;
    } catch (e) {
      return false;
    }
  }

  function accept() {
    localStorage.setItem(KEY, JSON.stringify({ version: TERMS_VERSION, acceptedAt: new Date().toISOString() }));
  }

  /** Resolves immediately if already accepted; otherwise blocks (renders
   *  a mandatory full-screen gate) until the person actually accepts.
   *  There is deliberately no skip/close path. */
  function requireAcceptance() {
    if (alreadyAccepted()) return Promise.resolve();

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'terms-gate';
      overlay.innerHTML = `
        <div class="terms-gate__header">
          <div class="terms-gate__title">Terms of Use</div>
          <div class="terms-gate__sub">Please review before continuing</div>
        </div>
        <div class="terms-gate__body">${escapeHTML(TERMS_TEXT)}</div>
        <div class="terms-gate__footer">
          <label class="terms-gate__check">
            <input type="checkbox" id="termsCheckbox">
            <span>I have read and agree to the Terms of Use</span>
          </label>
          <button class="onboard-start-btn tappable" id="termsAcceptBtn" disabled>I Accept & Continue</button>
        </div>
      `;
      document.body.appendChild(overlay);
      if (window.Fx) Fx.animate(overlay, { opacity: [0, 1] }, { duration: 0.2 });

      const checkbox = overlay.querySelector('#termsCheckbox');
      const acceptBtn = overlay.querySelector('#termsAcceptBtn');
      checkbox.addEventListener('change', () => { acceptBtn.disabled = !checkbox.checked; });

      acceptBtn.addEventListener('click', () => {
        if (acceptBtn.disabled) return;
        accept();
        overlay.remove();
        resolve();
      });
    });
  }

  /** Lets someone re-read the terms any time from More/About, without
   *  forcing re-acceptance. */
  function show() {
    const overlay = document.createElement('div');
    overlay.className = 'terms-gate';
    overlay.innerHTML = `
      <div class="terms-gate__header">
        <div class="terms-gate__title">Terms of Use</div>
      </div>
      <div class="terms-gate__body">${escapeHTML(TERMS_TEXT)}</div>
      <div class="terms-gate__footer">
        <button class="onboard-start-btn tappable" id="termsCloseBtn">Close</button>
      </div>
    `;
    document.body.appendChild(overlay);
    if (window.Fx) Fx.animate(overlay, { opacity: [0, 1] }, { duration: 0.2 });
    overlay.querySelector('#termsCloseBtn').addEventListener('click', () => overlay.remove());
  }

  return { requireAcceptance, show };
})();
window.Terms = Terms;
