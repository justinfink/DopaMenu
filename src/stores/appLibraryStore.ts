import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  InstalledApp,
  UserAppConfig,
  CatalogApp,
  AppCategory,
  AppDesignation,
  AppPriority,
} from '../models';
import { appCatalogService } from '../services/appCatalog';

// ============================================
// App Library Store
// Manages installed apps, user configurations,
// and app categorization
// ============================================

const generateId = () => Math.random().toString(36).substring(2, 11);

interface AppLibraryState {
  installedApps: InstalledApp[];
  userConfigs: Record<string, UserAppConfig>; // keyed by appId
  isLoaded: boolean;
  lastSyncTime: number | null;

  // Filter state
  activeFilter: 'all' | 'aligned' | 'timewaster' | 'priority' | 'uncategorized';
  searchQuery: string;

  // Actions
  setApps: (apps: InstalledApp[]) => void;
  addAppFromCatalog: (catalogApp: CatalogApp) => string;
  addCustomApp: (name: string, packageName: string, category: AppCategory) => string;
  removeApp: (appId: string) => void;
  updateAppConfig: (appId: string, config: Partial<UserAppConfig>) => void;
  setDesignation: (appId: string, designation: AppDesignation) => void;
  setPriority: (appId: string, priority: AppPriority) => void;
  addIdentityGoal: (appId: string, goalId: string) => void;
  removeIdentityGoal: (appId: string, goalId: string) => void;
  setRedirectBehavior: (appId: string, behavior: UserAppConfig['redirectBehavior']) => void;
  setDailyTimeLimit: (appId: string, minutes: number | undefined) => void;
  bulkSetDesignation: (appIds: string[], designation: AppDesignation) => void;

  // Queries
  getTimewasterApps: () => InstalledApp[];
  getAlignedApps: () => InstalledApp[];
  getPriorityApps: () => InstalledApp[];
  getAppConfig: (appId: string) => UserAppConfig | null;
  getAppByPackageName: (packageName: string) => InstalledApp | null;
  getFilteredApps: () => InstalledApp[];
  getRedirectApps: () => InstalledApp[];
  getAppStats: () => { total: number; timewasters: number; aligned: number; priority: number };

  // Filter actions
  setFilter: (filter: AppLibraryState['activeFilter']) => void;
  setSearchQuery: (query: string) => void;

  syncFromPackageManager: (packageNames: { name: string; packageName: string }[]) => void;
  reset: () => void;
}

