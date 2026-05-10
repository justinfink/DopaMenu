import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card } from '..';
import { useUserStore } from '../../stores/userStore';
import { useCustomInterventionsStore } from '../../stores/customInterventionsStore';
import { appUsageService, deriveMonitoringWindows } from '../../services/appUsage';
import {
  setDisarmedKeysForIos,
  setAppWindowsForIos,
  deriveAppWindowsForIos,
} from '../../services/iosFamilyControls';
import {
  parseHHMM,
  rangesOverlap,
  formatHHMMForDisplay,
  toMinutes,
} from '../../utils/time';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';
import { TrackedAppConfig, MonitoringWindow, TimeRange } from '../../models';

// ============================================
// QuickEditPanel — three collapsible inline editors on the home page so the
// user can tweak quiet hours, triggers (with per-app monitoring windows), and
// custom activities without rerunning onboarding.
// ============================================

type SectionKey = 'quiet' | 'triggers' | 'activities';

interface QuickEditPanelProps {
  // Externally-controlled "open this section" — used by LiveMenu's
  // "Edit quiet hours" link to expand the relevant editor.
  expandedSection?: SectionKey | null;
  onSectionChange?: (key: SectionKey | null) => void;
}

export function QuickEditPanel({
  expandedSection: controlledExpanded,
  onSectionChange,
}: QuickEditPanelProps) {
  const [internalExpanded, setInternalExpanded] = useState<SectionKey | null>(
    null,
  );
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = (key: SectionKey | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onSectionChange) onSectionChange(key);
    else setInternalExpanded(key);
  };

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <SectionHeader
          icon="moon"
          title="Quiet hours"
          expanded={expanded === 'quiet'}
          onToggle={() => setExpanded(expanded === 'quiet' ? null : 'quiet')}
        />
        {expanded === 'quiet' && <QuietHoursEditor />}
      </Card>

      <Card style={styles.card}>
        <SectionHeader
          icon="phone-portrait-outline"
          title="Triggers"
          expanded={expanded === 'triggers'}
          onToggle={() =>
            setExpanded(expanded === 'triggers' ? null : 'triggers')
          }
        />
        {expanded === 'triggers' && <TriggersEditor />}
      </Card>

      <Card style={styles.card}>
        <SectionHeader
          icon="restaurant-outline"
          title="My activities"
          expanded={expanded === 'activities'}
          onToggle={() =>
            setExpanded(expanded === 'activities' ? null : 'activities')
          }
        />
        {expanded === 'activities' && <ActivitiesEditor />}
      </Card>
    </View>
  );
}

// ============================================
// Section header — expandable chevron row.
// ============================================

function SectionHeader({
  icon,
  title,
  expanded,
  onToggle,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity onPress={onToggle} style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={20}
        color={colors.textSecondary}
      />
    </TouchableOpacity>
  );
}

// ============================================
// 1) Quiet Hours editor
// ============================================

function QuietHoursEditor() {
  const user = useUserStore((s) => s.user);
  const addQuietHours = useUserStore((s) => s.addQuietHours);
  const removeQuietHoursById = useUserStore((s) => s.removeQuietHoursById);
  const updateQuietHourAt = useUserStore((s) => s.updateQuietHourAt);

  if (!user) return null;
  const quietHours = user.preferences.quietHours;

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addQuietHours('22:00', '07:00');
  };

  const handleDelete = (id?: string) => {
    if (!id) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    removeQuietHoursById(id);
  };

  // Show overlap warning if any pair of ranges intersects.
  const overlap = useMemo(() => {
    for (let i = 0; i < quietHours.length; i++) {
      for (let j = i + 1; j < quietHours.length; j++) {
        if (rangesOverlap(quietHours[i], quietHours[j])) return true;
      }
    }
    return false;
  }, [quietHours]);

  return (
    <View style={styles.sectionBody}>
      <Text style={styles.helper}>
        During quiet hours, DopaMenu stays silent — no app-detect interventions, no high-risk
        reminders, the home menu hushes. Use it for sleep, deep work, or focus blocks. The
        widget keeps showing your last menu so you can still glance at it.
      </Text>

      {quietHours.map((range) => (
        <QuietRangeRow
          key={range.id ?? `${range.start}-${range.end}`}
          range={range}
          onChange={(next) => {
            if (range.id) updateQuietHourAt(range.id, next);
          }}
          onDelete={() => handleDelete(range.id)}
        />
      ))}

      {overlap && (
        <View style={styles.overlapHint}>
          <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.overlapText}>
            These windows overlap — DopaMenu treats them as one continuous quiet block.
          </Text>
        </View>
      )}

      <TouchableOpacity onPress={handleAdd} style={styles.dashedAdd}>
        <Ionicons name="add-circle" size={20} color={colors.primary} />
        <Text style={styles.dashedAddText}>Add a quiet window</Text>
      </TouchableOpacity>
    </View>
  );
}

