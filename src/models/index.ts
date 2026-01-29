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

export interface UserPreferences {
  interventionFrequency: 'low' | 'medium' | 'high';
  quietHours: TimeRange[];
  excludedApps: string[];
  tone: 'gentle' | 'direct' | 'minimal';
  weeklyRecalibrationEnabled: boolean;
  analyticsEnabled: boolean; // Opt-in for anonymous analytics
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
