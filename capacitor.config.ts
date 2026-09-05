import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mohaab.storeapp',
  appName: 'Better Store',
  webDir: 'www',
  plugins: {
    LocalNotifications: {
      // Status-bar (monochrome) icon + large (full-color logo) icon and
      // tint used by every local notification unless overridden per-call.
      // Resource names map to android/app/src/main/res/drawable-*/*.png.
      smallIcon: 'ic_stat_notify',
      iconColor: '#8b5cf6'
    },
    PushNotifications: {
      // Android only reads this for the "app in foreground" case (see
      // AdPush.js) — background/closed-app delivery is drawn by the OS
      // straight from the FCM payload using AndroidManifest.xml's
      // default_notification_* meta-data instead.
      presentationOptions: ['sound', 'alert']
    }
  }
};

export default config;
