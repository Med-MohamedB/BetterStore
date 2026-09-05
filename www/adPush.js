/* ==========================================================================
   AdPush — real push notifications for new ads, delivered the moment the
   control panel publishes ad-config.json, even if the app is backgrounded
   or fully closed (same "instant" behavior as a chat app's message push).

   How delivery actually happens in each app state:

   • App closed / backgrounded: Android displays the notification itself,
     straight from the FCM payload — no app code runs at all. It uses the
     app logo + purple tint + the high-importance "ad-alerts" channel
     automatically, via the default_notification_* meta-data declared in
     AndroidManifest.xml, and shows the banner image as a big picture if
     the payload included one. There is nothing for this file to do in
     that case — it already just works once Firebase is set up.

   • App open (foreground): FCM does NOT auto-display a "notification"
     message while the app is in the foreground — it hands it to this
     file instead (`pushNotificationReceived`), so this reconstructs the
     exact same rich local notification AdNotify.js would show — the ad's
     own text, image attached as a big picture, the app logo, all through
     the same "ad-alerts" channel.

   Where the pushes come from: .github/workflows/send-ad-push.yml runs
   automatically whenever ad-config.json changes on the repo (whether
   that's a Termux `git push` or the control panel publishing through the
   GitHub API) and sends one push to the "ad-updates" topic — every
   installed copy of the app is subscribed to that topic natively on
   first launch (see MainActivity.kt), no per-device token bookkeeping
   needed anywhere.
   ========================================================================== */

const AdPush = (() => {
  const CHANNEL_ID = 'ad-alerts';
  const SMALL_ICON = 'ic_stat_notify';
  const LARGE_ICON = 'ic_notify_logo';
  const PERM_ASKED_KEY = 'sa_push_perm_asked';

  function plugin() {
    const cap = window.Capacitor;
    return cap && cap.Plugins && cap.Plugins.PushNotifications;
  }
  function localPlugin() {
    const cap = window.Capacitor;
    return cap && cap.Plugins && cap.Plugins.LocalNotifications;
  }
  function isNative() {
    const cap = window.Capacitor;
    return !!(cap && cap.isNativePlatform && cap.isNativePlatform());
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
      if (!cap || !cap.Plugins || !cap.Plugins.Filesystem || !url) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const base64 = await blobToBase64(blob);
      const ext = ((blob.type.split('/')[1] || 'jpg').split('+')[0]).replace(/[^a-z0-9]/gi, '') || 'jpg';
      const filename = `ad-push-${Date.now()}.${ext}`;
      const written = await cap.Plugins.Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
      return written.uri;
    } catch (e) {
      return null;
    }
  }

  /** Rebuild the rich local notification for the "app is already open"
   *  case — mirrors AdNotify.checkAndNotify's styling exactly, so a push
   *  looks identical whether it was shown by the OS or by us. */
  async function showForegroundNotification(pushNotification) {
    const lp = localPlugin();
    if (!lp) return;

    const data = pushNotification.data || {};
    const imageUrl = data.image || (pushNotification.notification && pushNotification.notification.image) || null;
    const localImageUri = imageUrl ? await downloadImageAsLocalUri(imageUrl) : null;

    try {
      await lp.schedule({
        notifications: [{
          id: Date.now() % 2147483647,
          channelId: CHANNEL_ID,
          smallIcon: SMALL_ICON,
          largeIcon: LARGE_ICON,
          iconColor: '#8b5cf6',
          title: pushNotification.title || 'New offer available',
          body: pushNotification.body || 'Tap to see what\u2019s new',
          ...(localImageUri ? { attachments: [{ id: 'ad-push-image', url: localImageUri }] } : {}),
        }],
      });
    } catch (e) {
      console.warn('Foreground ad push notification failed:', e);
    }
  }

  /** Ask for the notification permission (shared with LocalNotifications —
   *  same Android setting) and register the device for push. Safe to call
   *  repeatedly; only ever prompts once. Call this once at app boot. */
  async function init() {
    const p = plugin();
    if (!p || !isNative()) return;

    try {
      const current = await p.checkPermissions();
      let granted = current.receive === 'granted';
      if (!granted && !localStorage.getItem(PERM_ASKED_KEY)) {
        localStorage.setItem(PERM_ASKED_KEY, '1');
        const result = await p.requestPermissions();
        granted = result.receive === 'granted';
      }
      if (!granted) return;

      await p.register();

      await p.addListener('registrationError', (err) => {
        console.warn('Push registration failed:', err);
      });

      // Only fires while the app is in the foreground — see file header.
      await p.addListener('pushNotificationReceived', (notification) => {
        showForegroundNotification(notification);
      });
    } catch (e) {
      console.warn('AdPush init failed:', e);
    }
  }

  return { init };
})();
window.AdPush = AdPush;
