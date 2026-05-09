/**
 * iOS-only. Wraps Apple's native FamilyActivityPicker (the one Apple-owned
 * way to pick apps on iOS — tokens are opaque and bundle IDs aren't exposed
 * to us). Single-button flow: a primary CTA that morphs based on auth +
 * selection state. No preflight blocks, no review cards — every prior tester
 * complaint about onboarding friction maps back to those.
 *
 * State machine for the primary button:
 *   auth not granted             → "Pick the apps" (taps grants + opens picker)
 *   auth granted, no selection   → "Pick the apps" (opens picker)
 *   auth granted, has selection  → "Continue (N picked) →" (calls onContinue)
 *
 * Hard requirement: iOS 16+. The Shield + DeviceActivity APIs we depend on
 * weren't added until iOS 16, so on 15.x we render a clear "update iOS"
 * gate instead of a button that silently does nothing.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../Button';
import { colors, spacing, typography } from '../../constants/theme';
import {
  getAuthorizationStatus,
  hasProblemAppSelection,
  requestFamilyControlsAuthorization,
} from '../../services/iosFamilyControls';
import { IOS_FAMILY_ACTIVITY_SELECTION_ID } from '../../constants/appGroup';
import {
  AppCatalogEntry,
  getAppById,
} from '../../constants/appCatalog';
import {
  getPreselectHints,
  PreselectHint,
} from '../../services/telemetryPreselect';
import { useInterventionStore } from '../../stores/interventionStore';
import { useUserStore } from '../../stores/userStore';

const IOS_VERSION_NUM =
  Platform.OS === 'ios' ? parseInt(String(Platform.Version), 10) : 0;
const IOS_VERSION_OK = IOS_VERSION_NUM >= 16;

let DeviceActivitySelectionSheetViewPersisted: React.ComponentType<any> | null = null;
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    DeviceActivitySelectionSheetViewPersisted =
      require('react-native-device-activity/build/DeviceActivitySelectionSheetViewPersisted')
        .default;
  } catch {
    DeviceActivitySelectionSheetViewPersisted = null;
  }
}

type Props = {
  title?: string;
  subtitle?: string;
  /** Fires after Apple's picker closes with at least one app selected. */
  onSelectionChange?: (count: number) => void;
  /**
   * Fires when the user taps the primary button while a selection is active.
   * Parents should advance to the next onboarding step here. v18.2 and prior
   * had a separate footer Continue button on the parent screen, which forced
   * users to scroll past the picker to find it; this prop pulls Continue
   * inline with the picker so it's always above the fold.
   */
  onContinue?: () => void;
};

