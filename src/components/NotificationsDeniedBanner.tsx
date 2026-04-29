import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

// Re-surface the banner at most once per ~24h after a dismiss. Long enough
// not to nag, short enough that a user who dismissed and forgot why DopaMenu
// has been quiet sees it again the next day.
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = '@dopamenu/notifications-banner-dismissed-at';

type Status = 'loading' | 'visible' | 'hidden';

/**
 * Top-of-screen banner shown on the home tab when POST_NOTIFICATIONS is
 * denied. Tapping it opens system app settings. Dismissing it hides for
 * ~24h. Hides itself automatically when the user re-grants in settings.
 *
 * Renders nothing when the permission is granted or when the dismiss-TTL
 * is still active.
 */
export function NotificationsDeniedBanner() {
  const [status, setStatus] = useState<Status>('loading');

  const refresh = useCallback(async () => {
    try {
      const perm = await Notifications.getPermissionsAsync();
      if (perm.status === 'granted') {
        setStatus('hidden');
        return;
      }
      const dismissedAtRaw = await AsyncStorage.getItem(STORAGE_KEY);
      const dismissedAt = dismissedAtRaw ? Number(dismissedAtRaw) : 0;
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) {
        setStatus('hidden');
        return;
      }
      setStatus('visible');
    } catch {
      // Failing safely means hiding — banners that misfire on permission
      // probe errors are worse than a missed nudge.
      setStatus('hidden');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const handleEnable = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      // openSettings is best-effort — if it fails the user can find
      // settings themselves.
    }
  }, []);

  const handleDismiss = useCallback(async () => {
    setStatus('hidden');
    try {
      await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // Persistence failure is acceptable — the in-memory hide still
      // takes effect for the rest of this session.
    }
  }, []);

  if (status !== 'visible') return null;

  return (
    <Pressable onPress={handleEnable} style={styles.container} accessibilityRole="button">
      <Ionicons name="notifications-off" size={20} color="#A05A2A" />
      <View style={styles.body}>
        <Text style={styles.title}>Notifications are off</Text>
        <Text style={styles.subtitle}>
          You won't get reminders or "caught yourself" alerts. Tap to enable.
        </Text>
      </View>
      <Pressable
        onPress={handleDismiss}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification reminder"
        style={styles.close}
      >
        <Ionicons name="close" size={18} color="#7A6F85" />
      </Pressable>
    </Pressable>
  );
}

export default NotificationsDeniedBanner;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FBF1E5',
    borderWidth: 1,
    borderColor: '#E8C9A0',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  body: { flex: 1 },
  title: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: '#5A3818',
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    color: '#5A3818',
    marginTop: 2,
    lineHeight: 16,
  },
  close: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
