import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

// ============================================
// ChatBubble Component
// For conversational onboarding interface
// ============================================

interface ChatBubbleProps {
  message: string;
  isUser?: boolean;
  timestamp?: string;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isUser = false,
  timestamp,
}) => {
  return (
    <View style={[styles.container, isUser && styles.userContainer]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.message, isUser && styles.userMessage]}>
          {message}
        </Text>
      </View>
      {timestamp && (
        <Text style={[styles.timestamp, isUser && styles.userTimestamp]}>
          {timestamp}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    marginVertical: spacing.xs,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: borderRadius.sm,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: borderRadius.sm,
  },
  message: {
    fontSize: typography.sizes.md,
    lineHeight: typography.sizes.md * typography.lineHeights.normal,
    color: colors.textPrimary,
  },
  userMessage: {
    color: colors.textInverse,
  },
  timestamp: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },
  userTimestamp: {
    marginLeft: 0,
    marginRight: spacing.sm,
  },
});

export default ChatBubble;
