import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The Android app is a native shell around the live site: it loads https://apex-voice-app.netlify.app, so sign-in
 * cookies stay same-origin and every web deploy reaches the app without a new APK. The shell adds what a browser
 * cannot do: a foreground service that keeps the microphone alive when the screen is off.
 */
/**
 * Test builds only: set APEX_DEV_SERVER (for example http://localhost:8888, reached over the USB cable with adb reverse)
 * before `npx cap sync android` to point the app at a local server instead of the live site. Leave it unset for the real app.
 */
const devServer = process.env.APEX_DEV_SERVER

const config: CapacitorConfig = {
  appId: 'com.brandigail.apexvoice',
  appName: 'Apex Voice',
  webDir: 'dist',
  server: {
    url: devServer ?? 'https://apex-voice-app.netlify.app',
    androidScheme: devServer ? 'http' : 'https',
    cleartext: Boolean(devServer),
    // Shown instead of Chrome's error page when the phone has no connection (public/app-offline.html).
    errorPath: 'app-offline.html',
  },
  android: {
    backgroundColor: '#07060f',
    allowMixedContent: false,
  },
}

export default config
