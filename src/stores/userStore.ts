import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  User,
  IdentityAnchor,
  UserPreferences,
  DEFAULT_IDENTITY_ANCHORS,
} from '../models';

// ============================================
// User Store
// Manages user profile and preferences
// ============================================

interface UserState {
  user: User | null;
  isLoading: boolean;

  // Actions
  initializeUser: (timezone: string) => void;
  completeOnboarding: () => void;
  setChronotype: (chronotype: User['chronotype']) => void;
  addIdentityAnchor: (anchor: Omit<IdentityAnchor, 'id' | 'priority'>) => void;
  removeIdentityAnchor: (anchorId: string) => void;
  updateIdentityPriority: (anchorId: string, priority: number) => void;
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  addQuietHours: (start: string, end: string) => void;
  removeQuietHours: (index: number) => void;
  addExcludedApp: (appId: string) => void;
  removeExcludedApp: (appId: string) => void;
  reset: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

const defaultPreferences: UserPreferences = {
  interventionFrequency: 'medium',
  quietHours: [{ start: '22:00', end: '07:00' }],
  excludedApps: [],
  tone: 'gentle',
  weeklyRecalibrationEnabled: true,
};

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,

      initializeUser: (timezone: string) => {
        const existing = get().user;
        if (existing) {
          set({ isLoading: false });
          return;
        }

        const newUser: User = {
          id: generateId(),
          timezone,
          chronotype: undefined,
          identityAnchors: [],
          preferences: defaultPreferences,
          createdAt: Date.now(),
          onboardingCompleted: false,
        };

        set({ user: newUser, isLoading: false });
      },

      completeOnboarding: () => {
        set((state) => ({
          user: state.user
            ? { ...state.user, onboardingCompleted: true }
            : null,
        }));
      },

      setChronotype: (chronotype) => {
        set((state) => ({
          user: state.user ? { ...state.user, chronotype } : null,
        }));
      },

      addIdentityAnchor: (anchor) => {
        set((state) => {
          if (!state.user) return state;

          const newAnchor: IdentityAnchor = {
            ...anchor,
            id: generateId(),
            priority: state.user.identityAnchors.length + 1,
          };

          return {
            user: {
              ...state.user,
              identityAnchors: [...state.user.identityAnchors, newAnchor],
            },
          };
        });
      },

      removeIdentityAnchor: (anchorId) => {
        set((state) => {
          if (!state.user) return state;

          const filtered = state.user.identityAnchors.filter(
            (a) => a.id !== anchorId
          );

          // Re-index priorities
          const reIndexed = filtered.map((a, i) => ({
            ...a,
            priority: i + 1,
          }));

          return {
            user: {
              ...state.user,
              identityAnchors: reIndexed,
            },
          };
        });
      },

      updateIdentityPriority: (anchorId, priority) => {
        set((state) => {
          if (!state.user) return state;

          return {
            user: {
              ...state.user,
              identityAnchors: state.user.identityAnchors.map((a) =>
                a.id === anchorId ? { ...a, priority } : a
              ),
            },
          };
        });
      },

      updatePreferences: (preferences) => {
        set((state) => {
          if (!state.user) return state;

          return {
            user: {
              ...state.user,
              preferences: {
                ...state.user.preferences,
                ...preferences,
              },
            },
          };
        });
      },

      addQuietHours: (start, end) => {
        set((state) => {
          if (!state.user) return state;

          return {
            user: {
              ...state.user,
              preferences: {
                ...state.user.preferences,
                quietHours: [
                  ...state.user.preferences.quietHours,
                  { start, end },
                ],
              },
            },
          };
        });
      },

      removeQuietHours: (index) => {
        set((state) => {
          if (!state.user) return state;

          const quietHours = [...state.user.preferences.quietHours];
          quietHours.splice(index, 1);

          return {
            user: {
              ...state.user,
              preferences: {
                ...state.user.preferences,
                quietHours,
              },
            },
          };
        });
      },

      addExcludedApp: (appId) => {
        set((state) => {
          if (!state.user) return state;

          if (state.user.preferences.excludedApps.includes(appId)) {
            return state;
          }

          return {
            user: {
              ...state.user,
              preferences: {
                ...state.user.preferences,
                excludedApps: [...state.user.preferences.excludedApps, appId],
              },
            },
          };
        });
      },

      removeExcludedApp: (appId) => {
        set((state) => {
          if (!state.user) return state;

          return {
            user: {
              ...state.user,
              preferences: {
                ...state.user.preferences,
                excludedApps: state.user.preferences.excludedApps.filter(
                  (id) => id !== appId
                ),
              },
            },
          };
        });
      },

      reset: () => {
        set({ user: null, isLoading: false });
      },
    }),
    {
      name: 'dopamenu-user-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
        }
      },
    }
  )
);

export default useUserStore;
