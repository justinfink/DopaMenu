import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button } from '../src/components';
import { useAppLibraryStore } from '../src/stores/appLibraryStore';
import { useUserStore } from '../src/stores/userStore';
import { AppDesignation, AppPriority } from '../src/models';
import { colors, spacing, typography, borderRadius } from '../src/constants/theme';

// ============================================
// App Configuration Screen
// Configure designation, priority, identity
// goals, and redirect behavior for an app
// ============================================

const DESIGNATIONS: { value: AppDesignation; label: string; color: string; icon: string }[] = [
  { value: 'aligned', label: 'Aligned', color: '#43A047', icon: 'checkmark-circle' },
  { value: 'neutral', label: 'Neutral', color: '#757575', icon: 'remove-circle' },
  { value: 'timewaster', label: 'Timewaster', color: '#E53935', icon: 'close-circle' },
];

const PRIORITIES: { value: AppPriority; label: string; stars: number }[] = [
  { value: 'high', label: 'High', stars: 3 },
  { value: 'medium', label: 'Medium', stars: 2 },
  { value: 'low', label: 'Low', stars: 1 },
  { value: 'none', label: 'None', stars: 0 },
];

export default function AppConfigScreen() {
  const { appId } = useLocalSearchParams<{ appId: string }>();
  const { installedApps, userConfigs, updateAppConfig, setDesignation, setPriority, addIdentityGoal, removeIdentityGoal, setDailyTimeLimit } = useAppLibraryStore();
  const { user } = useUserStore();

  const app = installedApps.find(a => a.id === appId);
  const config = appId ? userConfigs[appId] : null;

  const [notes, setNotes] = useState(config?.notes || '');
  const [timeLimitStr, setTimeLimitStr] = useState(
    config?.dailyTimeLimitMinutes?.toString() || ''
  );

  if (!app || !appId) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>App not found</Text>
        <Button title="Go back" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const designation = config?.designation || 'neutral';
  const priority = config?.priority || 'none';
  const identityGoals = config?.identityGoals || [];
  const redirectEnabled = config?.redirectBehavior === 'full_overlay';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {app.displayName}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* App Info */}
        <Card style={styles.infoCard}>
          <View style={styles.appHeader}>
            <View style={styles.appIcon}>
              <Ionicons name={(app.icon as any) || 'apps'} size={32} color={colors.primary} />
            </View>
            <View style={styles.appInfo}>
              <Text style={styles.appName}>{app.displayName}</Text>
              <Text style={styles.appCategory}>{app.category.replace('_', ' ')}</Text>
              <Text style={styles.appSource}>Source: {app.source.replace('_', ' ')}</Text>
            </View>
          </View>
        </Card>

        {/* Designation */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Designation</Text>
          <Text style={styles.sectionDesc}>
            How does this app fit your goals?
          </Text>
          <View style={styles.optionsRow}>
            {DESIGNATIONS.map((d) => (
              <TouchableOpacity
                key={d.value}
                style={[
                  styles.designationOption,
                  designation === d.value && { borderColor: d.color, backgroundColor: d.color + '10' },
                ]}
                onPress={() => setDesignation(appId, d.value)}
              >
                <Ionicons name={d.icon as any} size={20} color={designation === d.value ? d.color : colors.textTertiary} />
                <Text style={[
                  styles.designationLabel,
                  designation === d.value && { color: d.color, fontWeight: typography.weights.semibold as any },
                ]}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Priority */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Priority</Text>
          <View style={styles.priorityRow}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[
                  styles.priorityOption,
                  priority === p.value && styles.priorityActive,
                ]}
                onPress={() => setPriority(appId, p.value)}
              >
                <View style={styles.starsRow}>
                  {Array.from({ length: p.stars }).map((_, i) => (
                    <Ionicons key={i} name="star" size={12} color={priority === p.value ? '#FFB300' : colors.textTertiary} />
                  ))}
                  {p.stars === 0 && <Ionicons name="star-outline" size={12} color={colors.textTertiary} />}
                </View>
                <Text style={[
                  styles.priorityLabel,
                  priority === p.value && styles.priorityLabelActive,
                ]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Identity Goals */}
        {user && user.identityAnchors.length > 0 && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Identity Goals</Text>
            <Text style={styles.sectionDesc}>
              Which identities does this app serve?
            </Text>
            <View style={styles.identityGrid}>
              {user.identityAnchors.map((anchor) => {
                const isSelected = identityGoals.includes(anchor.id);
                return (
                  <TouchableOpacity
                    key={anchor.id}
                    style={[
                      styles.identityChip,
                      isSelected && styles.identityChipActive,
                    ]}
                    onPress={() => {
                      if (isSelected) {
                        removeIdentityGoal(appId, anchor.id);
                      } else {
                        addIdentityGoal(appId, anchor.id);
                      }
                    }}
                  >
                    <Ionicons
                      name={(anchor.icon as any) || 'star'}
                      size={16}
                      color={isSelected ? colors.primary : colors.textTertiary}
                    />
                    <Text style={[
                      styles.identityChipText,
                      isSelected && styles.identityChipTextActive,
                    ]}>
                      {anchor.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        )}

        {/* Redirect */}
        <Card style={styles.sectionCard}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.sectionTitle}>Redirect when opened</Text>
              <Text style={styles.sectionDesc}>
                Show full-screen intervention overlay
              </Text>
            </View>
            <Switch
              value={redirectEnabled}
              onValueChange={(value) => {
                updateAppConfig(appId, {
                  redirectBehavior: value ? 'full_overlay' : 'none',
                });
              }}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={redirectEnabled ? colors.primary : colors.textTertiary}
            />
          </View>
        </Card>

        {/* Daily Time Limit */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Daily Time Limit</Text>
          <Text style={styles.sectionDesc}>
            Set a daily usage limit in minutes (optional)
          </Text>
          <View style={styles.timeLimitRow}>
            <TextInput
              style={styles.timeLimitInput}
              value={timeLimitStr}
              onChangeText={setTimeLimitStr}
              onBlur={() => {
                const mins = parseInt(timeLimitStr, 10);
                setDailyTimeLimit(appId, isNaN(mins) ? undefined : mins);
              }}
              placeholder="No limit"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numeric"
            />
            <Text style={styles.timeLimitUnit}>minutes</Text>
          </View>
        </Card>

        {/* Notes */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            onBlur={() => updateAppConfig(appId, { notes: notes || undefined })}
            placeholder="Add personal notes about this app..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold as any,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  errorText: {
    fontSize: typography.sizes.lg,
    color: colors.error,
    textAlign: 'center',
    padding: spacing.xl,
  },
  infoCard: {
    marginBottom: spacing.md,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold as any,
    color: colors.textPrimary,
  },
  appCategory: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  appSource: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  sectionCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold as any,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sectionDesc: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  designationOption: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  designationLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priorityOption: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priorityActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaded,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  priorityLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  priorityLabelActive: {
    color: colors.primary,
    fontWeight: typography.weights.semibold as any,
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  identityChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaded,
  },
  identityChipText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  identityChipTextActive: {
    color: colors.primary,
    fontWeight: typography.weights.medium as any,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timeLimitInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeLimitUnit: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  notesInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
