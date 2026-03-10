import { useEffect, useCallback } from 'react';
import { usePhenotypeStore } from '../stores/phenotypeStore';
import { PhenotypeSnapshot, PhenotypeProfile, PhenotypeTrend, PhenotypeAnomaly, PhenotypePattern } from '../models';

// ============================================
// usePhenotype Hook
// Provides access to phenotype data and
// auto-refreshes on mount.
// ============================================

interface UsePhenotypeReturn {
  profile: PhenotypeProfile | null;
  todaySnapshot: PhenotypeSnapshot | null;
  recentSnapshots: PhenotypeSnapshot[];
  wellbeingScore: number;
  trends: PhenotypeTrend[];
  anomalies: PhenotypeAnomaly[];
  patterns: PhenotypePattern[];
  isCollecting: boolean;
  refresh: () => Promise<void>;
}

export function usePhenotype(autoRefresh = true): UsePhenotypeReturn {
  const {
    profile,
    todaySnapshot,
    recentSnapshots,
    isCollecting,
    refreshProfile,
    refreshTodaySnapshot,
    loadRecentSnapshots,
    getWellbeingScore,
    getTrends,
    getAnomalies,
    getPatterns,
  } = usePhenotypeStore();

  const refresh = useCallback(async () => {
    await Promise.all([
      refreshProfile(),
      refreshTodaySnapshot(),
      loadRecentSnapshots(7),
    ]);
  }, [refreshProfile, refreshTodaySnapshot, loadRecentSnapshots]);

  useEffect(() => {
    if (autoRefresh) {
      refresh();
    }
  }, [autoRefresh, refresh]);

  return {
    profile,
    todaySnapshot,
    recentSnapshots,
    wellbeingScore: getWellbeingScore(),
    trends: getTrends(),
    anomalies: getAnomalies(),
    patterns: getPatterns(),
    isCollecting,
    refresh,
  };
}

export default usePhenotype;
