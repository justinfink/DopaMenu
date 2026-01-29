// Dynamic Expo config - reads from environment variables
// https://docs.expo.dev/workflow/configuration/

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://app.posthog.com';

export default {
  expo: {
    name: 'DopaMenu',
    slug: 'dopamenu',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'dopamenu',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#F8F6FA',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.dopamenu.app',
      infoPlist: {
        NSCalendarsUsageDescription:
          'DopaMenu uses your calendar to understand your schedule and suggest better alternatives at the right moments.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#F8F6FA',
      },
      package: 'com.dopamenu.app',
      permissions: [
        'android.permission.READ_CALENDAR',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.VIBRATE',
        'android.permission.WRITE_CALENDAR',
        'android.permission.PACKAGE_USAGE_STATS',
        'android.permission.FOREGROUND_SERVICE',
      ],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-notifications',
        {
          icon: './assets/images/notification-icon.png',
          color: '#9B7BB8',
        },
      ],
      [
        'expo-calendar',
        {
          calendarPermission: 'DopaMenu uses your calendar to understand your schedule.',
        },
      ],
      'expo-font',
      // Custom plugin for Android app usage detection
      './plugins/app-usage/withAppUsage',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '0c185b6b-f75b-4108-9410-df2ba98ae98e',
      },
      // Environment variables exposed to the app
      posthogApiKey: POSTHOG_API_KEY,
      posthogHost: POSTHOG_HOST,
    },
  },
};
