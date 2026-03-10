import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppListItem } from '../../src/components';
import { useAppLibraryStore } from '../../src/stores/appLibraryStore';
import { useUserStore } from '../../src/stores/userStore';
import { appCatalogService } from '../../src/services/appCatalog';
import { analyticsService } from '../../src/services';
import { InstalledApp } from '../../src/models';
import { colors, spacing, typography, borderRadius, shadows } from '../../src/constants/theme';

// ============================================
// App Library Screen
// Browse, categorize, and configure apps
// ============================================

type FilterType = 'all' | 'aligned' | 'timewaster' | 'priority' | 'uncategorized';

const FILTERS: { key: FilterType; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'apps' },
  { key: 'aligned', label: 'Aligned', icon: 'checkmark-circle' },
  { key: 'timewaster', label: 'Timewasters', icon: 'warning' },
  { key: 'priority', label: 'Priority', icon: 'star' },
  { key: 'uncategorized', label: 'Uncategorized', icon: 'help-circle' },
];

export default function AppLibraryScreen() {
  const {
    installedApps,
    userConfigs,
    isLoaded,
    activeFilter,
    searchQuery,
    setFilter,
    setSearchQuery,
    getFilteredApps,
    getAppStats,
    addAppFromCatalog,
  } = useAppLibraryStore();
  const { user } = useUserStore();
  const [showCatalog, setShowCatalog] = useState(false);

  useEffect(() => {
    analyticsService.screen('AppLibrary');

    // If no apps loaded yet, populate from catalog common timewasters
    if (!isLoaded || installedApps.length === 0) {
      const catalog = appCatalogService.getAll();
      catalog.forEach(app => addAppFromCatalog(app));
    }
  }, []);

  const filteredApps = getFilteredApps();
  const stats = getAppStats();

  const identityMap = new Map(
    user?.identityAnchors.map(a => [a.id, a.label]) || []
  );

  const getIdentityLabels = (appId: string): string[] => {
    const config = userConfigs[appId];
    if (!config?.identityGoals) return [];
    return config.identityGoals
      .map(id => identityMap.get(id))
      .filter(Boolean) as string[];
  };

  const renderApp = ({ item }: { item: InstalledApp }) => (
    <AppListItem
      app={item}
      config={userConfigs[item.id]}
      identityLabels={getIdentityLabels(item.id)}
      onPress={() => router.push(`/app-config?appId=${item.id}`)}
    />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="apps-outline" size={48} color={colors.textTertiary} />
      <Text style={styles.emptyTitle}>
        {activeFilter === 'all' ? 'No apps yet' : `No ${activeFilter} apps`}
      </Text>
      <Text style={styles.emptySubtitle}>
        {activeFilter === 'all'
          ? 'Tap + to add apps from the catalog'
          : 'Configure apps to see them here'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>App Library</Text>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>
            {stats.total} apps · {stats.timewasters} timewasters · {stats.aligned} aligned
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search apps..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        {FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterChip,
              activeFilter === filter.key && styles.filterChipActive,
            ]}
            onPress={() => setFilter(filter.key)}
          >
            <Ionicons
              name={filter.icon as any}
              size={14}
              color={activeFilter === filter.key ? colors.textInverse : colors.textSecondary}
            />
            <Text
              style={[
                styles.filterText,
                activeFilter === filter.key && styles.filterTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* App List */}
      <FlatList
        data={filteredApps}
        renderItem={renderApp}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      {/* Add App FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCatalog(!showCatalog)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) + spacing.sm : spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold as any,
    color: colors.textPrimary,
  },
  statsRow: {
    marginTop: spacing.xs,
  },
  statText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    padding: 0,
  },
  filtersContainer: {
    maxHeight: 44,
    marginBottom: spacing.sm,
  },
  filtersContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium as any,
  },
  filterTextActive: {
    color: colors.textInverse,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl + 60, // Room for FAB
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold as any,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg + 80, // Above tab bar
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
});
