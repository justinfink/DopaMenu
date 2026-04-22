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
  setTriggerPins: (packageName: string, interventionIds: string[]) => void;
  clearTriggerPins: (packageName: string) => void;
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
  analyticsEnabled: false, // Opt-out by default for privacy
  // High-risk time notifications
  highRiskRemindersEnabled: true,
  highRiskTimes: [
    { id: 'morning', label: 'Morning check-in', hour: 8, minute: 0, enabled: true, daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
    { id: 'lunch', label: 'Lunch break', hour: 12, minute: 30, enabled: true, daysOfWeek: [2, 3, 4, 5, 6] },
    { id: 'afternoon', label: 'Afternoon slump', hour: 15, minute: 0, enabled: true, daysOfWeek: [2, 3, 4, 5, 6] },
    { id: 'evening', label: 'Evening wind-down', hour: 21, minute: 0, enabled: true, daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
  ],
  // App monitoring. On Android this drives the UsageStats/Accessibility
  // detection pipeline. On iOS it drives the Shortcuts-based redirect path:
  // enabled=true means "user has set up (or will set up) Shortcuts
  // automations for these apps." iosBundleId is the bundle id that goes into
  // the Shortcuts "App is Opened" trigger.
  appMonitoringEnabled: false,
  trackedApps: [
    { packageName: 'com.instagram.android', label: 'Instagram', enabled: true, iosBundleId: 'com.burbn.instagram' },
    { packageName: 'com.twitter.android', label: 'Twitter/X', enabled: true, iosBundleId: 'com.atebits.Tweetie2' },
    { packageName: 'com.zhiliaoapp.musically', label: 'TikTok', enabled: true, iosBundleId: 'com.zhiliaoapp.musically' },
    { packageName: 'com.facebook.katana', label: 'Facebook', enabled: true, iosBundleId: 'com.facebook.Facebook' },
    { packageName: 'com.reddit.frontpage', label: 'Reddit', enabled: true, iosBundleId: 'com.reddit.Reddit' },
  ],
  // Per-trigger pin map. Seeded with a Chess.com top pin for Instagram so new
  // users experience the feature out of the box. Users can edit/remove it.
  triggerPreferences: {
    'com.instagram.android': ['int-custom-chess-seed'],
  },
};

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,

      initializeUser: (timezone: string) => {
        const existing = get().user;
        if (existing) {
          // Merge any new default trackedApps that aren't in the stored prefs.
          // Covers users who installed before the current defaults were written.
          const existingPackages = new Set(existing.preferences.trackedApps.map(a => a.packageName));
          const newApps = defaultPreferences.trackedApps.filter(a => !existingPackages.has(a.packageName));

          // Migration: backfill iosBundleId onto existing tracked apps that
          // were persisted before iOS support shipped. Look up the bundle id
          // from the current defaults by packageName.
          const defaultsByPackage = Object.fromEntries(
            defaultPreferences.trackedApps.map(a => [a.packageName, a])
          );
          const mergedExistingApps = existing.preferences.trackedApps.map(a =>
            a.iosBundleId ? a : { ...a, iosBundleId: defaultsByPackage[a.packageName]?.iosBundleId }
          );
          const needsIosBackfill = mergedExistingApps.some((a, i) => a !== existing.preferences.trackedApps[i]);

          // Migration: ensure triggerPreferences exists for users upgrading from
          // a version where the field didn't exist. Seed the Chess-for-Instagram
          // pin only if the user has no existing triggerPreferences at all —
          // don't overwrite intentional configuration.
          const hasTriggerPrefs = existing.preferences.triggerPreferences !== undefined;
          const nextTriggerPrefs = hasTriggerPrefs
            ? existing.preferences.triggerPreferences
            : defaultPreferences.triggerPreferences;

          if (newApps.length > 0 || !hasTriggerPrefs || needsIosBackfill) {
            set({
              user: {
                ...existing,
                preferences: {
                  ...existing.preferences,
                  trackedApps: [...mergedExistingApps, ...newApps],
                  triggerPreferences: nextTriggerPrefs,
                },
              },
              isLoading: false,
            });
          } else {
            set({ isLoading: false });
          }
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

      setTriggerPins: (packageName, interventionIds) => {
        set((state) => {
          if (!state.user) return state;
          const currentMap = state.user.preferences.triggerPreferences || {};
          const nextMap = { ...currentMap, [packageName]: interventionIds };
          return {
            user: {
              ...state.user,
              preferences: {
                ...state.user.preferences,
                triggerPreferences: nextMap,
              },
            },
          };
        });
      },

      clearTriggerPins: (packageName) => {
        set((state) => {
          if (!state.user) return state;
          const currentMap = state.user.preferences.triggerPreferences || {};
          const nextMap = { ...currentMap };
          delete nextMap[packageName];
          return {
            user: {
              ...state.user,
              preferences: {
                ...state.user.preferences,
                triggerPreferences: nextMap,
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
