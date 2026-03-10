import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PhenotypeSnapshot,
  PhenotypeProfile,
  PhenotypeTrend,
  PhenotypeAnomaly,
  PhenotypePattern,
} from '../models';
import { phenotypeCollector } from '../services/phenotypeCollector';

// ============================================
// Phenotype Store
// Manages digital phenotype snapshots and profile
// ============================================

interface PhenotypeState {
  profile: PhenotypeProfile | null;
  todaySnapshot: PhenotypeSnapshot | null;
  recentSnapshots: PhenotypeSnapshot[];
  isCollecting: boolean;
  lastCollectionTime: number | null;

  // Actions
  refreshProfile: () => Promise<void>;
  refreshTodaySnapshot: () => Promise<void>;
  loadRecentSnapshots: (days?: number) => Promise<void>;
  getWellbeingScore: () => number;
  getTrends: () => PhenotypeTrend[];
  getAnomalies: () => PhenotypeAnomaly[];
  getPatterns: () => PhenotypePattern[];
  setCollecting: (collecting: boolean) => void;
  clearAll: () => Promise<void>;
}

export const usePhenotypeStore = create<PhenotypeState>()(
  persist(
    (set, get) => ({
      profile: null,
      todaySnapshot: null,
      recentSnapshots: [],
      isCollecting: false,
      lastCollectionTime: null,

      refreshProfile: async () => {
        const profile = await phenotypeCollector.getProfile();
        set({ profile, lastCollectionTime: Date.now() });
      },

      refreshTodaySnapshot: async () => {
        const snapshot = await phenotypeCollector.getTodaySnapshot();
        set({ todaySnapshot: snapshot });
      },

      loadRecentSnapshots: async (days = 7) => {
        const snapshots = await phenotypeCollector.getRecentSnapshots(days);
        set({ recentSnapshots: snapshots });
      },

      getWellbeingScore: () => {
        const { profile, todaySnapshot } = get();
        if (todaySnapshot) return todaySnapshot.wellbeingScore;
        if (profile) return profile.wellbeingScore;
        return 50;
      },

      getTrends: () => {
        return get().profile?.trends ?? [];
      },

      getAnomalies: () => {
        return get().profile?.anomalies ?? [];
      },

      getPatterns: () => {
        return get().profile?.patterns ?? [];
      },

      setCollecting: (collecting: boolean) => {
        set({ isCollecting: collecting });
      },

      clearAll: async () => {
        await phenotypeCollector.clearAll();
        set({
          profile: null,
          todaySnapshot: null,
          recentSnapshots: [],
          isCollecting: false,
          lastCollectionTime: null,
        });
      },
    }),
    {
      name: 'dopamenu-phenotype-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        profile: state.profile,
        lastCollectionTime: state.lastCollectionTime,
        isCollecting: state.isCollecting,
      }),
    }
  )
);

export default usePhenotypeStore;
