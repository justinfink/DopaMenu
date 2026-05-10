import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  AppStateStatus,
  Platform,
  Alert,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card } from '..';
import { useUserStore } from '../../stores/userStore';
import { useInterventionStore } from '../../stores/interventionStore';
import { getLiveMenuData, LiveMenuData } from '../../widget/liveMenuService';
import { launchOrShow } from '../../services/interventionResolver';
import { useIntervention } from '../../hooks/useIntervention';
import { isTimeInRange, formatHHMMForDisplay } from '../../utils/time';
import { getTimeBucketLabel, EFFORT_LABELS } from '../../widget/iconMap';
import { analyticsService, AnalyticsEvents, appUsageService } from '../../services';
import {
  isPaused,
  pausedUntil,
  pauseBlockingFor,
  resumeBlocking,
} from '../../services/iosFamilyControls';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/theme';
import type { InterventionCandidate } from '../../models';

// ============================================
// LiveMenu — the calibrated DopaMenu hero on the home page.
// Reads from the same getLiveMenuData() the widget uses so both surfaces stay
// in lockstep. Refreshes on mount, screen focus, and store changes (user
// preferences, accepted interventions) — same triggers as the widget.
// ============================================

interface QuietState {
  isQuiet: boolean;
  // HH:mm of when quiet hours end. Undefined when not in quiet hours.
  resumeAt?: string;
}

