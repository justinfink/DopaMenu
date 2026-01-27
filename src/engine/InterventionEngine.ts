import {
  Situation,
  SituationType,
  ItchInference,
  ItchType,
  ItchWeight,
  EffortBudget,
  EffortLevel,
  ModalityVector,
  InterventionCandidate,
  InterventionDecision,
  TimeBucket,
  User,
} from '../models';
import { DEFAULT_INTERVENTIONS, SOCIAL_MEDIA_MODALITY } from '../constants/interventions';

// ============================================
// Intervention Engine
// Core logic for selecting contextual interventions
// ============================================

const generateId = () => Math.random().toString(36).substring(2, 11);

// ============================================
// Itch Inference
// ============================================

const SITUATION_ITCH_MAP: Record<SituationType, Partial<Record<ItchType, number>>> = {
  REPEATED_APP_OPEN: {
    BOREDOM: 0.6,
    RESTLESSNESS: 0.4,
    REWARD_SEEKING: 0.5,
  },
  LONG_SINGLE_APP_SESSION: {
    AVOIDANCE: 0.5,
    BOREDOM: 0.3,
    DEPLETION: 0.4,
  },
  POST_MEETING_TRANSITION: {
    DEPLETION: 0.6,
    AVOIDANCE: 0.3,
    RESTLESSNESS: 0.4,
  },
  ARRIVED_HOME_AFTER_WORK: {
    DEPLETION: 0.7,
    RESTLESSNESS: 0.3,
  },
  LATE_NIGHT_IDLE: {
    ANXIETY: 0.4,
    LONELINESS: 0.5,
    RESTLESSNESS: 0.3,
  },
  WAITING_CONTEXT: {
    BOREDOM: 0.8,
    RESTLESSNESS: 0.5,
  },
  MORNING_ROUTINE: {
    AVOIDANCE: 0.4,
    ANXIETY: 0.3,
  },
  WORK_BREAK: {
    DEPLETION: 0.5,
    BOREDOM: 0.4,
  },
};

export function inferItches(situation: Situation): ItchInference {
  const itchMap = SITUATION_ITCH_MAP[situation.type] || {};

  const itches: ItchWeight[] = Object.entries(itchMap)
    .map(([itch, weight]) => ({
      itch: itch as ItchType,
      weight: weight * situation.confidence,
    }))
    .sort((a, b) => b.weight - a.weight);

  return {
    situationId: situation.id,
    itches,
    timestamp: Date.now(),
  };
}

// ============================================
// Effort Budget Estimation
// ============================================

const TIME_EFFORT_MAP: Record<TimeBucket, EffortLevel> = {
  early_morning: 'low',
  morning: 'high',
  afternoon: 'medium',
  evening: 'medium',
  night: 'low',
  late_night: 'very_low',
};

export function estimateEffortBudget(situation: Situation): EffortBudget {
  const timeOfDay = situation.context.timeOfDay || 'afternoon';
  const cognitiveLoad = situation.context.recentCognitiveLoad || 'medium';

  let baseEffort = TIME_EFFORT_MAP[timeOfDay];

  // Adjust based on cognitive load
  if (cognitiveLoad === 'high') {
    baseEffort = downgradeEffort(baseEffort);
  } else if (cognitiveLoad === 'low') {
    baseEffort = upgradeEffort(baseEffort);
  }

  // Adjust based on situation type
  if (situation.type === 'POST_MEETING_TRANSITION') {
    baseEffort = downgradeEffort(baseEffort);
  }

  return {
    level: baseEffort,
    confidence: situation.confidence * 0.8,
  };
}

function downgradeEffort(level: EffortLevel): EffortLevel {
  const order: EffortLevel[] = ['very_low', 'low', 'medium', 'high'];
  const idx = order.indexOf(level);
  return order[Math.max(0, idx - 1)];
}

function upgradeEffort(level: EffortLevel): EffortLevel {
  const order: EffortLevel[] = ['very_low', 'low', 'medium', 'high'];
  const idx = order.indexOf(level);
  return order[Math.min(order.length - 1, idx + 1)];
}

// ============================================
// Modality Matching
// ============================================

export function calculateModalitySimilarity(
  a: ModalityVector,
  b: ModalityVector
): number {
  // Euclidean distance normalized to 0-1 similarity
  const dimensions = [
    'passiveActive',
    'novelFamiliar',
    'socialSolo',
    'finiteInfinite',
    'expressiveConsumptive',
  ] as const;

  let sumSquared = 0;
  for (const dim of dimensions) {
    const diff = a[dim] - b[dim];
    sumSquared += diff * diff;
  }

  // Max distance is sqrt(5 * 4) = sqrt(20) ≈ 4.47
  const maxDistance = Math.sqrt(20);
  const distance = Math.sqrt(sumSquared);

  return 1 - distance / maxDistance;
}

// ============================================
// Candidate Filtering & Ranking
// ============================================

const EFFORT_HIERARCHY: EffortLevel[] = ['very_low', 'low', 'medium', 'high'];

