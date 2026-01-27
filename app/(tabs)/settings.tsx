import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card } from '../../src/components';
import { useUserStore } from '../../src/stores/userStore';
import { useInterventionStore } from '../../src/stores/interventionStore';
import { usePortfolioStore } from '../../src/stores/portfolioStore';
import { DEFAULT_IDENTITY_ANCHORS } from '../../src/models';
import { colors, spacing, borderRadius, typography } from '../../src/constants/theme';

// ============================================
// Settings Screen
// User preferences and configuration
// ============================================

type FrequencyLevel = 'low' | 'medium' | 'high';
type ToneLevel = 'gentle' | 'direct' | 'minimal';

const FREQUENCY_OPTIONS: { value: FrequencyLevel; label: string; description: string }[] = [
  { value: 'low', label: 'Less', description: 'Minimal interruptions' },
  { value: 'medium', label: 'Balanced', description: 'Moderate suggestions' },
  { value: 'high', label: 'More', description: 'Frequent check-ins' },
];

const TONE_OPTIONS: { value: ToneLevel; label: string; description: string }[] = [
  { value: 'gentle', label: 'Gentle', description: 'Soft and encouraging' },
  { value: 'direct', label: 'Direct', description: 'Clear and straightforward' },
  { value: 'minimal', label: 'Minimal', description: 'Just the essentials' },
];

