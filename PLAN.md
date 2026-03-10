# DopaMenu: Digital Phenotype, App Library & Redirection Implementation Plan

## Overview

Three major features implemented as a comprehensive update:
1. **Passive Digital Phenotype Collection** - Deep behavioral data collection for personalized guidance
2. **In-App Library of Installed Apps** - Full app catalog with identity alignment and priority tagging
3. **Timewaster App Redirection** - Full-screen intervention overlay when timewasting apps are detected

---

## Phase 1: Data Models & Foundation

### 1.1 Extend Core Models (`src/models/index.ts`)

**New Phenotype Models:**
- `PhenotypeSnapshot` - Daily aggregate of all behavioral signals
  - `screenTime`: total minutes, session count, per-hour distribution
  - `unlockPatterns`: count, frequency, time-of-day distribution
  - `sleepInference`: estimated bedtime, wake time, quality score (derived from usage gaps)
  - `activityLevel`: step count, movement minutes, sedentary minutes
  - `typingDynamics`: average speed (chars/min), backspace ratio, pause frequency
  - `touchPatterns`: average scroll velocity, tap frequency, interaction intensity score
  - `socialEngagement`: messaging app session count, communication app time
  - `cognitiveLoad`: calendar density, app-switching frequency, multitasking score
  - `circadianProfile`: first/last device use, peak activity hours, regularity score
  - `notificationBehavior`: response times, ignored count, interaction rate
  - `moodProxy`: composite score derived from typing speed, activity, social engagement, sleep
  - `batteryPatterns`: charge times, low-battery moments, charging routine regularity
  - `ambientContext`: average ambient light readings, orientation change frequency

- `PhenotypeProfile` - Rolling behavioral fingerprint (7-day, 30-day averages)
  - `trends`: directional changes in each dimension (improving, declining, stable)
  - `anomalies`: significant deviations from baseline
  - `patterns`: recurring behavioral signatures (e.g., "afternoon slump", "late-night scroll")
  - `wellbeingScore`: composite 0-100 score from all dimensions

- `PhenotypeSettings` - Per-signal collection toggles
  - Individual on/off for each data category
  - Collection frequency preferences
  - Data retention period

**New App Library Models:**
- `InstalledApp` - Representation of an app on the device
  - `packageName` / `bundleId`: platform identifier
  - `displayName`: human-readable name
  - `icon`: base64 or URI
  - `category`: auto-detected AppCategory
  - `source`: 'auto_detected' | 'user_added' | 'curated_catalog'

- `UserAppConfig` - User's configuration for an app
  - `appId`: reference to InstalledApp
  - `priority`: 'high' | 'medium' | 'low' | 'none'
  - `identityGoals`: string[] (mapped to identity anchor IDs)
  - `designation`: 'aligned' | 'neutral' | 'timewaster'
  - `redirectBehavior`: 'full_overlay' | 'notification' | 'none'
  - `dailyTimeLimit`: optional minutes cap
  - `notes`: optional user annotation

- `AppCatalog` - Pre-built catalog of popular apps with default categories
  - ~200 popular apps across categories (social, entertainment, productivity, fitness, education, etc.)
  - Default category mappings
  - Suggested identity goal alignments

**New Redirection Models:**
- `RedirectEvent` - Record of a redirection attempt
  - `triggeredAt`: timestamp
  - `sourceApp`: package/bundle ID
  - `interventionShown`: InterventionDecision reference
  - `outcome`: 'redirected' | 'continued' | 'dismissed'
  - `timeInSourceApp`: ms spent before/after
  - `situation`: Situation reference

- `RedirectStats` - Aggregate redirection metrics
  - `totalRedirects`: count
  - `successRate`: percentage redirected away
  - `topTimewasters`: ranked list
  - `savedTime`: estimated minutes redirected to aligned activities

### 1.2 New Stores

**`src/stores/phenotypeStore.ts`**
- State: daily snapshots (indexed by date), current profile, settings, collection status
- Actions: recordSnapshot, updateProfile, getInsights, toggleCollection, getTrend
- Persistence: AsyncStorage with date-based keys, automatic pruning (keep 90 days)

**`src/stores/appLibraryStore.ts`**
- State: installed apps list, user configs per app, catalog, filter/sort state
- Actions: syncInstalledApps, updateAppConfig, getTimewasterApps, getAlignedApps, searchApps
- Persistence: AsyncStorage

**`src/stores/redirectStore.ts`**
- State: redirect events, active redirect (if in progress), stats, cooldown
- Actions: recordRedirect, getStats, isInCooldown
- Persistence: AsyncStorage

### 1.3 Extend UserPreferences

