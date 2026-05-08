import { Platform, BackHandler } from 'react-native';
import { router } from 'expo-router';
import {
  InterventionCandidate,
  InterventionDecision,
  Situation,
  User,
} from '../models';
import { getInterventionPool } from '../constants/interventions';
import { useCustomInterventionsStore } from '../stores/customInterventionsStore';
import { useInterventionStore } from '../stores/interventionStore';
import { simulateSituation } from '../engine/InterventionEngine';
import { launchIntervention } from './interventionLauncher';

// Single source for the merged candidate pool — built-in + user redirect picks
// + user-authored custom interventions. Centralizing this prevents the four
// previous in-place duplicates (app/_layout, app/(tabs)/index, useIntervention,
// widgetDataService) from drifting out of sync.
export function buildCandidatePool(user: User | null): InterventionCandidate[] {
  if (!user) return [];
  return [
    ...getInterventionPool(user),
    ...useCustomInterventionsStore.getState().interventions,
  ];
}

export interface LaunchOrShowOptions {
  // Widget tap path expects DopaMenu to exit after launch so the user lands
  // cleanly back on their phone home screen. In-app paths set this false so
  // the back stack stays intact.
  exitAfterLaunch?: boolean;
  // What to attribute this surface as in analytics / decision metadata. The
  // off-phone fallback wraps the intervention in a synthetic decision and
  // tags it with this string.
  source?: string;
}

// Shared "open this intervention" path. Used by the widget deep link AND the
// home-page live menu so both surfaces behave identically.
//   - has launch target → call launchIntervention (intent / scheme / web).
//     If exitAfterLaunch is set and we're on Android, BackHandler.exitApp()
//     after launch so the user lands on the trigger app, not DopaMenu.
//   - off-phone → wrap in a synthetic decision and route to /intervention so
//     the user can act on the suggestion in-app.
export async function launchOrShow(
  intervention: InterventionCandidate,
  options: LaunchOrShowOptions = {},
): Promise<void> {
  const hasLaunchTarget =
    !!intervention.launchAppPackage ||
    !!intervention.launchIosScheme ||
    !!intervention.launchTarget;

  if (hasLaunchTarget) {
    const launched = await launchIntervention(intervention);
    if (launched && options.exitAfterLaunch && Platform.OS === 'android') {
      BackHandler.exitApp();
    }
    return;
  }

  // Off-phone path — surface the modal so the user has something to engage
  // with rather than a no-op tap.
  const situation: Situation = simulateSituation();
  const decision: InterventionDecision = {
    id: `${options.source ?? 'home'}-${intervention.id}`,
    situationId: situation.id,
    primary: intervention,
    alternatives: [],
    explanation: options.source === 'widget'
      ? 'From your widget'
      : 'From your home menu',
    timestamp: Date.now(),
  };

  useInterventionStore.getState().showIntervention(decision, situation);
  router.push('/intervention');
}