export function filterCandidates(
  candidates: InterventionCandidate[],
  effortBudget: EffortBudget,
  situation: Situation,
  user: User
): InterventionCandidate[] {
  const budgetIdx = EFFORT_HIERARCHY.indexOf(effortBudget.level);

  return candidates.filter((candidate) => {
    // Check effort constraint
    const candidateEffortIdx = EFFORT_HIERARCHY.indexOf(candidate.requiredEffort);
    if (candidateEffortIdx > budgetIdx) {
      return false;
    }

    // Check context constraints
    for (const constraint of candidate.contextConstraints) {
      if (constraint.type === 'location') {
        const location = situation.context.locationCategory;
        if (constraint.operator === 'equals' && location !== constraint.value) {
          return false;
        }
        if (constraint.operator === 'not_equals' && location === constraint.value) {
          return false;
        }
      }
    }

    return true;
  });
}

export function rankCandidates(
  candidates: InterventionCandidate[],
  defaultModality: ModalityVector,
  user: User,
  itchInference: ItchInference
): InterventionCandidate[] {
  const userIdentities = user.identityAnchors.map((a) => a.label.toLowerCase());

  const scored = candidates.map((candidate) => {
    let score = 0;

    // Modality similarity (0-1, weight: 40%)
    const modalitySimilarity = calculateModalitySimilarity(
      candidate.modality,
      defaultModality
    );
    score += modalitySimilarity * 0.4;

    // Identity alignment (0-1, weight: 30%)
    const identityMatches = candidate.identityTags.filter((tag) =>
      userIdentities.includes(tag.toLowerCase())
    ).length;
    const identityScore =
      userIdentities.length > 0
        ? identityMatches / Math.min(candidate.identityTags.length, userIdentities.length)
        : 0.5;
    score += identityScore * 0.3;

    // Effort appropriateness (prefer lower effort slightly, weight: 15%)
    const effortIdx = EFFORT_HIERARCHY.indexOf(candidate.requiredEffort);
    const effortScore = 1 - effortIdx / (EFFORT_HIERARCHY.length - 1);
    score += effortScore * 0.15;

    // Variety bonus (weight: 15%) - could be enhanced with history
    const varietyScore = Math.random() * 0.15;
    score += varietyScore;

    return { candidate, score };
  });

  return scored.sort((a, b) => b.score - a.score).map((s) => s.candidate);
}

// ============================================
// Main Engine Function
// ============================================

const EXPLANATIONS: Record<SituationType, string[]> = {
  REPEATED_APP_OPEN: [
    'You\'ve been reaching for your phone frequently.',
    'Noticed a pattern of quick app checks.',
  ],
  LONG_SINGLE_APP_SESSION: [
    'You\'ve been on this app for a while.',
    'A longer session than usual.',
  ],
  POST_MEETING_TRANSITION: [
    'Transitioning after your meeting.',
    'A natural break in your day.',
  ],
  ARRIVED_HOME_AFTER_WORK: [
    'Welcome home. Transition moment.',
    'End of workday, new context.',
  ],
  LATE_NIGHT_IDLE: [
    'Getting late. Wind-down time.',
    'Late night moment.',
  ],
  WAITING_CONTEXT: [
    'Looks like you\'re waiting.',
    'A brief pause in your day.',
  ],
  MORNING_ROUTINE: [
    'Starting the day.',
    'Morning moment.',
  ],
  WORK_BREAK: [
    'Taking a break.',
    'Brief pause from work.',
  ],
};

export function generateIntervention(
  situation: Situation,
  user: User,
  candidates: InterventionCandidate[] = DEFAULT_INTERVENTIONS
): InterventionDecision {
  // 1. Infer itches
  const itchInference = inferItches(situation);

  // 2. Estimate effort budget
  const effortBudget = estimateEffortBudget(situation);

  // 3. Filter candidates
  const filtered = filterCandidates(candidates, effortBudget, situation, user);

  // 4. Rank candidates
  const ranked = rankCandidates(filtered, SOCIAL_MEDIA_MODALITY, user, itchInference);

  // 5. Select primary and alternatives
  const primary = ranked[0] || candidates[0]; // Fallback to first candidate
  const alternatives = ranked.slice(1, 4); // Up to 3 alternatives

  // 6. Generate explanation
  const explanations = EXPLANATIONS[situation.type] || ['A moment to pause.'];
  const explanation = explanations[Math.floor(Math.random() * explanations.length)];

  return {
    id: generateId(),
    situationId: situation.id,
    primary,
    alternatives,
    explanation,
    timestamp: Date.now(),
  };
}

// ============================================
// Situation Simulation (for MVP demo)
// ============================================

export function simulateSituation(): Situation {
  const types: SituationType[] = [
    'REPEATED_APP_OPEN',
    'LONG_SINGLE_APP_SESSION',
    'WORK_BREAK',
    'WAITING_CONTEXT',
  ];

  const timeBuckets: TimeBucket[] = [
    'morning',
    'afternoon',
    'evening',
  ];

  const type = types[Math.floor(Math.random() * types.length)];
  const timeOfDay = timeBuckets[Math.floor(Math.random() * timeBuckets.length)];

  return {
    id: generateId(),
    type,
    confidence: 0.7 + Math.random() * 0.3,
    startedAt: Date.now(),
    context: {
      timeOfDay,
      locationCategory: 'home',
      recentCognitiveLoad: 'medium',
    },
    eligibleForIntervention: true,
  };
}

export default {
  inferItches,
  estimateEffortBudget,
  calculateModalitySimilarity,
  filterCandidates,
  rankCandidates,
  generateIntervention,
  simulateSituation,
};
