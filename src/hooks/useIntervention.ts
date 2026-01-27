import { useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { useUserStore } from '../stores/userStore';
import { useInterventionStore } from '../stores/interventionStore';
import { generateIntervention, simulateSituation } from '../engine/InterventionEngine';
import { Situation, InterventionDecision } from '../models';

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

      // Generate intervention decision
      const decision = generateIntervention(sit, user);

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

// Helper function to check if time is in range
function isTimeInRange(time: string, start: string, end: string): boolean {
  const [timeH, timeM] = time.split(':').map(Number);
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  const timeMinutes = timeH * 60 + timeM;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // Handle overnight ranges (e.g., 22:00 - 07:00)
  if (startMinutes > endMinutes) {
    return timeMinutes >= startMinutes || timeMinutes <= endMinutes;
  }

  return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
}

export default useIntervention;
