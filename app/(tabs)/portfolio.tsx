import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, PortfolioCategory } from '../../src/components';
import { usePortfolioStore } from '../../src/stores/portfolioStore';
import { formatDate } from '../../src/utils/helpers';
import { colors, spacing, borderRadius, typography } from '../../src/constants/theme';

// ============================================
// Portfolio / Daily Reflection Screen
// ============================================

export default function PortfolioScreen() {
  const { getTodayPortfolio, toggleCategory, setGoodDayRating, setNotes } = usePortfolioStore();
  const portfolio = getTodayPortfolio();

  const [showNotes, setShowNotes] = useState(false);

  const handleRating = (rating: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGoodDayRating(rating);
  };

  const completedCount = portfolio.categories.filter((c) => c.completed).length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Daily Balance</Text>
          <Text style={styles.date}>{formatDate(new Date())}</Text>
        </View>

        {/* Intro text */}
        <Text style={styles.intro}>
          Not a to-do list. Just a gentle check-in on the kinds of activities that
          made it into your day.
        </Text>

        {/* Categories */}
        <View style={styles.categoriesSection}>
          <Text style={styles.sectionTitle}>What showed up today?</Text>
          <View style={styles.categoriesList}>
            {portfolio.categories.map((category) => (
              <PortfolioCategory
                key={category.id}
                category={category}
                onToggle={() => toggleCategory(category.id)}
              />
            ))}
          </View>
        </View>

        {/* Summary */}
        <Card variant="filled" style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            <Ionicons
              name={completedCount >= 3 ? 'sunny' : 'partly-sunny'}
              size={32}
              color={colors.primary}
            />
            <View style={styles.summaryText}>
              <Text style={styles.summaryTitle}>
                {completedCount === 0
                  ? 'Start checking in'
                  : completedCount < 3
                  ? 'Building balance'
                  : 'Well-rounded day'}
              </Text>
              <Text style={styles.summarySubtitle}>
                {completedCount} of {portfolio.categories.length} categories touched
              </Text>
            </View>
          </View>
        </Card>

        {/* Rating */}
        <View style={styles.ratingSection}>
          <Text style={styles.sectionTitle}>How does today feel? (optional)</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((rating) => (
              <TouchableOpacity
                key={rating}
                style={[
                  styles.ratingButton,
                  portfolio.goodDayRating === rating && styles.ratingButtonActive,
                ]}
                onPress={() => handleRating(rating)}
              >
                <Text
                  style={[
                    styles.ratingEmoji,
                    portfolio.goodDayRating === rating && styles.ratingEmojiActive,
                  ]}
                >
                  {rating === 1 && '😔'}
                  {rating === 2 && '😐'}
                  {rating === 3 && '🙂'}
                  {rating === 4 && '😊'}
                  {rating === 5 && '😄'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {portfolio.goodDayRating && (
            <Text style={styles.ratingLabel}>
              {portfolio.goodDayRating <= 2
                ? "That's okay. Tomorrow is fresh."
                : portfolio.goodDayRating === 3
                ? 'A solid day.'
                : 'Great to hear!'}
            </Text>
          )}
        </View>

        {/* Notes */}
        <View style={styles.notesSection}>
          <TouchableOpacity
            style={styles.notesToggle}
            onPress={() => setShowNotes(!showNotes)}
          >
            <Text style={styles.sectionTitle}>Add a note (optional)</Text>
            <Ionicons
              name={showNotes ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {showNotes && (
            <TextInput
              style={styles.notesInput}
              placeholder="Anything you want to remember about today..."
              placeholderTextColor={colors.textTertiary}
              value={portfolio.notes || ''}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          )}
        </View>

        {/* Footer message */}
        <Text style={styles.footerMessage}>
          This is your private reflection. No streaks, no pressure.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.md,
    paddingTop: spacing.md,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  date: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  intro: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    lineHeight: typography.sizes.md * typography.lineHeights.normal,
    marginBottom: spacing.lg,
  },
  categoriesSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  categoriesList: {
    gap: spacing.sm,
  },
  summaryCard: {
    marginBottom: spacing.lg,
  },
  summaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryText: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  summarySubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  ratingSection: {
    marginBottom: spacing.lg,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  ratingButton: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 60,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  ratingButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaded,
  },
  ratingEmoji: {
    fontSize: 24,
    opacity: 0.5,
  },
  ratingEmojiActive: {
    opacity: 1,
  },
  ratingLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  notesSection: {
    marginBottom: spacing.lg,
  },
  notesToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notesInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    minHeight: 100,
  },
  footerMessage: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