function QuietRangeRow({
  range,
  onChange,
  onDelete,
}: {
  range: TimeRange;
  onChange: (next: { start: string; end: string }) => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.quietRow}>
      <TimePill
        value={range.start}
        onChange={(start) => onChange({ start, end: range.end })}
        label="Start"
      />
      <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
      <TimePill
        value={range.end}
        onChange={(end) => onChange({ start: range.start, end })}
        label="End"
      />
      <TouchableOpacity onPress={onDelete} style={styles.iconButton}>
        <Ionicons name="trash-outline" size={18} color={colors.error} />
      </TouchableOpacity>
    </View>
  );
}

// Tappable HH:mm pill. Tap to enter edit mode (TextInput), blur to save.
// No external time-picker dependency.
function TimePill({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    const parsed = parseHHMM(draft);
    if (parsed) {
      const formatted = `${parsed.h.toString().padStart(2, '0')}:${parsed.m.toString().padStart(2, '0')}`;
      onChange(formatted);
    }
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <TextInput
        value={draft}
        onChangeText={(text) => {
          // Auto-insert colon after 2 digits as user types.
          const digits = text.replace(/\D/g, '').slice(0, 4);
          if (digits.length <= 2) {
            setDraft(digits);
          } else {
            setDraft(`${digits.slice(0, 2)}:${digits.slice(2)}`);
          }
        }}
        onBlur={commit}
        onSubmitEditing={commit}
        autoFocus
        keyboardType="number-pad"
        maxLength={5}
        style={styles.timePillEditing}
        accessibilityLabel={label}
      />
    );
  }

  return (
    <TouchableOpacity
      onPress={() => {
        setDraft(value);
        setEditing(true);
      }}
      style={styles.timePill}
    >
      <Text style={styles.timePillText}>{formatHHMMForDisplay(value)}</Text>
    </TouchableOpacity>
  );
}

// ============================================
// 2) Triggers editor (with per-app monitoring windows)
// ============================================

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // 1=Mon..7=Sun

function TriggersEditor() {
  const user = useUserStore((s) => s.user);
  const updatePreferences = useUserStore((s) => s.updatePreferences);

  if (!user) return null;
  const trackedApps = user.preferences.trackedApps;

  const handleToggle = async (packageName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = trackedApps.map((a) =>
      a.packageName === packageName ? { ...a, enabled: !a.enabled } : a,
    );
    updatePreferences({ trackedApps: updated });
    if (user.preferences.appMonitoringEnabled && Platform.OS === 'android') {
      const enabled = updated.filter((a) => a.enabled);
      await appUsageService.startMonitoring(enabled);
    }
    // iOS v19: also push the disarmed-key list to App Group so the Pause
    // Shortcut's silence gate halts on disarmed apps. The userStore
    // subscription in _layout.tsx ALSO does this — pushing here too
    // means the change takes effect synchronously on this fire instead
    // of waiting for the subscription tick.
    if (Platform.OS === 'ios') {
      const disarmed: string[] = [];
      for (const a of updated) {
        if (a.enabled) continue;
        if (a.iosBundleId) disarmed.push(a.iosBundleId);
        if (a.label) disarmed.push(a.label);
        if (a.catalogId) disarmed.push(a.catalogId);
        if (a.packageName) disarmed.push(a.packageName);
      }
      setDisarmedKeysForIos(disarmed);
    }
  };

  return (
    <View style={styles.sectionBody}>
      <Text style={styles.helper}>
        Apps DopaMenu watches. Tap to toggle. Expand any row for advanced
        per-app rules (e.g. only monitor on weekday afternoons).
      </Text>

      {trackedApps.map((app) => (
        <TrackedAppRow key={app.packageName} app={app} onToggle={() => handleToggle(app.packageName)} />
      ))}

      <TouchableOpacity
        onPress={() => router.push('/onboarding/pick-problem-apps')}
        style={styles.dashedAdd}
      >
        <Ionicons name="add-circle" size={20} color={colors.primary} />
        <Text style={styles.dashedAddText}>Add or remove apps</Text>
      </TouchableOpacity>
    </View>
  );
}

