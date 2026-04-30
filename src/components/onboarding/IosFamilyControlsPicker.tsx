/**
 * iOS-only. Wraps Apple's native FamilyActivityPicker (the one Apple-owned
 * way to pick apps on iOS — tokens are opaque and bundle IDs aren't exposed
 * to us). Around it we render our own "preflight" UI: detect which popular
 * apps the user actually has, show those as a heads-up so they know what to
 * look for in Apple's picker, and offer App Store deep links for any popular
 * ones they don't have yet.
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
  ScrollView,
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
  getPopularProblemApps,
  getStoreUrl,
} from '../../constants/appCatalog';
import { installedAppsService } from '../../services/installedApps';
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
  onSelectionChange?: (count: number) => void;
  /**
   * Fires after the user has explicitly confirmed in the review step that
   * the apps they picked match what they meant. Parents should ONLY treat
   * the selection as "ready to continue" after this fires — bare
   * onSelectionChange means "Apple has tokens" but doesn't mean the user
   * actually verified their picks against their own usage.
   */
  onSelectionReviewed?: (reviewed: boolean) => void;
};

type PopularDetection = {
  app: AppCatalogEntry;
  installed: boolean;
};

export default function IosFamilyControlsPicker({
  // Reframed copy. Old subtitle led with "iPhone needs your OK" — fine but
  // it buried the most useful framing fact about Apple's picker: it shows
  // the user their own per-app screen time inline, in hours-minutes, right
  // next to each app row. New subtitle primes that, so the user opens the
  // picker already thinking "what's eaten the most time" instead of
  // "which icons should I tap." We also keep the privacy reassurance,
  // because tester feedback says this is the moment users worry most.
  title = 'Pick the apps that take the most time',
  subtitle = "In a moment, iPhone will show you every app on your phone with this week's screen time printed next to each one. Use those numbers — pick the apps where the hours surprised you. We don't see the numbers, only your picks.",
  onSelectionChange,
  onSelectionReviewed,
}: Props) {
  const [authStatus, setAuthStatus] = useState(getAuthorizationStatus());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectionCount, setSelectionCount] = useState(
    hasProblemAppSelection() ? 1 : 0,
  );
  // The user has to explicitly confirm the picks reflect their highest-time
  // apps before we treat the selection as "ready." This is the antidote to
  // the "I picked something and now I'm not sure" tester feedback. Pre-
  // filled true ONLY when there was already a saved selection from a prior
  // run (returning users shouldn't have to re-confirm every onboarding).
  const [reviewed, setReviewed] = useState(hasProblemAppSelection());
  const [busy, setBusy] = useState(false);
  const [popular, setPopular] = useState<PopularDetection[] | null>(null);
  // Telemetry hints — a small per-user "you've been struggling with X, Y, Z
  // lately, look for them in Apple's picker" surface. iOS 16+ uses Apple's
  // picker which we cannot preselect into (only opaque tokens come back), so
  // we surface this as guidance instead. Empty when telemetry is off or the
  // user lacks enough history.
  const [telemetryHints, setTelemetryHints] = useState<
    (PreselectHint & { entry: AppCatalogEntry })[]
  >([]);
  const recentOutcomes = useInterventionStore((s) => s.recentOutcomes);
  const analyticsEnabled = useUserStore(
    (s) => s.user?.preferences.analyticsEnabled ?? false,
  );

  // Bubble the reviewed-state up so the parent's Continue button can be
  // gated on it. Sync on every change so toggling re-pick clears it.
  useEffect(() => {
    onSelectionReviewed?.(reviewed);
  }, [reviewed, onSelectionReviewed]);

  useEffect(() => {
    setAuthStatus(getAuthorizationStatus());
  }, []);

  // Probe which of our popular apps are actually on the phone, so we can
  // tell the user "look for these in Apple's picker" + offer install links
  // for the ones they don't have. Runs once.
  useEffect(() => {
    if (Platform.OS !== 'ios' || !IOS_VERSION_OK) return;
    let cancelled = false;
    (async () => {
      const apps = getPopularProblemApps();
      const installed = await installedAppsService.probe(apps);
      if (cancelled) return;
      setPopular(apps.map((a) => ({ app: a, installed: !!installed[a.id] })));

      // Compute telemetry-derived hints. We need the installed-id list from
      // the broader catalog (not just popular) to resolve hints to apps the
      // user actually has — telemetry might surface apps that aren't in the
      // popular set (e.g. user is uniquely struggling with Pinterest).
      // Probe the full set of catalog ids referenced in their telemetry.
      const candidateIds = Array.from(
        new Set(
          recentOutcomes
            .map((o) => o.triggerCatalogId)
            .filter((id): id is string => !!id),
        ),
      );
      const candidateEntries = candidateIds
        .map((id) => getAppById(id))
        .filter((e): e is AppCatalogEntry => !!e);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentOutcomes, analyticsEnabled]);

  const handleGrantAuth = async () => {
    setBusy(true);
    try {
      const ok = await requestFamilyControlsAuthorization();
      const next = getAuthorizationStatus();
      setAuthStatus(next);
      if (ok) {
        setPickerOpen(true);
      } else if (next === 'denied') {
        Alert.alert(
          'Access was blocked',
          "Looks like you tapped Don't Allow on the iPhone prompt. To turn it back on: open Settings → DopaMenu → Screen Time, switch it on, then come back here.",
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Not now', style: 'cancel' },
          ],
        );
      } else {
        // notDetermined / unknown — usually means iPhone's prompt got dismissed
        // without an explicit choice. Just let them try again.
        Alert.alert(
          'Try once more',
          "iPhone didn't get a clear answer. Tap the button again — when you see the iPhone prompt, tap Allow.",
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

  const openStore = async (app: AppCatalogEntry) => {
    const url = getStoreUrl(app, 'ios');
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      // ignore — the user can find it themselves
    }
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

  // Section: which of our popular suggestions live on this phone?
  const onPhone = popular?.filter((p) => p.installed) ?? [];
  const offPhone = popular?.filter((p) => !p.installed) ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {/* Preflight: what we found on this phone */}
      {popular === null ? (
        <View style={styles.probing}>
          <ActivityIndicator color="#9B7BB8" />
          <Text style={styles.probingText}>Checking what's on your phone…</Text>
        </View>
      ) : (
        <View style={styles.preflight}>
          {/* Personalized hints from DopaMenu's own telemetry. Only renders
              when the user has analytics on AND enough history; otherwise
              we fall back to the static "popular" detected list below. The
              hint copy is honest about WHY each app is suggested ("you've
              continued past it 12 times") so the user can recognize the
              suggestion rather than feeling like we're guessing. iOS 16+
              can't preselect into Apple's picker (opaque tokens), so this
              is purely guidance — they still have to tap manually. */}
          {telemetryHints.length > 0 ? (
            <View style={styles.hintBlock}>
              <Text style={styles.hintHeader}>
                Suggested for you — based on the last few weeks
              </Text>
              <View style={styles.detectedRow}>
                {telemetryHints.map((h) => (
                  <View key={h.catalogId} style={styles.hintChip}>
                    <Ionicons name="trending-up" size={14} color="#7A5BA0" />
                    <Text style={styles.hintChipText}>{h.entry.label}</Text>
                    <Text style={styles.hintChipMeta}>
                      {h.continuedCount > 0
                        ? `${h.continuedCount}× continued`
                        : `${h.triggers}× opened`}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.preflightHint}>
                These are the apps where you've struggled most lately. Look for
                them in Apple's picker — Apple won't pre-check them, but they're
                the ones to flag.
              </Text>
            </View>
          ) : null}

          {onPhone.length > 0 ? (
            <>
              <Text style={styles.preflightHeader}>
                {telemetryHints.length > 0
                  ? 'Also commonly picked, and on your phone:'
                  : 'We see these on your phone — most people block all four:'}
              </Text>
              <View style={styles.detectedRow}>
                {onPhone.map(({ app }) => (
                  <View key={app.id} style={styles.detectedChip}>
                    <Ionicons name="checkmark-circle" size={14} color="#3B7A4B" />
                    <Text style={styles.detectedChipText}>{app.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.preflightHint}>
                When Apple's picker opens next, look for these in the list and
                tap each one. Add anything else that pulls you in too.
              </Text>
            </>
          ) : (
            <Text style={styles.preflightHeader}>
              We didn't spot any of the usual suspects (Instagram, TikTok,
              YouTube, Reddit) on this phone — pick whatever apps you want
              gentler with in the picker below.
            </Text>
          )}

          {offPhone.length > 0 ? (
            <View style={styles.missingBlock}>
              <Text style={styles.missingHeader}>
                Want to add any of these? Tap to install, then come back.
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.missingRow}>
                  {offPhone.map(({ app }) => (
                    <Pressable
                      key={app.id}
                      onPress={() => openStore(app)}
                      style={styles.missingChip}
                    >
                      <Ionicons name="logo-apple-appstore" size={14} color="#7A5BA0" />
                      <Text style={styles.missingChipText}>{app.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}
        </View>
      )}

      {authStatus !== 'approved' ? (
        <View style={styles.authBlock}>
          <Text style={styles.authBody}>
            Tap below. iPhone will pop up one prompt asking if DopaMenu can
            use Screen Time — tap Allow. That's it. We use it only to put a
            soft pause in front of the apps you pick.
          </Text>
          <Button
            title={busy ? 'Waiting on iPhone…' : 'Pick the apps'}
            onPress={handleGrantAuth}
            disabled={busy}
            size="large"
            fullWidth
          />
          {busy ? (
            <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary} />
          ) : null}
          {authStatus === 'denied' ? (
            <Text style={styles.statusLine}>
              Blocked — tap above to retry, or open Settings → DopaMenu.
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.pickerBlock}>
          <Text style={styles.selectionSummary}>
            {selectionCount > 0
              ? "Saved. Tap below if you want to change it."
              : 'Tap below to pick the apps you want gentler with.'}
          </Text>
          <Button
            title={selectionCount > 0 ? 'Change selection' : 'Pick apps'}
            onPress={() => {
              // Re-picking always invalidates "reviewed" — the user is
              // about to change their mind, the previous confirmation no
              // longer applies. They'll re-confirm when they come back.
              setReviewed(false);
              setPickerOpen(true);
            }}
            size="large"
            fullWidth
          />
          {/* Review sub-step. Apple's picker lets users tap apps without
              ever seeing a "you're done, are you sure?" moment. We add it
              here because tester feedback was "I picked something but I'm
              not sure" — the review card forces a deliberate "yes, those
              are my top apps" before we let them advance. We don't list
              the picked apps (Apple's tokens are opaque), but the count +
              prompt is enough to make them think about it. */}
          {selectionCount > 0 && !reviewed ? (
            <View style={[styles.reviewCard, { marginTop: spacing.md }]}>
              <Ionicons
                name="help-circle"
                size={20}
                color="#9B7BB8"
              />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.reviewTitle}>Take a second look</Text>
                <Text style={styles.reviewBody}>
                  Are the apps you just picked the ones with the highest hours
                  this week? If something obvious is missing, change selection
                  before continuing.
                </Text>
                <View style={styles.reviewButtonRow}>
                  <Pressable
                    onPress={() => setReviewed(true)}
                    style={({ pressed }) => [
                      styles.reviewPrimary,
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Confirm my picks"
                  >
                    <Text style={styles.reviewPrimaryText}>
                      Yes, looks right
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setReviewed(false);
                      setPickerOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.reviewSecondary,
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Re-pick the apps"
                  >
                    <Text style={styles.reviewSecondaryText}>
                      Let me re-pick
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
          {selectionCount > 0 && reviewed ? (
            <View style={[styles.reviewedBadge, { marginTop: spacing.sm }]}>
              <Ionicons name="checkmark-circle" size={16} color="#3B7A4B" />
              <Text style={styles.reviewedBadgeText}>
                Confirmed. Continue when you're ready.
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {pickerOpen ? (
        <DeviceActivitySelectionSheetViewPersisted
          familyActivitySelectionId={IOS_FAMILY_ACTIVITY_SELECTION_ID}
          headerText="Pick the apps with the highest hours"
          footerText="You can change this any time from DopaMenu's settings."
          includeEntireCategory
          onSelectionChange={() => {
            const next = hasProblemAppSelection() ? 1 : 0;
            setSelectionCount(next);
            // New picks invalidate the prior review — the user has to
            // re-confirm whether THIS selection is right.
            setReviewed(false);
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
  preflight: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAE2F1',
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  preflightHeader: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    fontWeight: typography.weights.semibold,
    lineHeight: 20,
  },
  preflightHint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  detectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#E5F3E8',
    borderRadius: 999,
  },
  detectedChipText: {
    fontSize: typography.sizes.xs,
    color: '#3B7A4B',
    fontWeight: typography.weights.semibold,
  },
  missingBlock: {
    marginTop: spacing.xs,
    gap: 4,
  },
  missingHeader: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  missingRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  missingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F4EEFB',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2D7EC',
  },
  missingChipText: {
    fontSize: typography.sizes.xs,
    color: '#7A5BA0',
    fontWeight: typography.weights.semibold,
  },
  authBlock: {
    gap: spacing.sm,
  },
  authBody: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  pickerBlock: {
    gap: spacing.sm,
  },
  selectionSummary: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  statusLine: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  bold: {
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  probing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
  probingText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  // "Take a second look" review card. Soft purple to feel like a friendly
  // double-check, not a warning. Lives between Apple's picker dismiss and
  // the parent's Continue button so the user can't sleepwalk past their
  // own selection.
  reviewCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#F4EEFB',
    borderColor: '#E2D7EC',
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.md,
  },
  reviewTitle: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    fontWeight: typography.weights.bold,
  },
  reviewBody: {
    fontSize: typography.sizes.xs,
    color: '#6D6378',
    lineHeight: 18,
  },
  reviewButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  reviewPrimary: {
    backgroundColor: '#9B7BB8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  reviewPrimaryText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
  },
  reviewSecondary: {
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C9B4E2',
  },
  reviewSecondaryText: {
    color: '#5C4A72',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
  },
  reviewedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E5F3E8',
    borderColor: '#B7DFC0',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  reviewedBadgeText: {
    fontSize: typography.sizes.xs,
    color: '#2E5535',
    fontWeight: typography.weights.semibold,
  },
  // Telemetry-derived hint block. Visually distinct from the static
  // "popular detected" block — the personal-brand purple instead of
  // green-checkmark — so the user can tell "this is YOU" vs "this is
  // a generic popular pick."
  hintBlock: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#EAE2F1',
    marginBottom: spacing.sm,
    gap: 6,
  },
  hintHeader: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    fontWeight: typography.weights.bold,
  },
  hintChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#F4EEFB',
    borderColor: '#E2D7EC',
    borderWidth: 1,
    borderRadius: 999,
  },
  hintChipText: {
    fontSize: typography.sizes.xs,
    color: '#5C4A72',
    fontWeight: typography.weights.bold,
  },
  hintChipMeta: {
    fontSize: typography.sizes.xs,
    color: '#9B7BB8',
    fontWeight: typography.weights.medium,
    marginLeft: 2,
  },
});
