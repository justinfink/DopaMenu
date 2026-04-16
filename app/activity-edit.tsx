import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button, Card } from '../src/components';
import { useCustomInterventionsStore } from '../src/stores/customInterventionsStore';
import { useUserStore } from '../src/stores/userStore';
import { EffortLevel, InterventionSurface } from '../src/models';
import { KNOWN_APPS, KNOWN_APPS_BY_ID, KnownApp, CATEGORY_LABELS } from '../src/constants/knownApps';
import { colors, spacing, borderRadius, typography } from '../src/constants/theme';

// ============================================
// Activity Edit Screen
// Create or edit a custom intervention, and pick which tracked apps pin it
// as their top choice.
// ============================================

const EFFORT_OPTIONS: { value: EffortLevel; label: string; description: string }[] = [
  { value: 'very_low', label: 'Quick', description: '< 1 minute' },
  { value: 'low', label: 'Easy', description: '1-5 minutes' },
  { value: 'medium', label: 'Moderate', description: '5-15 minutes' },
  { value: 'high', label: 'Committed', description: '15+ minutes' },
];

const SURFACE_OPTIONS: { value: InterventionSurface; label: string }[] = [
  { value: 'on_phone', label: 'On phone' },
  { value: 'off_phone', label: 'Away from phone' },
];

// A short curated icon list — users can pick a visual without a full picker UI.
const ICON_OPTIONS: string[] = [
  'game-controller',
  'book',
  'barbell',
  'bicycle',
  'walk',
  'musical-notes',
  'brush',
  'create',
  'leaf',
  'flower',
  'cafe',
  'restaurant',
  'call',
  'chatbubbles',
  'headset',
  'moon',
  'sparkles',
  'rocket',
  'heart',
  'star',
];

