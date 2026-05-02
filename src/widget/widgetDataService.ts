import AsyncStorage from '@react-native-async-storage/async-storage';
import { InterventionCandidate, User } from '../models';
import { generateIntervention, simulateSituation } from '../engine/InterventionEngine';
import { DEFAULT_INTERVENTIONS, getInterventionPool } from '../constants/interventions';
import { getTimeBucket, getGreeting } from '../utils/helpers';
import type { TimeBucket } from '../models';

export interface WidgetMenuData {
  primary: InterventionCandidate;
  alternatives: InterventionCandidate[];
  timeBucket: TimeBucket;
  greeting: string;
  explanation: string;
}

export async function getWidgetMenuData(): Promise<WidgetMenuData | null> {
  const userRaw = await AsyncStorage.getItem('dopamenu-user-storage');
  const customRaw = await AsyncStorage.getItem('dopamenu-custom-interventions-storage');

  const userState = userRaw ? JSON.parse(userRaw) : null;
  const customState = customRaw ? JSON.parse(customRaw) : null;

  const user: User | null = userState?.state?.user ?? null;
  if (!user) return null;

  const customInterventions: InterventionCandidate[] =
    customState?.state?.interventions ?? [];
  const pool = [...getInterventionPool(user), ...customInterventions];

  const situation = simulateSituation();
  const decision = generateIntervention(situation, user, pool);

  return {
    primary: decision.primary,
    alternatives: decision.alternatives.slice(0, 2),
    timeBucket: getTimeBucket(),
    greeting: getGreeting(),
    explanation: decision.explanation,
  };
}
