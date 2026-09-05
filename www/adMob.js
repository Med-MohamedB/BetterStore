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

   SETUP: ships with Google's PUBLIC TEST App ID/Ad Unit ID by default —
   safe to leave as-is, it only ever serves clearly-labeled test ads and
   earns nothing. To earn real revenue:
     1. Create a free AdMob account at admob.google.com, add this app
        (package: com.mohaab.storeapp), create a Banner ad unit.
     2. Put your real App ID in AndroidManifest.xml's
        com.google.android.gms.ads.APPLICATION_ID meta-data (replacing
        the ca-app-pub-3940256099942544~... test value there).
     3. Replace AD_UNIT_ID below with your real banner ad unit id, and
        set IS_TESTING to false.
   New AdMob accounts/apps often serve test-only fill for the first
   little while even once IDs are correct — that's Google's own review
   process, not a bug here.
   ========================================================================== */

const AdMobBridge = (() => {
  // Your real AdMob banner ad unit, live and earning.
  const AD_UNIT_ID = 'ca-app-pub-3555762597064994/7740575940';
  const IS_TESTING = false;

  let initialized = false;
  let bannerVisible = false;

  function plugin() {
    const cap = window.Capacitor;
    return cap && cap.Plugins && cap.Plugins.AdMob;
  }
  function isNative() {
    const cap = window.Capacitor;
    return !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  }

  async function ensureInit() {
    const p = plugin();
    if (!p || !isNative()) return false;
    if (initialized) return true;
    try {
      await p.initialize({});
      initialized = true;
    } catch (e) {
      console.warn('AdMob init failed:', e);
    }
    return initialized;
  }

  /** Shows the banner pinned to the top of the screen. Safe to call
   *  repeatedly — reloads/re-shows if already up. */
  async function showBanner() {
    const p = plugin();
    if (!(await ensureInit())) return;
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
