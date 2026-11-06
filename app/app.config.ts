import type { ExpoConfig } from 'expo/config';

// SERVER_URL and APP_TOKEN come from the environment (local .env or EAS env per profile).
// APP_TOKEN ships in the APK by design: it only unlocks our rate-limited relay (spec §10).
const config: ExpoConfig = {
  name: 'Drishti',
  slug: 'drishti',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  platforms: ['android'],
  android: {
    package: 'com.divyanshparashar.drishti',
    adaptiveIcon: {
      backgroundColor: '#000000',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'],
    blockedPermissions: [
      'android.permission.READ_PHONE_STATE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
  },
  plugins: [
    ['react-native-fast-tflite', { enableAndroidGpuLibraries: true }],
    [
      '@siteed/audio-studio',
      {
        enablePhoneStateHandling: false,
        enableNotifications: false,
        enableBackgroundAudio: false,
        enableDeviceDetection: false,
      },
    ],
    ['expo-audio', { microphonePermission: false }],
    'expo-sqlite',
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
  ],
  owner: 'divyanshdp1212',
  extra: {
    eas: { projectId: '2bda16b5-50c0-4ef7-b9fc-8cf185843351' },
    serverUrl: process.env.SERVER_URL ?? 'http://192.168.1.2:8000',
    appToken: process.env.APP_TOKEN ?? 'dev-token',
  },
};

export default config;
