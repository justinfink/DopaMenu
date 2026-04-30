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
  getPopularProblemApps,
  getStoreUrl,
} from '../../constants/appCatalog';
import { installedAppsService } from '../../services/installedApps';

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
};

type PopularDetection = {
  app: AppCatalogEntry;
  installed: boolean;
};

export default function IosFamilyControlsPicker({
  title = 'Pick the apps that pull you in',
  subtitle = 'iPhone needs your OK to let DopaMenu step in when you open these apps. Your selection stays on your device — we never see which apps you chose.',
  onSelectionChange,
}: Props) {
  const [authStatus, setAuthStatus] = useState(getAuthorizationStatus());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectionCount, setSelectionCount] = useState(
    hasProblemAppSelection() ? 1 : 0,
  );
  const [busy, setBusy] = useState(false);
  const [popular, setPopular] = useState<PopularDetection[] | null>(null);

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
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          {onPhone.length > 0 ? (
            <>
              <Text style={styles.preflightHeader}>
                We see these on your phone — most people block all four:
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
            onPress={() => setPickerOpen(true)}
            size="large"
            fullWidth
          />
        </View>
      )}

      {pickerOpen ? (
        <DeviceActivitySelectionSheetViewPersisted
          familyActivitySelectionId={IOS_FAMILY_ACTIVITY_SELECTION_ID}
          headerText="Pick the apps you want gentler with"
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
});