Add to existing `UserPreferences` in models:
- `phenotypeCollectionEnabled`: boolean (master toggle)
- `phenotypeSettings`: PhenotypeSettings (per-signal toggles)
- `appLibraryEnabled`: boolean
- `redirectionEnabled`: boolean
- `redirectCooldownMinutes`: number (default 15, prevent spamming)

---

## Phase 2: Services Layer

### 2.1 Phenotype Collector Service (`src/services/phenotypeCollector.ts`)

Central orchestrator that:
- Aggregates raw signals from all sources into PhenotypeSnapshot
- Runs on a periodic timer (every 15 minutes for rolling aggregation)
- Computes daily summaries at midnight
- Updates PhenotypeProfile with rolling averages
- Detects anomalies against baseline
- Computes mood proxy and wellbeing score
- All processing is local, no data leaves device

### 2.2 Sensors Service (`src/services/sensors.ts`)

Wraps Expo sensor APIs:
- **Pedometer** (expo-sensors): step count tracking
- **Accelerometer** (expo-sensors): movement classification (still, walking, active)
- **DeviceMotion** (expo-sensors): orientation changes
- **Battery** (expo-battery): charging state, battery level monitoring
- **Brightness** (expo-brightness): ambient light as context signal
- Platform-aware: gracefully degrades on iOS where needed
- Configurable sampling rates to preserve battery

### 2.3 Touch & Typing Tracker Service (`src/services/interactionTracker.ts`)

- Higher-order component / hook that wraps TextInput to capture:
  - Characters per minute
  - Backspace frequency (ratio to total keystrokes)
  - Typing pause patterns (gap between keystrokes)
  - Session typing patterns
- Touch tracking hook:
  - Scroll velocity (via onScroll events)
  - Tap frequency (via onPress counts)
  - Average interaction intensity per session
- All metrics are aggregated locally, no raw input stored

### 2.4 Sleep Inference Service (`src/services/sleepInference.ts`)

- Monitors device usage gaps (timestamp of last interaction → first interaction)
- Battery charging patterns (overnight charge start/end = sleep proxy)
- Combines with step count (no steps + no screen = likely sleeping)
- Outputs: estimated bedtime, wake time, sleep duration, sleep quality score
- Uses 7-day rolling average for regularity score

### 2.5 Extend App Usage Service (`src/services/appUsage.ts`)

Add:
- `getInstalledApps()` - Query PackageManager (Android) for all installed apps
- `getAppUsageStats(period)` - Detailed per-app usage statistics
- `onAppLaunch(callback)` - Real-time app launch detection for redirection
- `bringToForeground()` - Bring DopaMenu to front when redirect triggered
- Extend the existing native Kotlin module in the plugin

### 2.6 App Catalog Service (`src/services/appCatalog.ts`)

- Static curated catalog of ~200 popular apps with:
  - Package name (Android) and common name
  - Default category
  - Suggested identity alignment
  - Common "timewaster" flag
- Searchable and filterable
- Used on both platforms (Android matches against installed, iOS presents as browsable list)

### 2.7 Permissions Helper Service (`src/services/permissions.ts`)

- Centralized permission management
- `openUsageAccessSettings()` - Already exists, move here
- `openNotificationSettings()`
- `openBatteryOptimizationSettings()`
- `openOverlayPermissionSettings()` - For drawing over other apps
- `checkAllPermissions()` - Status of all needed permissions
- `requestPermissionFlow(type)` - In-app explanation → open exact settings page
- All "modify settings" actions surfaced within the app UI

---

## Phase 3: Extend Native Plugin

### 3.1 Extend `plugins/app-usage/withAppUsage.js`

Add to the generated Kotlin module:
- `getInstalledApps()` → Returns list of {packageName, appName, category, icon} via PackageManager
- `bringAppToForeground()` → Uses Intent to bring DopaMenu to front
- `canDrawOverlays()` / `requestOverlayPermission()` → For overlay redirection
- Enhanced `onForegroundAppChanged` event with more metadata
- Accessibility service option for more reliable app detection (with user consent)

---

## Phase 4: Intervention Engine Enhancement

### 4.1 Phenotype-Aware Interventions (`src/engine/InterventionEngine.ts`)

Extend the ranking algorithm:
- **Phenotype-weighted effort estimation**: Instead of just time-of-day, use actual measured energy (step count, activity, typing speed as cognitive proxy)
- **Mood-aware suggestions**: If mood proxy is low, bias toward low-effort, nurturing interventions
- **Sleep-aware adjustments**: If poor sleep detected, lower effort ceiling for the day
- **Pattern-based timing**: If user always doomscrolls at 3pm, proactively offer intervention at 2:55pm
- **Redirection-specific ranking**: When triggered by timewaster app, rank interventions that specifically replace the itch that app satisfies (e.g., Instagram → social itch → "Text a friend" ranked higher)
- **Identity reinforcement**: When redirecting from timewaster, explicitly surface how the alternative aligns with their stated identity goals