export const useAppLibraryStore = create<AppLibraryState>()(
  persist(
    (set, get) => ({
      installedApps: [],
      userConfigs: {},
      isLoaded: false,
      lastSyncTime: null,
      activeFilter: 'all',
      searchQuery: '',

      setApps: (apps) => set({ installedApps: apps, isLoaded: true }),

      addAppFromCatalog: (catalogApp) => {
        const installed = appCatalogService.catalogToInstalledApp(catalogApp);
        const config = appCatalogService.createDefaultConfig(installed.id, catalogApp);

        set((state) => {
          // Check if already exists
          const existing = state.installedApps.find(
            a => a.packageName === catalogApp.packageName
          );
          if (existing) return state;

          return {
            installedApps: [...state.installedApps, installed],
            userConfigs: { ...state.userConfigs, [installed.id]: config },
          };
        });

        return installed.id;
      },

      addCustomApp: (name, packageName, category) => {
        const id = generateId();
        const app: InstalledApp = {
          id,
          packageName,
          displayName: name,
          category,
          source: 'user_added',
        };

        const config: UserAppConfig = {
          appId: id,
          priority: 'none',
          identityGoals: [],
          designation: 'neutral',
          redirectBehavior: 'none',
        };

        set((state) => ({
          installedApps: [...state.installedApps, app],
          userConfigs: { ...state.userConfigs, [id]: config },
        }));

        return id;
      },

      removeApp: (appId) => {
        set((state) => {
          const { [appId]: _, ...remainingConfigs } = state.userConfigs;
          return {
            installedApps: state.installedApps.filter(a => a.id !== appId),
            userConfigs: remainingConfigs,
          };
        });
      },

      updateAppConfig: (appId, config) => {
        set((state) => {
          const existing = state.userConfigs[appId] || {
            appId,
            priority: 'none' as AppPriority,
            identityGoals: [],
            designation: 'neutral' as AppDesignation,
            redirectBehavior: 'none' as const,
          };

          return {
            userConfigs: {
              ...state.userConfigs,
              [appId]: { ...existing, ...config },
            },
          };
        });
      },

      setDesignation: (appId, designation) => {
        get().updateAppConfig(appId, {
          designation,
          redirectBehavior: designation === 'timewaster' ? 'full_overlay' : 'none',
        });
      },

      setPriority: (appId, priority) => {
        get().updateAppConfig(appId, { priority });
      },

      addIdentityGoal: (appId, goalId) => {
        const config = get().userConfigs[appId];
        if (!config) return;
        if (config.identityGoals.includes(goalId)) return;
        get().updateAppConfig(appId, {
          identityGoals: [...config.identityGoals, goalId],
        });
      },

      removeIdentityGoal: (appId, goalId) => {
        const config = get().userConfigs[appId];
        if (!config) return;
        get().updateAppConfig(appId, {
          identityGoals: config.identityGoals.filter(g => g !== goalId),
        });
      },

      setRedirectBehavior: (appId, behavior) => {
        get().updateAppConfig(appId, { redirectBehavior: behavior });
      },

      setDailyTimeLimit: (appId, minutes) => {
        get().updateAppConfig(appId, { dailyTimeLimitMinutes: minutes });
      },

      bulkSetDesignation: (appIds, designation) => {
        set((state) => {
          const newConfigs = { ...state.userConfigs };
          for (const appId of appIds) {
            const existing = newConfigs[appId] || {
              appId,
              priority: 'none' as AppPriority,
              identityGoals: [],
              designation: 'neutral' as AppDesignation,
              redirectBehavior: 'none' as const,
            };
            newConfigs[appId] = {
              ...existing,
              designation,
              redirectBehavior: designation === 'timewaster' ? 'full_overlay' : existing.redirectBehavior,
            };
          }
          return { userConfigs: newConfigs };
        });
      },

      // Queries
      getTimewasterApps: () => {
        const { installedApps, userConfigs } = get();
        return installedApps.filter(app => userConfigs[app.id]?.designation === 'timewaster');
      },

      getAlignedApps: () => {
        const { installedApps, userConfigs } = get();
        return installedApps.filter(app => userConfigs[app.id]?.designation === 'aligned');
      },

      getPriorityApps: () => {
        const { installedApps, userConfigs } = get();
        return installedApps.filter(
          app => userConfigs[app.id]?.priority === 'high' || userConfigs[app.id]?.priority === 'medium'
        );
      },

      getAppConfig: (appId) => {
        return get().userConfigs[appId] || null;
      },

      getAppByPackageName: (packageName) => {
        return get().installedApps.find(a => a.packageName === packageName) || null;
      },

      getFilteredApps: () => {
        const { installedApps, userConfigs, activeFilter, searchQuery } = get();

        let filtered = installedApps;

        // Apply search
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter(app =>
            app.displayName.toLowerCase().includes(q) ||
            app.category.toLowerCase().includes(q)
          );
        }

        // Apply filter
        switch (activeFilter) {
          case 'aligned':
            filtered = filtered.filter(app => userConfigs[app.id]?.designation === 'aligned');
            break;
          case 'timewaster':
            filtered = filtered.filter(app => userConfigs[app.id]?.designation === 'timewaster');
            break;
          case 'priority':
            filtered = filtered.filter(
              app => userConfigs[app.id]?.priority === 'high' || userConfigs[app.id]?.priority === 'medium'
            );
            break;
          case 'uncategorized':
            filtered = filtered.filter(
              app => !userConfigs[app.id] || userConfigs[app.id]?.designation === 'neutral'
            );
            break;
        }

        return filtered.sort((a, b) => a.displayName.localeCompare(b.displayName));
      },

      getRedirectApps: () => {
        const { installedApps, userConfigs } = get();
        return installedApps.filter(
          app => userConfigs[app.id]?.redirectBehavior === 'full_overlay' ||
                 userConfigs[app.id]?.redirectBehavior === 'notification'
        );
      },

      getAppStats: () => {
        const { installedApps, userConfigs } = get();
        return {
          total: installedApps.length,
          timewasters: installedApps.filter(a => userConfigs[a.id]?.designation === 'timewaster').length,
          aligned: installedApps.filter(a => userConfigs[a.id]?.designation === 'aligned').length,
          priority: installedApps.filter(
            a => userConfigs[a.id]?.priority === 'high' || userConfigs[a.id]?.priority === 'medium'
          ).length,
        };
      },

      setFilter: (filter) => set({ activeFilter: filter }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      syncFromPackageManager: (packageNames) => {
        set((state) => {
          const existingPackages = new Set(state.installedApps.map(a => a.packageName));
          const newApps: InstalledApp[] = [];
          const newConfigs: Record<string, UserAppConfig> = {};

          for (const { name, packageName } of packageNames) {
            if (existingPackages.has(packageName)) continue;

            const catalogMatch = appCatalogService.matchToCatalog(packageName);
            const id = generateId();

            const app: InstalledApp = {
              id,
              packageName,
              displayName: catalogMatch?.name || name,
              icon: catalogMatch?.icon,
              category: catalogMatch?.category || 'other',
              source: catalogMatch ? 'auto_detected' : 'auto_detected',
            };

            const config: UserAppConfig = catalogMatch
              ? appCatalogService.createDefaultConfig(id, catalogMatch)
              : {
                  appId: id,
                  priority: 'none',
                  identityGoals: [],
                  designation: 'neutral',
                  redirectBehavior: 'none',
                };

            newApps.push(app);
            newConfigs[id] = config;
          }

          return {
            installedApps: [...state.installedApps, ...newApps],
            userConfigs: { ...state.userConfigs, ...newConfigs },
            lastSyncTime: Date.now(),
            isLoaded: true,
          };
        });
      },

      reset: () => {
        set({
          installedApps: [],
          userConfigs: {},
          isLoaded: false,
          lastSyncTime: null,
          activeFilter: 'all',
          searchQuery: '',
        });
      },
    }),
    {
      name: 'dopamenu-app-library-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        installedApps: state.installedApps,
        userConfigs: state.userConfigs,
        lastSyncTime: state.lastSyncTime,
        isLoaded: state.isLoaded,
      }),
    }
  )
);

export default useAppLibraryStore;