export default function ActivityEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;

  const { interventions, addIntervention, updateIntervention, removeIntervention } =
    useCustomInterventionsStore();
  const { user, setTriggerPins } = useUserStore();

  const existing = useMemo(
    () => (params.id ? interventions.find((i) => i.id === params.id) : undefined),
    [params.id, interventions]
  );

  const [label, setLabel] = useState(existing?.label ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [effort, setEffort] = useState<EffortLevel>(existing?.requiredEffort ?? 'low');
  const [surface, setSurface] = useState<InterventionSurface>(existing?.surface ?? 'on_phone');
  const [icon, setIcon] = useState<string>(existing?.icon ?? 'sparkles');

  // Launch target: three modes so users can route to an app, a URL, or nothing
  // (for off-phone activities). Derive initial mode from existing fields.
  type LaunchMode = 'app' | 'url' | 'none';
  const deriveInitialMode = (): LaunchMode => {
    if (existing?.launchAppPackage || existing?.launchIosScheme) return 'app';
    if (existing?.launchTarget) return 'url';
    return existing ? 'none' : 'app';
  };
  const deriveInitialAppId = (): string | null => {
    if (!existing?.launchAppPackage) return null;
    const match = KNOWN_APPS.find((a) => a.androidPackage === existing.launchAppPackage);
    return match?.id ?? null;
  };
  const [launchMode, setLaunchMode] = useState<LaunchMode>(deriveInitialMode());
  const [selectedAppId, setSelectedAppId] = useState<string | null>(deriveInitialAppId());
  const [launchTarget, setLaunchTarget] = useState(
    existing && !existing.launchAppPackage ? existing.launchTarget ?? '' : ''
  );

  // Auto-fill icon and name hints when the user picks a known app and hasn't
  // customized those fields yet. We only overwrite when fields are empty or
  // clearly untouched so we don't clobber deliberate edits.
  const handleSelectApp = (app: KnownApp) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAppId(app.id);
    if (!label.trim()) {
      setLabel(app.tagline ? `${app.tagline} on ${app.label}` : `Open ${app.label}`);
    }
    // Only overwrite icon if it's still the default 'sparkles'
    if (icon === 'sparkles' || icon === '') {
      setIcon(app.icon);
    }
  };

  // Group known apps by category for the picker
  const appsByCategory = useMemo(() => {
    const groups: Record<string, KnownApp[]> = {};
    for (const app of KNOWN_APPS) {
      if (!groups[app.category]) groups[app.category] = [];
      groups[app.category].push(app);
    }
    return groups;
  }, []);

  // Per-trigger pin state: which tracked apps have this activity pinned?
  const initialPinnedApps = useMemo(() => {
    const apps = new Set<string>();
    if (!user || !existing) return apps;
    const map = user.preferences.triggerPreferences || {};
    for (const [pkg, ids] of Object.entries(map)) {
      if (ids.includes(existing.id)) apps.add(pkg);
    }
    return apps;
  }, [user, existing]);

  const [pinnedApps, setPinnedApps] = useState<Set<string>>(initialPinnedApps);

  const togglePinnedApp = (packageName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPinnedApps((prev) => {
      const next = new Set(prev);
      if (next.has(packageName)) next.delete(packageName);
      else next.add(packageName);
      return next;
    });
  };

  const handleSave = () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      Alert.alert('Name required', 'Give this activity a short name.');
      return;
    }

    // Resolve launch fields from the selected mode. "app" uses the known app
    // catalog so we get package + scheme + fallback URL together. "url" uses
    // whatever raw URL the user typed. "none" clears them all (off-phone).
    let resolvedTarget: string | undefined;
    let resolvedPackage: string | undefined;
    let resolvedIos: string | undefined;
    if (launchMode === 'app' && selectedAppId) {
      const app = KNOWN_APPS_BY_ID[selectedAppId];
      if (app) {
        resolvedPackage = app.androidPackage;
        resolvedIos = app.iosScheme;
        resolvedTarget = app.fallbackUrl;
      }
    } else if (launchMode === 'app' && !selectedAppId) {
      Alert.alert('Pick an app', 'Select one of the apps below or switch to "Enter URL".');
      return;
    } else if (launchMode === 'url') {
      resolvedTarget = launchTarget.trim() || undefined;
    }

    let savedId: string;
    if (isEditing && existing) {
      updateIntervention(existing.id, {
        label: trimmedLabel,
        description: description.trim() || undefined,
        launchTarget: resolvedTarget,
        launchAppPackage: resolvedPackage,
        launchIosScheme: resolvedIos,
        requiredEffort: effort,
        surface,
        icon,
      });
      savedId = existing.id;
    } else {
      const created = addIntervention({
        label: trimmedLabel,
        description: description.trim() || undefined,
        launchTarget: resolvedTarget,
        launchAppPackage: resolvedPackage,
        launchIosScheme: resolvedIos,
        requiredEffort: effort,
        surface,
        icon,
      });
      savedId = created.id;
    }

    // Update per-trigger pins: for every tracked app, add or remove this ID.
    if (user) {
      const currentMap = user.preferences.triggerPreferences || {};
      for (const app of user.preferences.trackedApps) {
        const existingPins = currentMap[app.packageName] || [];
        const shouldBePinned = pinnedApps.has(app.packageName);
        const isCurrentlyPinned = existingPins.includes(savedId);

        if (shouldBePinned && !isCurrentlyPinned) {
          // Prepend as top choice
          setTriggerPins(app.packageName, [savedId, ...existingPins]);
        } else if (!shouldBePinned && isCurrentlyPinned) {
          setTriggerPins(
            app.packageName,
            existingPins.filter((id) => id !== savedId)
          );
        }
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert(
      'Delete activity',
      `Remove "${existing.label}" from your menu? This also removes any app pins.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Strip this ID from every trigger-pin list before removing
            if (user) {
              const map = user.preferences.triggerPreferences || {};
              for (const [pkg, ids] of Object.entries(map)) {
                if (ids.includes(existing.id)) {
                  setTriggerPins(pkg, ids.filter((id) => id !== existing.id));
                }
              }
            }
            removeIntervention(existing.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            router.back();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit activity' : 'New activity'}
          </Text>
          <View style={styles.headerButton} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Name */}
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Play a chess puzzle"
            placeholderTextColor={colors.textTertiary}
            autoFocus={!isEditing}
            maxLength={60}
            returnKeyType="next"
          />

          {/* Description */}
          <Text style={styles.fieldLabel}>Short description (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="A nudge for your future self"
            placeholderTextColor={colors.textTertiary}
            maxLength={120}
            multiline
          />

          {/* Launch mode: Pick an app / Enter URL / Nothing */}
          <Text style={styles.fieldLabel}>When I tap "I'll do this"...</Text>
          <View style={styles.surfaceRow}>
            {(['app', 'url', 'none'] as const).map((mode) => {
              const selected = launchMode === mode;
              const label =
                mode === 'app' ? 'Open in app' : mode === 'url' ? 'Open URL' : 'Nothing';
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.surfaceChip, selected && styles.surfaceChipSelected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setLaunchMode(mode);
                  }}
                >
                  <Text style={[styles.surfaceText, selected && styles.surfaceTextSelected]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Mode: Open in app → show the catalog grouped by category */}
          {launchMode === 'app' && (
            <>
              <Text style={styles.helper}>
                Picks the native app if installed, and falls back to the web if not.
              </Text>
              {Object.entries(appsByCategory).map(([category, apps]) => (
                <View key={category} style={styles.categoryBlock}>
                  <Text style={styles.categoryLabel}>
                    {CATEGORY_LABELS[category as KnownApp['category']]}
                  </Text>
                  <View style={styles.appGrid}>
                    {apps.map((app) => {
                      const selected = selectedAppId === app.id;
                      return (
                        <TouchableOpacity
                          key={app.id}
                          style={[styles.appChip, selected && styles.appChipSelected]}
                          onPress={() => handleSelectApp(app)}
                        >
                          <Ionicons
                            name={app.icon as any}
                            size={20}
                            color={selected ? colors.textInverse : colors.primary}
                          />
                          <Text
                            style={[
                              styles.appChipLabel,
                              selected && styles.appChipLabelSelected,
                            ]}
                          >
                            {app.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Mode: Enter URL → raw text field */}
          {launchMode === 'url' && (
            <>
              <TextInput
                style={[styles.input, { marginTop: spacing.sm }]}
                value={launchTarget}
                onChangeText={setLaunchTarget}
                placeholder="https://... or app-scheme://"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={styles.helper}>
                Any web URL or app deep link (e.g. spotify://playlist/...).
              </Text>
            </>
          )}

          {launchMode === 'none' && (
            <Text style={styles.helper}>
              For off-phone activities — "I'll do this" just closes the menu.
            </Text>
          )}

          {/* Icon picker */}
          <Text style={styles.fieldLabel}>Icon</Text>
          <View style={styles.iconGrid}>
            {ICON_OPTIONS.map((name) => {
              const selected = icon === name;
              return (
                <TouchableOpacity
                  key={name}
                  style={[styles.iconChip, selected && styles.iconChipSelected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setIcon(name);
                  }}
                >
                  <Ionicons
                    name={name as any}
                    size={22}
                    color={selected ? colors.textInverse : colors.primary}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Effort */}
          <Text style={styles.fieldLabel}>Effort</Text>
          <View style={styles.optionsList}>
            {EFFORT_OPTIONS.map((opt) => {
              const selected = effort === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.optionItem, selected && styles.optionItemSelected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setEffort(opt.value);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                    <Text style={styles.optionDesc}>{opt.description}</Text>
                  </View>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Surface */}
          <Text style={styles.fieldLabel}>Where does this happen?</Text>
          <View style={styles.surfaceRow}>
            {SURFACE_OPTIONS.map((opt) => {
              const selected = surface === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.surfaceChip, selected && styles.surfaceChipSelected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSurface(opt.value);
                  }}
                >
                  <Text style={[styles.surfaceText, selected && styles.surfaceTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Pin as top for apps */}
          <Text style={styles.fieldLabel}>Pin as top choice for...</Text>
          <Text style={styles.helper}>
            When one of these apps triggers DopaMenu, this activity will be the first
            option you see.
          </Text>
          {user?.preferences.trackedApps.length ? (
            <View style={styles.appList}>
              {user.preferences.trackedApps.map((app) => {
                const selected = pinnedApps.has(app.packageName);
                return (
                  <TouchableOpacity
                    key={app.packageName}
                    style={[styles.appItem, selected && styles.appItemSelected]}
                    onPress={() => togglePinnedApp(app.packageName)}
                  >
                    <Text style={styles.appLabel}>{app.label}</Text>
                    <Ionicons
                      name={selected ? 'pin' : 'pin-outline'}
                      size={22}
                      color={selected ? colors.primary : colors.textTertiary}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Card style={styles.emptyAppsCard}>
              <Text style={styles.helper}>
                You don't have any tracked apps yet. Add some under App Detection above
                to enable per-app pins.
              </Text>
            </Card>
          )}

          {/* Delete (edit mode only) */}
          {isEditing && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={styles.deleteText}>Delete activity</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Save footer */}
        <View style={styles.footer}>
          <Button
            title={isEditing ? 'Save changes' : 'Add to my menu'}
            onPress={handleSave}
            size="large"
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  helper: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionsList: {
    gap: spacing.sm,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaded,
  },
  optionLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  optionDesc: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  surfaceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  surfaceChip: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  surfaceChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  surfaceText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  surfaceTextSelected: {
    color: colors.textInverse,
  },
  appList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  appItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaded,
  },
  appLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  emptyAppsCard: {
    marginTop: spacing.sm,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    paddingVertical: spacing.md,
  },
  deleteText: {
    fontSize: typography.sizes.md,
    color: colors.error,
    fontWeight: typography.weights.medium,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryBlock: {
    marginTop: spacing.md,
  },
  categoryLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  appGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  appChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  appChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  appChipLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  appChipLabelSelected: {
    color: colors.textInverse,
  },
});
