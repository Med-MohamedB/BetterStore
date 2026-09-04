/* ==========================================================================
   AdNotify — fires a local notification when the promo banner actually
   changes to something new (not on first install, not on every app open
   — only on a genuine change), with the ad's image attached to the
   notification itself where Android's notification system allows it.
   Tapping it just opens the app (the OS's default behavior for a local
   notification) — the ad is already shown on Dashboard once open.

   Notes on the image attachment: Android's notification "big picture"
   style needs a LOCAL file, not a remote URL — passing a remote
   https:// URL directly tends to silently fail to render on real
   devices. So this downloads the image once via Filesystem into the
   app's cache and attaches that local copy instead, which is the
   reliable path.
   ========================================================================== */

const AdNotify = (() => {
  const SIG_KEY = 'sa_ad_notified_sig';
  const PERM_ASKED_KEY = 'sa_notify_perm_asked';

  function signatureFor(config) {
    if (!config) return '';
    if (config.style === 'image') return `image:${config.bannerImage}:${config.url}`;
    return `simple:${config.title}:${config.subtitle}:${config.image}:${config.url}`;
  }

  function plugin() {
    const cap = window.Capacitor;
    return cap && cap.Plugins && cap.Plugins.LocalNotifications;
  }

  async function ensurePermission() {
    const p = plugin();
    if (!p) return false;
    try {
      const current = await p.checkPermissions();
      if (current.display === 'granted') return true;
      // Ask at most once, ever — re-prompting after a decline is both
      // against Android's own guidance and just annoying.
      if (localStorage.getItem(PERM_ASKED_KEY)) return false;
      localStorage.setItem(PERM_ASKED_KEY, '1');
      const result = await p.requestPermissions();
      return result.display === 'granted';
    } catch (e) {
      return false;
    }
  }

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
   *  once per screen navigation. */
  async function checkAndNotify(config) {
    const cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return; // local notifications need the native app
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

    localStorage.setItem(SIG_KEY, sig);

    const granted = await ensurePermission();
    if (!granted) return;

    const imageUrl = config.style === 'image' ? config.bannerImage : config.image;
    const localImageUri = imageUrl ? await downloadImageAsLocalUri(imageUrl) : null;

    const title = config.style === 'image' ? 'New offer available' : (config.title || 'New offer available');
    const body = config.style === 'image' ? 'Tap to see what\u2019s new' : (config.subtitle || '');

    try {
      await plugin().schedule({
        notifications: [{
          id: Date.now() % 2147483647,
          title,
          body,
          ...(localImageUri ? { attachments: [{ id: 'ad-image', url: localImageUri }] } : {}),
        }],
      });
    } catch (e) {
      console.warn('Ad notification failed:', e);
    }
  }

  return { checkAndNotify };
})();
window.AdNotify = AdNotify;
