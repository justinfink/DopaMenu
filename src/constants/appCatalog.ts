/**
 * Central catalog of known apps — used for:
 *   - Problem-app picker (dopamine traps to track & intervene on)
 *   - Redirect-app picker (healthy alternatives to suggest)
 *   - Installed-app probing (iOS canOpenURL + Android PackageManager)
 *   - LSApplicationQueriesSchemes generation (build-time)
 *   - Auto-generated redirect interventions (launch target by platform)
 *
 * Each entry should carry enough info to launch the app on both platforms
 * with a web fallback. iOS schemes must match Info.plist LSApplicationQueriesSchemes.
 */

export type AppCategory =
  | 'social'
  | 'video'
  | 'news'
  | 'shopping'
  | 'dating'
  | 'gaming'
  | 'messaging'
  | 'chess'
  | 'reading'
  | 'meditation'
  | 'language'
  | 'audio'
  | 'music'
  | 'notes'
  | 'fitness'
  | 'learning'
  | 'creative'
  | 'productivity'
  | 'nature';

export type AppRole = 'problem' | 'redirect' | 'both';

export interface AppCatalogEntry {
  /** Stable id — used in storage, never change */
  id: string;
  /** User-facing name */
  label: string;
  category: AppCategory;
  role: AppRole;
  /** iOS URL scheme with trailing colon — e.g. "instagram://" */
  iosScheme?: string;
  /** iOS bundle id — used for Shortcuts "Open App" action */
  iosBundleId?: string;
  /** Android package name — used for installed-app detection & intent:// */
  androidPackage?: string;
  /** Web fallback URL — always provide one */
  webUrl: string;
  /** One-line description shown in picker */
  blurb?: string;
}

// -------------------------------------------------------------------------
// PROBLEM APPS — dopamine traps to track
// -------------------------------------------------------------------------
const PROBLEM_APPS: AppCatalogEntry[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    category: 'social',
    role: 'problem',
    iosScheme: 'instagram://',
    iosBundleId: 'com.burbn.instagram',
    androidPackage: 'com.instagram.android',
    webUrl: 'https://instagram.com',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    category: 'video',
    role: 'problem',
    iosScheme: 'tiktok://',
    iosBundleId: 'com.zhiliaoapp.musically',
    androidPackage: 'com.zhiliaoapp.musically',
    webUrl: 'https://tiktok.com',
  },
  {
    id: 'twitter',
    label: 'X (Twitter)',
    category: 'social',
    role: 'problem',
    iosScheme: 'twitter://',
    iosBundleId: 'com.atebits.Tweetie2',
    androidPackage: 'com.twitter.android',
    webUrl: 'https://x.com',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    category: 'social',
    role: 'problem',
    iosScheme: 'fb://',
    iosBundleId: 'com.facebook.Facebook',
    androidPackage: 'com.facebook.katana',
    webUrl: 'https://facebook.com',
  },
  {
    id: 'reddit',
    label: 'Reddit',
    category: 'social',
    role: 'problem',
    iosScheme: 'reddit://',
    iosBundleId: 'com.reddit.Reddit',
    androidPackage: 'com.reddit.frontpage',
    webUrl: 'https://reddit.com',
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    category: 'social',
    role: 'problem',
    iosScheme: 'snapchat://',
    iosBundleId: 'com.toyopagroup.picaboo',
    androidPackage: 'com.snapchat.android',
    webUrl: 'https://snapchat.com',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    category: 'video',
    role: 'both',
    iosScheme: 'youtube://',
    iosBundleId: 'com.google.ios.youtube',
    androidPackage: 'com.google.android.youtube',
    webUrl: 'https://youtube.com',
  },
  {
    id: 'netflix',
    label: 'Netflix',
    category: 'video',
    role: 'problem',
    iosScheme: 'nflx://',
    iosBundleId: 'com.netflix.Netflix',
    androidPackage: 'com.netflix.mediaclient',
    webUrl: 'https://netflix.com',
  },
  {
    id: 'threads',
    label: 'Threads',
    category: 'social',
    role: 'problem',
    iosScheme: 'barcelona://',
    iosBundleId: 'com.burbn.barcelona',
    androidPackage: 'com.instagram.barcelona',
    webUrl: 'https://threads.net',
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    category: 'social',
    role: 'problem',
    iosScheme: 'pinterest://',
    iosBundleId: 'pinterest',
    androidPackage: 'com.pinterest',
    webUrl: 'https://pinterest.com',
  },
  {
    id: 'tinder',
    label: 'Tinder',
    category: 'dating',
    role: 'problem',
    iosScheme: 'tinder://',
    iosBundleId: 'com.cardify.tinder',
    androidPackage: 'com.tinder',
    webUrl: 'https://tinder.com',
  },
  {
    id: 'bumble',
    label: 'Bumble',
    category: 'dating',
    role: 'problem',
    iosScheme: 'bumble://',
    iosBundleId: 'com.bumble.app',
    androidPackage: 'com.bumble.app',
    webUrl: 'https://bumble.com',
  },
  {
    id: 'hinge',
    label: 'Hinge',
    category: 'dating',
    role: 'problem',
    iosScheme: 'hinge://',
    iosBundleId: 'co.match.matchhinge',
    androidPackage: 'co.hinge.app',
    webUrl: 'https://hinge.co',
  },
  {
    id: 'twitch',
    label: 'Twitch',
    category: 'video',
    role: 'problem',
    iosScheme: 'twitch://',
    iosBundleId: 'tv.twitch',
    androidPackage: 'tv.twitch.android.app',
    webUrl: 'https://twitch.tv',
  },
  {
    id: 'amazon',
    label: 'Amazon',
    category: 'shopping',
    role: 'problem',
    iosBundleId: 'com.amazon.Amazon',
    androidPackage: 'com.amazon.mShop.android.shopping',
    webUrl: 'https://amazon.com',
  },
  {
    id: 'ebay',
    label: 'eBay',
    category: 'shopping',
    role: 'problem',
    iosScheme: 'ebay://',
    iosBundleId: 'com.ebay.iphone',
    androidPackage: 'com.ebay.mobile',
    webUrl: 'https://ebay.com',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    category: 'social',
    role: 'problem',
    iosScheme: 'linkedin://',
    iosBundleId: 'com.linkedin.LinkedIn',
    androidPackage: 'com.linkedin.android',
    webUrl: 'https://linkedin.com',
  },
  {
    id: 'discord',
    label: 'Discord',
    category: 'messaging',
    role: 'problem',
    iosScheme: 'discord://',
    iosBundleId: 'com.hammerandchisel.discord',
    androidPackage: 'com.discord',
    webUrl: 'https://discord.com',
  },
];