export default function SettingsScreen() {
  const { user, updatePreferences, addIdentityAnchor, removeIdentityAnchor, reset: resetUser } = useUserStore();
  const { reset: resetInterventions } = useInterventionStore();
  const { reset: resetPortfolio } = usePortfolioStore();

  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  if (!user) return null;

  const toggleSection = (section: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedSection(expandedSection === section ? null : section);
  };

  const handleFrequencyChange = (frequency: FrequencyLevel) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updatePreferences({ interventionFrequency: frequency });
  };

  const handleToneChange = (tone: ToneLevel) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updatePreferences({ tone });
  };

  const handleWeeklyRecalibrationToggle = () => {
    updatePreferences({
      weeklyRecalibrationEnabled: !user.preferences.weeklyRecalibrationEnabled,
    });
  };

  const handleIdentityToggle = (label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const existing = user.identityAnchors.find((a) => a.label === label);

    if (existing) {
      removeIdentityAnchor(existing.id);
    } else {
      const anchor = DEFAULT_IDENTITY_ANCHORS.find((a) => a.label === label);
      if (anchor) {
        addIdentityAnchor(anchor);
      }
    }
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Data',
      'This will clear all your settings, history, and preferences. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetUser();
            resetInterventions();
            resetPortfolio();
          },
        },
      ]
    );
  };

  const userIdentityLabels = user.identityAnchors.map((a) => a.label);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Make DopaMenu work for you</Text>
        </View>

        {/* Identity Anchors */}
        <SettingsSection
          title="Your Identities"
          icon="person"
          expanded={expandedSection === 'identity'}
          onToggle={() => toggleSection('identity')}
        >
          <Text style={styles.sectionDescription}>
            These help us suggest activities that align with who you want to be
          </Text>
          <View style={styles.identityGrid}>
            {DEFAULT_IDENTITY_ANCHORS.map((anchor) => {
              const isSelected = userIdentityLabels.includes(anchor.label);
              return (
                <TouchableOpacity
                  key={anchor.label}
                  style={[
                    styles.identityChip,
                    isSelected && styles.identityChipSelected,
                  ]}
                  onPress={() => handleIdentityToggle(anchor.label)}
                >
                  <Ionicons
                    name={(anchor.icon as any) || 'star'}
                    size={16}
                    color={isSelected ? colors.textInverse : colors.primary}
                  />
                  <Text
                    style={[
                      styles.identityChipText,
                      isSelected && styles.identityChipTextSelected,
                    ]}
                  >
                    {anchor.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SettingsSection>

        {/* Intervention Frequency */}
        <SettingsSection
          title="Suggestion Frequency"
          icon="notifications"
          expanded={expandedSection === 'frequency'}
          onToggle={() => toggleSection('frequency')}
        >
          <Text style={styles.sectionDescription}>
            How often should DopaMenu offer alternatives?
          </Text>
          <View style={styles.optionsList}>
            {FREQUENCY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionItem,
                  user.preferences.interventionFrequency === option.value &&
                    styles.optionItemSelected,
                ]}
                onPress={() => handleFrequencyChange(option.value)}
              >
                <View style={styles.optionContent}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </View>
                {user.preferences.interventionFrequency === option.value && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </SettingsSection>

        {/* Tone */}
        <SettingsSection
          title="Suggestion Tone"
          icon="chatbubble"
          expanded={expandedSection === 'tone'}
          onToggle={() => toggleSection('tone')}
        >
          <Text style={styles.sectionDescription}>
            How should suggestions sound?
          </Text>
          <View style={styles.optionsList}>
            {TONE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionItem,
                  user.preferences.tone === option.value && styles.optionItemSelected,
                ]}
                onPress={() => handleToneChange(option.value)}
              >
                <View style={styles.optionContent}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </View>
                {user.preferences.tone === option.value && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </SettingsSection>

        {/* Weekly Recalibration */}
        <Card style={styles.toggleCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleContent}>
              <View style={styles.toggleIcon}>
                <Ionicons name="calendar" size={20} color={colors.primary} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleTitle}>Weekly Recalibration</Text>
                <Text style={styles.toggleDescription}>
                  Get a prompt to review your preferences
                </Text>
              </View>
            </View>
            <Switch
              value={user.preferences.weeklyRecalibrationEnabled}
              onValueChange={handleWeeklyRecalibrationToggle}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={
                user.preferences.weeklyRecalibrationEnabled
                  ? colors.primary
                  : colors.textTertiary
              }
            />
          </View>
        </Card>

        {/* Quiet Hours Info */}
        <Card style={styles.infoCard}>
          <View style={styles.infoContent}>
            <Ionicons name="moon" size={20} color={colors.primary} />
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>Quiet Hours</Text>
              <Text style={styles.infoDescription}>
                {user.preferences.quietHours.length > 0
                  ? `${user.preferences.quietHours[0].start} - ${user.preferences.quietHours[0].end}`
                  : 'No quiet hours set'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Danger Zone */}
        <View style={styles.dangerSection}>
          <Text style={styles.dangerTitle}>Data</Text>
          <TouchableOpacity style={styles.dangerButton} onPress={handleResetData}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
            <Text style={styles.dangerButtonText}>Reset All Data</Text>
          </TouchableOpacity>
        </View>

        {/* Version */}
        <Text style={styles.version}>DopaMenu v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface SettingsSectionProps {
  title: string;
  icon: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function SettingsSection({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: SettingsSectionProps) {
  return (
    <Card style={styles.sectionCard}>
      <TouchableOpacity style={styles.sectionHeader} onPress={onToggle}>
        <View style={styles.sectionHeaderContent}>
          <View style={styles.sectionIcon}>
            <Ionicons name={icon as any} size={20} color={colors.primary} />
          </View>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {expanded && <View style={styles.sectionContent}>{children}</View>}
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
    marginBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  sectionCard: {
    marginBottom: spacing.md,
    padding: 0,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  sectionContent: {
    padding: spacing.md,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  identityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  identityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  identityChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  identityChipText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  identityChipTextSelected: {
    color: colors.textInverse,
  },
  optionsList: {
    gap: spacing.sm,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaded,
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  optionDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  toggleCard: {
    marginBottom: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  toggleIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  toggleDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  infoCard: {
    marginBottom: spacing.lg,
  },
  infoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  infoDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  dangerSection: {
    marginBottom: spacing.lg,
  },
  dangerTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  dangerButtonText: {
    fontSize: typography.sizes.md,
    color: colors.error,
    fontWeight: typography.weights.medium,
  },
  version: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
