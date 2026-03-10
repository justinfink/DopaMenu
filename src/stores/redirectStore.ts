import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RedirectEvent,
  RedirectStats,
  RedirectOutcome,
  SituationType,
  InterventionDecision,
} from '../models';

// ============================================
// Redirect Store
// Manages redirect events, stats, and cooldown
// ============================================

const generateId = () => Math.random().toString(36).substring(2, 11);

interface RedirectState {
  events: RedirectEvent[];
  activeRedirect: {
    sourceApp: string;
    sourceAppName: string;
    startedAt: number;
    intervention: InterventionDecision | null;
  } | null;
  lastRedirectTime: number | null;
  cooldownMinutes: number;

  // Actions
  startRedirect: (sourceApp: string, sourceAppName: string, intervention: InterventionDecision | null) => void;
  completeRedirect: (outcome: RedirectOutcome) => void;
  dismissRedirect: () => void;
  clearActiveRedirect: () => void;
  setCooldownMinutes: (minutes: number) => void;

  // Queries
  isInCooldown: () => boolean;
  getStats: () => RedirectStats;
  getTodayEvents: () => RedirectEvent[];
  getRecentEvents: (days?: number) => RedirectEvent[];
  reset: () => void;
}

export const useRedirectStore = create<RedirectState>()(
  persist(
    (set, get) => ({
      events: [],
      activeRedirect: null,
      lastRedirectTime: null,
      cooldownMinutes: 15,

      startRedirect: (sourceApp, sourceAppName, intervention) => {
        set({
          activeRedirect: {
            sourceApp,
            sourceAppName,
            startedAt: Date.now(),
            intervention,
          },
        });
      },

      completeRedirect: (outcome) => {
        const { activeRedirect } = get();
        if (!activeRedirect) return;

        const event: RedirectEvent = {
          id: generateId(),
          triggeredAt: activeRedirect.startedAt,
          sourceApp: activeRedirect.sourceApp,
          sourceAppName: activeRedirect.sourceAppName,
          interventionId: activeRedirect.intervention?.id,
          outcome,
          timeSpentMs: Date.now() - activeRedirect.startedAt,
          situationType: 'TIMEWASTER_APP_OPENED',
        };

        set((state) => ({
          events: [...state.events, event].slice(-500), // Keep last 500
          activeRedirect: null,
          lastRedirectTime: Date.now(),
        }));
      },

      dismissRedirect: () => {
        get().completeRedirect('dismissed');
      },

      clearActiveRedirect: () => {
        set({ activeRedirect: null });
      },

      setCooldownMinutes: (minutes) => {
        set({ cooldownMinutes: minutes });
      },

      isInCooldown: () => {
        const { lastRedirectTime, cooldownMinutes } = get();
        if (!lastRedirectTime) return false;
        return Date.now() - lastRedirectTime < cooldownMinutes * 60 * 1000;
      },

      getStats: () => {
        const { events } = get();
        const today = new Date().toISOString().split('T')[0];
        const todayEvents = events.filter(e => {
          const d = new Date(e.triggeredAt).toISOString().split('T')[0];
          return d === today;
        });

        const successCount = events.filter(e => e.outcome === 'redirected').length;

        // Top timewasters
        const appCounts: Record<string, number> = {};
        events.forEach(e => {
          appCounts[e.sourceAppName] = (appCounts[e.sourceAppName] || 0) + 1;
        });
        const topTimewasters = Object.entries(appCounts)
          .map(([app, count]) => ({ app, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // Estimate saved time (assume 15 min per successful redirect)
        const estimatedSavedMinutes = successCount * 15;

        return {
          totalRedirects: events.length,
          successCount,
          successRate: events.length > 0 ? successCount / events.length : 0,
          topTimewasters,
          estimatedSavedMinutes,
          todayRedirects: todayEvents.length,
          todaySuccessCount: todayEvents.filter(e => e.outcome === 'redirected').length,
        };
      },

      getTodayEvents: () => {
        const today = new Date().toISOString().split('T')[0];
        return get().events.filter(e => {
          const d = new Date(e.triggeredAt).toISOString().split('T')[0];
          return d === today;
        });
      },

      getRecentEvents: (days = 7) => {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        return get().events.filter(e => e.triggeredAt > cutoff);
      },

      reset: () => {
        set({
          events: [],
          activeRedirect: null,
          lastRedirectTime: null,
        });
      },
    }),
    {
      name: 'dopamenu-redirect-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        events: state.events,
        lastRedirectTime: state.lastRedirectTime,
        cooldownMinutes: state.cooldownMinutes,
      }),
    }
  )
);

export default useRedirectStore;