// -------------------------------------------------------------------------
// REDIRECT APPS — healthy alternatives
// -------------------------------------------------------------------------
const REDIRECT_APPS: AppCatalogEntry[] = [
  // Chess / puzzles
  {
    id: 'chesscom',
    label: 'Chess.com',
    category: 'chess',
    role: 'redirect',
    iosScheme: 'chesscom://',
    iosBundleId: 'com.chess.Chess',
    androidPackage: 'com.chess',
    webUrl: 'https://chess.com',
    blurb: 'Play a quick game',
  },
  {
    id: 'lichess',
    label: 'Lichess',
    category: 'chess',
    role: 'redirect',
    iosScheme: 'lichess://',
    iosBundleId: 'org.lichess.mobileapp',
    androidPackage: 'org.lichess.mobileapp',
    webUrl: 'https://lichess.org',
  },
  // Reading
  {
    id: 'kindle',
    label: 'Kindle',
    category: 'reading',
    role: 'redirect',
    iosScheme: 'kindle://',
    iosBundleId: 'com.amazon.Lassen',
    androidPackage: 'com.amazon.kindle',
    webUrl: 'https://read.amazon.com',
    blurb: 'Open your current book',
  },
  {
    id: 'libby',
    label: 'Libby',
    category: 'reading',
    role: 'redirect',
    iosScheme: 'libby://',
    iosBundleId: 'com.overdrive.mobile.iphone.libby',
    androidPackage: 'com.overdrive.mobile.android.libby',
    webUrl: 'https://libbyapp.com',
  },
  {
    id: 'readwise',
    label: 'Readwise',
    category: 'reading',
    role: 'redirect',
    iosScheme: 'readwise://',
    iosBundleId: 'com.readwise.app',
    androidPackage: 'com.readwise.books',
    webUrl: 'https://readwise.io',
  },
  // Meditation
  {
    id: 'headspace',
    label: 'Headspace',
    category: 'meditation',
    role: 'redirect',
    iosScheme: 'headspace://',
    iosBundleId: 'com.getsomeheadspace.Headspace',
    androidPackage: 'com.getsomeheadspace.android',
    webUrl: 'https://headspace.com',
    blurb: 'Guided meditation',
  },
  {
    id: 'calm',
    label: 'Calm',
    category: 'meditation',
    role: 'redirect',
    iosScheme: 'calm://',
    iosBundleId: 'com.calm.calm',
    androidPackage: 'com.calm.android',
    webUrl: 'https://calm.com',
  },
  {
    id: 'waking-up',
    label: 'Waking Up',
    category: 'meditation',
    role: 'redirect',
    iosBundleId: 'com.wakingup.app',
    androidPackage: 'com.wakingup.android',
    webUrl: 'https://wakingup.com',
  },
  {
    id: 'insight-timer',
    label: 'Insight Timer',
    category: 'meditation',
    role: 'redirect',
    iosBundleId: 'com.spotlightsix.zentimercloud',
    androidPackage: 'com.spotlightsix.zentimerlite2',
    webUrl: 'https://insighttimer.com',
  },
  // Language
  {
    id: 'duolingo',
    label: 'Duolingo',
    category: 'language',
    role: 'redirect',
    iosScheme: 'duolingo://',
    iosBundleId: 'com.duolingo.DuolingoMobile',
    androidPackage: 'com.duolingo',
    webUrl: 'https://duolingo.com',
    blurb: 'One quick lesson',
  },
  {
    id: 'anki',
    label: 'AnkiMobile',
    category: 'learning',
    role: 'redirect',
    iosScheme: 'anki://',
    iosBundleId: 'net.ankimobile.flashcards',
    androidPackage: 'com.ichi2.anki',
    webUrl: 'https://apps.ankiweb.net',
  },
  {
    id: 'babbel',
    label: 'Babbel',
    category: 'language',
    role: 'redirect',
    iosBundleId: 'com.lesson-nine.babbel',
    androidPackage: 'com.babbel.mobile.android.en',
    webUrl: 'https://babbel.com',
  },
  // Audio / podcasts
  {
    id: 'audible',
    label: 'Audible',
    category: 'audio',
    role: 'redirect',
    iosScheme: 'audible://',
    iosBundleId: 'com.audible.iphone',
    androidPackage: 'com.audible.application',
    webUrl: 'https://audible.com',
    blurb: 'Continue audiobook',
  },
  {
    id: 'spotify',
    label: 'Spotify',
    category: 'music',
    role: 'both',
    iosScheme: 'spotify://',
    iosBundleId: 'com.spotify.client',
    androidPackage: 'com.spotify.music',
    webUrl: 'https://spotify.com',
  },
  {
    id: 'apple-podcasts',
    label: 'Apple Podcasts',
    category: 'audio',
    role: 'redirect',
    iosScheme: 'podcasts://',
    iosBundleId: 'com.apple.podcasts',
    webUrl: 'https://podcasts.apple.com',
  },
  {
    id: 'overcast',
    label: 'Overcast',
    category: 'audio',
    role: 'redirect',
    iosScheme: 'overcast://',
    iosBundleId: 'fm.overcast.overcast',
    webUrl: 'https://overcast.fm',
  },
  {
    id: 'pocketcasts',
    label: 'Pocket Casts',
    category: 'audio',
    role: 'redirect',
    iosScheme: 'pktc://',
    iosBundleId: 'au.com.shiftyjelly.podcasts',
    androidPackage: 'au.com.shiftyjelly.pocketcasts',
    webUrl: 'https://pocketcasts.com',
  },
  // Notes / journaling / thinking
  {
    id: 'notes',
    label: 'Apple Notes',
    category: 'notes',
    role: 'redirect',
    iosScheme: 'mobilenotes://',
    iosBundleId: 'com.apple.mobilenotes',
    webUrl: 'https://www.icloud.com/notes',
  },
  {
    id: 'bear',
    label: 'Bear',
    category: 'notes',
    role: 'redirect',
    iosScheme: 'bear://',
    iosBundleId: 'net.shinyfrog.bear',
    webUrl: 'https://bear.app',
  },
  {
    id: 'obsidian',
    label: 'Obsidian',
    category: 'notes',
    role: 'redirect',
    iosScheme: 'obsidian://',
    iosBundleId: 'md.obsidian',
    androidPackage: 'md.obsidian',
    webUrl: 'https://obsidian.md',
  },
  {
    id: 'dayone',
    label: 'Day One',
    category: 'notes',
    role: 'redirect',
    iosScheme: 'dayone://',
    iosBundleId: 'com.bloombuilt.dayone',
    androidPackage: 'com.dayoneapp.dayone',
    webUrl: 'https://dayoneapp.com',
  },
  // Fitness / outdoors
  {
    id: 'strava',
    label: 'Strava',
    category: 'fitness',
    role: 'redirect',
    iosScheme: 'strava://',
    iosBundleId: 'com.strava.stravaride',
    androidPackage: 'com.strava',
    webUrl: 'https://strava.com',
    blurb: 'Log a walk or run',
  },
  {
    id: 'nike-run',
    label: 'Nike Run Club',
    category: 'fitness',
    role: 'redirect',
    iosBundleId: 'com.nike.nikeplus-gps',
    androidPackage: 'com.nike.plusgps',
    webUrl: 'https://nike.com/nrc-app',
  },
  {
    id: 'allTrails',
    label: 'AllTrails',
    category: 'nature',
    role: 'redirect',
    iosScheme: 'alltrails://',
    iosBundleId: 'com.alltrails.alltrails',
    androidPackage: 'com.alltrails.alltrails',
    webUrl: 'https://alltrails.com',
  },
  // Learning
  {
    id: 'khan',
    label: 'Khan Academy',
    category: 'learning',
    role: 'redirect',
    iosBundleId: 'org.khanacademy.Khan-Academy',
    androidPackage: 'org.khanacademy.android',
    webUrl: 'https://khanacademy.org',
  },
  {
    id: 'brilliant',
    label: 'Brilliant',
    category: 'learning',
    role: 'redirect',
    iosBundleId: 'org.brilliant.Brilliant',
    androidPackage: 'org.brilliant.android',
    webUrl: 'https://brilliant.org',
  },
  // Creative
  {
    id: 'procreate',
    label: 'Procreate',
    category: 'creative',
    role: 'redirect',
    iosBundleId: 'com.savage.procreate',
    webUrl: 'https://procreate.com',
  },
  {
    id: 'garageband',
    label: 'GarageBand',
    category: 'creative',
    role: 'redirect',
    iosScheme: 'garageband://',
    iosBundleId: 'com.apple.mobilegarageband',
    webUrl: 'https://apple.com/ios/garageband',
  },
  // Productivity
  {
    id: 'todoist',
    label: 'Todoist',
    category: 'productivity',
    role: 'redirect',
    iosScheme: 'todoist://',
    iosBundleId: 'com.todoist.Todoist',
    androidPackage: 'com.todoist',
    webUrl: 'https://todoist.com',
  },
  {
    id: 'things',
    label: 'Things 3',
    category: 'productivity',
    role: 'redirect',
    iosScheme: 'things://',
    iosBundleId: 'com.culturedcode.ThingsiPhone',
    webUrl: 'https://culturedcode.com/things',
  },
];

export const APP_CATALOG: AppCatalogEntry[] = [...PROBLEM_APPS, ...REDIRECT_APPS];

/** All unique iOS schemes (without the "://"). Used to generate Info.plist LSApplicationQueriesSchemes. */
export const IOS_QUERY_SCHEMES: string[] = Array.from(
  new Set(
    APP_CATALOG.map((a) => a.iosScheme)
      .filter((s): s is string => !!s)
      .map((s) => s.replace(/:\/\/$/, '').replace(/:$/, ''))
  )
).sort();

export function getAppById(id: string): AppCatalogEntry | undefined {
  return APP_CATALOG.find((a) => a.id === id);
}

export function getAppsByRole(role: 'problem' | 'redirect'): AppCatalogEntry[] {
  return APP_CATALOG.filter((a) => a.role === role || a.role === 'both');
}

export function getAppsByCategory(category: AppCategory): AppCatalogEntry[] {
  return APP_CATALOG.filter((a) => a.category === category);
}
