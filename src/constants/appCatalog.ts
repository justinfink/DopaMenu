import { CatalogApp } from '../models';

// ============================================
// Curated App Catalog
// ~200 popular apps with default categories,
// identity alignments, and timewaster flags.
// Used on both platforms (Android matches against
// installed; iOS presents as browsable list).
// ============================================

export const APP_CATALOG: CatalogApp[] = [
  // ── Social Media ──────────────────────────────
  { name: 'Instagram', packageName: 'com.instagram.android', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'logo-instagram', isCommonTimewaster: true },
  { name: 'Facebook', packageName: 'com.facebook.katana', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'logo-facebook', isCommonTimewaster: true },
  { name: 'TikTok', packageName: 'com.zhiliaoapp.musically', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'logo-tiktok', isCommonTimewaster: true },
  { name: 'Twitter / X', packageName: 'com.twitter.android', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'logo-twitter', isCommonTimewaster: true },
  { name: 'Snapchat', packageName: 'com.snapchat.android', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Connected'], icon: 'camera', isCommonTimewaster: true },
  { name: 'Reddit', packageName: 'com.reddit.frontpage', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'logo-reddit', isCommonTimewaster: true },
  { name: 'Threads', packageName: 'com.instagram.barcelona', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'chatbubbles', isCommonTimewaster: true },
  { name: 'BeReal', packageName: 'com.bereal.ft', category: 'social_media', defaultDesignation: 'neutral', suggestedIdentityTags: ['Connected'], icon: 'happy', isCommonTimewaster: false },
  { name: 'Pinterest', packageName: 'com.pinterest', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Creative'], icon: 'logo-pinterest', isCommonTimewaster: true },
  { name: 'LinkedIn', packageName: 'com.linkedin.android', category: 'social_media', defaultDesignation: 'neutral', suggestedIdentityTags: ['Builder'], icon: 'logo-linkedin', isCommonTimewaster: false },
  { name: 'Tumblr', packageName: 'com.tumblr', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Creative'], icon: 'logo-tumblr', isCommonTimewaster: true },
  { name: 'Bluesky', packageName: 'xyz.blueskyweb.app', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'cloud', isCommonTimewaster: true },
  { name: 'Mastodon', packageName: 'org.joinmastodon.android', category: 'social_media', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'globe', isCommonTimewaster: false },

  // ── Entertainment ─────────────────────────────
  { name: 'YouTube', packageName: 'com.google.android.youtube', category: 'entertainment', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Learner'], icon: 'logo-youtube', isCommonTimewaster: true },
  { name: 'Netflix', packageName: 'com.netflix.mediaclient', category: 'entertainment', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Restful'], icon: 'film', isCommonTimewaster: true },
  { name: 'Twitch', packageName: 'tv.twitch.android.app', category: 'entertainment', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'logo-twitch', isCommonTimewaster: true },
  { name: 'Disney+', packageName: 'com.disney.disneyplus', category: 'entertainment', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Restful'], icon: 'film', isCommonTimewaster: true },
  { name: 'HBO Max', packageName: 'com.hbo.hbonow', category: 'entertainment', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Restful'], icon: 'film', isCommonTimewaster: true },
  { name: 'Hulu', packageName: 'com.hulu.plus', category: 'entertainment', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Restful'], icon: 'film', isCommonTimewaster: true },
  { name: 'Amazon Prime Video', packageName: 'com.amazon.avod.thirdpartyclient', category: 'entertainment', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Restful'], icon: 'film', isCommonTimewaster: true },
  { name: 'Peacock', packageName: 'com.peacocktv.peacockandroid', category: 'entertainment', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Restful'], icon: 'film', isCommonTimewaster: false },
  { name: 'Paramount+', packageName: 'com.cbs.app', category: 'entertainment', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Restful'], icon: 'film', isCommonTimewaster: false },
  { name: 'Crunchyroll', packageName: 'com.crunchyroll.crunchyroid', category: 'entertainment', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'film', isCommonTimewaster: false },
  { name: 'Plex', packageName: 'com.plexapp.android', category: 'entertainment', defaultDesignation: 'neutral', suggestedIdentityTags: ['Restful'], icon: 'film', isCommonTimewaster: false },
  { name: 'Roku', packageName: 'com.roku.remote', category: 'entertainment', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'tv', isCommonTimewaster: false },
  { name: 'Apple TV', packageName: 'com.apple.atve.androidtv.appletv', category: 'entertainment', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Restful'], icon: 'logo-apple', isCommonTimewaster: false },

  // ── Music & Audio ─────────────────────────────
  { name: 'Spotify', packageName: 'com.spotify.music', category: 'music', defaultDesignation: 'aligned', suggestedIdentityTags: ['Creative', 'Restful'], icon: 'musical-notes', isCommonTimewaster: false },
  { name: 'Apple Music', packageName: 'com.apple.android.music', category: 'music', defaultDesignation: 'aligned', suggestedIdentityTags: ['Creative', 'Restful'], icon: 'musical-notes', isCommonTimewaster: false },
  { name: 'YouTube Music', packageName: 'com.google.android.apps.youtube.music', category: 'music', defaultDesignation: 'neutral', suggestedIdentityTags: ['Creative'], icon: 'musical-notes', isCommonTimewaster: false },
  { name: 'SoundCloud', packageName: 'com.soundcloud.android', category: 'music', defaultDesignation: 'neutral', suggestedIdentityTags: ['Creative'], icon: 'musical-notes', isCommonTimewaster: false },
  { name: 'Pandora', packageName: 'com.pandora.android', category: 'music', defaultDesignation: 'aligned', suggestedIdentityTags: ['Restful'], icon: 'musical-notes', isCommonTimewaster: false },
  { name: 'Amazon Music', packageName: 'com.amazon.mp3', category: 'music', defaultDesignation: 'aligned', suggestedIdentityTags: ['Restful'], icon: 'musical-notes', isCommonTimewaster: false },
  { name: 'Tidal', packageName: 'com.aspiro.tidal', category: 'music', defaultDesignation: 'aligned', suggestedIdentityTags: ['Creative'], icon: 'musical-notes', isCommonTimewaster: false },

  // ── Communication ─────────────────────────────
  { name: 'WhatsApp', packageName: 'com.whatsapp', category: 'communication', defaultDesignation: 'neutral', suggestedIdentityTags: ['Connected'], icon: 'logo-whatsapp', isCommonTimewaster: false },
  { name: 'Telegram', packageName: 'org.telegram.messenger', category: 'communication', defaultDesignation: 'neutral', suggestedIdentityTags: ['Connected'], icon: 'paper-plane', isCommonTimewaster: false },
  { name: 'Signal', packageName: 'org.thoughtcrime.securesms', category: 'communication', defaultDesignation: 'aligned', suggestedIdentityTags: ['Connected'], icon: 'chatbubble', isCommonTimewaster: false },
  { name: 'Discord', packageName: 'com.discord', category: 'communication', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Connected'], icon: 'logo-discord', isCommonTimewaster: true },
  { name: 'Slack', packageName: 'com.Slack', category: 'communication', defaultDesignation: 'neutral', suggestedIdentityTags: ['Builder'], icon: 'chatbubbles', isCommonTimewaster: false },
  { name: 'Microsoft Teams', packageName: 'com.microsoft.teams', category: 'communication', defaultDesignation: 'neutral', suggestedIdentityTags: ['Builder'], icon: 'people', isCommonTimewaster: false },
  { name: 'Zoom', packageName: 'us.zoom.videomeetings', category: 'communication', defaultDesignation: 'neutral', suggestedIdentityTags: ['Connected', 'Builder'], icon: 'videocam', isCommonTimewaster: false },
  { name: 'Google Meet', packageName: 'com.google.android.apps.meetings', category: 'communication', defaultDesignation: 'neutral', suggestedIdentityTags: ['Connected'], icon: 'videocam', isCommonTimewaster: false },
  { name: 'FaceTime', packageName: 'com.apple.facetime', category: 'communication', defaultDesignation: 'aligned', suggestedIdentityTags: ['Connected'], icon: 'videocam', isCommonTimewaster: false },
  { name: 'Messenger', packageName: 'com.facebook.orca', category: 'communication', defaultDesignation: 'neutral', suggestedIdentityTags: ['Connected'], icon: 'chatbubble', isCommonTimewaster: false },
  { name: 'Google Chat', packageName: 'com.google.android.apps.dynamite', category: 'communication', defaultDesignation: 'neutral', suggestedIdentityTags: ['Builder'], icon: 'chatbubbles', isCommonTimewaster: false },

  // ── Productivity ──────────────────────────────
  { name: 'Notion', packageName: 'notion.id', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder', 'Learner'], icon: 'document-text', isCommonTimewaster: false },
  { name: 'Todoist', packageName: 'com.todoist', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'checkmark-circle', isCommonTimewaster: false },
  { name: 'Things 3', packageName: 'com.culturedcode.ThingsiPhone', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'checkmark-circle', isCommonTimewaster: false },
  { name: 'Obsidian', packageName: 'md.obsidian', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder', 'Learner'], icon: 'document-text', isCommonTimewaster: false },
  { name: 'Google Drive', packageName: 'com.google.android.apps.docs', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'folder', isCommonTimewaster: false },
  { name: 'Google Docs', packageName: 'com.google.android.apps.docs.editors.docs', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder', 'Creative'], icon: 'document', isCommonTimewaster: false },
  { name: 'Google Sheets', packageName: 'com.google.android.apps.docs.editors.sheets', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'grid', isCommonTimewaster: false },
  { name: 'Microsoft Word', packageName: 'com.microsoft.office.word', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'document', isCommonTimewaster: false },
  { name: 'Microsoft Excel', packageName: 'com.microsoft.office.excel', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'grid', isCommonTimewaster: false },
  { name: 'Evernote', packageName: 'com.evernote', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder', 'Learner'], icon: 'document-text', isCommonTimewaster: false },
  { name: 'Trello', packageName: 'com.trello', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'list', isCommonTimewaster: false },
  { name: 'Asana', packageName: 'com.asana.app', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'checkmark-circle', isCommonTimewaster: false },
  { name: 'Linear', packageName: 'com.linear', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'git-branch', isCommonTimewaster: false },
  { name: 'Figma', packageName: 'com.figma.mirror', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder', 'Creative'], icon: 'color-palette', isCommonTimewaster: false },
  { name: 'Canva', packageName: 'com.canva.editor', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Creative'], icon: 'color-palette', isCommonTimewaster: false },
  { name: 'Airtable', packageName: 'com.formagrid.airtable', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'grid', isCommonTimewaster: false },
  { name: '1Password', packageName: 'com.onepassword.android', category: 'utilities', defaultDesignation: 'aligned', suggestedIdentityTags: [], icon: 'key', isCommonTimewaster: false },

  // ── Education & Learning ──────────────────────
  { name: 'Duolingo', packageName: 'com.duolingo', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'language', isCommonTimewaster: false },
  { name: 'Coursera', packageName: 'org.coursera.android', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'school', isCommonTimewaster: false },
  { name: 'Udemy', packageName: 'com.udemy.android', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'school', isCommonTimewaster: false },
  { name: 'Khan Academy', packageName: 'org.khanacademy.android', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'school', isCommonTimewaster: false },
  { name: 'Kindle', packageName: 'com.amazon.kindle', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner', 'Restful'], icon: 'book', isCommonTimewaster: false },
  { name: 'Audible', packageName: 'com.audible.application', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'headset', isCommonTimewaster: false },
  { name: 'Blinkist', packageName: 'com.blinkslabs.blinkist.android', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'book', isCommonTimewaster: false },
  { name: 'Anki', packageName: 'com.ichi2.anki', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'flash', isCommonTimewaster: false },
  { name: 'Brilliant', packageName: 'org.brilliant.android', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'bulb', isCommonTimewaster: false },
  { name: 'Pocket', packageName: 'com.ideashower.readitlater.pro', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'bookmark', isCommonTimewaster: false },
  { name: 'Libby', packageName: 'com.overdrive.mobile.android.libby', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner', 'Restful'], icon: 'library', isCommonTimewaster: false },
  { name: 'Skillshare', packageName: 'com.skillshare.Skillshare', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner', 'Creative'], icon: 'school', isCommonTimewaster: false },
  { name: 'Medium', packageName: 'com.medium.reader', category: 'education', defaultDesignation: 'neutral', suggestedIdentityTags: ['Learner'], icon: 'book', isCommonTimewaster: false },
  { name: 'Substack', packageName: 'com.substack.app', category: 'education', defaultDesignation: 'neutral', suggestedIdentityTags: ['Learner'], icon: 'newspaper', isCommonTimewaster: false },

  // ── Fitness & Health ──────────────────────────
  { name: 'Strava', packageName: 'com.strava', category: 'fitness', defaultDesignation: 'aligned', suggestedIdentityTags: ['Active'], icon: 'bicycle', isCommonTimewaster: false },
  { name: 'Nike Run Club', packageName: 'com.nike.plusgps', category: 'fitness', defaultDesignation: 'aligned', suggestedIdentityTags: ['Active'], icon: 'walk', isCommonTimewaster: false },
  { name: 'Nike Training Club', packageName: 'com.nike.ntc', category: 'fitness', defaultDesignation: 'aligned', suggestedIdentityTags: ['Active'], icon: 'fitness', isCommonTimewaster: false },
  { name: 'MyFitnessPal', packageName: 'com.myfitnesspal.android', category: 'fitness', defaultDesignation: 'aligned', suggestedIdentityTags: ['Active', 'Mindful'], icon: 'nutrition', isCommonTimewaster: false },
  { name: 'Peloton', packageName: 'com.onepeloton.callisto', category: 'fitness', defaultDesignation: 'aligned', suggestedIdentityTags: ['Active'], icon: 'bicycle', isCommonTimewaster: false },
  { name: 'Fitbit', packageName: 'com.fitbit.FitbitMobile', category: 'fitness', defaultDesignation: 'aligned', suggestedIdentityTags: ['Active'], icon: 'watch', isCommonTimewaster: false },
  { name: 'Apple Health', packageName: 'com.apple.Health', category: 'health', defaultDesignation: 'aligned', suggestedIdentityTags: ['Active', 'Mindful'], icon: 'heart', isCommonTimewaster: false },
  { name: 'Samsung Health', packageName: 'com.sec.android.app.shealth', category: 'health', defaultDesignation: 'aligned', suggestedIdentityTags: ['Active'], icon: 'heart', isCommonTimewaster: false },
  { name: 'AllTrails', packageName: 'com.alltrails.alltrails', category: 'fitness', defaultDesignation: 'aligned', suggestedIdentityTags: ['Active'], icon: 'trail-sign', isCommonTimewaster: false },
  { name: 'Strong', packageName: 'io.strongapp.strong', category: 'fitness', defaultDesignation: 'aligned', suggestedIdentityTags: ['Active'], icon: 'barbell', isCommonTimewaster: false },
  { name: 'Garmin Connect', packageName: 'com.garmin.android.apps.connectmobile', category: 'fitness', defaultDesignation: 'aligned', suggestedIdentityTags: ['Active'], icon: 'watch', isCommonTimewaster: false },
  { name: 'WHOOP', packageName: 'com.whoop.android', category: 'fitness', defaultDesignation: 'aligned', suggestedIdentityTags: ['Active', 'Mindful'], icon: 'pulse', isCommonTimewaster: false },
  { name: 'Oura', packageName: 'com.ouraring.oura', category: 'health', defaultDesignation: 'aligned', suggestedIdentityTags: ['Mindful', 'Restful'], icon: 'pulse', isCommonTimewaster: false },

  // ── Mindfulness & Mental Health ────────────────
  { name: 'Headspace', packageName: 'com.getsomeheadspace.android', category: 'health', defaultDesignation: 'aligned', suggestedIdentityTags: ['Mindful', 'Restful'], icon: 'leaf', isCommonTimewaster: false },
  { name: 'Calm', packageName: 'com.calm.android', category: 'health', defaultDesignation: 'aligned', suggestedIdentityTags: ['Mindful', 'Restful'], icon: 'leaf', isCommonTimewaster: false },
  { name: 'Waking Up', packageName: 'org.wakingup.android', category: 'health', defaultDesignation: 'aligned', suggestedIdentityTags: ['Mindful'], icon: 'leaf', isCommonTimewaster: false },
  { name: 'Insight Timer', packageName: 'com.spotlightsix.zentimerlite2', category: 'health', defaultDesignation: 'aligned', suggestedIdentityTags: ['Mindful'], icon: 'timer', isCommonTimewaster: false },
  { name: 'Finch', packageName: 'com.finch.finch', category: 'health', defaultDesignation: 'aligned', suggestedIdentityTags: ['Mindful'], icon: 'happy', isCommonTimewaster: false },
  { name: 'Daylio', packageName: 'net.daylio', category: 'health', defaultDesignation: 'aligned', suggestedIdentityTags: ['Mindful'], icon: 'journal', isCommonTimewaster: false },
  { name: 'BetterHelp', packageName: 'com.betterhelp', category: 'health', defaultDesignation: 'aligned', suggestedIdentityTags: ['Mindful'], icon: 'heart', isCommonTimewaster: false },
  { name: 'Woebot', packageName: 'com.woebot', category: 'health', defaultDesignation: 'aligned', suggestedIdentityTags: ['Mindful'], icon: 'chatbubble-ellipses', isCommonTimewaster: false },

  // ── News ──────────────────────────────────────
  { name: 'Apple News', packageName: 'com.apple.news', category: 'news', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'newspaper', isCommonTimewaster: true },
  { name: 'Google News', packageName: 'com.google.android.apps.magazines', category: 'news', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'newspaper', isCommonTimewaster: true },
  { name: 'Flipboard', packageName: 'flipboard.app', category: 'news', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'newspaper', isCommonTimewaster: true },
  { name: 'CNN', packageName: 'com.cnn.mobile.android.phone', category: 'news', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'newspaper', isCommonTimewaster: true },
  { name: 'BBC News', packageName: 'bbc.mobile.news.ww', category: 'news', defaultDesignation: 'neutral', suggestedIdentityTags: ['Learner'], icon: 'newspaper', isCommonTimewaster: false },
  { name: 'NYT News', packageName: 'com.nytimes.android', category: 'news', defaultDesignation: 'neutral', suggestedIdentityTags: ['Learner'], icon: 'newspaper', isCommonTimewaster: false },
  { name: 'The Guardian', packageName: 'com.guardian', category: 'news', defaultDesignation: 'neutral', suggestedIdentityTags: ['Learner'], icon: 'newspaper', isCommonTimewaster: false },
  { name: 'Reuters', packageName: 'com.thomsonreuters.reuters', category: 'news', defaultDesignation: 'neutral', suggestedIdentityTags: ['Learner'], icon: 'newspaper', isCommonTimewaster: false },
  { name: 'AP News', packageName: 'mnn.Android', category: 'news', defaultDesignation: 'neutral', suggestedIdentityTags: ['Learner'], icon: 'newspaper', isCommonTimewaster: false },

  // ── Games ─────────────────────────────────────
  { name: 'Candy Crush Saga', packageName: 'com.king.candycrushsaga', category: 'games', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'game-controller', isCommonTimewaster: true },
  { name: 'Wordle', packageName: 'com.nytimes.crossword', category: 'games', defaultDesignation: 'neutral', suggestedIdentityTags: ['Learner'], icon: 'grid', isCommonTimewaster: false },
  { name: 'Chess.com', packageName: 'com.chess', category: 'games', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'trophy', isCommonTimewaster: false },
  { name: 'Clash of Clans', packageName: 'com.supercell.clashofclans', category: 'games', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'game-controller', isCommonTimewaster: true },
  { name: 'Among Us', packageName: 'com.innersloth.spacemafia', category: 'games', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Connected'], icon: 'game-controller', isCommonTimewaster: true },
  { name: 'Roblox', packageName: 'com.roblox.client', category: 'games', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'game-controller', isCommonTimewaster: true },
  { name: 'Genshin Impact', packageName: 'com.miHoYo.GenshinImpact', category: 'games', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'game-controller', isCommonTimewaster: true },
  { name: 'Subway Surfers', packageName: 'com.kiloo.subwaysurf', category: 'games', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'game-controller', isCommonTimewaster: true },
  { name: 'Call of Duty Mobile', packageName: 'com.activision.callofduty.shooter', category: 'games', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'game-controller', isCommonTimewaster: true },
  { name: 'Pokémon GO', packageName: 'com.nianticlabs.pokemongo', category: 'games', defaultDesignation: 'neutral', suggestedIdentityTags: ['Active'], icon: 'walk', isCommonTimewaster: false },

  // ── Finance ───────────────────────────────────
  { name: 'Robinhood', packageName: 'com.robinhood.android', category: 'finance', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'trending-up', isCommonTimewaster: true },
  { name: 'Coinbase', packageName: 'com.coinbase.android', category: 'finance', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'logo-bitcoin', isCommonTimewaster: true },
  { name: 'Mint', packageName: 'com.mint', category: 'finance', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'wallet', isCommonTimewaster: false },
  { name: 'Venmo', packageName: 'com.venmo', category: 'finance', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'card', isCommonTimewaster: false },
  { name: 'Cash App', packageName: 'com.squareup.cash', category: 'finance', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'card', isCommonTimewaster: false },
  { name: 'PayPal', packageName: 'com.paypal.android.p2pmobile', category: 'finance', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'card', isCommonTimewaster: false },
  { name: 'YNAB', packageName: 'com.youneedabudget.evergreen.app', category: 'finance', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder', 'Mindful'], icon: 'wallet', isCommonTimewaster: false },
  { name: 'Fidelity', packageName: 'com.fidelity.android', category: 'finance', defaultDesignation: 'neutral', suggestedIdentityTags: ['Builder'], icon: 'trending-up', isCommonTimewaster: false },
  { name: 'Schwab', packageName: 'com.schwab.mobile', category: 'finance', defaultDesignation: 'neutral', suggestedIdentityTags: ['Builder'], icon: 'trending-up', isCommonTimewaster: false },

  // ── Photo & Video ─────────────────────────────
  { name: 'VSCO', packageName: 'com.vsco.cam', category: 'photo_video', defaultDesignation: 'aligned', suggestedIdentityTags: ['Creative'], icon: 'camera', isCommonTimewaster: false },
  { name: 'Lightroom', packageName: 'com.adobe.lrmobile', category: 'photo_video', defaultDesignation: 'aligned', suggestedIdentityTags: ['Creative'], icon: 'camera', isCommonTimewaster: false },
  { name: 'Google Photos', packageName: 'com.google.android.apps.photos', category: 'photo_video', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'images', isCommonTimewaster: false },
  { name: 'CapCut', packageName: 'com.lemon.lvoverseas', category: 'photo_video', defaultDesignation: 'neutral', suggestedIdentityTags: ['Creative'], icon: 'videocam', isCommonTimewaster: false },
  { name: 'Snapseed', packageName: 'com.niksoftware.snapseed', category: 'photo_video', defaultDesignation: 'aligned', suggestedIdentityTags: ['Creative'], icon: 'camera', isCommonTimewaster: false },
  { name: 'iMovie', packageName: 'com.apple.iMovie', category: 'photo_video', defaultDesignation: 'aligned', suggestedIdentityTags: ['Creative'], icon: 'videocam', isCommonTimewaster: false },

  // ── Shopping ──────────────────────────────────
  { name: 'Amazon', packageName: 'com.amazon.mShop.android.shopping', category: 'shopping', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'cart', isCommonTimewaster: true },
  { name: 'eBay', packageName: 'com.ebay.mobile', category: 'shopping', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'cart', isCommonTimewaster: true },
  { name: 'Etsy', packageName: 'com.etsy.android', category: 'shopping', defaultDesignation: 'neutral', suggestedIdentityTags: ['Creative'], icon: 'cart', isCommonTimewaster: false },
  { name: 'Walmart', packageName: 'com.walmart.android', category: 'shopping', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'cart', isCommonTimewaster: false },
  { name: 'Target', packageName: 'com.target.ui', category: 'shopping', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'cart', isCommonTimewaster: false },
  { name: 'Wish', packageName: 'com.contextlogic.wish', category: 'shopping', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'cart', isCommonTimewaster: true },
  { name: 'Shein', packageName: 'com.zzkko', category: 'shopping', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'cart', isCommonTimewaster: true },
  { name: 'Temu', packageName: 'com.einnovation.temu', category: 'shopping', defaultDesignation: 'timewaster', suggestedIdentityTags: [], icon: 'cart', isCommonTimewaster: true },

  // ── Food & Delivery ───────────────────────────
  { name: 'DoorDash', packageName: 'com.dd.doordash', category: 'food', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'fast-food', isCommonTimewaster: false },
  { name: 'Uber Eats', packageName: 'com.ubercab.eats', category: 'food', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'fast-food', isCommonTimewaster: false },
  { name: 'Grubhub', packageName: 'com.grubhub.android', category: 'food', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'fast-food', isCommonTimewaster: false },
  { name: 'Instacart', packageName: 'com.instacart.client', category: 'food', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'cart', isCommonTimewaster: false },

  // ── Travel & Navigation ───────────────────────
  { name: 'Google Maps', packageName: 'com.google.android.apps.maps', category: 'travel', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'map', isCommonTimewaster: false },
  { name: 'Apple Maps', packageName: 'com.apple.Maps', category: 'travel', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'map', isCommonTimewaster: false },
  { name: 'Waze', packageName: 'com.waze', category: 'travel', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'car', isCommonTimewaster: false },
  { name: 'Uber', packageName: 'com.ubercab', category: 'travel', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'car', isCommonTimewaster: false },
  { name: 'Lyft', packageName: 'me.lyft.android', category: 'travel', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'car', isCommonTimewaster: false },
  { name: 'Airbnb', packageName: 'com.airbnb.android', category: 'travel', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'home', isCommonTimewaster: false },

  // ── Podcasts ──────────────────────────────────
  { name: 'Apple Podcasts', packageName: 'com.apple.podcasts', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'mic', isCommonTimewaster: false },
  { name: 'Overcast', packageName: 'com.overcast.overcast', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'mic', isCommonTimewaster: false },
  { name: 'Pocket Casts', packageName: 'au.com.shiftyjelly.pocketcasts', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'mic', isCommonTimewaster: false },
  { name: 'Google Podcasts', packageName: 'com.google.android.apps.podcasts', category: 'education', defaultDesignation: 'aligned', suggestedIdentityTags: ['Learner'], icon: 'mic', isCommonTimewaster: false },

  // ── Creative Tools ────────────────────────────
  { name: 'GarageBand', packageName: 'com.apple.garageband', category: 'entertainment', defaultDesignation: 'aligned', suggestedIdentityTags: ['Creative'], icon: 'musical-notes', isCommonTimewaster: false },
  { name: 'Procreate', packageName: 'com.procreate.procreate', category: 'entertainment', defaultDesignation: 'aligned', suggestedIdentityTags: ['Creative'], icon: 'brush', isCommonTimewaster: false },
  { name: 'Clip Studio Paint', packageName: 'jp.co.celsys.clipstudiopaint.phone', category: 'entertainment', defaultDesignation: 'aligned', suggestedIdentityTags: ['Creative'], icon: 'brush', isCommonTimewaster: false },

  // ── Utilities ─────────────────────────────────
  { name: 'Gmail', packageName: 'com.google.android.gm', category: 'communication', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'mail', isCommonTimewaster: false },
  { name: 'Outlook', packageName: 'com.microsoft.office.outlook', category: 'communication', defaultDesignation: 'neutral', suggestedIdentityTags: ['Builder'], icon: 'mail', isCommonTimewaster: false },
  { name: 'Google Calendar', packageName: 'com.google.android.calendar', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'calendar', isCommonTimewaster: false },
  { name: 'Apple Calendar', packageName: 'com.apple.mobilecal', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'calendar', isCommonTimewaster: false },
  { name: 'Notes', packageName: 'com.apple.mobilenotes', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'create', isCommonTimewaster: false },
  { name: 'Google Keep', packageName: 'com.google.android.keep', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder'], icon: 'create', isCommonTimewaster: false },
  { name: 'Files', packageName: 'com.google.android.apps.nbu.files', category: 'utilities', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'folder', isCommonTimewaster: false },
  { name: 'Calculator', packageName: 'com.google.android.calculator', category: 'utilities', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'calculator', isCommonTimewaster: false },
  { name: 'Clock', packageName: 'com.google.android.deskclock', category: 'utilities', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'time', isCommonTimewaster: false },
  { name: 'Weather', packageName: 'com.google.android.apps.weather', category: 'utilities', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'partly-sunny', isCommonTimewaster: false },

  // ── Journaling & Writing ──────────────────────
  { name: 'Day One', packageName: 'com.dayoneapp.dayone', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Mindful', 'Creative'], icon: 'journal', isCommonTimewaster: false },
  { name: 'Bear', packageName: 'net.shinyfrog.bear', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Builder', 'Creative'], icon: 'document-text', isCommonTimewaster: false },
  { name: 'iA Writer', packageName: 'net.ia.iawriter', category: 'productivity', defaultDesignation: 'aligned', suggestedIdentityTags: ['Creative', 'Builder'], icon: 'create', isCommonTimewaster: false },

  // ── Browsers ──────────────────────────────────
  { name: 'Chrome', packageName: 'com.android.chrome', category: 'utilities', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'logo-chrome', isCommonTimewaster: false },
  { name: 'Safari', packageName: 'com.apple.mobilesafari', category: 'utilities', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'compass', isCommonTimewaster: false },
  { name: 'Firefox', packageName: 'org.mozilla.firefox', category: 'utilities', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'logo-firefox', isCommonTimewaster: false },
  { name: 'Brave', packageName: 'com.brave.browser', category: 'utilities', defaultDesignation: 'neutral', suggestedIdentityTags: [], icon: 'shield', isCommonTimewaster: false },

  // ── Dating ────────────────────────────────────
  { name: 'Tinder', packageName: 'com.tinder', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Connected'], icon: 'flame', isCommonTimewaster: true },
  { name: 'Bumble', packageName: 'com.bumble.app', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Connected'], icon: 'heart', isCommonTimewaster: true },
  { name: 'Hinge', packageName: 'co.hinge.app', category: 'social_media', defaultDesignation: 'timewaster', suggestedIdentityTags: ['Connected'], icon: 'heart', isCommonTimewaster: true },
];

// Helper to get apps by category
export function getCatalogAppsByCategory(category: string): CatalogApp[] {
  return APP_CATALOG.filter(app => app.category === category);
}

// Helper to get common timewaster apps
export function getCommonTimewasters(): CatalogApp[] {
  return APP_CATALOG.filter(app => app.isCommonTimewaster);
}

// Helper to search catalog
export function searchCatalog(query: string): CatalogApp[] {
  const lower = query.toLowerCase();
  return APP_CATALOG.filter(app =>
    app.name.toLowerCase().includes(lower) ||
    app.category.toLowerCase().includes(lower)
  );
}

// All unique categories in the catalog
export const CATALOG_CATEGORIES = [
  ...new Set(APP_CATALOG.map(app => app.category)),
].sort();
