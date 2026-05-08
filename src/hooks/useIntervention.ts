import { useCallback } from 'react';
import { router } from 'expo-router';
import { useUserStore } from '../stores/userStore';
import { useInterventionStore } from '../stores/interventionStore';
import { generateIntervention, simulateSituation } from '../engine/InterventionEngine';
import { buildCandidatePool } from '../services/interventionResolver';
import { Situation, InterventionDecision } from '../models';
import { isTimeInRange } from '../utils/time';

// ============================================
// useIntervention Hook
// Manages intervention triggering and display
// ============================================

interface UseInterventionReturn {
  activeIntervention: InterventionDecision | null;
  activeSituation: Situation | null;
  isInCooldown: boolean;
  triggerIntervention: (situation?: Situation) => void;
  dismissIntervention: () => void;
  canIntervene: () => boolean;
}

export function useIntervention(): UseInterventionReturn {
  const { user } = useUserStore();
  const {
    activeIntervention,
    activeSituation,
    showIntervention,
    dismissIntervention,
    isInCooldown,
  } = useInterventionStore();

  const canIntervene = useCallback(() => {
    if (!user) return false;
    if (isInCooldown()) return false;

    // Check quiet hours
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    for (const quietHour of user.preferences.quietHours) {
      if (isTimeInRange(currentTime, quietHour.start, quietHour.end)) {
        return false;
      }
    }

    return true;
  }, [user, isInCooldown]);

  const triggerIntervention = useCallback(
    (situation?: Situation) => {
      if (!user) return;
      if (!canIntervene()) return;

      const sit = situation || simulateSituation();

      // Check confidence threshold
      if (sit.confidence < 0.5) return;

      // Generate intervention decision (no trigger package for manual urge —
      // fall back to standard ranking).
      const decision = generateIntervention(sit, user, buildCandidatePool(user));

      // Show intervention
      showIntervention(decision, sit);

      // Navigate to intervention modal
      router.push('/intervention');
    },
    [user, canIntervene, showIntervention]
  );

  return {
    activeIntervention,
    activeSituation,
    isInCooldown: isInCooldown(),
    triggerIntervention,
    dismissIntervention,
    canIntervene,
  };
}

// Re-export so existing call sites that import from this module continue to
// work. New code should import from '../utils/time' directly.
export { isTimeInRange };

export default useIntervention;
