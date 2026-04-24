import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Share,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Card } from '../src/components';
import { useUserStore } from '../src/stores/userStore';
import { screenTimeService } from '../src/services/screenTime';
import { TrackedAppConfig } from '../src/models';
import { buildImportShortcutUrl, iCloudUrlFor } from '../src/constants/shortcutLibrary';
import { Linking } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../src/constants/theme';

// ============================================
// iOS Setup Screen
// Walks the user through creating one Shortcuts automation per tracked app.
// Automation: "When [App] is opened → Open URL: dopamenu://intervention?app=<bundleId>"
// ============================================

export default function IosSetupScreen() {
  const { user, updatePreferences } = useUserStore();
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  if (!user) return null;

  const trackedApps = user.preferences.trackedApps;
  const configuredCount = trackedApps.filter((a) => a.iosShortcutConfigured).length;

  const handleAppToggle = (packageName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = trackedApps.map((a) =>
      a.packageName === packageName ? { ...a, enabled: !a.enabled } : a
    );
    updatePreferences({ trackedApps: updated });
  };

  const handleMarkConfigured = (packageName: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const updated = trackedApps.map((a) =>
      a.packageName === packageName ? { ...a, iosShortcutConfigured: !a.iosShortcutConfigured } : a
    );
    updatePreferences({ trackedApps: updated });
  };

  const handleToggleExpand = (packageName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedApp(expandedApp === packageName ? null : packageName);
  };

  const handleCopyUrl = async (url: string) => {
    await Clipboard.setStringAsync(url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'URL copied to clipboard. Paste it into the Shortcuts "Open URLs" action.');
  };

  const handleOpenShortcuts = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await screenTimeService.openShortcutsApp();
  };

  const handleInstallShortcut = async (bundleId?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const url = buildImportShortcutUrl(bundleId);
    if (url) {
      try {
        await Linking.openURL(url);
        return;
      } catch {
        // fall through to manual flow
      }
    }
    Alert.alert(
      'One-tap install not ready yet',
      "We'll drop into Shortcuts now — paste the URL we just copied into the 'Open URLs' action.",
      [{ text: 'OK', onPress: () => screenTimeService.openShortcutsApp() }]
    );
  };

  const handleTestDeepLink = async (bundleId?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await screenTimeService.testDeepLink(bundleId);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>iOS App Redirect</Text>
          <View style={styles.backButton} />
        </View>

        <Text style={styles.subtitle}>
          {configuredCount} of {trackedApps.length} apps configured
        </Text>

        {/* How it works */}
        <Card style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Text style={styles.infoTitle}>How this works</Text>
          </View>
          <Text style={styles.infoBody}>
            iOS doesn't let apps detect each other directly. Instead, we use the built-in Shortcuts app to redirect you
            to DopaMenu when you open a tracked app.{'\n\n'}
            You set this up once per app. On iOS 16.4+ the redirect runs automatically.
          </Text>
        </Card>

        {/* Apps List */}
        <Text style={styles.sectionTitle}>Your tracked apps</Text>
        {trackedApps.map((app) => (
          <AppSetupCard
            key={app.packageName}
            app={app}
            expanded={expandedApp === app.packageName}
            onToggleEnabled={() => handleAppToggle(app.packageName)}
            onToggleExpand={() => handleToggleExpand(app.packageName)}
            onMarkConfigured={() => handleMarkConfigured(app.packageName)}
            onCopyUrl={handleCopyUrl}
            onOpenShortcuts={handleOpenShortcuts}
            onInstallShortcut={() => handleInstallShortcut(app.iosBundleId)}
            onTestDeepLink={() => handleTestDeepLink(app.iosBundleId)}
          />
        ))}

        {/* Global test deep link */}
        <Card style={[styles.infoCard, { marginTop: spacing.lg }]}>
          <View style={styles.infoHeader}>
            <Ionicons name="flask" size={20} color={colors.primary} />
            <Text style={styles.infoTitle}>Test the redirect</Text>
          </View>
          <Text style={styles.infoBody}>
            Tap below to simulate what happens when a tracked app opens. If this shows a DopaMenu intervention, your
            deep link is wired up correctly.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => handleTestDeepLink()}>
            <Ionicons name="play" size={18} color={colors.textInverse} />
            <Text style={styles.primaryButtonText}>Trigger a test intervention</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

