import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ChatBubble, Button } from '../../src/components';
import { useUserStore } from '../../src/stores/userStore';
import { DEFAULT_IDENTITY_ANCHORS } from '../../src/models';
import { colors, spacing, borderRadius, typography, shadows } from '../../src/constants/theme';

// ============================================
// Chat Intake Screen
// Conversational identity anchor setup
// ============================================

interface Message {
  id: string;
  text: string;
  isUser: boolean;
}

type Stage = 'intro' | 'identity' | 'frequency' | 'tone' | 'complete';

const INTRO_MESSAGES: string[] = [
  "Hi! I'm DopaMenu.",
  "I help you make more intentional choices when you reach for your phone automatically.",
  "Let's set things up so I can be helpful without being annoying.",
  "What kind of person do you want to be more of?",
];

const FREQUENCY_MESSAGE = "How often would you like suggestions?";
const TONE_MESSAGE = "What tone works best for you?";
const COMPLETE_MESSAGE = "Perfect! You're all set. I'll be here when you need me.";

export default function ChatIntakeScreen() {
  const { addIdentityAnchor, updatePreferences, completeOnboarding, user } = useUserStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [stage, setStage] = useState<Stage>('intro');
  const [selectedIdentities, setSelectedIdentities] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const introIndexRef = useRef(0);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    // Start intro sequence only once
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      showNextIntroMessage();
    }
  }, []);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const addAssistantMessage = (text: string, callback?: () => void) => {
    setIsTyping(true);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: `msg-${Date.now()}-${Math.random()}`, text, isUser: false },
      ]);
      setIsTyping(false);
      if (callback) callback();
    }, 600);
  };

  const addUserMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `msg-${Date.now()}-${Math.random()}`, text, isUser: true },
    ]);
  };

  const showNextIntroMessage = () => {
    const currentIndex = introIndexRef.current;

    if (currentIndex < INTRO_MESSAGES.length) {
      addAssistantMessage(INTRO_MESSAGES[currentIndex], () => {
        introIndexRef.current = currentIndex + 1;

        if (currentIndex < INTRO_MESSAGES.length - 1) {
          setTimeout(showNextIntroMessage, 800);
        } else {
          setTimeout(() => setStage('identity'), 500);
        }
      });
    }
  };

  const handleIdentitySelect = (label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setSelectedIdentities((prev) => {
      if (prev.includes(label)) {
        return prev.filter((l) => l !== label);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, label];
    });
  };

  const handleIdentityConfirm = () => {
    if (selectedIdentities.length === 0) return;

    // Add user message summarizing selection
    addUserMessage(`I want to be more: ${selectedIdentities.join(', ')}`);

    // Save identities to store
    selectedIdentities.forEach((label) => {
      const anchor = DEFAULT_IDENTITY_ANCHORS.find((a) => a.label === label);
      if (anchor) {
        addIdentityAnchor(anchor);
      }
    });

    // Progress to next stage
    setTimeout(() => {
      addAssistantMessage(FREQUENCY_MESSAGE);
      setTimeout(() => setStage('frequency'), 800);
    }, 500);
  };

  const handleFrequencySelect = (frequency: 'low' | 'medium' | 'high') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const labels = { low: 'Less often', medium: 'Sometimes', high: 'More often' };
    addUserMessage(labels[frequency]);
    updatePreferences({ interventionFrequency: frequency });

    setTimeout(() => {
      addAssistantMessage(TONE_MESSAGE);
      setTimeout(() => setStage('tone'), 800);
    }, 500);
  };

  const handleToneSelect = (tone: 'gentle' | 'direct' | 'minimal') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const labels = { gentle: 'Gentle', direct: 'Direct', minimal: 'Minimal' };
    addUserMessage(labels[tone]);
    updatePreferences({ tone });

    setTimeout(() => {
      addAssistantMessage(COMPLETE_MESSAGE);
      setTimeout(() => setStage('complete'), 800);
    }, 500);
  };

  const handleComplete = () => {
    completeOnboarding();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Setup</Text>
          <View style={styles.backButton} />
        </View>

        {/* Chat area */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg.text} isUser={msg.isUser} />
          ))}

          {isTyping && (
            <View style={styles.typingIndicator}>
              <Text style={styles.typingText}>...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input area based on stage */}
        <View style={styles.inputArea}>
          {stage === 'identity' && (
            <View style={styles.identityPicker}>
              <Text style={styles.pickerLabel}>
                Choose up to 3 identities ({selectedIdentities.length}/3)
              </Text>
              <View style={styles.identityGrid}>
                {DEFAULT_IDENTITY_ANCHORS.map((anchor) => (
                  <TouchableOpacity
                    key={anchor.label}
                    style={[
                      styles.identityChip,
                      selectedIdentities.includes(anchor.label) &&
                        styles.identityChipSelected,
                    ]}
                    onPress={() => handleIdentitySelect(anchor.label)}
                  >
                    <Text
                      style={[
                        styles.identityChipText,
                        selectedIdentities.includes(anchor.label) &&
                          styles.identityChipTextSelected,
                      ]}
                    >
                      {anchor.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Button
                title="Continue"
                onPress={handleIdentityConfirm}
                disabled={selectedIdentities.length === 0}
                fullWidth
              />
            </View>
          )}

          {stage === 'frequency' && (
            <View style={styles.optionPicker}>
              <OptionButton
                label="Less often"
                description="Only when really needed"
                onPress={() => handleFrequencySelect('low')}
              />
              <OptionButton
                label="Sometimes"
                description="A balanced approach"
                onPress={() => handleFrequencySelect('medium')}
                recommended
              />
              <OptionButton
                label="More often"
                description="Frequent check-ins"
                onPress={() => handleFrequencySelect('high')}
              />
            </View>
          )}

          {stage === 'tone' && (
            <View style={styles.optionPicker}>
              <OptionButton
                label="Gentle"
                description="Soft, encouraging nudges"
                onPress={() => handleToneSelect('gentle')}
                recommended
              />
              <OptionButton
                label="Direct"
                description="Clear and straightforward"
                onPress={() => handleToneSelect('direct')}
              />
              <OptionButton
                label="Minimal"
                description="Just the essentials"
                onPress={() => handleToneSelect('minimal')}
              />
            </View>
          )}

          {stage === 'complete' && (
            <View style={styles.completePicker}>
              <Button
                title="Start Using DopaMenu"
                onPress={handleComplete}
                size="large"
                fullWidth
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface OptionButtonProps {
  label: string;
  description: string;
  onPress: () => void;
  recommended?: boolean;
}

function OptionButton({ label, description, onPress, recommended }: OptionButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.optionButton, recommended && styles.optionButtonRecommended]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.optionContent}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
      {recommended && (
        <View style={styles.recommendedBadge}>
          <Text style={styles.recommendedText}>Recommended</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  typingIndicator: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    alignSelf: 'flex-start',
  },
  typingText: {
    fontSize: typography.sizes.lg,
    color: colors.textSecondary,
    letterSpacing: 4,
  },
  inputArea: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  identityPicker: {
    gap: spacing.md,
  },
  pickerLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  identityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  identityChip: {
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
  optionPicker: {
    gap: spacing.sm,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionButtonRecommended: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaded,
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  recommendedBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  recommendedText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    color: colors.textInverse,
  },
  completePicker: {
    paddingVertical: spacing.sm,
  },
});
