import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  InterventionCandidate,
  ModalityVector,
  EffortLevel,
  InterventionSurface,
} from '../models';

// ============================================
// Custom Interventions Store
// User-authored interventions that merge with the built-in catalog.
// ============================================

// The seeded Chess.com intervention ID — referenced from the default
// triggerPreferences map in userStore so new users see Chess as the top option
// for Instagram immediately after install.
export const SEEDED_CHESS_ID = 'int-custom-chess-seed';

// A neutral modality vector used for custom interventions by default.
// Users can't currently set this via UI; the engine still ranks custom items
// with this vector but trigger pins bypass ranking for the pinned slot, which
// is the path that matters for the user-facing flow.
const NEUTRAL_MODALITY: ModalityVector = {
  passiveActive: 0.3,
  novelFamiliar: 0,
  socialSolo: -0.3,
  finiteInfinite: -0.3,
  expressiveConsumptive: 0,
};

const SEEDED_CUSTOM: InterventionCandidate[] = [
  {
    id: SEEDED_CHESS_ID,
    label: 'Play a chess puzzle',
    description: 'One puzzle on Chess.com. Engage your brain instead.',
    modality: NEUTRAL_MODALITY,
    requiredEffort: 'low',
    contextConstraints: [],
    surface: 'on_phone',
    launchTarget: 'https://www.chess.com/puzzles',
    identityTags: ['learner'],
    icon: 'game-controller',
  },
];

export interface CustomInterventionInput {
  label: string;
  description?: string;
  icon?: string;
  requiredEffort: EffortLevel;
  surface: InterventionSurface;
  launchTarget?: string;
  identityTags?: string[];
}

interface CustomInterventionsState {
  interventions: InterventionCandidate[];
  hasSeeded: boolean;

  addIntervention: (input: CustomInterventionInput) => InterventionCandidate;
  updateIntervention: (id: string, input: Partial<CustomInterventionInput>) => void;
  removeIntervention: (id: string) => void;
  getById: (id: string) => InterventionCandidate | undefined;
  reset: () => void;
}

const generateCustomId = () =>
  `int-custom-${Math.random().toString(36).substring(2, 10)}`;

export const useCustomInterventionsStore = create<CustomInterventionsState>()(
  persist(
    (set, get) => ({
      interventions: SEEDED_CUSTOM,
      hasSeeded: true,

      addIntervention: (input) => {
        const candidate: InterventionCandidate = {
          id: generateCustomId(),
          label: input.label,
          description: input.description,
          modality: NEUTRAL_MODALITY,
          requiredEffort: input.requiredEffort,
          contextConstraints: [],
          surface: input.surface,
          launchTarget: input.launchTarget || undefined,
          identityTags: input.identityTags || [],
          icon: input.icon || 'sparkles',
        };
        set((state) => ({
          interventions: [...state.interventions, candidate],
        }));
        return candidate;
      },

      updateIntervention: (id, input) => {
        set((state) => ({
          interventions: state.interventions.map((i) =>
            i.id === id
              ? {
                  ...i,
                  ...(input.label !== undefined && { label: input.label }),
                  ...(input.description !== undefined && { description: input.description }),
                  ...(input.icon !== undefined && { icon: input.icon }),
                  ...(input.requiredEffort !== undefined && { requiredEffort: input.requiredEffort }),
                  ...(input.surface !== undefined && { surface: input.surface }),
                  ...(input.launchTarget !== undefined && { launchTarget: input.launchTarget || undefined }),
                  ...(input.identityTags !== undefined && { identityTags: input.identityTags }),
                }
              : i
          ),
        }));
      },

      removeIntervention: (id) => {
        set((state) => ({
          interventions: state.interventions.filter((i) => i.id !== id),
        }));
      },

      getById: (id) => {
        return get().interventions.find((i) => i.id === id);
      },

      reset: () => {
        set({ interventions: SEEDED_CUSTOM, hasSeeded: true });
      },
    }),
    {
      name: 'dopamenu-custom-interventions-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Ensure users who installed before the seed existed get it once.
      onRehydrateStorage: () => (state) => {
        if (state && !state.hasSeeded) {
          state.interventions = [...state.interventions, ...SEEDED_CUSTOM];
          state.hasSeeded = true;
        }
      },
    }
  )
);

export default useCustomInterventionsStore;
