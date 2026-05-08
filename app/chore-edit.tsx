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
import { Button } from '../src/components';
import { useChoresStore } from '../src/stores/choresStore';
import { ChoreCadence } from '../src/models';
import { colors, spacing, borderRadius, typography } from '../src/constants/theme';

// ============================================
// Chore Edit Screen
// Create or edit an off-phone chore. Mirrors activity-edit.tsx structure.
// ============================================

const CADENCE_OPTIONS: { value: ChoreCadence; label: string; description: string }[] = [
  { value: 'once', label: 'One-time', description: 'Disappears when done' },
  { value: 'daily', label: 'Daily', description: 'Every day' },
  { value: 'weekly', label: 'Weekly', description: 'Pick one day' },
  { value: 'custom', label: 'Custom', description: 'Pick specific days' },
];

const DAY_LABELS = [
  { num: 1, label: 'Mon' },
  { num: 2, label: 'Tue' },
  { num: 3, label: 'Wed' },
  { num: 4, label: 'Thu' },
  { num: 5, label: 'Fri' },
  { num: 6, label: 'Sat' },
  { num: 7, label: 'Sun' },
];

export default function ChoreEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;

  const chores = useChoresStore((s) => s.chores);
  const addChore = useChoresStore((s) => s.addChore);
  const updateChore = useChoresStore((s) => s.updateChore);
  const removeChore = useChoresStore((s) => s.removeChore);

  const existing = useMemo(
    () => (params.id ? chores.find((c) => c.id === params.id) : undefined),
    [params.id, chores],
  );

  const [label, setLabel] = useState(existing?.label ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [cadence, setCadence] = useState<ChoreCadence>(existing?.cadence ?? 'daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    existing?.daysOfWeek ?? [1, 2, 3, 4, 5],
  );

  const showDayPicker = cadence === 'weekly' || cadence === 'custom';

  const toggleDay = (num: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (cadence === 'weekly') {
      // Weekly = exactly one day. Replace selection.
      setDaysOfWeek([num]);
      return;
    }
    setDaysOfWeek((prev) =>
      prev.includes(num) ? prev.filter((d) => d !== num) : [...prev, num].sort(),
    );
  };

  const handleSave = () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      Alert.alert('Name required', 'Give this chore a short name.');
      return;
    }
    if (showDayPicker && daysOfWeek.length === 0) {
      Alert.alert('Pick at least one day', 'Select a day for this chore to recur on.');
      return;
    }

    const input = {
      label: trimmedLabel,
      notes: notes.trim() || undefined,
      cadence,
      daysOfWeek: showDayPicker ? daysOfWeek : undefined,
    };

    if (isEditing && existing) {
      updateChore(existing.id, input);
    } else {
      addChore(input);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert(
      'Delete chore',
      `Remove "${existing.label}" from your list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeChore(existing.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit chore' : 'New chore'}
          </Text>
          <View style={styles.headerButton} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Take out the trash"
            placeholderTextColor={colors.textTertiary}
            autoFocus={!isEditing}
            maxLength={80}
            returnKeyType="next"
          />

          <Text style={styles.fieldLabel}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="A reminder for your future self"
            placeholderTextColor={colors.textTertiary}
            maxLength={200}
            multiline
          />

          <Text style={styles.fieldLabel}>How often?</Text>
          <View style={styles.options}>
            {CADENCE_OPTIONS.map((opt) => {
              const selected = cadence === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCadence(opt.value);
                    // Reset day selection when switching modes
                    if (opt.value === 'weekly' && daysOfWeek.length !== 1) {
                      setDaysOfWeek([daysOfWeek[0] ?? 1]);
                    }
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

          {showDayPicker && (
            <>
              <Text style={styles.fieldLabel}>
                {cadence === 'weekly' ? 'Pick a day' : 'Pick days'}
              </Text>
              <View style={styles.daysRow}>
                {DAY_LABELS.map(({ num, label: dayLabel }) => {
                  const on = daysOfWeek.includes(num);
                  return (
                    <TouchableOpacity
                      key={num}
                      style={[styles.dayChip, on && styles.dayChipOn]}
                      onPress={() => toggleDay(num)}
                    >
                      <Text style={[styles.dayChipText, on && styles.dayChipTextOn]}>
                        {dayLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {isEditing && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={styles.deleteText}>Delete chore</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={isEditing ? 'Save changes' : 'Add chore'}
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
  options: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: {
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
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dayChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dayChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayChipText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  dayChipTextOn: {
    color: colors.textInverse,
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
});
