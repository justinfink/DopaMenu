// ============================================
// DopaMenu Domain Models
// Based on Product Requirements Document
// ============================================

// ============================================
// User Models
// ============================================

export interface User {
  id: string;
  timezone: string;
  chronotype?: 'morning' | 'evening' | 'neutral';
  identityAnchors: IdentityAnchor[];
  preferences: UserPreferences;
  createdAt: number;
  onboardingCompleted: boolean;
}

export interface IdentityAnchor {
  id: string;
  label: string;
  description?: string;
  priority: number;
  icon?: string;
}

export interface HighRiskTimeConfig {
  id: string;
  label: string;
  hour: number;
  minute: number;
  enabled: boolean;
  daysOfWeek: number[]; // 1=Sunday, 2=Monday, ..., 7=Saturday
}

export interface TrackedAppConfig {
  packageName: string;
  label: string;
  enabled: boolean;
  iosBundleId?: string;
  // Stable id from appCatalog, if this tracked app corresponds to a known entry.
  catalogId?: string;
  // Category string from appCatalog (social, video, etc.) — used for smart
  // redirect suggestions (e.g. for a social trigger, prefer expressive redirects).
  category?: string;
  // True once setup automation fires at least once (auto-detected via deep link).
  // Kept for iOS Shortcuts path; Android doesn't need this.
  iosShortcutConfigured?: boolean;
}

export interface RedirectAppConfig {
  // Stable id from appCatalog
  catalogId: string;
  label: string;
  enabled: boolean;
  category?: string;
  iosScheme?: string;
  iosBundleId?: string;
  androidPackage?: string;
  webUrl: string;
}

export type OnboardingStepKey =
  | 'welcome'
  | 'pick-problem-apps'
  | 'pick-redirect-apps'
  | 'permissions'
  | 'complete';

// Persisted onboarding state. Lives on UserPreferences so it survives process
// death — without this, the user is kicked back to the welcome screen if the
// OS kills the app while they're in Settings granting permissions.
export interface OnboardingProgress {
  currentStep: OnboardingStepKey;
  // Permissions sub-flow: once true, the user has been out to Usage Access at
  // least once (so the "try" step on Android 13+ can advance even if the user
  // hit a restricted-settings block and didn't actually flip the toggle).
  usageAccessTried: boolean;
  // Once true, the user has visited App Info → Allow restricted settings at
  // least once (so the "unlock" step can auto-advance regardless of whether
  // we can functionally probe the AppOp).
  restrictedUnlockVisited: boolean;
}

export interface UserPreferences {
  interventionFrequency: 'low' | 'medium' | 'high';
  quietHours: TimeRange[];
  excludedApps: string[];
  tone: 'gentle' | 'direct' | 'minimal';
  weeklyRecalibrationEnabled: boolean;
  analyticsEnabled: boolean; // Opt-in for anonymous analytics
  // High-risk time notifications (iOS & Android)
  highRiskRemindersEnabled: boolean;
  highRiskTimes: HighRiskTimeConfig[];
  // App usage monitoring (Android only)
  appMonitoringEnabled: boolean;
  trackedApps: TrackedAppConfig[];
  // User-picked healthy-alternative apps. Populated during onboarding and
  // managed in Settings. Feeds auto-generated redirect interventions.
  redirectApps?: RedirectAppConfig[];
  // Per-trigger pinned interventions.
  // Map of tracked app packageName → ordered intervention IDs shown as top options
  // when that app triggers an intercept. Interventions can be either built-in
  // (from DEFAULT_INTERVENTIONS) or custom (from customInterventionsStore).
  // Optional because older persisted users may not have it until migration.
  triggerPreferences?: Record<string, string[]>;
  // Persisted onboarding state. Optional because older persisted users predate
  // the field — userStore's initializeUser backfills it.
  onboardingProgress?: OnboardingProgress;
  // True once the iOS Personal Automation that runs our "Take a Pause"
  // App Intent has fired at least once (auto-detected by app/_layout via
  // the App Group `automationTriggeredAt` flag the Swift intent stamps).
  // We use this to switch the Settings Tap-Free card from "set up" to
  // "active" without nagging the user.
  iosAutomationConfigured?: boolean;
}

