/* ==========================================================================
   auth.js — Google Sign-In foundation (Firebase Authentication).

   Infrastructure for Features 5 (staff accounts) and 6 (Drive backup) —
   one sign-in flow serves both: requesting the Drive appdata scope up
   front on every sign-in gives an access token usable for the Drive API
   too, so there's no separate auth system and no custom backend.
   Firebase Auth's own user record is the source of truth; Settings.auth
   (see db.js) is just a small local mirror (name/email/photo) keyed by
   uid, enough to show who's signed in and to key future local data
   against without an extra round-trip.

   The app must stay fully usable, forever, for someone who never signs
   in — that's a permanent, valid state, not a temporary onboarding one.
   Nothing outside this file should call the Firebase plugin directly;
   every feature that actually needs a signed-in user calls
   requireSignIn() first (the one shared contextual prompt) rather than
   assuming one, and every call site awaits it before continuing so the
   person lands back in the exact flow they were trying to use.
   ========================================================================== */

const Auth = (() => {
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

  // Google's own official "G" mark, as published for third-party
  // "Sign in with Google" buttons — not decorative brand art, the
  // specific asset Google provides for exactly this use.
  const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 18 18" style="flex-shrink:0;"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>`;

  function plugin() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication;
  }

  async function currentProfile() {
    const auth = await Settings.get('auth');
    return auth.uid ? auth : null;
  }

  function isSignedIn(profile) {
    return !!(profile && profile.uid);
  }

  /** Performs the actual Google sign-in flow and updates the local
   *  profile mirror. Requests the Drive scope up front (see file
   *  header). The credential's accessToken is only available right
   *  after THIS call, not from getCurrentUser() later — Feature 6 will
   *  need to call signIn() again (normally silent/instant, since the
   *  person is already signed in) whenever it actually needs to talk to
   *  Drive, rather than caching this token. */
  async function signIn() {
    const p = plugin();
    if (!p) throw new Error('FirebaseAuthentication plugin not available');
    const result = await p.signInWithGoogle({ scopes: [DRIVE_SCOPE] });
    const user = result && result.user;
    if (!user) throw new Error('No user returned from sign-in');
    const profile = {
      uid: user.uid,
      name: user.displayName || null,
      email: user.email || null,
      photoUrl: user.photoUrl || null,
    };
    await Settings.set('auth', profile);
    return { profile, credential: result.credential || null };
  }

  async function signOut() {
    const p = plugin();
    if (p) {
      try { await p.signOut(); } catch (e) { console.warn('Firebase sign-out failed:', e); }
    }
    await Settings.set('auth', { uid: null, name: null, email: null, photoUrl: null });
  }

  /** The one shared contextual sign-in prompt. Any feature that needs a
   *  signed-in user (Add Staff Member, Back Up to Drive, Import via QR
   *  when that transfer needs Drive) calls this FIRST and awaits it —
   *  never write a bespoke sign-in sheet per feature.
   *
   *  Resolves true immediately if already signed in — no UI shown.
   *  Otherwise shows one sheet explaining why (via reasonKey, an i18n
   *  key), and resolves true only once sign-in actually succeeds, false
   *  if the person cancels or dismisses it. Callers should gate their
   *  action on the resolved value so the person lands right back in the
   *  flow they were trying to use, e.g.:
   *    if (await Auth.requireSignIn('auth.reasonAddStaff')) { ...continue... }
   */
  async function requireSignIn(reasonKey) {
    if (isSignedIn(await currentProfile())) return true;

    return new Promise((resolve) => {
      let succeeded = false;

      const bodyHTML = `
        <div style="text-align:center;">
          <div style="width:52px;height:52px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">${Icon('user', { size: 24 })}</div>
          <div class="text-sm" style="margin-bottom:22px; color:var(--text-dim);">${I18n.t(reasonKey)}</div>
          <button class="onboard-signin-card__btn tappable" id="authPromptSignInBtn" style="max-width:280px; margin:0 auto;">
            ${GOOGLE_ICON}
            <span>${I18n.t('auth.signInWithGoogle')}</span>
          </button>
        </div>
      `;
      const footerHTML = `<button class="btn btn-secondary tappable" id="authPromptCancelBtn">${I18n.t('common.cancel')}</button>`;

      const sheetEl = Sheet.open({
        title: I18n.t('auth.promptTitle'),
        bodyHTML,
        footerHTML,
        onClose: () => resolve(succeeded),
      });

      sheetEl.querySelector('#authPromptCancelBtn').addEventListener('click', () => Sheet.close());
      sheetEl.querySelector('#authPromptSignInBtn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await signIn();
          succeeded = true;
          Toast.success(I18n.t('auth.signedInToast'));
          Sheet.close();
        } catch (err) {
          console.error('Sign-in failed:', err);
          Toast.error(I18n.t('auth.signInFailedToast'));
          btn.disabled = false;
        }
      });
    });
  }

  return { signIn, signOut, currentProfile, isSignedIn, requireSignIn, GOOGLE_ICON, DRIVE_SCOPE };
})();
window.Auth = Auth;
