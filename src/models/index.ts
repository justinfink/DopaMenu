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
  // Digital phenotype collection
  phenotypeCollectionEnabled: boolean;
  phenotypeSettings: PhenotypeSettings;
  // App library
  appLibraryEnabled: boolean;
  appLibraryAutoSync: boolean; // Android: auto-detect installed apps
  // Redirection
  redirectionEnabled: boolean;
  redirectCooldownMinutes: number;
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
  | 'TIME_OF_DAY_BUCKET'
  | 'STEP_COUNT'
  | 'BATTERY_STATE'
  | 'SENSOR_READING'
  | 'NOTIFICATION_RESPONSE'
  | 'TYPING_EVENT'
  | 'TOUCH_EVENT'
  | 'TIMEWASTER_DETECTED';

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
  | 'WORK_BREAK'
  | 'TIMEWASTER_APP_OPENED'
  | 'EXCESSIVE_SCREEN_TIME'
  | 'SLEEP_DEFICIT'
  | 'HIGH_COGNITIVE_LOAD'
  | 'SEDENTARY_ALERT'
  | 'MOOD_DIP';

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
  | 'fitness'
  | 'education'
  | 'finance'
  | 'health'
  | 'utilities'
  | 'shopping'
  | 'travel'
  | 'food'
  | 'music'
  | 'photo_video'
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
  launchTarget?: string; // Deep link
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

// ============================================
// Digital Phenotype Models
// ============================================

export interface PhenotypeSettings {
  screenTime: boolean;
  unlockPatterns: boolean;
  sleepInference: boolean;
  activityLevel: boolean;
  typingDynamics: boolean;
  touchPatterns: boolean;
  socialEngagement: boolean;
  cognitiveLoad: boolean;
  circadianProfile: boolean;
  notificationBehavior: boolean;
  batteryPatterns: boolean;
  ambientContext: boolean;
  dataRetentionDays: number; // default 90
}

export const DEFAULT_PHENOTYPE_SETTINGS: PhenotypeSettings = {
  screenTime: true,
  unlockPatterns: true,
  sleepInference: true,
  activityLevel: true,
  typingDynamics: true,
  touchPatterns: true,
  socialEngagement: true,
  cognitiveLoad: true,
  circadianProfile: true,
  notificationBehavior: true,
  batteryPatterns: true,
  ambientContext: true,
  dataRetentionDays: 90,
};

export interface ScreenTimeData {
  totalMinutes: number;
  sessionCount: number;
  hourlyDistribution: number[]; // 24 buckets
}

export interface UnlockPatternData {
  totalUnlocks: number;
  hourlyDistribution: number[]; // 24 buckets
  averageSessionSeconds: number;
}

export interface SleepInferenceData {
  estimatedBedtime: string | null; // HH:mm
  estimatedWakeTime: string | null; // HH:mm
  estimatedDurationMinutes: number | null;
  qualityScore: number; // 0-100
  regularity: number; // 0-100 (consistency over 7 days)
}

export interface ActivityLevelData {
  stepCount: number;
  movementMinutes: number;
  sedentaryMinutes: number;
  activityClassification: 'sedentary' | 'light' | 'moderate' | 'active';
}

export interface TypingDynamicsData {
  averageCharsPerMinute: number;
  backspaceRatio: number; // 0-1
  averagePauseMs: number;
  sessionCount: number;
}

export interface TouchPatternData {
  averageScrollVelocity: number;
  tapFrequencyPerMinute: number;
  interactionIntensity: number; // 0-100
}

export interface SocialEngagementData {
  messagingSessionCount: number;
  communicationAppMinutes: number;
  socialMediaMinutes: number;
}

export interface CognitiveLoadData {
  calendarEventCount: number;
  appSwitchesPerHour: number;
  multitaskingScore: number; // 0-100
}

export interface CircadianProfileData {
  firstDeviceUse: string | null; // HH:mm
  lastDeviceUse: string | null; // HH:mm
  peakActivityHour: number; // 0-23
  regularityScore: number; // 0-100
}

export interface NotificationBehaviorData {
  averageResponseTimeMs: number;
  ignoredCount: number;
  interactionRate: number; // 0-1
  totalReceived: number;
}

export interface BatteryPatternData {
  chargeStartTimes: string[]; // HH:mm
  chargeEndTimes: string[]; // HH:mm
  lowBatteryMoments: number;
  routineRegularity: number; // 0-100
}