export interface TimeRange {
  start: string; // HH:mm format
  end: string;
}

// ============================================
// Signal Models (Raw, Ephemeral)
// ============================================

export type SignalType =
  | 'APP_OPEN'
  | 'APP_SESSION_DURATION'
  | 'DEVICE_UNLOCK'
  | 'CALENDAR_EVENT_END'
  | 'LOCATION_STATE_CHANGE'
  | 'TIME_OF_DAY_BUCKET';

export interface Signal {
  id: string;
  type: SignalType;
  timestamp: number;
  payload: Record<string, unknown>;
}

// ============================================
// Situation Models
// ============================================

export type SituationType =
  | 'REPEATED_APP_OPEN'
  | 'LONG_SINGLE_APP_SESSION'
  | 'POST_MEETING_TRANSITION'
  | 'ARRIVED_HOME_AFTER_WORK'
  | 'LATE_NIGHT_IDLE'
  | 'WAITING_CONTEXT'
  | 'MORNING_ROUTINE'
  | 'WORK_BREAK';

export type TimeBucket =
  | 'early_morning'   // 5-8am
  | 'morning'         // 8-12pm
  | 'afternoon'       // 12-5pm
  | 'evening'         // 5-9pm
  | 'night'           // 9pm-12am
  | 'late_night';     // 12-5am

export type LocationCategory =
  | 'home'
  | 'work'
  | 'transit'
  | 'public'
  | 'unknown';

export type AppCategory =
  | 'social_media'
  | 'entertainment'
  | 'productivity'
  | 'communication'
  | 'news'
  | 'games'
  | 'other';

export interface SituationContext {
  appCategory?: AppCategory;
  timeOfDay?: TimeBucket;
  locationCategory?: LocationCategory;
  recentCognitiveLoad?: 'low' | 'medium' | 'high';
}

export interface Situation {
  id: string;
  type: SituationType;
  confidence: number; // 0-1
  startedAt: number;
  context: SituationContext;
  eligibleForIntervention: boolean;
}

// ============================================
// Itch Models (Inferred State)
// ============================================

export type ItchType =
  | 'BOREDOM'
  | 'AVOIDANCE'
  | 'DEPLETION'
  | 'LONELINESS'
  | 'RESTLESSNESS'
  | 'ANXIETY'
  | 'CURIOSITY'
  | 'REWARD_SEEKING';

export interface ItchWeight {
  itch: ItchType;
  weight: number; // 0-1
}

export interface ItchInference {
  situationId: string;
  itches: ItchWeight[];
  timestamp: number;
}

// ============================================
// Modality & Effort Models
// ============================================

export interface ModalityVector {
  passiveActive: number;         // -1 (passive) to +1 (active)
  novelFamiliar: number;         // -1 (familiar) to +1 (novel)
  socialSolo: number;            // -1 (solo) to +1 (social)
  finiteInfinite: number;        // -1 (finite) to +1 (infinite)
  expressiveConsumptive: number; // -1 (consumptive) to +1 (expressive)
}

export type EffortLevel = 'very_low' | 'low' | 'medium' | 'high';

export interface EffortBudget {
  level: EffortLevel;
  confidence: number; // 0-1
}

// ============================================
// Intervention Models
// ============================================

export type InterventionSurface = 'on_phone' | 'off_phone';

export interface ContextConstraint {
  type: 'location' | 'time' | 'app' | 'custom';
  value: string;
  operator: 'equals' | 'not_equals' | 'contains';
}

