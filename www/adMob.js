/* ==========================================================================
   AdMobBridge — thin wrapper around @capacitor-community/admob for one
   thing only: a single banner ad, shown/hidden on demand by ShopPromo
   when the control panel's "Ad Source" is set to AdMob or Both.

   IMPORTANT PLATFORM LIMITATION (read before changing this file):
   AdMob banners are a NATIVE Android view drawn on top of the WebView,
   anchored to a screen edge (top/bottom) with a margin — not an HTML
   element. That means it:
     - does NOT scroll with the page the way the personal ad card does
     - can't inherit the app's custom border/glow/theme styling
     - draws straight over whatever pixels are already there — it does
       NOT push the app's own header down automatically the way an HTML
       element would. This file compensates for that by adding top
       padding to #app equal to the ad's real reported height (see
       applyContentOffset() below), so the header ends up sitting BELOW
       the ad instead of hidden behind it.
   This isn't a bug to fix — Google's AdMob policies require ads to stay
   visually distinguishable as ads rather than blended into surrounding
   app content, so a plain, clearly-Google-branded banner is expected.

   SETUP: currently wired to your real AdMob App ID (in AndroidManifest.xml)
   and real ad unit ID (AD_UNIT_ID below), with IS_TESTING off — this is
   live and earning. New AdMob accounts/apps can take a while (sometimes
   longer than Google's own "up to an hour" estimate) to start actually
   returning fill; a consent-check failure or no-fill response both look
   identical from the outside (no ad, no error shown to the user) — see
   ensureConsent() below and the console logs from bannerAdLoaded /
   bannerAdFailedToLoad for what's actually happening (inspect via
   chrome://inspect with the phone on USB debugging).
   ========================================================================== */

const AdMobBridge = (() => {
  // ↓↓↓ TEMPORARY: forces Google's public sample ad unit, which always
  // serves a real (test-labeled) ad regardless of AdMob account approval
  // status — used purely to confirm the banner itself renders/positions
  // correctly while your real account is still pending review. Once
  // AdMob shows your account as Approved, set this back to `false` and
  // republish — it'll automatically go back to using your real
  // AD_UNIT_ID/IS_TESTING values below.
  const FORCE_SAMPLE_AD_FOR_TESTING = true;

  // Your real AdMob banner ad unit, live and earning.
  const AD_UNIT_ID = FORCE_SAMPLE_AD_FOR_TESTING ? 'ca-app-pub-3940256099942544/6300978111' : 'ca-app-pub-3555762597064994/7740575940';
  const IS_TESTING = FORCE_SAMPLE_AD_FOR_TESTING ? true : false;

  let initialized = false;
  let consentChecked = false;
  let canRequestAds = true; // optimistic default if consent check itself fails
  let bannerVisible = false;
  let everShownThisSession = false; // survives navigating away, unlike bannerVisible
  let everFailedThisSession = false;
  let everAttemptedThisSession = false;
  let lastError = null;
  let lastConsentStatus = null;

  function plugin() {
    const cap = window.Capacitor;
    return cap && cap.Plugins && cap.Plugins.AdMob;
  }
  function isNative() {
    const cap = window.Capacitor;
    return !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  }

  /** Pushes the app's whole shell (header included) down by the ad's
   *  real height so the native banner has clear space above it instead
   *  of drawing over it. `px` is in dp, which lines up with CSS px in a
   *  standard Capacitor WebView (both are density-independent). Pass 0
   *  to remove the offset entirely. */
  function applyContentOffset(px) {
    const app = document.getElementById('app');
    if (!app) return;
    app.style.paddingTop = px > 0 ? `${px}px` : '';
  }

  /** Google's Mobile Ads SDK will silently refuse to serve ANY ad — no
   *  error, just permanent no-fill — until this consent (UMP) flow has
   *  been resolved at least once. Skipping this entirely is the single
   *  most common reason a correctly-configured AdMob integration shows
   *  nothing at all. */
  async function ensureConsent() {
    const p = plugin();
    if (!p || consentChecked) return canRequestAds;
    try {
      const info = await p.requestConsentInfo();
      lastConsentStatus = info.status;
      if (info.isConsentFormAvailable && info.status === 'REQUIRED') {
        const updated = await p.showConsentForm();
        canRequestAds = updated.canRequestAds;
        lastConsentStatus = updated.status;
      } else {
        canRequestAds = info.canRequestAds;
      }
    } catch (e) {
      lastError = `consent check: ${e.message || e}`;
      console.warn('AdMob consent check failed:', e);
      // Leave canRequestAds at its optimistic default — better to attempt
      // the ad request than to permanently block ads over a transient
      // consent-check failure.
    }
    consentChecked = true;
    return canRequestAds;
  }

  async function ensureInit() {
    const p = plugin();
    if (!p || !isNative()) return false;
    if (initialized) return true;
    try {
      await p.initialize({});
      initialized = true;
      p.addListener('bannerAdLoaded', () => {
        everShownThisSession = true;
        console.log('AdMob: banner loaded');
      });
      p.addListener('bannerAdFailedToLoad', (err) => {
        everFailedThisSession = true;
        lastError = `load failed: ${(err && (err.message || err.code)) || JSON.stringify(err)}`;
        console.warn('AdMob: banner failed to load', err);
      });
      p.addListener('bannerAdSizeChanged', (size) => {
        // A hidden/removed/failed banner reports 0×0 — treat that as
        // "no offset needed" rather than collapsing content to nothing.
        applyContentOffset(size && size.height > 0 ? size.height : 0);
      });
    } catch (e) {
      lastError = `init: ${e.message || e}`;
      console.warn('AdMob init failed:', e);
    }
    return initialized;
  }

  /** Shows the banner pinned to the top of the screen. Safe to call
   *  repeatedly — reloads/re-shows if already up. */
  async function showBanner() {
    if (!(await ensureInit())) return;
    if (!(await ensureConsent())) {
      lastError = lastError || 'consent not granted (canRequestAds=false)';
      console.warn('AdMob: consent not granted, skipping ad request');
      return;
    }
    const p = plugin();
    try {
      everAttemptedThisSession = true;
      await p.showBanner({
        adId: AD_UNIT_ID,
        adSize: 'ADAPTIVE_BANNER',
        position: 'TOP_CENTER',
        margin: 0,
        isTesting: IS_TESTING,
      });
      bannerVisible = true;
      lastError = null;
    } catch (e) {
      lastError = `showBanner: ${e.message || e}`;
      console.warn('AdMob banner failed to show:', e);
    }
  }

  /** Tears the banner down completely — call this whenever leaving a
   *  screen that might have shown it, so it doesn't linger as a stray
   *  overlay on screens that were never meant to have an ad at all. */
  async function hideBannerIfShown() {
    const p = plugin();
    if (!p || !bannerVisible) return;
    try {
      await p.removeBanner();
    } catch (e) { /* already gone — fine */ }
    bannerVisible = false;
    applyContentOffset(0);
  }

  /** Everything the on-device diagnostics screen (More → About This App →
   *  Run Diagnostics) needs to show, so a stuck banner is debuggable from
   *  the phone itself with no computer involved. */
  function getDebugInfo() {
    return {
      pluginPresent: !!plugin(),
      isNative: isNative(),
      initialized,
      consentChecked,
      canRequestAds,
      lastConsentStatus,
      bannerVisible,
      everAttemptedThisSession,
      everShownThisSession,
      everFailedThisSession,
      lastError,
    };
  }

  return { showBanner, hideBannerIfShown, getDebugInfo };
})();
window.AdMobBridge = AdMobBridge;
