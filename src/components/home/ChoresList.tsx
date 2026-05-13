import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card } from '..';
import { useChoresStore } from '../../stores/choresStore';
import { Chore } from '../../models';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';

// ============================================
// ChoresList — today's off-phone chores. Inline checkbox + quick-add.
// Lives between LiveMenu and QuickEditPanel on the home page.
// ============================================

function ChoreRow({
  chore,
  done,
  onToggle,
  onEdit,
}: {
  chore: Chore;
  done: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        style={styles.checkbox}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
      >
        <Ionicons
          name={done ? 'checkmark-circle' : 'ellipse-outline'}
          size={26}
          color={done ? colors.primary : colors.textTertiary}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={onEdit} style={styles.rowBody} activeOpacity={0.7}>
        <Text
          style={[styles.rowLabel, done && styles.rowLabelDone]}
          numberOfLines={1}
        >
          {chore.label}
        </Text>
        {chore.cadence !== 'daily' && chore.cadence !== 'once' && (
          <Text style={styles.rowMeta}>
            {chore.cadence === 'weekly' ? 'Weekly' : 'Custom days'}
          </Text>
        )}
        {chore.cadence === 'once' && <Text style={styles.rowMeta}>One-time</Text>}
      </TouchableOpacity>
    </View>
  );
}

export function ChoresList() {
  const chores = useChoresStore((s) => s.chores);
  const addChore = useChoresStore((s) => s.addChore);
  const toggleChoreForToday = useChoresStore((s) => s.toggleChoreForToday);
  const isCompletedToday = useChoresStore((s) => s.isCompletedToday);
  const getChoresForToday = useChoresStore((s) => s.getChoresForToday);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const submittedDraftRef = useRef<string | null>(null);

  // Recompute todays list when chores change. We pass `chores` through the
  // selector so we re-render on add/delete, then call the helper to apply
  // day-of-week filtering.
  void chores; // referenced for re-render dep
  const today = getChoresForToday();
  const totalToday = today.length;
  const doneToday = today.filter((c) => isCompletedToday(c.id)).length;

  const handleQuickAdd = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    if (submittedDraftRef.current === trimmed) return;
    submittedDraftRef.current = trimmed;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addChore({ label: trimmed, cadence: 'daily' });
    setDraft('');
    setAdding(false);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="checkmark-done" size={16} color={colors.primary} />
          <Text style={styles.headerTitle}>
            Today's chores
            {totalToday > 0 && (
              <Text style={styles.headerCount}>
                {`  ·  ${doneToday} of ${totalToday}`}
              </Text>
            )}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/chore-edit' as never)}
          accessibilityLabel="Add chore with options"
        >
          <Ionicons name="options-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {today.length === 0 && !adding && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Nothing on your list. Add a chore to keep your DopaMenu in balance with real life.
          </Text>
        </View>
      )}

      {today.map((chore) => (
        <ChoreRow
          key={chore.id}
          chore={chore}
          done={isCompletedToday(chore.id)}
          onToggle={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleChoreForToday(chore.id);
          }}
          onEdit={() =>
            router.push({ pathname: '/chore-edit' as never, params: { id: chore.id } } as never)
          }
        />
      ))}

      {adding ? (
        <View style={styles.addRow}>
          <Ionicons name="ellipse-outline" size={26} color={colors.textTertiary} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="What needs doing?"
            placeholderTextColor={colors.textTertiary}
            style={styles.addInput}
            autoFocus
            onSubmitEditing={handleQuickAdd}
            returnKeyType="done"
            blurOnSubmit
            onBlur={handleQuickAdd}
            maxLength={80}
          />
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            submittedDraftRef.current = null;
            setAdding(true);
          }}
          style={styles.addCta}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.addCtaText}>Add a chore</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
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
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerCount: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    fontWeight: typography.weights.medium,
    textTransform: 'none',
    letterSpacing: 0,
  },
  empty: {
    paddingVertical: spacing.md,
  },
  emptyText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  checkbox: {
    paddingVertical: spacing.xs,
  },
  rowBody: {
    flex: 1,
  },
  rowLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  rowLabelDone: {
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  rowMeta: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    marginTop: spacing.xs,
  },
  addInput: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    paddingVertical: spacing.xs,
  },
  addCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  addCtaText: {
    fontSize: typography.sizes.sm,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
});

export default ChoresList;
