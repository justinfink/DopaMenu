import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { InterventionCard, Button } from '../src/components';
import { useRedirectStore } from '../src/stores/redirectStore';
import { useUserStore } from '../src/stores/userStore';
import { useInterventionStore } from '../src/stores/interventionStore';
import { colors, spacing, typography, borderRadius } from '../src/constants/theme';

// ============================================
// Redirect Overlay
// Full-screen modal shown when a timewaster
// app is detected. Identity-aware messaging.
// ============================================

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function RedirectScreen() {
  const { activeRedirect, completeRedirect } = useRedirectStore();
  const { user } = useUserStore();
  const { activeIntervention } = useInterventionStore();

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Slide in animation
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 25,
      stiffness: 200,
      useNativeDriver: true,
    }).start();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeRedirect) {
        setElapsed(Math.floor((Date.now() - activeRedirect.startedAt) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeRedirect]);

  if (!activeRedirect) {
    return null;
  }

  const intervention = activeRedirect.intervention;
  const primaryIdentity = user?.identityAnchors[0]?.label || 'Your best';
  const sourceAppName = activeRedirect.sourceAppName;

  const handleRedirect = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeRedirect('redirected');
    router.back();
  };

  const handleSnooze = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    completeRedirect('snoozed');
    router.back();
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    completeRedirect('continued');
    router.back();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <View style={styles.overlay}>
      <Animated.View
        style={[
          styles.container,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Timer */}
        <View style={styles.timerRow}>
          <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.5)" />
          <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
        </View>

        {/* Source app info */}
        <View style={styles.sourceSection}>
          <View style={styles.sourceIconContainer}>
            <Ionicons name="warning" size={32} color="#FF9800" />
          </View>
          <Text style={styles.sourceText}>
            You opened <Text style={styles.sourceAppName}>{sourceAppName}</Text>
          </Text>
          <Text style={styles.identityText}>
            Here's what {primaryIdentity} You would do instead:
          </Text>
        </View>

        {/* Primary intervention */}
        {intervention?.primary && (
          <TouchableOpacity style={styles.interventionSection} onPress={handleRedirect} activeOpacity={0.8}>
            <InterventionCard
              intervention={intervention.primary}
              isPrimary
            />
          </TouchableOpacity>
        )}

        {/* Alternatives */}
        {!showAlternatives && intervention?.alternatives && intervention.alternatives.length > 0 && (
          <TouchableOpacity
            style={styles.alternativesToggle}
            onPress={() => {
              setShowAlternatives(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={styles.alternativesText}>See other options</Text>
            <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        )}

        {showAlternatives && intervention?.alternatives?.map((alt) => (
          <TouchableOpacity key={alt.id} style={styles.altCard} activeOpacity={0.8} onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            completeRedirect('redirected');
            router.back();
          }}>
            <InterventionCard
              intervention={alt}
              isPrimary={false}
            />
          </TouchableOpacity>
        ))}

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryAction} onPress={handleRedirect}>
            <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>I'll do this instead</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryAction} onPress={handleSnooze}>
            <Ionicons name="timer-outline" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.secondaryActionText}>Give me 5 minutes</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.continueAction} onPress={handleContinue}>
            <Text style={styles.continueText}>
              Continue to {sourceAppName}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl + 20,
    maxHeight: SCREEN_HEIGHT * 0.92,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  timerText: {
    fontSize: typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  sourceSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  sourceIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  sourceText: {
    fontSize: typography.sizes.lg,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
  sourceAppName: {
    fontWeight: typography.weights.bold as any,
    color: '#FF9800',
  },
  identityText: {
    fontSize: typography.sizes.md,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  interventionSection: {
    marginBottom: spacing.md,
  },
  alternativesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  alternativesText: {
    fontSize: typography.sizes.sm,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  altCard: {
    marginBottom: spacing.sm,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#43A047',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  primaryActionText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold as any,
    color: '#FFFFFF',
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  secondaryActionText: {
    fontSize: typography.sizes.md,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  continueAction: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  continueText: {
    fontSize: typography.sizes.sm,
    color: 'rgba(255, 255, 255, 0.4)',
    textDecorationLine: 'underline',
  },
});
