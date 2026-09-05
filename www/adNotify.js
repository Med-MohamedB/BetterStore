/* ==========================================================================
   AdNotify — fires a local notification when the promo banner actually
   changes to something new (not on first install, not on every app open
   — only on a genuine change, and again every time it changes after that,
   even if the previous one was already opened/dismissed), with the ad's
   image attached to the notification itself where Android's notification
   system allows it. Every notification also carries the app's logo (small
   status-bar glyph + full-colour large icon) so it's instantly recognizable
   in the shade. Tapping it just opens the app (the OS's default behavior
   for a local notification) — the ad is already shown on Dashboard once
   open.

   Notes on the image attachment: Android's notification "big picture"
   style needs a LOCAL file, not a remote URL — passing a remote
   https:// URL directly tends to silently fail to render on real
   devices. So this downloads the image once via Filesystem into the
   app's cache and attaches that local copy instead, which is the
   reliable path.

   Notes on permission: this is asked for proactively on first launch
   (see requestPermission(), called from app.js/onboarding.js) so it's
   already resolved by the time the first ad shows up, instead of the
   user seeing a system prompt appear "out of nowhere" mid-session.
   ========================================================================== */

const AdNotify = (() => {
  const SIG_KEY = 'sa_ad_notified_sig';
  const PERM_ASKED_KEY = 'sa_notify_perm_asked';
  const CHANNEL_ID = 'ad-alerts';

  // These map to android/app/src/main/res/drawable-*/ — a white silhouette
  // of the app glyph for the status bar, and the full-colour app logo for
  // the larger icon shown inside the expanded notification.
  const SMALL_ICON = 'ic_stat_notify';
  const LARGE_ICON = 'ic_notify_logo';

  function signatureFor(config) {
    if (!config) return '';
    if (config.style === 'image') return `image:${config.bannerImage}:${config.url}`;
    return `simple:${config.title}:${config.subtitle}:${config.image}:${config.url}`;
  }

  function plugin() {
    const cap = window.Capacitor;
    return cap && cap.Plugins && cap.Plugins.LocalNotifications;
  }

  function isNative() {
    const cap = window.Capacitor;
    return !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  }

  let channelReady = null;
  /** Make sure a HIGH-importance channel exists so ad notifications pop up
   *  as a heads-up banner + sound instead of landing silently in the shade.
   *  Android ignores repeat calls with the same id, so this is safe to
   *  call as often as needed. */
  async function ensureChannel() {
    const p = plugin();
    if (!p || !p.createChannel) return;
    if (channelReady) return channelReady;
    channelReady = p.createChannel({
      id: CHANNEL_ID,
      name: 'Offers & promotions',
      description: 'Lets you know when a new offer or ad is available',
      importance: 4, // IMPORTANCE_HIGH — heads-up banner + sound
      visibility: 1,
      vibration: true,
    }).catch(() => {});
    return channelReady;
  }

  /** Ask for the notification permission. Safe to call multiple times —
   *  if the OS already decided (granted or denied) it resolves instantly
   *  without showing anything. Only ever shows the actual system prompt
   *  once, ever, per Android's own guidance (re-prompting after a decline
   *  is not allowed to open the system dialog again anyway). */
  async function requestPermission() {
    const p = plugin();
    if (!p || !isNative()) return false;
    try {
      await ensureChannel();
      const current = await p.checkPermissions();
      if (current.display === 'granted') return true;
      if (localStorage.getItem(PERM_ASKED_KEY)) return false;
      localStorage.setItem(PERM_ASKED_KEY, '1');
      const result = await p.requestPermissions();
      return result.display === 'granted';
    } catch (e) {
      return false;
    }
  }

  // Kept as an internal alias — checkAndNotify calls this right before
  // scheduling, so permission is (re-)verified even if the proactive
  // launch-time request above hasn't run yet for some reason.
  const ensurePermission = requestPermission;

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function downloadImageAsLocalUri(url) {
    try {
      const cap = window.Capacitor;
      if (!cap || !cap.Plugins || !cap.Plugins.Filesystem) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const base64 = await blobToBase64(blob);
      const ext = ((blob.type.split('/')[1] || 'jpg').split('+')[0]).replace(/[^a-z0-9]/gi, '') || 'jpg';
      const filename = `ad-notify-${Date.now()}.${ext}`;
      const written = await cap.Plugins.Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
      return written.uri;
    } catch (e) {
      return null;
    }
  }

  /** Called by ShopPromo right after a *fresh network fetch* resolves
   *  (not on cached reads) — so this runs roughly once per session, not
   *  once per screen navigation. Fires again every single time the ad's
   *  content actually changes, regardless of whether the user already
   *  opened, tapped, or dismissed the previous one — the comparison is
   *  purely "is this different from the last thing we notified about". */
  async function checkAndNotify(config) {
    if (!isNative()) return; // local notifications need the native app
    if (!plugin()) return;
    if (!config || !config.style || !config.url) return;
    // The Telegram-shop default isn't "a new ad" worth a notification.
    if (config.style === 'simple' && config.title === 'Check out our Telegram Shop') return;

    const sig = signatureFor(config);
    const lastSig = localStorage.getItem(SIG_KEY);

    if (lastSig === null) {
      // First-ever check on this device — record a baseline silently.
      // Notifying here would mean everyone who already had an ad running
      // gets a notification the moment this feature ships, which isn't
      // "new" from their perspective.
      localStorage.setItem(SIG_KEY, sig);
      return;
    }
    if (lastSig === sig) return; // nothing changed

    // Record the new signature BEFORE we know whether the push actually
    // succeeds — a permission hiccup shouldn't cause the same ad to spam
    // once permission is later granted; the *content change* is what
    // gates this, not delivery success.
    localStorage.setItem(SIG_KEY, sig);

    const granted = await ensurePermission();
    if (!granted) return;

    const imageUrl = config.style === 'image' ? config.bannerImage : config.image;
    const localImageUri = imageUrl ? await downloadImageAsLocalUri(imageUrl) : null;

    // Simple ads show their own real title/subtitle text. Image (custom
    // banner) ads have no separate text fields by design — the graphic is
    // fully self-contained — so they keep this same generic line, shown
    // alongside the banner image attachment.
    const title = config.style === 'image' ? 'New offer available' : (config.title || 'New offer available');
    const body = config.style === 'image' ? 'Tap to see what\u2019s new' : (config.subtitle || '');

    try {
      await plugin().schedule({
        notifications: [{
          id: Date.now() % 2147483647,
          channelId: CHANNEL_ID,
          smallIcon: SMALL_ICON,
          largeIcon: LARGE_ICON,
          iconColor: '#8b5cf6',
          title,
          body,
          ...(localImageUri ? { attachments: [{ id: 'ad-image', url: localImageUri }] } : {}),
        }],
      });
    } catch (e) {
      console.warn('Ad notification failed:', e);
    }
  }

  return { checkAndNotify, requestPermission };
})();
window.AdNotify = AdNotify;
