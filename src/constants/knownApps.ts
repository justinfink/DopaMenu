// ============================================
// Known Apps Catalog
// Curated routing targets for custom interventions. DopaMenu is fundamentally
// an app router, so activities that want to "open Chess.com" should point at
// the native app with a URL fallback, not a raw website.
//
// Each entry ideally has:
//   - androidPackage: Play Store package id (used to build intent:// URLs)
//   - iosScheme:      iOS URL scheme or universal link (best-effort; many apps
//                     advertise one but it's not publicly documented)
//   - fallbackUrl:    what to open if neither native app is installed
//
// This list is intentionally small and hand-curated. Users can still enter a
// raw URL via the form's "Enter URL" option for anything not listed here.
// ============================================

export interface KnownApp {
  id: string;
  label: string;
  icon: string; // Ionicons name
  category: 'game' | 'learn' | 'read' | 'music' | 'fitness' | 'mindful' | 'create' | 'connect';
  androidPackage?: string;
  iosScheme?: string;
  fallbackUrl: string;
  // Short tagline shown in the picker grid
  tagline?: string;
}

export const KNOWN_APPS: KnownApp[] = [
  // --- Games / brain ---
  {
    id: 'chess-com',
    label: 'Chess.com',
    icon: 'game-controller',
    category: 'game',
    androidPackage: 'com.chess',
    iosScheme: 'chesscom://',
    fallbackUrl: 'https://www.chess.com/puzzles',
    tagline: 'One puzzle',
  },
  {
    id: 'lichess',
    label: 'Lichess',
    icon: 'game-controller',
    category: 'game',
    androidPackage: 'org.lichess.mobileapp',
    fallbackUrl: 'https://lichess.org/training',
    tagline: 'Free chess',
  },

  // --- Learning ---
  {
    id: 'duolingo',
    label: 'Duolingo',
    icon: 'language',
    category: 'learn',
    androidPackage: 'com.duolingo',
    iosScheme: 'duolingo://',
    fallbackUrl: 'https://www.duolingo.com',
    tagline: 'Language practice',
  },
  {
    id: 'anki',
    label: 'AnkiDroid',
    icon: 'school',
    category: 'learn',
    androidPackage: 'com.ichi2.anki',
    fallbackUrl: 'https://apps.ankiweb.net',
    tagline: 'Flashcards',
  },
  {
    id: 'khan-academy',
    label: 'Khan Academy',
    icon: 'school',
    category: 'learn',
    androidPackage: 'org.khanacademy.android',
    fallbackUrl: 'https://www.khanacademy.org',
    tagline: 'Free lessons',
  },

  // --- Reading ---
  {
    id: 'kindle',
    label: 'Kindle',
    icon: 'book',
    category: 'read',
    androidPackage: 'com.amazon.kindle',
    iosScheme: 'kindle://',
    fallbackUrl: 'https://read.amazon.com',
    tagline: 'Read a book',
  },
  {
    id: 'libby',
    label: 'Libby',
    icon: 'library',
    category: 'read',
    androidPackage: 'com.overdrive.mobile.android.libby',
    fallbackUrl: 'https://libbyapp.com',
    tagline: 'Library books',
  },
  {
    id: 'pocket',
    label: 'Pocket',
    icon: 'bookmark',
    category: 'read',
    androidPackage: 'com.ideashower.readitlater.pro',
    fallbackUrl: 'https://getpocket.com',
    tagline: 'Saved articles',
  },

  // --- Music / audio ---
  {
    id: 'spotify',
    label: 'Spotify',
    icon: 'musical-notes',
    category: 'music',
    androidPackage: 'com.spotify.music',
    iosScheme: 'spotify://',
    fallbackUrl: 'https://open.spotify.com',
    tagline: 'Music',
  },
  {
    id: 'yt-music',
    label: 'YouTube Music',
    icon: 'musical-notes',
    category: 'music',
    androidPackage: 'com.google.android.apps.youtube.music',
    fallbackUrl: 'https://music.youtube.com',
    tagline: 'Music',
  },
  {
    id: 'podcasts-google',
    label: 'Pocket Casts',
    icon: 'headset',
    category: 'music',
    androidPackage: 'au.com.shiftyjelly.pocketcasts',
    fallbackUrl: 'https://pca.st',
    tagline: 'Podcasts',
  },

  // --- Fitness ---
  {
    id: 'strava',
    label: 'Strava',
    icon: 'bicycle',
    category: 'fitness',
    androidPackage: 'com.strava',
    iosScheme: 'strava://',
    fallbackUrl: 'https://www.strava.com',
    tagline: 'Log a workout',
  },
  {
    id: 'nike-run',
    label: 'Nike Run Club',
    icon: 'walk',
    category: 'fitness',
    androidPackage: 'com.nike.plusgps',
    fallbackUrl: 'https://www.nike.com/nrc-app',
    tagline: 'Go for a run',
  },
  {
    id: 'seven',
    label: 'Seven',
    icon: 'barbell',
    category: 'fitness',
    androidPackage: 'se.perigee.android.seven',
    fallbackUrl: 'https://seven.app',
    tagline: '7-min workout',
  },

  // --- Mindfulness ---
  {
    id: 'headspace',
    label: 'Headspace',
    icon: 'leaf',
    category: 'mindful',
    androidPackage: 'com.getsomeheadspace.android',
    iosScheme: 'headspace://',
    fallbackUrl: 'https://www.headspace.com',
    tagline: 'Meditate',
  },
  {
    id: 'calm',
    label: 'Calm',
    icon: 'moon',
    category: 'mindful',
    androidPackage: 'com.calm.android',
    fallbackUrl: 'https://www.calm.com',
    tagline: 'Relax',
  },
  {
    id: 'insight-timer',
    label: 'Insight Timer',
    icon: 'timer',
    category: 'mindful',
    androidPackage: 'com.spotlightsix.zentimerlite2',
    fallbackUrl: 'https://insighttimer.com',
    tagline: 'Meditate',
  },

  // --- Create ---
  {
    id: 'day-one',
    label: 'Day One',
    icon: 'journal',
    category: 'create',
    androidPackage: 'com.dayoneapp.dayone',
    fallbackUrl: 'https://dayoneapp.com',
    tagline: 'Journal',
  },
  {
    id: 'procreate-pocket',
    label: 'Procreate Pocket',
    icon: 'brush',
    category: 'create',
    iosScheme: 'procreate://',
    fallbackUrl: 'https://procreate.com/pocket',
    tagline: 'Sketch (iOS)',
  },
  {
    id: 'notion',
    label: 'Notion',
    icon: 'create',
    category: 'create',
    androidPackage: 'notion.id',
    iosScheme: 'notion://',
    fallbackUrl: 'https://www.notion.so',
    tagline: 'Write',
  },

  // --- Connect ---
  {
    id: 'marco-polo',
    label: 'Marco Polo',
    icon: 'videocam',
    category: 'connect',
    androidPackage: 'co.happybits.marcopolo',
    fallbackUrl: 'https://www.marcopolo.me',
    tagline: 'Video message',
  },
  {
    id: 'signal',
    label: 'Signal',
    icon: 'chatbubbles',
    category: 'connect',
    androidPackage: 'org.thoughtcrime.securesms',
    fallbackUrl: 'https://signal.org',
    tagline: 'Message a friend',
  },
];

export const KNOWN_APPS_BY_ID: Record<string, KnownApp> = Object.fromEntries(
  KNOWN_APPS.map((a) => [a.id, a])
);

// Lookup by Android package — useful if we ever want to reverse-match a
// persisted intervention back to a catalog entry for display.
export const KNOWN_APPS_BY_PACKAGE: Record<string, KnownApp> = Object.fromEntries(
  KNOWN_APPS.filter((a) => !!a.androidPackage).map((a) => [a.androidPackage!, a])
);

export const CATEGORY_LABELS: Record<KnownApp['category'], string> = {
  game: 'Games & brain',
  learn: 'Learning',
  read: 'Reading',
  music: 'Music & audio',
  fitness: 'Fitness',
  mindful: 'Mindfulness',
  create: 'Create',
  connect: 'Connect',
};
