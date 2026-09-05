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
     - will sit at a fixed distance from the top/bottom of the SCREEN,
       not from wherever the promo slot happens to be in the scrolled
       content
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
  // Your real AdMob banner ad unit, live and earning.
  const AD_UNIT_ID = 'ca-app-pub-3555762597064994/7740575940';
  const IS_TESTING = false;

  let initialized = false;
  let consentChecked = false;
  let canRequestAds = true; // optimistic default if consent check itself fails
  let bannerVisible = false;

  function plugin() {
    const cap = window.Capacitor;
    return cap && cap.Plugins && cap.Plugins.AdMob;
  }
  function isNative() {
    const cap = window.Capacitor;
    return !!(cap && cap.isNativePlatform && cap.isNativePlatform());
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
      if (info.isConsentFormAvailable && info.status === 'REQUIRED') {
        const updated = await p.showConsentForm();
        canRequestAds = updated.canRequestAds;
      } else {
        canRequestAds = info.canRequestAds;
      }
    } catch (e) {
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
      p.addListener('bannerAdLoaded', () => console.log('AdMob: banner loaded'));
      p.addListener('bannerAdFailedToLoad', (err) => console.warn('AdMob: banner failed to load', err));
    } catch (e) {
      console.warn('AdMob init failed:', e);
    }
    return initialized;
  }

  /** Shows the banner pinned to the top of the screen. Safe to call
   *  repeatedly — reloads/re-shows if already up. */
  async function showBanner() {
    if (!(await ensureInit())) return;
    if (!(await ensureConsent())) {
      console.warn('AdMob: consent not granted, skipping ad request');
      return;
    }
    const p = plugin();
    try {
      await p.showBanner({
        adId: AD_UNIT_ID,
        adSize: 'ADAPTIVE_BANNER',
        position: 'TOP_CENTER',
        margin: 0,
        isTesting: IS_TESTING,
      });
      bannerVisible = true;
    } catch (e) {
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
  }

  return { showBanner, hideBannerIfShown };
})();
window.AdMobBridge = AdMobBridge;
