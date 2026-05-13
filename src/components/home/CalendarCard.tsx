import React, { useEffect } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '..';
import { useCalendarStore } from '../../stores/calendarStore';
import { calendarService } from '../../services/calendar';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';
import type { CalendarAccount, CalendarEventItem } from '../../models/calendar';

function formatClock(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatProvider(provider: CalendarAccount['provider']): string {
  if (provider === 'google') return 'Google';
  if (provider === 'outlook') return 'Outlook';
  return 'Device';
}

function EventLine({ event, label }: { event?: CalendarEventItem; label: string }) {
  if (!event) return null;
  return (
    <View style={styles.eventLine}>
      <Text style={styles.eventLabel}>{label}</Text>
      <Text style={styles.eventTitle} numberOfLines={1}>
        {event.title}
      </Text>
      <Text style={styles.eventMeta}>
        {formatClock(event.startDate)}-{formatClock(event.endDate)}
        {event.location ? ` · ${event.location}` : ''}
      </Text>
    </View>
  );
}

export function CalendarCard() {
  const {
    accounts,
    calendars,
    error,
    isSyncing,
    lastSyncedAt,
    getInsight,
  } = useCalendarStore();
  const insight = getInsight();

  useEffect(() => {
    if (accounts.length > 0 && !lastSyncedAt && !isSyncing) {
      void handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  const handleConnect = async (provider: 'google' | 'outlook' | 'device') => {
    useCalendarStore.getState().setError(undefined);
    useCalendarStore.getState().setSyncing(true);
    try {
      if (provider === 'google') await calendarService.connectGoogle();
      else if (provider === 'outlook') await calendarService.connectOutlook();
      else await calendarService.connectDevice();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not connect calendar.';
      useCalendarStore.getState().setError(message);
      Alert.alert('Calendar connection failed', message);
    } finally {
      useCalendarStore.getState().setSyncing(false);
    }
  };

  const handleSync = async () => {
    try {
      await calendarService.syncAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not sync calendar.';
      Alert.alert('Calendar sync failed', message);
    }
  };

  const handleDisconnect = (account: CalendarAccount) => {
    Alert.alert(
      `Disconnect ${formatProvider(account.provider)}?`,
      'DopaMenu will remove stored tokens and stop syncing this calendar account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            void calendarService.disconnect(account.id);
          },
        },
      ],
    );
  };

  const handleScheduleReset = async () => {
    const writable = accounts.find((account) => account.writableCalendarId);
    if (!writable) {
      Alert.alert('No writable calendar', 'Connect a calendar that allows DopaMenu to create events.');
      return;
    }
    const now = new Date();
    const start = insight.currentEvent
      ? new Date(insight.currentEvent.endDate)
      : new Date(now.getTime() + 5 * 60_000);
    const end = new Date(start.getTime() + 20 * 60_000);
    try {
      await calendarService.createEvent(writable.id, {
        title: 'DopaMenu reset',
        notes: 'A short intentional break scheduled from DopaMenu.',
        startDate: start,
        endDate: end,
      });
      Alert.alert('Added to calendar', `Scheduled ${formatClock(start.toISOString())}-${formatClock(end.toISOString())}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create calendar event.';
      Alert.alert('Could not add event', message);
    }
  };

  const connected = accounts.length > 0;
  const selectedCount = calendars.filter((calendar) => calendar.isSelected).length;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="calendar" size={18} color={colors.primary} />
          <Text style={styles.headerTitle}>Calendar</Text>
        </View>
        {connected && (
          <TouchableOpacity onPress={handleSync} disabled={isSyncing} style={styles.syncButton}>
            <Ionicons
              name={isSyncing ? 'sync' : 'refresh'}
              size={15}
              color={colors.primary}
            />
            <Text style={styles.syncText}>{isSyncing ? 'Syncing' : 'Sync'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!connected ? (
        <View>
          <Text style={styles.body}>
            Connect Google Calendar or Outlook so DopaMenu can read your actual schedule
            and create calendar blocks when you choose an action.
          </Text>
          <View style={styles.buttonRow}>
            <ConnectButton label="Google" icon="logo-google" onPress={() => handleConnect('google')} />
            <ConnectButton label="Outlook" icon="mail" onPress={() => handleConnect('outlook')} />
            <ConnectButton label="Device" icon="phone-portrait" onPress={() => handleConnect('device')} />
          </View>
          <Text style={styles.disclaimer}>
            Full title, location, notes, attendee, and write access is requested. You can disconnect any time.
          </Text>
        </View>
      ) : (
        <View>
          <View style={styles.accountChips}>
            {accounts.map((account) => (
              <TouchableOpacity
                key={account.id}
                style={styles.accountChip}
                onPress={() => handleDisconnect(account)}
              >
                <Text style={styles.accountLine} numberOfLines={1}>
                  {formatProvider(account.provider)}
                  {account.email ? ` · ${account.email}` : ''}
                </Text>
                <Ionicons name="close" size={13} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.contextRow}>
            <View style={styles.contextPill}>
              <Text style={styles.contextValue}>{insight.eventsToday}</Text>
              <Text style={styles.contextLabel}>events</Text>
            </View>
            <View style={styles.contextPill}>
              <Text style={styles.contextValue}>{Math.round(insight.scheduledMinutesToday / 60)}h</Text>
              <Text style={styles.contextLabel}>scheduled</Text>
            </View>
            <View style={styles.contextPill}>
              <Text style={styles.contextValue}>{insight.cognitiveLoad}</Text>
              <Text style={styles.contextLabel}>load</Text>
            </View>
          </View>
          <EventLine event={insight.currentEvent} label="Now" />
          <EventLine event={insight.nextEvent} label="Next" />
          {!insight.currentEvent && !insight.nextEvent && (
            <Text style={styles.body}>No upcoming events in the synced window.</Text>
          )}
          {insight.freeMinutesUntilNext !== null && !insight.currentEvent && (
            <Text style={styles.freeWindow}>
              {insight.freeMinutesUntilNext} minutes free before your next event.
            </Text>
          )}
          <View style={styles.footerRow}>
            <Text style={styles.selectedText}>
              {selectedCount} calendar{selectedCount === 1 ? '' : 's'} selected
            </Text>
            <TouchableOpacity onPress={handleScheduleReset} style={styles.scheduleButton}>
              <Ionicons name="add" size={15} color={colors.textInverse} />
              <Text style={styles.scheduleText}>Schedule reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </Card>
  );
}

function ConnectButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.connectButton} onPress={onPress}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.connectText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryFaded,
  },
  syncText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  body: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: colors.surface,
  },
  connectText: {
    fontSize: typography.sizes.sm,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  disclaimer: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    lineHeight: 16,
  },
  accountLine: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    maxWidth: 230,
  },
  accountChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.divider,
  },
  contextRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  contextPill: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: '#F4EEFB',
  },
  contextValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  contextLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  eventLine: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  eventLabel: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  eventTitle: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    fontWeight: typography.weights.semibold,
  },
  eventMeta: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  freeWindow: {
    fontSize: typography.sizes.xs,
    color: colors.success,
    fontWeight: typography.weights.semibold,
    marginTop: spacing.xs,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  selectedText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  scheduleText: {
    color: colors.textInverse,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
  },
  error: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.xs,
    color: colors.error,
  },
});

export default CalendarCard;