export interface AmbientContextData {
  averageBrightness: number; // 0-1
  orientationChanges: number;
}

export interface MoodProxyData {
  score: number; // 0-100
  contributors: {
    factor: string;
    influence: number; // -1 to +1
  }[];
}

export interface PhenotypeSnapshot {
  id: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  screenTime: ScreenTimeData;
  unlockPatterns: UnlockPatternData;
  sleepInference: SleepInferenceData;
  activityLevel: ActivityLevelData;
  typingDynamics: TypingDynamicsData;
  touchPatterns: TouchPatternData;
  socialEngagement: SocialEngagementData;
  cognitiveLoad: CognitiveLoadData;
  circadianProfile: CircadianProfileData;
  notificationBehavior: NotificationBehaviorData;
  batteryPatterns: BatteryPatternData;
  ambientContext: AmbientContextData;
  moodProxy: MoodProxyData;
  wellbeingScore: number; // 0-100 composite
}

export type TrendDirection = 'improving' | 'declining' | 'stable';

export interface PhenotypeTrend {
  dimension: string;
  direction: TrendDirection;
  magnitude: number; // 0-1
  period: '7d' | '30d';
}

export interface PhenotypeAnomaly {
  dimension: string;
  deviation: number; // standard deviations from baseline
  message: string;
  timestamp: number;
}

export interface PhenotypePattern {
  id: string;
  label: string; // e.g., "afternoon slump", "late-night scroll"
  description: string;
  confidence: number; // 0-1
  triggerConditions: string;
}

export interface PhenotypeProfile {
  lastUpdated: number;
  averages7d: Partial<PhenotypeSnapshot>;
  averages30d: Partial<PhenotypeSnapshot>;
  trends: PhenotypeTrend[];
  anomalies: PhenotypeAnomaly[];
  patterns: PhenotypePattern[];
  wellbeingScore: number; // 0-100
  wellbeingTrend: TrendDirection;
}

// ============================================
// App Library Models
// ============================================

export interface InstalledApp {
  id: string;
  packageName: string; // Android package or iOS bundle ID
  displayName: string;
  icon?: string; // base64 or URI
  category: AppCategory;
  source: 'auto_detected' | 'user_added' | 'curated_catalog';
}

export type AppDesignation = 'aligned' | 'neutral' | 'timewaster';
export type AppPriority = 'high' | 'medium' | 'low' | 'none';

export interface UserAppConfig {
  appId: string; // references InstalledApp.id
  priority: AppPriority;
  identityGoals: string[]; // identity anchor IDs
  designation: AppDesignation;
  redirectBehavior: 'full_overlay' | 'notification' | 'none';
  dailyTimeLimitMinutes?: number;
  notes?: string;
}

export interface CatalogApp {
  name: string;
  packageName: string; // Android package name
  category: AppCategory;
  defaultDesignation: AppDesignation;
  suggestedIdentityTags: string[]; // identity anchor labels
  icon: string; // Ionicons name
  isCommonTimewaster: boolean;
}

// ============================================
// Redirection Models
// ============================================

export type RedirectOutcome = 'redirected' | 'continued' | 'dismissed' | 'snoozed';

export interface RedirectEvent {
  id: string;
  triggeredAt: number;
  sourceApp: string; // package name
  sourceAppName: string;
  interventionId?: string;
  outcome: RedirectOutcome;
  timeSpentMs: number; // time in redirect overlay
  situationType: SituationType;
}

export interface RedirectStats {
  totalRedirects: number;
  successCount: number; // outcome === 'redirected'
  successRate: number; // 0-1
  topTimewasters: { app: string; count: number }[];
  estimatedSavedMinutes: number;
  todayRedirects: number;
  todaySuccessCount: number;
}

// ============================================
// Interaction Tracking Models
// ============================================

export interface TypingSession {
  startedAt: number;
  endedAt: number;
  totalChars: number;
  backspaceCount: number;
  pauseCount: number; // pauses > 2 seconds
  averagePauseMs: number;
}

export interface TouchSession {
  startedAt: number;
  endedAt: number;
  scrollEvents: number;
  tapEvents: number;
  averageScrollVelocity: number;
}

// ============================================
// Sensor Data Models
// ============================================

export interface SensorReading {
  type: 'accelerometer' | 'pedometer' | 'battery' | 'brightness';
  timestamp: number;
  value: Record<string, number>;
}

export interface BatterySnapshot {
  level: number; // 0-1
  isCharging: boolean;
  timestamp: number;
}
