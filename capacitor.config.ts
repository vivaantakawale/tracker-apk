import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android app wrapper. The appId identifies the installed app and its private
 * storage: never change it after installing, or the phone treats it as a
 * different app (with empty data).
 */
const config: CapacitorConfig = {
  appId: 'app.weighttracker.personal',
  appName: 'Weight Tracker',
  webDir: 'dist',
  android: {
    // The theme opts out of Android 15 edge-to-edge (see styles.xml), so the
    // WebView sits below the status bar on every Android version.
    adjustMarginsForEdgeToEdge: 'auto',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
    },
  },
};

export default config;
