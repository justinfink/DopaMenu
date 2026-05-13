import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { InterventionCandidate, Situation, SituationType, User } from '../models';
import { generateIntervention } from '../engine/InterventionEngine';
import { getInterventionPool } from '../constants/interventions';
import { getTimeBucket, getGreeting } from '../utils/helpers';
import type { TimeBucket } from '../models';

// iOS widget shares App Group UserDefaults with the main app process — that's
// the documented WidgetKit pattern. We import lazily so this module stays
// importable on Android (where the bridge isn't built) without runtime errors.
type RNDAModule = typeof import('react-native-device-activity');
let RNDA: RNDAModule | null = null;
if (Platform.OS === 'ios') {
  try {
    RNDA = require('react-native-device-activity') as RNDAModule;
  } catch {
    RNDA = null;
  }
}

/** App Group key the iOS WidgetKit extension reads on every timeline refresh. */
const IOS_WIDGET_USERDEFAULTS_KEY = 'iosWidgetMenuData';

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
  let alternatives = decision.alternatives.slice(0, 3);
  if (!isLaunchable(primary)) {
    const launchableAlt = decision.alternatives.find(isLaunchable);
    if (launchableAlt) {
      primary = launchableAlt;
      alternatives = decision.alternatives
        .filter((c) => c.id !== launchableAlt.id)
        .slice(0, 3);
    }
  }

  // Filter alternatives the same way — never render a row whose tap won't do
  // anything. Falls back to the first 3 launchable candidates from the pool
  // (excluding primary) if filtering empties the list.
  alternatives = alternatives.filter(isLaunchable);
  if (alternatives.length < 3) {
    const filler = pool
      .filter((c) => c.id !== primary.id && isLaunchable(c))
      .slice(0, 3 - alternatives.length);
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

/**
 * Project a LiveMenuData into the slim, widget-only shape that the iOS
 * WidgetKit extension renders. We deliberately strip everything the widget
 * doesn't need (modality vectors, situation IDs, etc.) so the extension's
 * memory footprint stays small and the JSON write is cheap.
 *
 * The shape is the contract between JS and the Swift widget — if you change
 * a field name here, update the matching field in
 * `plugins/widget-ios/DopaMenuWidget.swift`'s `WidgetMenuData` struct, or
 * the widget will silently render its placeholder.
 */
interface IosWidgetMenuPayload {
  primary: { id: string; label: string; icon: string; effort: string };
  alternatives: { id: string; label: string; icon: string; effort: string }[];
  timeBucket: TimeBucket;
  greeting: string;
  /** Epoch ms — Swift uses this to decide whether to show stale-data hint. */
  updatedAt: number;
}

function projectForIosWidget(data: LiveMenuData): IosWidgetMenuPayload {
  const project = (c: InterventionCandidate) => ({
    id: c.id,
    label: c.label,
    icon: c.icon ?? 'sparkles',
    effort: String(c.requiredEffort ?? ''),
  });
  return {
    primary: project(data.primary),
    alternatives: data.alternatives.slice(0, 3).map(project),
    timeBucket: data.timeBucket,
    greeting: data.greeting,
    updatedAt: Date.now(),
  };
}

/**
 * Serialize the live menu into App Group UserDefaults for the iOS WidgetKit
 * extension. Idempotent + fast (a single string write); safe to call on
 * every preferences change. No-op on Android.
 *
 * Expected callers:
 *   • app/_layout.tsx's userStore subscription (mirrors how Android refreshes
 *     the widget on prefs changes)
 *   • interventionStore subscription (after an outcome fires — the menu
 *     might re-rank)
 *   • Pause / resume actions (paused state isn't in the payload but the
 *     widget should reflect it via the same data shape)
 */
export async function writeIosWidgetData(): Promise<void> {
  if (Platform.OS !== 'ios' || !RNDA) return;
  try {
    const data = await getLiveMenuData();
    if (!data) {
      // No user / not onboarded — clear stale data so the widget shows its
      // placeholder rather than yesterday's stale recommendation.
      RNDA.userDefaultsRemove(IOS_WIDGET_USERDEFAULTS_KEY);
      return;
    }
    const payload = projectForIosWidget(data);
    RNDA.userDefaultsSet(
      IOS_WIDGET_USERDEFAULTS_KEY,
      JSON.stringify(payload),
    );
    // Ask iOS to reload the timeline so the new data shows up on the widget
    // immediately instead of waiting for the next system-scheduled refresh
    // (which can be up to ~30 min out). The native module ignores the call
    // when the WidgetKit bridge isn't built (older iOS, missing extension).
    const NativeWidget = (require('react-native').NativeModules as any)
      .DopaMenuWidget;
    if (NativeWidget?.reloadAllTimelines) {
      try {
        NativeWidget.reloadAllTimelines();
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn('[liveMenuService] writeIosWidgetData failed', err);
  }
}
