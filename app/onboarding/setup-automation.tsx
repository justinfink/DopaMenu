/**
 * Tap-free mode setup walkthrough (iOS).
 *
 * The point: the Personal Automation that bridges Shortcuts.app → DopaMenu
 * cannot be created programmatically — Apple has hard-blocked that since
 * iOS 14 as a security boundary. The cleanest possible setup is therefore
 *  (1) make the action our App Intent so it auto-appears in Shortcuts.app
 *      under DopaMenu's name (no URL typing),
 *  (2) deep-link the user straight to `shortcuts://create-automation`,
 *  (3) show them in DopaMenu — BEFORE they jump out — exactly which apps
 *      to multi-select, so the otherwise-unfamiliar Shortcuts UI feels
 *      pattern-matched.
 *
 * After they tap "Open Shortcuts," they leave DopaMenu, do ~6 taps in
 * Apple's UI, return. Our AppState listener in app/_layout.tsx catches the
 * automation's first fire and (a) routes them into the intervention modal
 * for live confirmation, and (b) sets `iosAutomationConfigured: true` so
 * we never nag them about setup again.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Platform,
  Linking,
  AppState,
  AppStateStatus,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button } from '../../src/components';
import { useUserStore } from '../../src/stores/userStore';
import { lastAutomationTriggerAt } from '../../src/services/iosFamilyControls';
import { APP_CATALOG } from '../../src/constants/appCatalog';
import { colors, spacing, typography } from '../../src/constants/theme';
import { useResponsive } from '../../src/utils/responsive';

const SHORTCUTS_DEEPLINK = 'shortcuts://create-automation';
const SHORTCUTS_FALLBACK_DEEPLINK = 'shortcuts://';

// iOS 15 fallback: AppIntents framework only exists on iOS 16+. So on iOS 15
// our "Take a Pause" action doesn't auto-appear in Shortcuts.app. The
// alternative is an iCloud-signed shortcut that the user installs once,
// then references in their Personal Automation as "Run Shortcut → DopaMenu
// Pause." The iCloud URL below is permanent — generated from a one-time
// upload of a hand-built shortcut whose only action is
// "Open URL dopamenu://intervention?source=automation". When fired, our
// existing handleDeepLink in app/_layout.tsx routes to the intervention
// modal exactly as the AppIntent path does.
const ICLOUD_SHORTCUT_URL =
  'https://www.icloud.com/shortcuts/b42c29cf21054d118c21a631f9ec8e78';

// iOS 16+ has the AppIntent registered automatically via
// DopaMenuAppShortcutsProvider in DopaMenuAppIntents.swift. iOS 15 needs the
// iCloud-shared shortcut import flow. We dispatch the walkthrough off this.
const IOS_VERSION_NUM =
  Platform.OS === 'ios' ? parseInt(String(Platform.Version), 10) : 0;
const NEEDS_ICLOUD_SHORTCUT = Platform.OS === 'ios' && IOS_VERSION_NUM < 16;

export default function SetupAutomationScreen() {
  const r = useResponsive();
  const { user, updatePreferences } = useUserStore();
  // `from=onboarding` tells us this screen is the LAST step of the new-user
  // flow (after permissions, before /(tabs)). In that mode "go back" doesn't
  // make sense — the back-stack contains the permissions screen we just
  // replace()'d off, and either way we want the user to land on the home tab
  // when they're done. From Settings, this screen is router.push()'d and
  // router.back() is the correct return path.
  const params = useLocalSearchParams<{ from?: string }>();
  const fromOnboarding = params.from === 'onboarding';

  // Single source of truth for "where do we send the user when they're done
  // here, by skip or by success?" — keeps the handful of exit points below
  // honest about which mode we're in.
  const exitToHome = React.useCallback(() => {
    if (fromOnboarding) {
      router.replace('/(tabs)');
    } else {
      router.back();
    }
  }, [fromOnboarding]);

  // Surface tracked apps as a visual list so the user knows exactly which
  // apps to tap on the next screen. On iOS our trackedApps store can be
  // empty (Family Controls tokens are opaque), so we fall back to a generic
  // "the apps you picked in step 1" hint when we don't have explicit names.
  const trackedApps = useMemo(() => {
    const fromStore = (user?.preferences.trackedApps ?? [])
      .filter((a) => a.enabled)
      .map((a) => ({
        label: a.label,
        catalogId: a.catalogId,
        iosBundleId: a.iosBundleId,
      }));
    return fromStore;
  }, [user]);

  const [waitingForAutomation, setWaitingForAutomation] = useState(false);
  const lastSeenStampRef = React.useRef(lastAutomationTriggerAt());

  // While they're in Shortcuts.app, watch for the automation's first fire.
  // Foreground returns trigger the App Group stamp check; if the stamp moved
  // forward, it means they actually wired it up. We mark configured + show
  // a confirmation, then return them to settings.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      const now = lastAutomationTriggerAt();
      if (now > lastSeenStampRef.current) {
        lastSeenStampRef.current = now;
        updatePreferences({ iosAutomationConfigured: true });
        setWaitingForAutomation(false);
        Alert.alert(
          "You're set up.",
          "DopaMenu will now step in instantly when you open one of those apps. You can adjust which apps any time from Settings.",
          [{ text: 'Great', onPress: exitToHome }],
        );
      }
    });
    return () => sub.remove();
  }, [updatePreferences]);

  const openShortcuts = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWaitingForAutomation(true);
    try {
      await Linking.openURL(SHORTCUTS_DEEPLINK);
    } catch {
      // Some iOS versions don't accept the undocumented create-automation
      // deeplink. Fall back to opening Shortcuts.app's home; the user lands
      // one tap away from the right place.
      try {
        await Linking.openURL(SHORTCUTS_FALLBACK_DEEPLINK);
      } catch {
        Alert.alert(
          "Couldn't open Shortcuts",
          "Open the Shortcuts app yourself, then tap the Automation tab.",
        );
        setWaitingForAutomation(false);
      }
    }
  };

  // iOS 15 step 1: install the iCloud-shared shortcut. Universal link to
  // iCloud auto-routes to Shortcuts.app, which presents the import preview
  // ("Add Shortcut?"). User taps once. Shortcut is named "DopaMenu Pause"
  // with a single Open URL action — no further configuration needed.
  const installICloudShortcut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Linking.openURL(ICLOUD_SHORTCUT_URL);
    } catch {
      Alert.alert(
        "Couldn't reach iCloud",
        "Make sure you're online, then tap again. Or paste this URL into Safari yourself: " +
          ICLOUD_SHORTCUT_URL,
      );
    }
  };

  if (Platform.OS !== 'ios') {
    // Shouldn't happen — this screen is iOS-only — but bail safely if Android
    // somehow lands here.
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.center, { padding: r.scale(24) }]}>
          <Text style={styles.body}>Tap-free mode is iPhone-only.</Text>
          <Button title="Back" onPress={() => router.back()} fullWidth size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (waitingForAutomation) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.center, { padding: r.scale(24) }]}>
          <Ionicons name="hourglass-outline" size={r.scale(48)} color={colors.primary} />
          <Text style={[styles.title, { fontSize: r.ms(22), marginTop: spacing.lg }]}>
            Waiting for your first automation
          </Text>
          <Text style={[styles.body, { fontSize: r.ms(14), textAlign: 'center', marginTop: spacing.sm }]}>
            Open one of the apps you just picked (like Instagram). DopaMenu
            should pop up before the app does. Come back here when it works,
            or tap below if something didn't go right.
          </Text>
          <View style={{ height: spacing.xl }} />
          <Button
            title="Try setup again"
            onPress={openShortcuts}
            fullWidth
            size="large"
          />
          <Pressable
            onPress={exitToHome}
            style={{ marginTop: spacing.md }}
          >
            <Text style={[styles.linkText, { fontSize: r.ms(14) }]}>I'll come back later</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: r.scale(20) }]}
      >
        {/* Hide the back chevron when this is the last onboarding step. The
            previous screen is permissions, which we replace()'d off — going
            "back" there would land the user in a half-broken state. From
            Settings the back arrow is the right behavior. */}
        {!fromOnboarding ? (
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={r.scale(22)} color={colors.textSecondary} />
            <Text style={[styles.backText, { fontSize: r.ms(15) }]}>Back</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.eyebrow, { fontSize: r.ms(11) }]}>
          {fromOnboarding ? 'LAST STEP · 30 SECONDS' : 'TAP-FREE MODE · 30 SECONDS'}
        </Text>
        <Text style={[styles.title, { fontSize: r.ms(28), marginTop: 4 }]}>
          One last setup.
        </Text>
        <Text style={[styles.subtitle, { fontSize: r.ms(15) }]}>
          {fromOnboarding ? (
            <>
              This is the part that makes DopaMenu actually work — a tiny
              Shortcuts automation so we step in <Text style={styles.bold}>before</Text>{' '}
              the app opens, instead of after. Apple won't let us do it for
              you, but it's about 30 seconds of tapping.
            </>
          ) : (
            <>
              DopaMenu can step in <Text style={styles.bold}>before</Text> the app
              opens — you tap Instagram, DopaMenu appears instantly, no Shield to
              tap through. Apple needs you to set this up once.
            </>
          )}
        </Text>

        <View style={[styles.card, { padding: r.scale(16), marginTop: r.scale(20) }]}>
          <Text style={[styles.cardTitle, { fontSize: r.ms(15) }]}>
            What you'll do next
          </Text>

          {NEEDS_ICLOUD_SHORTCUT ? (
            <View style={[styles.step, { marginTop: spacing.md }]}>
              <View style={[styles.stepNum, { width: r.scale(24), height: r.scale(24) }]}>
                <Text style={[styles.stepNumText, { fontSize: r.ms(12) }]}>1</Text>
              </View>
              <Text style={[styles.stepText, { fontSize: r.ms(14) }]}>
                Tap <Text style={styles.bold}>Add the DopaMenu Pause shortcut</Text>{' '}
                below. Shortcuts will open and ask "Add Shortcut?" — tap{' '}
                <Text style={styles.bold}>Add Shortcut</Text>.
              </Text>
            </View>
          ) : null}

          <View style={[styles.step, { marginTop: spacing.md }]}>
            <View style={[styles.stepNum, { width: r.scale(24), height: r.scale(24) }]}>
              <Text style={[styles.stepNumText, { fontSize: r.ms(12) }]}>
                {NEEDS_ICLOUD_SHORTCUT ? '2' : '1'}
              </Text>
            </View>
            <Text style={[styles.stepText, { fontSize: r.ms(14) }]}>
              {NEEDS_ICLOUD_SHORTCUT
                ? 'Then tap Open Shortcuts (Apple’s app, blue icon).'
                : "We'll open the Shortcuts app to the right screen."}
            </Text>
          </View>

          <View style={styles.step}>
            <View style={[styles.stepNum, { width: r.scale(24), height: r.scale(24) }]}>
              <Text style={[styles.stepNumText, { fontSize: r.ms(12) }]}>
                {NEEDS_ICLOUD_SHORTCUT ? '3' : '2'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepText, { fontSize: r.ms(14) }]}>
                Tap <Text style={styles.bold}>Open App</Text>, then tap{' '}
                {trackedApps.length > 0
                  ? 'each of these to add them all:'
                  : 'each app you picked in step 1:'}
              </Text>
              {trackedApps.length > 0 ? (
                <View style={styles.appPreviewRow}>
                  {trackedApps.map((a) => (
                    <View key={a.catalogId ?? a.label} style={styles.appPreviewChip}>
                      <Text style={[styles.appPreviewChipText, { fontSize: r.ms(12) }]}>
                        {a.label}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.step}>
            <View style={[styles.stepNum, { width: r.scale(24), height: r.scale(24) }]}>
              <Text style={[styles.stepNumText, { fontSize: r.ms(12) }]}>
                {NEEDS_ICLOUD_SHORTCUT ? '4' : '3'}
              </Text>
            </View>
            <Text style={[styles.stepText, { fontSize: r.ms(14) }]}>
              {NEEDS_ICLOUD_SHORTCUT ? (
                <>
                  Tap Next. In the action list, search{' '}
                  <Text style={styles.bold}>Run Shortcut</Text> → tap it →
                  pick <Text style={styles.bold}>DopaMenu Pause</Text>.
                </>
              ) : (
                <>
                  Tap Next, then in the action list tap{' '}
                  <Text style={styles.bold}>DopaMenu</Text> →{' '}
                  <Text style={styles.bold}>Take a Pause</Text>.
                </>
              )}
            </Text>
          </View>

          <View style={styles.step}>
            <View style={[styles.stepNum, { width: r.scale(24), height: r.scale(24) }]}>
              <Text style={[styles.stepNumText, { fontSize: r.ms(12) }]}>
                {NEEDS_ICLOUD_SHORTCUT ? '5' : '4'}
              </Text>
            </View>
            <Text style={[styles.stepText, { fontSize: r.ms(14) }]}>
              Tap Done. That's it — come back here.
            </Text>
          </View>
        </View>

        <View style={[styles.note, { padding: r.scale(12), marginTop: r.scale(16) }]}>
          <Ionicons name="information-circle" size={r.scale(16)} color="#7A6F85" />
          <Text style={[styles.noteText, { fontSize: r.ms(12) }]}>
            You're not coding anything — Apple's UI does the work. Once it's
            set, DopaMenu's intervention takes over <Text style={styles.bold}>before</Text>
            {' '}those apps load. If you skip, you'll still see Apple's Shield when
            you open them, but it can't reliably open DopaMenu for you — this
            step is what makes that work.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { padding: r.scale(20) }]}>
        {NEEDS_ICLOUD_SHORTCUT ? (
          <>
            <Button
              title="Add the DopaMenu Pause shortcut"
              onPress={installICloudShortcut}
              fullWidth
              size="large"
            />
            <View style={{ height: spacing.sm }} />
            <Button
              title="Then open Shortcuts"
              onPress={openShortcuts}
              fullWidth
              size="large"
            />
          </>
        ) : (
          <Button title="Open Shortcuts" onPress={openShortcuts} fullWidth size="large" />
        )}
        <Pressable onPress={exitToHome} style={{ marginTop: spacing.md }}>
          <Text style={[styles.linkText, { fontSize: r.ms(14) }]}>
            {fromOnboarding ? "I'll set this up later" : 'Skip for now'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  backText: { color: colors.textSecondary, fontWeight: '500' },
  eyebrow: { color: '#9B7BB8', fontWeight: '700', letterSpacing: 1.2 },
  title: { color: colors.textPrimary, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
  bold: { fontWeight: typography.weights.bold, color: colors.textPrimary },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAE2F1',
  },
  cardTitle: { color: colors.textPrimary, fontWeight: '700' },
  step: {
    flexDirection: 'row',
    gap: 12,
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
  stepNum: {
    backgroundColor: '#F4EEFB',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2D7EC',
  },
  stepNumText: { color: '#5C4A72', fontWeight: '700' },
  stepText: { flex: 1, color: '#3D354A', lineHeight: 22 },
  appPreviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
  },
  appPreviewChip: {
    backgroundColor: '#F4EEFB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2D7EC',
  },
  appPreviewChipText: { color: '#5C4A72', fontWeight: '600' },
  note: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#F2EEF7',
    borderRadius: 12,
  },
  noteText: { flex: 1, color: '#6D6378', lineHeight: 18 },
  footer: { borderTopWidth: 1, borderTopColor: '#EAE2F1' },
  linkText: { color: colors.primary, fontWeight: '600', textAlign: 'center' },
  body: { color: colors.textSecondary, fontSize: 14 },
});
