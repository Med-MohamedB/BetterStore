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
    }
  }
};

export default config;
