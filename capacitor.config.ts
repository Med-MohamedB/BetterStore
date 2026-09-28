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
    },
    AdMob: {
      // initializeForTesting only affects the plugin's OWN test flows —
      // whether ads actually request as test ads is controlled per-call
      // via `isTesting` in www/adMob.js (currently true, using Google's
      // public test ad unit id, until a real one is configured there).
      initializeForTesting: false
    },
    FirebaseAuthentication: {
      // Only Google needs building in natively (see android/variables.gradle
      // — rgcfaIncludeGoogle) and configuring here. skipNativeAuth: false
      // (the default) means sign-in goes through the native Firebase Auth
      // SDK on Android rather than a WebView — see the file's own notes
      // on why that matters.
      providers: ['google.com'],
      skipNativeAuth: false
    }
  }
};

export default config;
