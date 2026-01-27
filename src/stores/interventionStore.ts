import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  InterventionDecision,
  Outcome,
  Situation,
  OutcomeAction,
} from '../models';

// ============================================
// Intervention Store
// Manages interventions, outcomes, and learning
// ============================================

interface InterventionState {
  // Current active intervention (if any)
  activeIntervention: InterventionDecision | null;
  activeSituation: Situation | null;

  // History for learning
  recentOutcomes: Outcome[];
  interventionHistory: InterventionDecision[];

  // Cooldown management
  lastInterventionTime: number | null;
  cooldownMinutes: number;

  // Stats
  totalInterventions: number;
  acceptedCount: number;
  dismissedCount: number;
  continuedCount: number;

  // Actions
  showIntervention: (decision: InterventionDecision, situation: Situation) => void;
  recordOutcome: (action: OutcomeAction, followThrough?: boolean) => void;
  dismissIntervention: () => void;
  clearActiveIntervention: () => void;
  isInCooldown: () => boolean;
  setCooldownMinutes: (minutes: number) => void;
  getAcceptanceRate: () => number;
  reset: () => void;
}

const MAX_HISTORY = 100;
const MAX_RECENT_OUTCOMES = 50;

export const useInterventionStore = create<InterventionState>()(
  persist(
    (set, get) => ({
      activeIntervention: null,
      activeSituation: null,
      recentOutcomes: [],
      interventionHistory: [],
      lastInterventionTime: null,
      cooldownMinutes: 15,
      totalInterventions: 0,
      acceptedCount: 0,
      dismissedCount: 0,
      continuedCount: 0,

      showIntervention: (decision, situation) => {
        set((state) => ({
          activeIntervention: decision,
          activeSituation: situation,
          interventionHistory: [
            decision,
            ...state.interventionHistory.slice(0, MAX_HISTORY - 1),
          ],
          totalInterventions: state.totalInterventions + 1,
        }));
      },

      recordOutcome: (action, followThrough) => {
        const { activeIntervention } = get();
        if (!activeIntervention) return;

        const outcome: Outcome = {
          interventionId: activeIntervention.id,
          actionTaken: action,
          followThrough,
          timestamp: Date.now(),
        };

        set((state) => ({
          recentOutcomes: [
            outcome,
            ...state.recentOutcomes.slice(0, MAX_RECENT_OUTCOMES - 1),
          ],
          lastInterventionTime: Date.now(),
          activeIntervention: null,
          activeSituation: null,
          acceptedCount:
            action === 'accepted'
              ? state.acceptedCount + 1
              : state.acceptedCount,
          dismissedCount:
            action === 'dismissed'
              ? state.dismissedCount + 1
              : state.dismissedCount,
          continuedCount:
            action === 'continued_default'
              ? state.continuedCount + 1
              : state.continuedCount,
        }));
      },

      dismissIntervention: () => {
        const { activeIntervention } = get();
        if (activeIntervention) {
          get().recordOutcome('dismissed');
        }
      },

      clearActiveIntervention: () => {
        set({
          activeIntervention: null,
          activeSituation: null,
        });
      },

      isInCooldown: () => {
        const { lastInterventionTime, cooldownMinutes } = get();
        if (!lastInterventionTime) return false;

        const cooldownMs = cooldownMinutes * 60 * 1000;
        return Date.now() - lastInterventionTime < cooldownMs;
      },

      setCooldownMinutes: (minutes) => {
        set({ cooldownMinutes: minutes });
      },

      getAcceptanceRate: () => {
        const { totalInterventions, acceptedCount } = get();
        if (totalInterventions === 0) return 0;
        return acceptedCount / totalInterventions;
      },

      reset: () => {
        set({
          activeIntervention: null,
          activeSituation: null,
          recentOutcomes: [],
          interventionHistory: [],
          lastInterventionTime: null,
          totalInterventions: 0,
          acceptedCount: 0,
          dismissedCount: 0,
          continuedCount: 0,
        });
      },
    }),
    {
      name: 'dopamenu-intervention-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useInterventionStore;