export interface InterventionCandidate {
  id: string;
  label: string;
  description?: string;
  modality: ModalityVector;
  requiredEffort: EffortLevel;
  contextConstraints: ContextConstraint[];
  surface: InterventionSurface;
  // launchTarget is a generic deep link / URL fallback. When launchAppPackage
  // or launchIosScheme are present, the intervention screen prefers those and
  // falls back to launchTarget only if the native app isn't installed.
  launchTarget?: string;
  // Android package id of the target app to route the user into (e.g. "com.chess").
  // When present, the intervention screen builds an Android intent URL so the
  // phone opens the native app instead of a browser.
  launchAppPackage?: string;
  // iOS URL scheme or universal link fragment (e.g. "chess://" or a https://
  // universal link that the target app claims). Tried on iOS before falling
  // back to launchTarget.
  launchIosScheme?: string;
  // Android-specific deep link URI inside the target app (e.g.
  // "strava://activities/new"). When set, the launcher constructs an intent
  // that opens the app directly to that screen instead of just the launcher
  // activity. Falls back to launchAppPackage's main activity if the deep link
  // doesn't resolve.
  launchAndroidUri?: string;
  identityTags: string[];
  icon?: string;
}

export interface InterventionDecision {
  id: string;
  situationId: string;
  primary: InterventionCandidate;
  alternatives: InterventionCandidate[];
  explanation: string;
  timestamp: number;
}

// ============================================
// Outcome Models
// ============================================

export type OutcomeAction = 'accepted' | 'dismissed' | 'continued_default';

export interface Outcome {
  interventionId: string;
  actionTaken: OutcomeAction;
  followThrough?: boolean;
  timestamp: number;
  // What app fired this intervention. Captured at recordOutcome time from
  // activeTriggerPackage / activeTriggerLabel on the intervention store.
  // Optional because:
  //   • iOS tap-free path doesn't always pipe the trigger through (Apple's
  //     AppIntent perform context doesn't expose the originating app).
  //   • Pre-existing outcomes from earlier app versions don't have it.
  // The aggregator in services/telemetryPreselect treats undefined as
  // "anonymous trigger" and ignores it for app-specific scoring.
  triggerCatalogId?: string; // resolved against APP_CATALOG when possible
  triggerPackage?: string;   // raw android package or iOS bundle ID
  triggerLabel?: string;     // user-facing label (Instagram, TikTok, ...)
}

// ============================================
// Portfolio Models
// ============================================

export interface PortfolioCategory {
  id: string;
  label: string;
  icon: string;
  completed: boolean;
  inferred: boolean;
}

export interface DailyPortfolio {
  date: string; // YYYY-MM-DD format
  categories: PortfolioCategory[];
  goodDayRating?: number; // 1-5, optional
  notes?: string;
}

// ============================================
// Default Identity Anchors
// ============================================

export const DEFAULT_IDENTITY_ANCHORS: Omit<IdentityAnchor, 'id' | 'priority'>[] = [
  { label: 'Builder', description: 'Creating and making things', icon: 'hammer' },
  { label: 'Learner', description: 'Growing knowledge and skills', icon: 'book' },
  { label: 'Connected', description: 'Maintaining relationships', icon: 'people' },
  { label: 'Mindful', description: 'Present and intentional', icon: 'leaf' },
  { label: 'Active', description: 'Moving and physical', icon: 'fitness' },
  { label: 'Creative', description: 'Expressing and imagining', icon: 'color-palette' },
  { label: 'Restful', description: 'Recovering and recharging', icon: 'moon' },
];

// ============================================
// Default Portfolio Categories
// ============================================

export const DEFAULT_PORTFOLIO_CATEGORIES: Omit<PortfolioCategory, 'id' | 'completed' | 'inferred'>[] = [
  { label: 'Creative', icon: 'color-palette' },
  { label: 'Physical', icon: 'fitness' },
  { label: 'Social', icon: 'people' },
  { label: 'Learning', icon: 'book' },
  { label: 'Rest', icon: 'moon' },
];