export default function IosFamilyControlsPicker({
  title = 'Pick the apps that take the most time',
  subtitle = "iPhone will show you every app on your phone with this week's screen time. Pick the apps where the hours surprised you. We don't see the numbers — only your picks.",
  onSelectionChange,
  onContinue,
}: Props) {
  const [authStatus, setAuthStatus] = useState(getAuthorizationStatus());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectionCount, setSelectionCount] = useState(
    hasProblemAppSelection() ? 1 : 0,
  );
  const [busy, setBusy] = useState(false);
  // Telemetry hints — small per-user "Suggested for you" chip row above the
  // primary button. Only renders when analytics are on AND the user has
  // enough history. iOS 16+ can't preselect into Apple's picker (opaque
  // tokens), so this is purely guidance.
  const [telemetryHints, setTelemetryHints] = useState<
    (PreselectHint & { entry: AppCatalogEntry })[]
  >([]);
  const recentOutcomes = useInterventionStore((s) => s.recentOutcomes);
  const analyticsEnabled = useUserStore(
    (s) => s.user?.preferences.analyticsEnabled ?? false,
  );

  useEffect(() => {
    setAuthStatus(getAuthorizationStatus());
  }, []);

  // Compute telemetry hints once on mount. We don't need to probe every
  // catalog app; we only need apps with attributed outcomes that are
  // actually installed. This is much cheaper than the previous "probe all
  // popular apps" preflight that was contributing to the slow first paint.
  useEffect(() => {
    if (Platform.OS !== 'ios' || !IOS_VERSION_OK) return;
    if (!analyticsEnabled) return;
    let cancelled = false;
    (async () => {
      const candidateIds = Array.from(
        new Set(
          recentOutcomes
            .map((o) => o.triggerCatalogId)
            .filter((id): id is string => !!id),
        ),
      );
      if (candidateIds.length === 0) return;
      const candidateEntries = candidateIds
        .map((id) => getAppById(id))
        .filter((e): e is AppCatalogEntry => !!e);
      const { installedAppsService } = await import(
        '../../services/installedApps'
      );
      const candidatesInstalled =
        candidateEntries.length > 0
          ? await installedAppsService.probe(candidateEntries)
          : {};
      if (cancelled) return;
      const installedIdsForHints = candidateEntries
        .filter((e) => candidatesInstalled[e.id])
        .map((e) => e.id);
      const hints = getPreselectHints({
        outcomes: recentOutcomes,
        analyticsEnabled,
        installedIds: installedIdsForHints,
      });
      setTelemetryHints(
        hints
          .map((h) => {
            const entry = getAppById(h.catalogId);
            return entry ? { ...h, entry } : null;
          })
          .filter((h): h is PreselectHint & { entry: AppCatalogEntry } => !!h),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [recentOutcomes, analyticsEnabled]);

  // Single primary action. Combines auth + open-picker so the user only
  // sees one button regardless of which sub-state they're in.
  const handleGrantAuthAndPick = async () => {
    setBusy(true);
    try {
      // If already auth'd, skip the request and just open the picker.
      if (authStatus === 'approved') {
        setPickerOpen(true);
        return;
      }
      const ok = await requestFamilyControlsAuthorization();
      const next = getAuthorizationStatus();
      setAuthStatus(next);
      if (ok) {
        setPickerOpen(true);
      } else if (next === 'denied') {
        Alert.alert(
          'Access was blocked',
          "Looks like you tapped Don't Allow. To turn it back on: open Settings → DopaMenu → Screen Time, switch it on, then come back.",
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Not now', style: 'cancel' },
          ],
        );
      } else {
        Alert.alert(
          'Try once more',
          "iPhone didn't get a clear answer. Tap the button again — when you see the prompt, tap Allow.",
        );
      }
    } catch (err: any) {
      Alert.alert(
        'Something went wrong',
        err?.message || String(err) || 'Unknown error from iPhone. Try once more.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePrimaryTap = () => {
    if (selectionCount > 0 && authStatus === 'approved') {
      // Has selection → Continue.
      onContinue?.();
      return;
    }
    // No selection → open picker (granting auth first if needed).
    void handleGrantAuthAndPick();
  };

  if (Platform.OS !== 'ios') return null;

  if (!IOS_VERSION_OK) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.gate}>
          <Ionicons
            name="information-circle-outline"
            size={28}
            color="#9B7BB8"
            style={{ marginBottom: spacing.sm }}
          />
          <Text style={styles.gateBody}>
            Your iPhone is on iOS {String(Platform.Version)}. The part of
            DopaMenu that politely interrupts you when you open Instagram or
            TikTok needs <Text style={styles.bold}>iOS 16 or later</Text> —
            Apple only made those tools available starting with iOS 16.
          </Text>
          <Text style={styles.gateBody}>
            Update your iPhone in Settings → General → Software Update, or
            tap Skip and you can still use the rest of DopaMenu without
            in-the-moment app blocking.
          </Text>
        </View>
      </View>
    );
  }

  if (!DeviceActivitySelectionSheetViewPersisted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.gate}>
          <Text style={styles.gateBody}>
            Something's wrong with this build — the on-device Screen Time
            module didn't load. Try uninstalling DopaMenu and reinstalling
            the latest build.
          </Text>
        </View>
      </View>
    );
  }

  // Primary button title morphs based on state. Single button on screen,
  // no scroll required to reach it on any iPhone size.
  const primaryTitle = busy
    ? 'Waiting on iPhone…'
    : selectionCount > 0 && authStatus === 'approved'
    ? 'Continue →'
    : 'Pick the apps';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {/* Telemetry hints — small chip row, only when present. Personal
          per-user signal: "you've been struggling with these lately, look
          for them in Apple's picker." Empty for new users; never shown
          when analytics are off. */}
      {telemetryHints.length > 0 ? (
        <View style={styles.hintBlock}>
          <Text style={styles.hintHeader}>Suggested for you</Text>
          <View style={styles.hintRow}>
            {telemetryHints.slice(0, 3).map((h) => (
              <View key={h.catalogId} style={styles.hintChip}>
                <Ionicons name="trending-up" size={12} color="#7A5BA0" />
                <Text style={styles.hintChipText}>{h.entry.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* iOS 16.x category drill-down hint. Apple's picker on 16.x renders
          the chevron smaller than 17+, users miss it and accidentally
          select-all categories. Only shown when relevant. */}
      {IOS_VERSION_NUM >= 16 && IOS_VERSION_NUM < 17 ? (
        <View style={styles.iosNote}>
          <Ionicons name="information-circle" size={14} color="#7A6F85" />
          <Text style={styles.iosNoteText}>
            Tap the small <Text style={{ fontWeight: '700' }}>{'›'}</Text> at
            the right end of each category to see individual apps. Tapping the
            row name selects the whole category.
          </Text>
        </View>
      ) : null}

      {/* The primary action. Single button, always visible above the fold. */}
      <Button
        title={primaryTitle}
        onPress={handlePrimaryTap}
        disabled={busy}
        size="large"
        fullWidth
      />

      {/* Tiny "saved" confirmation when a selection exists. Replaces the
          v18.2 review card — the count + tappable-Continue button gives
          enough feedback without an extra confirmation gate. */}
      {selectionCount > 0 && authStatus === 'approved' && !busy ? (
        <Pressable
          style={styles.changeLink}
          onPress={() => setPickerOpen(true)}
        >
          <Text style={styles.changeLinkText}>
            Change which apps you picked
          </Text>
        </Pressable>
      ) : null}

      {busy ? (
        <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary} />
      ) : null}

      {authStatus === 'denied' ? (
        <Text style={styles.statusLine}>
          Blocked — tap above to retry, or open Settings → DopaMenu.
        </Text>
      ) : null}

      {pickerOpen ? (
        <DeviceActivitySelectionSheetViewPersisted
          familyActivitySelectionId={IOS_FAMILY_ACTIVITY_SELECTION_ID}
          headerText="Pick the apps with the highest hours"
          footerText="You can change this any time from DopaMenu's settings."
          includeEntireCategory
          onSelectionChange={() => {
            const next = hasProblemAppSelection() ? 1 : 0;
            setSelectionCount(next);
            onSelectionChange?.(next);
          }}
          onDismissRequest={() => setPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  gate: {
    backgroundColor: '#F4EEFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2D7EC',
    padding: spacing.md,
    gap: spacing.sm,
  },
  gateBody: {
    fontSize: typography.sizes.sm,
    color: '#3D354A',
    lineHeight: 20,
  },
  bold: {
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  // Compact telemetry-hint block: just a header + chip row. No copy
  // explanation — the chip-row visual + "Suggested for you" header is
  // enough context. Old version had a paragraph explaining the chips
  // which doubled the block height.
  hintBlock: {
    marginBottom: spacing.md,
    gap: 6,
  },
  hintHeader: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  hintChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F4EEFB',
    borderColor: '#E2D7EC',
    borderWidth: 1,
    borderRadius: 999,
  },
  hintChipText: {
    fontSize: typography.sizes.xs,
    color: '#5C4A72',
    fontWeight: typography.weights.semibold,
  },
  iosNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#F2EEF7',
    borderRadius: 8,
    padding: 10,
    marginBottom: spacing.md,
  },
  iosNoteText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    color: '#6D6378',
    lineHeight: 17,
  },
  changeLink: {
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: 6,
  },
  changeLinkText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
    textDecorationLine: 'underline',
  },
  statusLine: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
