import AsyncStorage from '@react-native-async-storage/async-storage';
import { InterventionCandidate, Situation, SituationType, User } from '../models';
import { generateIntervention } from '../engine/InterventionEngine';
import { getInterventionPool } from '../constants/interventions';
import { getTimeBucket, getGreeting } from '../utils/helpers';
import type { TimeBucket } from '../models';

// ============================================
// Live Menu Service
// Single source of truth for the calibrated menu shown on BOTH the home page
// hero and the Android home-screen widget. Reads user state directly from
// AsyncStorage so the widget headless task can hydrate without booting React.
// ============================================

export interface LiveMenuData {
  primary: InterventionCandidate;
  alternatives: InterventionCandidate[];
  timeBucket: TimeBucket;
  greeting: string;
  explanation: string;
}

// True for any candidate that can do *something* on tap. Off-phone activities
// always pass (the resolver shows them in a modal). On-phone candidates need
// at least one launch field, otherwise tapping them is a silent no-op — the
// "links don't work" complaint that drove the widget polish.
function isLaunchable(c: InterventionCandidate): boolean {
  if (c.surface === 'off_phone') return true;
  return !!(c.launchAppPackage || c.launchIosScheme || c.launchTarget);
}

// Deterministic situation derived from the current time bucket. The widget
// refreshes every 30 min and the home page re-reads on focus / store change;
// both call this exact function, so both surfaces stay in lockstep — the
// "Right now" pick on the lock-screen widget matches what's at the top of the
// home page. Replaces simulateSituation()'s randomness for this surface only;
// the rest of the app (urge button, intercept paths) keeps its existing
// situation-randomization behavior.
function getLiveMenuSituation(): Situation {
  const bucket = getTimeBucket();
  const typeForBucket: Record<TimeBucket, SituationType> = {
    early_morning: 'MORNING_ROUTINE',
    morning: 'WORK_BREAK',
    afternoon: 'WORK_BREAK',
    evening: 'ARRIVED_HOME_AFTER_WORK',
    night: 'LATE_NIGHT_IDLE',
    late_night: 'LATE_NIGHT_IDLE',
  };
  return {
    id: `live-${bucket}`,
    type: typeForBucket[bucket],
    confidence: 0.8,
    startedAt: Date.now(),
    context: { timeOfDay: bucket },
    eligibleForIntervention: true,
  };
}

export async function getLiveMenuData(): Promise<LiveMenuData | null> {
  const userRaw = await AsyncStorage.getItem('dopamenu-user-storage');
  const customRaw = await AsyncStorage.getItem(
    'dopamenu-custom-interventions-storage',
  );

  const userState = userRaw ? JSON.parse(userRaw) : null;
  const customState = customRaw ? JSON.parse(customRaw) : null;

  const user: User | null = userState?.state?.user ?? null;
  if (!user) return null;

  const customInterventions: InterventionCandidate[] =
    customState?.state?.interventions ?? [];
  const pool = [...getInterventionPool(user), ...customInterventions];

  const situation = getLiveMenuSituation();
  const decision = generateIntervention(situation, user, pool);

  // Promote the first launchable alternative if the picked primary is an
  // on-phone item with no resolvable launch path. Eliminates the "tap does
  // nothing" footgun that bit the widget.
  let primary = decision.primary;
  let alternatives = decision.alternatives.slice(0, 2);
  if (!isLaunchable(primary)) {
    const launchableAlt = decision.alternatives.find(isLaunchable);
    if (launchableAlt) {
      primary = launchableAlt;
      alternatives = decision.alternatives
        .filter((c) => c.id !== launchableAlt.id)
        .slice(0, 2);
    }
  }

  // Filter alternatives the same way — never render a row whose tap won't do
  // anything. Falls back to the first 2 launchable candidates from the pool
  // (excluding primary) if filtering empties the list.
  alternatives = alternatives.filter(isLaunchable);
  if (alternatives.length < 2) {
    const filler = pool
      .filter((c) => c.id !== primary.id && isLaunchable(c))
      .slice(0, 2 - alternatives.length);
    alternatives = [...alternatives, ...filler];
  }

  return {
    primary,
    alternatives,
    timeBucket: getTimeBucket(),
    greeting: getGreeting(),
    explanation: decision.explanation,
  };
}
