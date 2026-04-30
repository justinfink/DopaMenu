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
  /** iOS App Store numeric id — used to deep-link App Store install when missing */
  iosAppStoreId?: string;
  /** Android Play Store package param — defaults to androidPackage */
  androidPlayStoreId?: string;
  /** Set true for the apps we preselect by default in onboarding */
  popular?: boolean;
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
    iosAppStoreId: '389801252',
    popular: true,
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
    iosAppStoreId: '835599320',
    popular: true,
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
    iosAppStoreId: '333903271',
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
    iosAppStoreId: '284882215',
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
    iosAppStoreId: '1064216828',
    popular: true,
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
    iosAppStoreId: '447188370',
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
    iosAppStoreId: '544007664',
    popular: true,
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
    iosAppStoreId: '363590051',
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
    iosAppStoreId: '6446901002',
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
    iosAppStoreId: '429047995',
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
    iosAppStoreId: '547702041',
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
    iosAppStoreId: '930441707',
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
    iosAppStoreId: '942215162',
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
    iosAppStoreId: '460177396',
  },
  {
    id: 'amazon',
    label: 'Amazon',
    category: 'shopping',
    role: 'problem',
    iosBundleId: 'com.amazon.Amazon',
    androidPackage: 'com.amazon.mShop.android.shopping',
    webUrl: 'https://amazon.com',
    iosAppStoreId: '297606951',
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
    iosAppStoreId: '282614216',
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
    iosAppStoreId: '288429040',
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
    iosAppStoreId: '985746746',
  },
  // ── Newsfeed traps (still lookup-worthy, but feed scroll is the trap) ───
  // Categorized as 'problem' because the surface area people get sucked into
  // is the home/feed, not actual article reading. Flag both so users who
  // genuinely use the app to read can also pick them as redirects.
  {
    id: 'substack',
    label: 'Substack',
    category: 'news',
    role: 'both',
    iosBundleId: 'com.substackpub.substack',
    androidPackage: 'com.substack.app',
    webUrl: 'https://substack.com',
    iosAppStoreId: '1561529452',
  },
  {
    id: 'nyt',
    label: 'New York Times',
    category: 'news',
    role: 'both',
    iosBundleId: 'com.nytimes.NYTimes',
    androidPackage: 'com.nytimes.android',
    webUrl: 'https://nytimes.com',
    iosAppStoreId: '284862083',
  },
  {
    id: 'wsj',
    label: 'Wall Street Journal',
    category: 'news',
    role: 'both',
    iosBundleId: 'wsj.reader_sp',
    androidPackage: 'wsj.reader_sp',
    webUrl: 'https://wsj.com',
    iosAppStoreId: '364387007',
  },
  {
    id: 'apple-news',
    label: 'Apple News',
    category: 'news',
    role: 'problem',
    iosScheme: 'applenews://',
    iosBundleId: 'com.apple.news',
    webUrl: 'https://apple.com/apple-news',
  },
  {
    id: 'flipboard',
    label: 'Flipboard',
    category: 'news',
    role: 'problem',
    iosScheme: 'flipboard://',
    iosBundleId: 'com.flipboard.fboard',
    androidPackage: 'flipboard.app',
    webUrl: 'https://flipboard.com',
  },
  {
    id: 'google-news',
    label: 'Google News',
    category: 'news',
    role: 'problem',
    iosBundleId: 'com.google.GoogleNews',
    androidPackage: 'com.google.android.apps.magazines',
    webUrl: 'https://news.google.com',
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
    iosAppStoreId: '329218549',
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
    iosAppStoreId: '302584613',
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
    iosAppStoreId: '1076402606',
    blurb: 'Library audiobooks + ebooks, free',
    popular: true,
  },
  {
    id: 'apple-books',
    label: 'Apple Books',
    category: 'reading',
    role: 'redirect',
    iosScheme: 'ibooks://',
    iosBundleId: 'com.apple.iBooks',
    webUrl: 'https://apple.com/apple-books',
    blurb: 'Continue reading',
    popular: true,
  },
  {
    id: 'google-play-books',
    label: 'Google Play Books',
    category: 'reading',
    role: 'redirect',
    iosBundleId: 'com.google.ebooks',
    androidPackage: 'com.google.android.apps.books',
    webUrl: 'https://play.google.com/store/books',
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
    iosAppStoreId: '493145008',
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
    iosAppStoreId: '570060128',
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
    iosAppStoreId: '379693831',
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
    iosAppStoreId: '324684580',
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
    iosAppStoreId: '426826309',
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
  // ── Broader audio / podcast coverage ─────────────────────────────────
  // Original catalog leaned iOS (Apple Podcasts, Overcast). These add
  // Android-first podcast clients so the redirect picker isn't a dead end
  // for the largest cohort of testers.
  {
    id: 'castbox',
    label: 'Castbox',
    category: 'audio',
    role: 'redirect',
    iosBundleId: 'fm.castbox.audiobook.radio.podcast',
    androidPackage: 'fm.castbox.audiobook.radio.podcast',
    webUrl: 'https://castbox.fm',
    blurb: 'Open your podcast queue',
    popular: true,
  },
  {
    id: 'podcast-addict',
    label: 'Podcast Addict',
    category: 'audio',
    role: 'redirect',
    androidPackage: 'com.bambuna.podcastaddict',
    webUrl: 'https://podcastaddict.com',
  },
  {
    id: 'player-fm',
    label: 'Player FM',
    category: 'audio',
    role: 'redirect',
    androidPackage: 'fm.player',
    webUrl: 'https://player.fm',
  },
  {
    id: 'podbean',
    label: 'Podbean',
    category: 'audio',
    role: 'redirect',
    iosBundleId: 'com.PodbeanCorp.Podbean',
    androidPackage: 'com.podbean.app.podcast',
    webUrl: 'https://podbean.com',
  },
  {
    id: 'npr-one',
    label: 'NPR One',
    category: 'audio',
    role: 'redirect',
    iosBundleId: 'org.npr.nprone',
    androidPackage: 'org.npr.one',
    webUrl: 'https://nprone.org',
  },
  {
    id: 'storytel',
    label: 'Storytel',
    category: 'audio',
    role: 'redirect',
    iosBundleId: 'se.storytel.app',
    androidPackage: 'grit.storytel.app',
    webUrl: 'https://storytel.com',
    blurb: 'Audiobooks + stories',
  },
  // ── Broader meditation ───────────────────────────────────────────────
  {
    id: 'smiling-mind',
    label: 'Smiling Mind',
    category: 'meditation',
    role: 'redirect',
    iosBundleId: 'org.smilingmind.app',
    androidPackage: 'com.smilingmind.app',
    webUrl: 'https://smilingmind.com.au',
    blurb: 'Free guided meditation',
  },
  {
    id: 'balance',
    label: 'Balance',
    category: 'meditation',
    role: 'redirect',
    iosBundleId: 'com.elevatelabs.geonosis',
    androidPackage: 'com.elevatelabs.geonosis',
    webUrl: 'https://balanceapp.com',
  },
  {
    id: 'ten-percent',
    label: 'Ten Percent Happier',
    category: 'meditation',
    role: 'redirect',
    iosBundleId: 'com.changecollective.tenpercenthappier',
    androidPackage: 'com.changecollective.tenpercenthappier',
    webUrl: 'https://tenpercent.com',
  },
  // ── Reading ──────────────────────────────────────────────────────────
  {
    id: 'goodreads',
    label: 'Goodreads',
    category: 'reading',
    role: 'redirect',
    iosBundleId: 'com.goodreads.iphone',
    androidPackage: 'com.goodreads',
    webUrl: 'https://goodreads.com',
  },
  {
    id: 'pocket',
    label: 'Pocket',
    category: 'reading',
    role: 'redirect',
    iosBundleId: 'com.ideashower.ReadItLaterPro3',
    androidPackage: 'com.ideashower.readitlater.pro',
    webUrl: 'https://getpocket.com',
    blurb: 'Read what you saved',
  },
  {
    id: 'blinkist',
    label: 'Blinkist',
    category: 'reading',
    role: 'redirect',
    iosBundleId: 'com.blinkslabs.Blinkist',
    androidPackage: 'com.blinkslabs.blinkist.android',
    webUrl: 'https://blinkist.com',
    blurb: 'A book in 15 minutes',
  },
  // ── Learning ─────────────────────────────────────────────────────────
  {
    id: 'ted',
    label: 'TED',
    category: 'learning',
    role: 'redirect',
    iosBundleId: 'com.ted.TED',
    androidPackage: 'com.ted.android',
    webUrl: 'https://ted.com',
    blurb: 'Watch one talk',
  },
  {
    id: 'memrise',
    label: 'Memrise',
    category: 'language',
    role: 'redirect',
    iosBundleId: 'com.memrise.MemriseMobile',
    androidPackage: 'com.memrise.android.memrisecompanion',
    webUrl: 'https://memrise.com',
  },
  {
    id: 'coursera',
    label: 'Coursera',
    category: 'learning',
    role: 'redirect',
    iosBundleId: 'org.coursera.ondemand',
    androidPackage: 'org.coursera.android',
    webUrl: 'https://coursera.org',
  },
  {
    id: 'masterclass',
    label: 'MasterClass',
    category: 'learning',
    role: 'redirect',
    iosBundleId: 'com.MasterClass.app',
    androidPackage: 'com.masterclass.android',
    webUrl: 'https://masterclass.com',
  },
  // ── Fitness ──────────────────────────────────────────────────────────
  {
    id: 'strong',
    label: 'Strong',
    category: 'fitness',
    role: 'redirect',
    iosBundleId: 'io.strongapp.strong',
    androidPackage: 'io.strongapp.strong',
    webUrl: 'https://strong.app',
    blurb: 'Log a quick workout',
  },
  {
    id: 'nike-training',
    label: 'Nike Training Club',
    category: 'fitness',
    role: 'redirect',
    iosBundleId: 'com.nike.NTC',
    androidPackage: 'com.nike.ntc',
    webUrl: 'https://nike.com/ntc-app',
  },
  {
    id: 'down-dog',
    label: 'Down Dog',
    category: 'fitness',
    role: 'redirect',
    iosBundleId: 'com.yogabuddhi.downdog',
    androidPackage: 'com.downdoghq.downdog',
    webUrl: 'https://downdogapp.com',
    blurb: 'Yoga, your length',
  },
  {
    id: 'peloton',
    label: 'Peloton',
    category: 'fitness',
    role: 'redirect',
    iosBundleId: 'com.onepeloton.peloton',
    androidPackage: 'com.onepeloton.callisto',
    webUrl: 'https://onepeloton.com',
  },
  // ── Nature / outdoors ────────────────────────────────────────────────
  {
    id: 'merlin',
    label: 'Merlin Bird ID',
    category: 'nature',
    role: 'redirect',
    iosBundleId: 'edu.cornell.merlin',
    androidPackage: 'com.labs.merlinbirdid.app',
    webUrl: 'https://merlin.allaboutbirds.org',
    blurb: 'What bird is that?',
  },
  {
    id: 'seek',
    label: 'Seek by iNaturalist',
    category: 'nature',
    role: 'redirect',
    iosBundleId: 'org.inaturalist.seekreact',
    androidPackage: 'org.inaturalist.seek',
    webUrl: 'https://inaturalist.org/pages/seek_app',
    blurb: 'ID a plant or critter',
  },
  // ── Creative / journaling ────────────────────────────────────────────
  {
    id: 'notion',
    label: 'Notion',
    category: 'productivity',
    role: 'redirect',
    iosBundleId: 'notion.id',
    androidPackage: 'notion.id',
    webUrl: 'https://notion.so',
  },
  // ── Productivity / focus ─────────────────────────────────────────────
  {
    id: 'forest',
    label: 'Forest',
    category: 'productivity',
    role: 'redirect',
    iosBundleId: 'cc.forestapp',
    androidPackage: 'cc.forestapp',
    webUrl: 'https://forestapp.cc',
    blurb: 'Plant a focus tree',
  },
  {
    id: 'opal',
    label: 'Opal',
    category: 'productivity',
    role: 'redirect',
    iosBundleId: 'com.opal.opal',
    androidPackage: 'com.opal.app',
    webUrl: 'https://opal.so',
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

/**
 * Apps we suggest by default in onboarding's problem-app selection. The list
 * is intentionally short — Insta, TikTok, YouTube, Reddit — because these are
 * the four most-tracked apps across our cohort. Filtered down at runtime to
 * only the ones actually installed on the user's device.
 */
export function getPopularProblemApps(): AppCatalogEntry[] {
  return APP_CATALOG.filter((a) => a.popular && (a.role === 'problem' || a.role === 'both'));
}

/**
 * Build a store URL we can hand to Linking.openURL. iOS uses itms-apps://
 * which jumps straight into the App Store app; Android uses the Play Store
 * market:// scheme with a web fallback.
 */
export function getStoreUrl(entry: AppCatalogEntry, platform: 'ios' | 'android'): string | undefined {
  if (platform === 'ios' && entry.iosAppStoreId) {
    return `https://apps.apple.com/app/id${entry.iosAppStoreId}`;
  }
  if (platform === 'android' && (entry.androidPlayStoreId || entry.androidPackage)) {
    const id = entry.androidPlayStoreId ?? entry.androidPackage!;
    return `https://play.google.com/store/apps/details?id=${id}`;
  }
  return undefined;
}