interface AppSetupCardProps {
  app: TrackedAppConfig;
  expanded: boolean;
  onToggleEnabled: () => void;
  onToggleExpand: () => void;
  onMarkConfigured: () => void;
  onCopyUrl: (url: string) => void;
  onOpenShortcuts: () => void;
  onInstallShortcut: () => void;
  onTestDeepLink: () => void;
}

function AppSetupCard({
  app,
  expanded,
  onToggleEnabled,
  onToggleExpand,
  onMarkConfigured,
  onCopyUrl,
  onOpenShortcuts,
  onInstallShortcut,
  onTestDeepLink,
}: AppSetupCardProps) {
  const instructions = screenTimeService.getSetupInstructions(app);
  const isConfigured = !!app.iosShortcutConfigured;
  const hasOneTapInstall = !!iCloudUrlFor(app.iosBundleId);

  return (
    <Card style={styles.appCard}>
      {/* Row header */}
      <TouchableOpacity style={styles.appRow} onPress={onToggleExpand}>
        <View style={styles.appRowLeft}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isConfigured ? colors.primary : colors.border },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.appLabel}>{app.label}</Text>
            <Text style={styles.appSubLabel}>
              {isConfigured
                ? '✓ Automation detected — you\'re all set'
                : hasOneTapInstall
                ? 'Tap to install automation (one tap)'
                : 'Tap to set up redirect'}
            </Text>
          </View>
        </View>
        <View style={styles.appRowRight}>
          <Switch
            value={app.enabled}
            onValueChange={onToggleEnabled}
            trackColor={{ false: colors.border, true: colors.primaryLight }}
            thumbColor={app.enabled ? colors.primary : colors.textTertiary}
          />
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.instructionsContainer}>
          {/* Status banner — auto-detected */}
          {isConfigured ? (
            <View style={[styles.tipBox, { backgroundColor: '#E5F3E8', marginBottom: spacing.md }]}>
              <Ionicons name="checkmark-circle" size={16} color="#3B7A4B" />
              <Text style={[styles.tipText, { color: '#3B7A4B' }]}>
                DopaMenu saw this automation fire — no action needed.
              </Text>
            </View>
          ) : null}

          {/* Primary action: one-tap install */}
          <TouchableOpacity
            style={[styles.primaryButton, { alignSelf: 'stretch', justifyContent: 'center' }]}
            onPress={onInstallShortcut}
          >
            <Ionicons name="download-outline" size={18} color={colors.textInverse} />
            <Text style={styles.primaryButtonText}>
              {hasOneTapInstall ? 'Install Shortcut (one tap)' : 'Open Shortcuts to set up'}
            </Text>
          </TouchableOpacity>

          {/* Secondary: test */}
          <TouchableOpacity
            style={[styles.secondaryButton, { alignSelf: 'stretch', justifyContent: 'center', marginTop: spacing.sm }]}
            onPress={onTestDeepLink}
          >
            <Ionicons name="flask-outline" size={16} color={colors.primary} />
            <Text style={styles.secondaryButtonText}>Test redirect</Text>
          </TouchableOpacity>

          {/* Fallback: manual URL (only surfaced when one-tap isn't ready) */}
          {!hasOneTapInstall ? (
            <>
              <Text style={[styles.urlLabel, { marginTop: spacing.md }]}>
                Fallback — paste this URL into the Shortcut's "Open URLs" action:
              </Text>
              <TouchableOpacity
                style={styles.urlBox}
                onPress={() => onCopyUrl(instructions.interventionUrl)}
              >
                <Text style={styles.urlText} selectable numberOfLines={2}>
                  {instructions.interventionUrl}
                </Text>
                <Ionicons name="copy-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
              {instructions.steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </>
          ) : null}

          <View style={[styles.tipBox, { marginTop: spacing.md }]}>
            <Ionicons name="information-circle" size={16} color={colors.primary} />
            <Text style={styles.tipText}>
              Status updates automatically the first time the automation fires. You don't need to confirm anything.
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    paddingTop: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  infoCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  infoTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  infoBody: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  appCard: {
    marginBottom: spacing.sm,
    padding: 0,
    overflow: 'hidden',
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  appRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  appRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  appLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  appSubLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  instructionsContainer: {
    padding: spacing.md,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  urlLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  urlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.primaryFaded,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  urlText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.textPrimary,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  stepText: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.primaryFaded,
    borderRadius: borderRadius.sm,
  },
  tipText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  primaryButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textInverse,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.primary,
  },
  markDoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  markDoneButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaded,
  },
  markDoneText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
});
