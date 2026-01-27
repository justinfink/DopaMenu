import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button, Card, InterventionCard } from '../src/components';
import { useInterventionStore } from '../src/stores/interventionStore';
import { useUserStore } from '../src/stores/userStore';
import { InterventionCandidate } from '../src/models';
import { colors, spacing, borderRadius, typography, shadows } from '../src/constants/theme';

// ============================================
// Intervention Modal
// The core intercept UI for suggesting alternatives
// ============================================

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function InterventionScreen() {
  const { activeIntervention, recordOutcome, clearActiveIntervention } = useInterventionStore();
  const { user } = useUserStore();

  const [showAlternatives, setShowAlternatives] = useState(false);
  const [selectedAlternative, setSelectedAlternative] = useState<InterventionCandidate | null>(null);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate in
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 20,
        stiffness: 90,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Haptic feedback on open
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      clearActiveIntervention();
      router.back();
    });
  };

  const handleAccept = (intervention?: InterventionCandidate) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    recordOutcome('accepted');
    handleClose();
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recordOutcome('dismissed');
    handleClose();
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recordOutcome('continued_default');
    handleClose();
  };

  const handleSelectAlternative = (intervention: InterventionCandidate) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAlternative(intervention);
  };

  if (!activeIntervention) {
    return null;
  }

  const displayIntervention = selectedAlternative || activeIntervention.primary;
  const tone = user?.preferences.tone || 'gentle';

  // Adjust messaging based on tone
  const getMessage = () => {
    switch (tone) {
      case 'gentle':
        return activeIntervention.explanation;
      case 'direct':
        return 'Noticed a pattern. Here\'s an option.';
      case 'minimal':
        return '';
      default:
        return activeIntervention.explanation;
    }
  };

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleDismiss}
      />

      <Animated.View
        style={[
          styles.modalContainer,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <SafeAreaView style={styles.safeArea}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleDismiss}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Explanation */}
            {getMessage() && (
              <Text style={styles.explanation}>{getMessage()}</Text>
            )}

            {/* Main title */}
            <Text style={styles.title}>
              {showAlternatives ? 'Other options' : 'Instead, you could...'}
            </Text>

            {/* Primary suggestion or alternatives */}
            {!showAlternatives ? (
              <>
                <TouchableOpacity
                  style={styles.primaryCard}
                  onPress={() => handleAccept()}
                  activeOpacity={0.8}
                >
                  <InterventionCard
                    intervention={displayIntervention}
                    isPrimary
                  />
                </TouchableOpacity>

                {/* See other options */}
                {activeIntervention.alternatives.length > 0 && (
                  <TouchableOpacity
                    style={styles.alternativesLink}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowAlternatives(true);
                    }}
                  >
                    <Text style={styles.alternativesLinkText}>
                      See {activeIntervention.alternatives.length} other options
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                {/* Back to primary */}
                <TouchableOpacity
                  style={styles.backLink}
                  onPress={() => {
                    setShowAlternatives(false);
                    setSelectedAlternative(null);
                  }}
                >
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.backLinkText}>Back to suggestion</Text>
                </TouchableOpacity>

                {/* Alternative list */}
                <View style={styles.alternativesList}>
                  {activeIntervention.alternatives.map((alt) => (
                    <TouchableOpacity
                      key={alt.id}
                      onPress={() => handleSelectAlternative(alt)}
                      activeOpacity={0.7}
                    >
                      <InterventionCard
                        intervention={alt}
                        isPrimary={selectedAlternative?.id === alt.id}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                {selectedAlternative && (
                  <Button
                    title={`Do: ${selectedAlternative.label}`}
                    onPress={() => handleAccept(selectedAlternative)}
                    fullWidth
                    style={styles.selectButton}
                  />
                )}
              </>
            )}
          </ScrollView>

          {/* Footer actions */}
          <View style={styles.footer}>
            {!showAlternatives && (
              <Button
                title="I'll do this"
                onPress={() => handleAccept()}
                size="large"
                fullWidth
              />
            )}

            <TouchableOpacity
              style={styles.continueButton}
              onPress={handleContinue}
            >
              <Text style={styles.continueText}>Continue what I was doing</Text>
            </TouchableOpacity>

            <Text style={styles.reassurance}>
              No judgment. Your choice.
            </Text>
          </View>
        </SafeAreaView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  modalContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: SCREEN_HEIGHT * 0.9,
    ...shadows.lg,
  },
  safeArea: {
    flex: 1,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
  explanation: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: typography.sizes.md * typography.lineHeights.normal,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  primaryCard: {
    marginBottom: spacing.md,
  },
  alternativesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  alternativesLinkText: {
    fontSize: typography.sizes.md,
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  backLinkText: {
    fontSize: typography.sizes.sm,
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },
  alternativesList: {
    gap: spacing.sm,
  },
  selectButton: {
    marginTop: spacing.lg,
  },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  continueButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  continueText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  reassurance: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