function computeQuietState(
  quietHours: { start: string; end: string }[] | undefined,
): QuietState {
  if (!quietHours || quietHours.length === 0) return { isQuiet: false };
  const now = new Date();
  const hh = `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
  for (const range of quietHours) {
    if (isTimeInRange(hh, range.start, range.end)) {
      return { isQuiet: true, resumeAt: range.end };
    }
  }
  return { isQuiet: false };
}

/**
 * Format ms-remaining into a friendly "X minutes" / "X hours, Y minutes"
 * string for the paused-banner. Always ceil to the nearest minute so a
 * 59-second remainder doesn't display "0 minutes."
 */
function formatRemainingDuration(ms: number): string {
  if (ms <= 0) return 'a moment';
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/**
 * Compute ms from now to "tomorrow at 7am" (the user's local time). Used by
 * the "Pause until tomorrow morning" preset — long enough to cover a full
 * sleep cycle without manually entering quiet hours, short enough that a
 * mistaken tap doesn't strand the user paused for days.
 */
function msUntilTomorrowMorning(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(7, 0, 0, 0);
  return Math.max(60_000, tomorrow.getTime() - now.getTime());
}

/**
 * iOS-only "Pause everything" controls. Drops the Shield + silences the
 * Pause Shortcut for a chosen duration. Hidden when paused — the paused
 * banner replaces it. Cheap state: every render re-reads pausedUntil() from
 * the App Group; AppState 'active' polls force re-mount.
 *
 * Why this lives here (inside LiveMenu) and not as its own component: the
 * pause directly affects what the LiveMenu shows. When paused, the menu's
 * "Right now" rows are still there (you can still tap a chore), but the
 * banner above makes clear that automated interventions are off.
 */
interface PauseControlsProps {
  /** True when paused — render the resume affordance instead of the picker. */
  pausedNow: boolean;
  /** Epoch ms of when the pause ends. Used to format the remaining label. */
  pausedUntilMs: number;
  /** After mutating, ask the parent to re-poll pause state. */
  onChange: () => void;
}

function PauseControls({ pausedNow, pausedUntilMs, onChange }: PauseControlsProps) {
  if (Platform.OS !== 'ios') return null;

  const handlePause = (durationMs: number, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void (async () => {
      try {
        await pauseBlockingFor(durationMs);
        analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
          trigger: 'pause_everything',
          duration: label,
          durationMs,
        });
      } catch (err) {
        console.warn('[LiveMenu] pauseBlockingFor failed', err);
        Alert.alert(
          "Couldn't pause",
          'Something went wrong arming the pause. Try again in a moment.',
        );
      } finally {
        onChange();
      }
    })();
  };

  const handleResume = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void (async () => {
      try {
        await resumeBlocking();
        analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
          trigger: 'resume_everything',
        });
      } catch (err) {
        console.warn('[LiveMenu] resumeBlocking failed', err);
      } finally {
        onChange();
      }
    })();
  };

  if (pausedNow) {
    const remaining = pausedUntilMs - Date.now();
    return (
      <View style={pauseStyles.pausedBanner}>
        <Ionicons name="pause-circle" size={20} color="#5C4A72" />
        <View style={{ flex: 1 }}>
          <Text style={pauseStyles.pausedTitle}>Paused</Text>
          <Text style={pauseStyles.pausedBody}>
            DopaMenu is off for the next {formatRemainingDuration(remaining)}. Apps open
            normally; the menu stays here for reference.
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleResume}
          style={pauseStyles.resumeButton}
          accessibilityLabel="Resume DopaMenu"
        >
          <Text style={pauseStyles.resumeButtonText}>Resume</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={pauseStyles.pickerRow}>
      <TouchableOpacity
        style={pauseStyles.pickerChip}
        onPress={() => handlePause(15 * 60_000, '15m')}
      >
        <Ionicons name="pause-outline" size={14} color={colors.primary} />
        <Text style={pauseStyles.pickerChipText}>Pause 15m</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={pauseStyles.pickerChip}
        onPress={() => handlePause(60 * 60_000, '1h')}
      >
        <Ionicons name="pause-outline" size={14} color={colors.primary} />
        <Text style={pauseStyles.pickerChipText}>Pause 1h</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={pauseStyles.pickerChip}
        onPress={() =>
          handlePause(msUntilTomorrowMorning(), 'until_morning')
        }
      >
        <Ionicons name="moon-outline" size={14} color={colors.primary} />
        <Text style={pauseStyles.pickerChipText}>Until 7am</Text>
      </TouchableOpacity>
    </View>
  );
}

const pauseStyles = StyleSheet.create({
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  pickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: colors.surface,
  },
  pickerChipText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  pausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: '#F4EEFB',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E2D7EC',
    marginBottom: spacing.sm,
  },
  pausedTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: '#3D354A',
  },
  pausedBody: {
    fontSize: typography.sizes.xs,
    color: '#6D6378',
    marginTop: 2,
    lineHeight: 16,
  },
  resumeButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
  },
  resumeButtonText: {
    fontSize: typography.sizes.xs,
    color: colors.textInverse,
    fontWeight: typography.weights.bold,
  },
});

function InterventionRow({
  intervention,
  isPrimary,
  onPress,
}: {
  intervention: InterventionCandidate;
  isPrimary: boolean;
  onPress: () => void;
}) {
  const effort = EFFORT_LABELS[intervention.requiredEffort] ?? '';
  const iconName = (intervention.icon as React.ComponentProps<typeof Ionicons>['name']) || 'sparkles';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.row,
        isPrimary ? styles.primaryRow : styles.altRow,
      ]}
    >
      <View
        style={[
          styles.iconTile,
          isPrimary ? styles.primaryIconTile : styles.altIconTile,
        ]}
      >
        <Ionicons
          name={iconName}
          size={isPrimary ? 22 : 18}
          color={colors.primary}
        />
      </View>
      <View style={styles.rowText}>
        <Text
          style={[styles.label, isPrimary && styles.primaryLabel]}
          numberOfLines={1}
        >
          {intervention.label}
        </Text>
        {!!effort && (
          <Text style={styles.effort} numberOfLines={1}>
            {effort}
          </Text>
        )}
      </View>
      <Ionicons
        name="chevron-forward"
        size={isPrimary ? 22 : 18}
        color={isPrimary ? colors.primary : colors.textTertiary}
      />
    </TouchableOpacity>
  );
}

interface LiveMenuProps {
  // Optional callback the home page passes so the "Edit quiet hours" link
  // can scroll to / expand the editor without LiveMenu knowing how it lives.
  onEditQuietHours?: () => void;
}

export function LiveMenu({ onEditQuietHours }: LiveMenuProps) {
  const { user } = useUserStore();
  const acceptedCount = useInterventionStore((s) => s.acceptedCount);
  const lastInterventionTime = useInterventionStore(
    (s) => s.lastInterventionTime,
  );
  const { canIntervene } = useIntervention();
  const [data, setData] = useState<LiveMenuData | null>(null);
  const [accessibilityGranted, setAccessibilityGranted] = useState<boolean>(true);

  // iOS pause state. Polled on mount, on AppState 'active', after explicit
  // pause/resume, and once per minute via interval so the "paused for X" text
  // counts down naturally. Re-reads from App Group via the kingstinct bridge.
  // pauseTick is incremented to force a re-render so isPaused()/pausedUntil()
  // re-poll their App Group values; we don't read pauseTick directly.
  const [, setPauseTick] = useState<number>(0);
  const pausedNow = Platform.OS === 'ios' ? isPaused() : false;
  const pausedUntilMs = Platform.OS === 'ios' ? pausedUntil() : 0;
  const onPauseChanged = useCallback(() => {
    setPauseTick((n) => n + 1);
  }, []);

  const refresh = useCallback(async () => {
    const next = await getLiveMenuData();
    setData(next);
  }, []);

  // Initial load + reload on user/outcomes change. The widget uses the same
  // triggers, so the two surfaces stay in lockstep.
  useEffect(() => {
    void refresh();
  }, [refresh, user?.preferences, acceptedCount, lastInterventionTime]);

  // Reload on screen focus too — covers the case where the user backgrounds
  // the app, time bucket flips, then they come back. (The widget already
  // handles foreground via the AppState listener in app/_layout.tsx.)
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Refresh on AppState 'active' so the home menu re-syncs with the widget
  // after a background/foreground cycle even if the tab stays focused.
  // Also re-check accessibility permission status (Android only) — used to
  // decide whether to show the "live menu is on but detection isn't" hint.
  useEffect(() => {
    const checkAccessibility = () => {
      if (Platform.OS !== 'android') return;
      appUsageService.checkAccessibilityPermission().then(setAccessibilityGranted);
    };
    checkAccessibility();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s !== 'active') return;
      checkAccessibility();
      void refresh();
      // Re-poll pause state on foreground — covers the case where the user
      // pauses, backgrounds DopaMenu, and comes back later. Without this,
      // the banner would show stale "30 min remaining" when they return
      // 45 minutes later (state would only refresh on next pauseTick).
      setPauseTick((n) => n + 1);
    });
    return () => sub.remove();
  }, [refresh]);

  // Tick the paused-banner countdown once per minute so "paused for X" stays
  // accurate without each render re-querying the App Group. iOS-only —
  // saves a re-render cycle on Android where pausedNow is always false.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const interval = setInterval(() => {
      setPauseTick((n) => n + 1);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const quietState = computeQuietState(user?.preferences.quietHours);

  const handleTap = useCallback(
    (intervention: InterventionCandidate) => {
      analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
        trigger: 'home_live_menu',
        interventionId: intervention.id,
      });
      void launchOrShow(intervention, {
        exitAfterLaunch: false,
        source: 'home',
      });
    },
    [],
  );

  // Permission warning banner — non-blocking, shown above the menu.
  const showAccessibilityWarning =
    Platform.OS === 'android' &&
    user?.preferences.appMonitoringEnabled === true &&
    !accessibilityGranted;

  return (
    <View>
      {showAccessibilityWarning && (
        <Card style={styles.warningCard}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.warningText}>
              Live menu is on, but app detection isn't fully active. Grant accessibility to catch
              app opens instantly.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/settings')}
            style={styles.warningCta}
          >
            <Text style={styles.warningCtaText}>Fix</Text>
          </TouchableOpacity>
        </Card>
      )}

      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="sparkles" size={16} color={colors.primary} />
            <Text style={styles.headerTitle}>Right now</Text>
          </View>
          {data && (
            <Text style={styles.headerMeta}>
              {getTimeBucketLabel(data.timeBucket)}
            </Text>
          )}
        </View>

        {/* iOS-only ad-hoc pause controls. Sits inside the card header area
            so the relationship between "Right now" and "DopaMenu is currently
            paused" is visually grouped. Hidden on Android (no analog
            mechanism in v19; the Android side already gates on quiet hours
            + per-app windows but doesn't have a global on-demand pause). */}
        {Platform.OS === 'ios' && !quietState.isQuiet && (
          <PauseControls
            pausedNow={pausedNow}
            pausedUntilMs={pausedUntilMs}
            onChange={onPauseChanged}
          />
        )}

        {quietState.isQuiet ? (
          <View style={styles.quietState}>
            <Ionicons name="moon" size={28} color={colors.primary} />
            <Text style={styles.quietTitle}>DopaMenu is quiet</Text>
            <Text style={styles.quietBody}>
              {quietState.resumeAt
                ? `Back at ${formatHHMMForDisplay(quietState.resumeAt)}. No suggestions until then.`
                : 'No suggestions during your quiet hours.'}
            </Text>
            {onEditQuietHours && (
              <TouchableOpacity onPress={onEditQuietHours} style={styles.quietEditLink}>
                <Text style={styles.quietEditText}>Edit quiet hours</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        ) : data ? (
          <View style={styles.rows}>
            <InterventionRow
              intervention={data.primary}
              isPrimary
              onPress={() => handleTap(data.primary)}
            />
            {data.alternatives.map((alt) => (
              <InterventionRow
                key={alt.id}
                intervention={alt}
                isPrimary={false}
                onPress={() => handleTap(alt)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              Finishing setup… complete onboarding to unlock your live menu.
            </Text>
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: '#FBF1E5',
    borderWidth: 1,
    borderColor: '#E8C9A0',
  },
  warningText: {
    fontSize: typography.sizes.sm,
    color: '#5A3818',
    fontWeight: typography.weights.medium,
  },
  warningCta: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: '#5A3818',
  },
  warningCtaText: {
    fontSize: typography.sizes.sm,
    color: colors.textInverse,
    fontWeight: typography.weights.semibold,
  },
  card: {
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerMeta: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  rows: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  primaryRow: {
    backgroundColor: colors.primaryFaded,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  altRow: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryIconTile: {
    backgroundColor: colors.surface,
  },
  altIconTile: {
    backgroundColor: colors.surface,
  },
  rowText: {
    flex: 1,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  primaryLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  effort: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  quietState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  quietTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  quietBody: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  quietEditLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  quietEditText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.primary,
  },
  emptyState: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default LiveMenu;