function TrackedAppRow({
  app,
  onToggle,
}: {
  app: TrackedAppConfig;
  onToggle: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const triggerPrefs = useUserStore(
    (s) => s.user?.preferences.triggerPreferences ?? {},
  );
  const customInterventions = useCustomInterventionsStore(
    (s) => s.interventions,
  );
  const pinnedIds = triggerPrefs[app.packageName] ?? [];
  // Stale-pin guard — drop ids that point to deleted activities.
  const pinnedActivities = pinnedIds
    .map((id) => customInterventions.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  const hasWindow = !!app.monitoringWindow;
  const windowSummary = app.monitoringWindow
    ? `${formatHHMMForDisplay(app.monitoringWindow.start)} – ${formatHHMMForDisplay(app.monitoringWindow.end)}`
    : null;

  return (
    <View style={[styles.trackedRow, app.enabled && styles.trackedRowOn]}>
      <TouchableOpacity onPress={onToggle} style={styles.trackedRowMain}>
        <View style={styles.trackedRowText}>
          <Text style={styles.trackedRowLabel}>{app.label}</Text>
          {hasWindow && windowSummary && (
            <Text style={styles.trackedRowMeta}>Window: {windowSummary}</Text>
          )}
          {pinnedActivities.length > 0 && (
            <View style={styles.pinChipRow}>
              {pinnedActivities.slice(0, 3).map((p) => (
                <View key={p.id} style={styles.pinChip}>
                  <Ionicons name="pin" size={10} color={colors.primary} />
                  <Text style={styles.pinChipText} numberOfLines={1}>
                    {p.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <Ionicons
          name={app.enabled ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={app.enabled ? colors.primary : colors.textTertiary}
        />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowAdvanced((v) => !v);
        }}
        style={styles.advancedToggle}
      >
        <Ionicons
          name={showAdvanced ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textSecondary}
        />
        <Text style={styles.advancedToggleText}>
          {showAdvanced ? 'Hide advanced' : 'Advanced'}
        </Text>
      </TouchableOpacity>
      {showAdvanced && <AppAdvanced app={app} />}
    </View>
  );
}

function AppAdvanced({ app }: { app: TrackedAppConfig }) {
  const setMonitoringWindow = useUserStore((s) => s.setMonitoringWindow);
  const trackedApps = useUserStore((s) => s.user?.preferences.trackedApps ?? []);
  const window = app.monitoringWindow;
  const enabled = !!window;

  const persistWindow = (next: MonitoringWindow | null) => {
    setMonitoringWindow(app.packageName, next);
    // Push the entire windows map to native — the chokepoint reads from there
    // for both AccessibilityService and FGS poller paths (Android), and the
    // ShouldSilencePauseIntent App Group blob (iOS). Recompute from the
    // store snapshot we just mutated.
    const updatedApps = trackedApps.map((a) =>
      a.packageName === app.packageName
        ? { ...a, monitoringWindow: next ?? undefined }
        : a,
    );
    if (Platform.OS === 'android') {
      void appUsageService.setMonitoringWindows(deriveMonitoringWindows(updatedApps));
    } else if (Platform.OS === 'ios') {
      // v19: write the per-app windows to App Group. Pause Shortcut's
      // silence gate consults this on every fire — outside the window
      // means silenced.
      setAppWindowsForIos(deriveAppWindowsForIos(updatedApps));
    }
  };

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (enabled) {
      persistWindow(null);
    } else {
      persistWindow({ start: '09:00', end: '17:00' });
    }
  };

  const updateTime = (key: 'start' | 'end', value: string) => {
    if (!window) return;
    const next: MonitoringWindow = { ...window, [key]: value };
    persistWindow(next);
  };

  const toggleDay = (day: number) => {
    if (!window) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = window.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort();
    persistWindow({ ...window, daysOfWeek: next.length === 7 ? undefined : next });
  };

  // iOS v19: same UI as Android. The window is written to the App Group's
  // appWindows key; ShouldSilencePauseIntent reads it on every Pause
  // Shortcut fire and halts when the user is outside the configured window.
  // No platform branching — both surfaces drive the same dynamic state.

  return (
    <View style={styles.advancedBody}>
      <View style={styles.advancedRowSwitch}>
        <Text style={styles.advancedSwitchLabel}>Only monitor during a window</Text>
        <TouchableOpacity onPress={toggle} style={styles.windowSwitch}>
          <Ionicons
            name={enabled ? 'toggle' : 'toggle-outline'}
            size={28}
            color={enabled ? colors.primary : colors.textTertiary}
          />
        </TouchableOpacity>
      </View>

      {enabled && window && (
        <>
          <View style={styles.windowTimes}>
            <TimePill value={window.start} onChange={(v) => updateTime('start', v)} label="Window start" />
            <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
            <TimePill value={window.end} onChange={(v) => updateTime('end', v)} label="Window end" />
          </View>

          <Text style={styles.helperSmall}>Active days</Text>
          <View style={styles.dayRow}>
            {DAY_LABELS.map((label, i) => {
              const dayNum = i + 1;
              const days = window.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7];
              const on = days.includes(dayNum);
              return (
                <TouchableOpacity
                  key={dayNum}
                  onPress={() => toggleDay(dayNum)}
                  style={[styles.dayChip, on && styles.dayChipOn]}
                >
                  <Text style={[styles.dayChipText, on && styles.dayChipTextOn]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

// ============================================
// 3) Activities editor — list custom interventions, deep-link to /activity-edit.
// ============================================

function ActivitiesEditor() {
  const user = useUserStore((s) => s.user);
  const interventions = useCustomInterventionsStore((s) => s.interventions);

  const trackedApps = user?.preferences.trackedApps ?? [];
  const triggerPrefs = user?.preferences.triggerPreferences ?? {};

  const pinSummary = (id: string): string => {
    const apps = trackedApps
      .filter((a) => (triggerPrefs[a.packageName] ?? []).includes(id))
      .map((a) => a.label);
    if (apps.length === 0) return '';
    return `Top choice for ${apps.join(', ')}`;
  };

  return (
    <View style={styles.sectionBody}>
      <Text style={styles.helper}>
        The menu DopaMenu offers when you reach for a tracked app. Pin a favorite as the top
        choice for any specific app from inside the activity editor.
      </Text>

      {interventions.map((item) => {
        const summary = pinSummary(item.id);
        const iconName = (item.icon as React.ComponentProps<typeof Ionicons>['name']) || 'sparkles';
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => router.push({ pathname: '/activity-edit', params: { id: item.id } })}
            style={styles.activityRow}
          >
            <View style={styles.activityIcon}>
              <Ionicons name={iconName} size={20} color={colors.primary} />
            </View>
            <View style={styles.activityText}>
              <Text style={styles.activityLabel} numberOfLines={1}>
                {item.label}
              </Text>
              {summary ? (
                <View style={styles.pinRow}>
                  <Ionicons name="pin" size={12} color={colors.primary} />
                  <Text style={styles.pinSummary} numberOfLines={1}>
                    {summary}
                  </Text>
                </View>
              ) : item.description ? (
                <Text style={styles.activityDesc} numberOfLines={1}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        onPress={() => router.push('/activity-edit')}
        style={styles.dashedAdd}
      >
        <Ionicons name="add-circle" size={20} color={colors.primary} />
        <Text style={styles.dashedAddText}>Add an activity</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================
// Styles
// ============================================

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.sm,
    padding: 0,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionIcon: {
    width: 32,
    height: 32,
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
  sectionBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  helper: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  helperSmall: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dashedAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },
  dashedAddText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.primary,
  },

  // Quiet hours
  quietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  iconButton: {
    padding: spacing.xs,
    marginLeft: 'auto',
  },
  timePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 84,
    alignItems: 'center',
  },
  timePillText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  timePillEditing: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    minWidth: 84,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  overlapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  overlapText: {
    fontSize: typography.sizes.xs,
    color: colors.warning,
    flex: 1,
  },

  // Triggers
  trackedRow: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  trackedRowOn: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.primaryFaded,
  },
  trackedRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  trackedRowText: {
    flex: 1,
  },
  trackedRowLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  trackedRowMeta: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pinChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  pinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    maxWidth: 160,
  },
  pinChipText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  advancedToggleText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  advancedBody: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.sm,
  },
  advancedRowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  advancedSwitchLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    fontWeight: typography.weights.medium,
  },
  windowSwitch: {
    padding: 2,
  },
  windowTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dayRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayChipText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  dayChipTextOn: {
    color: colors.textInverse,
  },

  // Activities
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityText: {
    flex: 1,
  },
  activityLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  activityDesc: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  pinSummary: {
    fontSize: typography.sizes.sm,
    color: colors.primary,
    fontWeight: typography.weights.medium,
    flexShrink: 1,
  },
});

export default QuickEditPanel;
