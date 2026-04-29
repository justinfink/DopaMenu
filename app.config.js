// Dynamic Expo config - reads from environment variables
// https://docs.expo.dev/workflow/configuration/

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://app.posthog.com';

// Keep in sync with IOS_QUERY_SCHEMES in src/constants/appCatalog.ts.
// Required so Linking.canOpenURL() can probe whether an app is installed on iOS.
const LS_APPLICATION_QUERIES_SCHEMES = [
  'alltrails', 'anki', 'audible', 'barcelona', 'bear', 'bumble', 'calm',
  'chesscom', 'dayone', 'discord', 'duolingo', 'ebay', 'fb', 'garageband',
  'headspace', 'hinge', 'instagram', 'kindle', 'libby', 'lichess', 'linkedin',
  'mobilenotes', 'nflx', 'obsidian', 'overcast', 'pinterest', 'pktc', 'podcasts',
  'readwise', 'reddit', 'snapchat', 'spotify', 'strava', 'things', 'tiktok',
  'tinder', 'todoist', 'twitch', 'twitter', 'youtube',
  // DopaMenu's own scheme for Shortcuts deep-link return
  'dopamenu',
  // Apple Shortcuts (for one-tap shortcut import)
  'shortcuts',
];

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
      bundleIdentifier: 'ai.dopamenu.app',
      infoPlist: {
        NSCalendarsUsageDescription:
          'DopaMenu uses your calendar to understand your schedule and suggest better alternatives at the right moments.',
        ITSAppUsesNonExemptEncryption: false,
        LSApplicationQueriesSchemes: LS_APPLICATION_QUERIES_SCHEMES,
      },
      // Family Controls entitlement — required for DeviceActivity monitoring
      // and the Shield extension. Apple gates this with a manual approval per
      // bundle ID; verify by building and watching for "Syncing capabilities"
      // to succeed without an "enable capability" error.
      entitlements: {
        'com.apple.developer.family-controls': true,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#F8F6FA',
      },
      package: 'ai.dopamenu.app',
      versionCode: 10,
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
      // iOS Family Controls — Shield + ShieldAction + DeviceActivityMonitor extensions.
      // Must match IOS_APP_GROUP in src/constants/appGroup.ts.
      [
        'react-native-device-activity',
        {
          appGroup: 'group.ai.dopamenu.app',
          copyToTargetFolder: true,
        },
      ],
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