### 4.2 Extend Situation Detection

New situation types:
- `TIMEWASTER_APP_OPENED` - User opened a designated timewaster
- `EXCESSIVE_SCREEN_TIME` - Screen time exceeds user's own baseline by >50%
- `SLEEP_DEFICIT` - Poor sleep detected, adjust all interventions
- `HIGH_COGNITIVE_LOAD` - Calendar density + app switching exceeds baseline
- `SEDENTARY_ALERT` - No movement detected for extended period
- `MOOD_DIP` - Mood proxy dropped significantly from baseline

---

## Phase 5: UI Implementation

### 5.1 App Library Screen (`app/(tabs)/apps.tsx`)

New tab in the tab bar:
- **Search bar** at top for filtering apps
- **Filter chips**: All, Aligned, Timewasters, Priority, Uncategorized
- **App list** with:
  - App icon, name, category badge
  - Priority indicator (star icons)
  - Identity goal tags (colored chips matching identity anchors)
  - Designation badge (aligned=green, timewaster=red, neutral=gray)
  - Tap to configure
- **App detail/config modal**:
  - Set priority level
  - Map to identity goals (multi-select from user's anchors)
  - Designate as aligned/neutral/timewaster
  - Configure redirect behavior
  - Set daily time limit
  - Add personal notes
- **Quick actions**: Bulk "mark as timewaster" selection mode
- **Add app button** (for iOS / apps not auto-detected)
- **On Android**: Auto-populated from installed apps
- **On iOS**: Browse from curated catalog + manual add

### 5.2 Insights Screen (`app/insights.tsx`)

Accessible from Dashboard:
- **Wellbeing Score** - Large circular score (0-100) with trend arrow
- **Sleep Card** - Bedtime/wake time, duration, regularity graph (7-day sparkline)
- **Activity Card** - Steps today vs average, movement minutes
- **Screen Time Card** - Total today vs average, per-app breakdown (top 5)
- **Mood Proxy Card** - Composite indicator with contributing factors
- **Cognitive Load Card** - Calendar density, multitasking score
- **Social Engagement Card** - Communication app usage trends
- **Circadian Rhythm** - 24-hour activity heatmap
- **Redirection Stats Card** - Success rate, time saved, top redirected apps
- **Patterns & Anomalies** - "You tend to scroll more after 3pm", "Your typing speed dropped this week"
- All data shows 7-day and 30-day trends

### 5.3 Enhanced Dashboard (`app/(tabs)/index.tsx`)

Add to existing dashboard:
- **Wellbeing Score Widget** - Compact version of wellbeing score with "See insights" link
- **Redirection Stats Widget** - "Redirected 5 times today, saved ~45 min"
- **Sleep Quality Widget** - Quick sleep quality from last night
- **Today's App Usage Widget** - Timewaster time vs aligned time as a simple bar
- **Pattern Alert Cards** - "You usually start scrolling around now. Ready for an alternative?"

### 5.4 Enhanced Settings (`app/(tabs)/settings.tsx`)

New sections:
- **Digital Phenotype section**:
  - Master toggle for phenotype collection
  - Individual toggles for each data category (screen time, sleep, activity, typing, touch, etc.)
  - Data retention period selector
  - "View my data" link → insights screen
  - "Delete all phenotype data" button
- **App Library section**:
  - "Manage App Library" link
  - Quick stats (X apps tracked, Y timewasters, Z aligned)
  - Auto-sync toggle (Android)
- **Redirection section**:
  - Master redirect toggle
  - Redirect style (full overlay)
  - Cooldown period between redirects
  - "Quick Add Timewasters" - shortcut to mark common apps
  - Test redirect button (like existing demo trigger)
- **Permissions section**:
  - Status indicators for all needed permissions
  - One-tap to open each permission's settings page
  - Usage Access, Overlay, Notifications, Battery Optimization, Sensors

### 5.5 Redirection Overlay (`app/redirect.tsx`)

New full-screen modal (similar to intervention.tsx but redirect-specific):
- Shows which app triggered the redirect
- "You opened [Instagram]. Here's what [Builder You] would do instead:"
- Primary intervention card with identity alignment explanation
- Alternative suggestions
- "I'll do this instead" → close timewaster, record success
- "Give me 5 minutes" → timer-based conscious use (snooze redirect)
- "Continue to [App]" → conscious continuation, record choice
- Animated transition, haptic feedback
- Time-spent counter showing how long they've been deliberating

### 5.6 Navigation Updates (`app/(tabs)/_layout.tsx`)

- Add 4th tab: "Apps" with `apps-outline` icon
- Reorder: Home, Apps, Insights (linked from portfolio or new tab), Portfolio, Settings
- Or keep 4 tabs: Home, Apps, Portfolio, Settings (Insights accessible from Home)

### 5.7 Onboarding Updates (`app/onboarding/chat-intake.tsx`)

Add to onboarding flow:
- Step asking about apps they want to reduce usage of
- Quick timewaster selection from curated popular apps
- Phenotype collection opt-in explanation and consent
- Permission setup walkthrough (usage access, overlay, sensors)

---

## Phase 6: Extended Signal Collection (`src/hooks/useSignals.ts`)

Enhance existing hook:
- Add sensor data subscription (accelerometer, pedometer)
- Add battery state monitoring
- Add notification response tracking
- Feed all new signal types to phenotype collector
- New signal types: STEP_COUNT, BATTERY_STATE, SENSOR_READING, NOTIFICATION_RESPONSE, TYPING_EVENT, TOUCH_EVENT, TIMEWASTER_DETECTED

---

## Phase 7: Integration & Polish

### 7.1 Wire Everything Together (`app/_layout.tsx`)

- Initialize phenotype collector on app start (if enabled)
- Initialize sensor service
- Register app launch listener for redirection
- Handle redirect flow when timewaster detected
- Periodic phenotype snapshot aggregation

### 7.2 Curated App Catalog Data (`src/constants/appCatalog.ts`)

Build catalog of ~200 popular apps:
- Social Media: Instagram, Facebook, TikTok, Twitter/X, Snapchat, Reddit, Threads, BeReal, etc.
- Entertainment: YouTube, Netflix, Twitch, Spotify, Disney+, HBO Max, etc.
- Productivity: Notion, Slack, Gmail, Calendar, Todoist, etc.
- Fitness: Strava, Nike Run Club, MyFitnessPal, Peloton, etc.
- Education: Duolingo, Coursera, Kindle, Audible, etc.
- Communication: WhatsApp, Signal, Telegram, Discord, Messages, etc.
- Finance: Mint, Robinhood, Venmo, etc.
- Health: Headspace, Calm, Apple Health, etc.
- Each with: name, packageName (Android), category, default identity alignment suggestions

### 7.3 Analytics Events

New PostHog events (opt-in):
- PHENOTYPE_COLLECTION_TOGGLED
- APP_LIBRARY_CONFIGURED
- REDIRECT_TRIGGERED, REDIRECT_OUTCOME
- INSIGHTS_VIEWED
- TIMEWASTER_DESIGNATED
- PERMISSION_GRANTED, PERMISSION_DENIED

---

## Implementation Order

1. **Models** - All new types and interfaces
2. **App Catalog constant** - Static data
3. **Services** - phenotypeCollector, sensors, interactionTracker, sleepInference, permissions, appCatalog; extend appUsage
4. **Stores** - phenotypeStore, appLibraryStore, redirectStore; extend userStore
5. **Native Plugin** - Extend withAppUsage for installed apps query and overlay support
6. **Engine** - Phenotype-aware intervention ranking, new situation types
7. **Hooks** - Extended useSignals
8. **UI Screens** - App Library tab, Insights screen, Redirect overlay
9. **UI Enhancements** - Dashboard widgets, Settings sections
10. **Onboarding** - Updated flow with new steps
11. **Layout** - Wire services, navigation, redirect flow
12. **Testing & Polish** - Demo mode for all features, graceful iOS fallbacks

---

## Platform Notes

**Android advantages:**
- Auto-detect installed apps via PackageManager
- Real-time app launch detection via UsageStatsManager
- Full-screen overlay via SYSTEM_ALERT_WINDOW permission
- Background sensor collection via foreground service

**iOS limitations & workarounds:**
- Cannot query installed apps → use curated catalog + manual add
- Cannot detect app launches → use notification-based approach + Screen Time API (future)
- Limited background execution → collect sensors when app is foregrounded
- No overlay permission → use local notification + deep link back to DopaMenu

**Privacy guarantees:**
- All phenotype data computed and stored locally
- No raw GPS, message content, or call recordings
- Aggregated metrics only (typing speed, not keystrokes)
- Every data category individually toggleable
- Full data deletion available
- Analytics (PostHog) remains opt-in and separate from phenotype data
