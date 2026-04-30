/**
 * AppPicker — universal app-selection UI used in onboarding and settings.
 *
 * Probes installed apps (iOS canOpenURL, Android PackageManager), surfaces the
 * ones the user actually has on top, and on first-render auto-checks the apps
 * we mark `popular` (Instagram, TikTok, YouTube, Reddit) when they're
 * installed — so the user opens the screen and the right answer is already
 * there waiting for them. Apps the user doesn't have show a tap-to-install
 * button that jumps straight to the App Store / Play Store.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AppCatalogEntry,
  getAppsByRole,
  getStoreUrl,
} from '@/constants/appCatalog';
import { installedAppsService } from '@/services/installedApps';
import { getPreselectIdsFromTelemetry } from '@/services/telemetryPreselect';
import { useInterventionStore } from '@/stores/interventionStore';
import { useUserStore } from '@/stores/userStore';
import { useResponsive } from '@/utils/responsive';

interface Props {
  role: 'problem' | 'redirect';
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  title?: string;
  subtitle?: string;
  /** Hide apps that aren't installed on device (default: false) */
  installedOnly?: boolean;
  /**
   * If true, when this component mounts and the user has nothing selected,
   * we'll auto-check every popular app that's actually installed on the
   * device. Set to true on first-time onboarding, false when re-editing.
   *
   * If the user has enough DopaMenu intervention history (analytics on AND
   * at least TELEMETRY_FLOOR attributed outcomes), we override the static
   * "popular" list with their personal top-triggered apps instead — the
   * actual apps THIS user struggles with, not the global default. Falls
   * back to popular when telemetry is insufficient or analytics is off.
   */
  preselectInstalledPopular?: boolean;
}

export default function AppPicker({
  role,
  selectedIds,
  onChange,
  title,
  subtitle,
  installedOnly = false,
  preselectInstalledPopular = false,
}: Props) {
  const r = useResponsive();
  const [query, setQuery] = useState('');
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const [probing, setProbing] = useState(true);
  const preselectAppliedRef = useRef(false);
  // Read once at preselect time — we don't want re-rendering AppPicker to
  // re-seed selection if the user manually unchecks an app while telemetry
  // updates in the background. Hooks pulled outside of useEffect so the
  // store subscription is wired correctly.
  const recentOutcomes = useInterventionStore((s) => s.recentOutcomes);
  const analyticsEnabled = useUserStore(
    (s) => s.user?.preferences.analyticsEnabled ?? false,
  );

  const pool = useMemo(() => getAppsByRole(role), [role]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await installedAppsService.probe(pool);
      if (cancelled) return;
      setInstalled(result);
      setProbing(false);

      // First-run preselect: if caller asked for it AND the user has nothing
      // checked, seed selection from either telemetry (if the user has
      // enough history) or the catalog's static popular flag (cold start).
      // We never override an existing selection — just seed the empty state.
      // Only applies to the 'problem' role; redirect-app preselection comes
      // from a different signal (what redirects the user has been accepting),
      // not what they're triggered on.
      if (
        preselectInstalledPopular &&
        !preselectAppliedRef.current &&
        selectedIds.length === 0
      ) {
        const installedIds = pool.filter((a) => result[a.id]).map((a) => a.id);
        let seed: string[];
        if (role === 'problem') {
          const fallbackPopular = pool
            .filter((a) => a.popular)
            .map((a) => a.id);
          seed = getPreselectIdsFromTelemetry({
            outcomes: recentOutcomes,
            analyticsEnabled,
            installedIds,
            fallbackPopular,
          });
        } else {
          // Redirect role: keep the existing popular-installed behavior.
          seed = pool
            .filter((a) => a.popular && result[a.id])
            .map((a) => a.id);
        }
        if (seed.length > 0) {
          preselectAppliedRef.current = true;
          onChange(seed);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, preselectInstalledPopular]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((a) => {
      if (installedOnly && !installed[a.id]) return false;
      if (!q) return true;
      return (
        a.label.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.blurb?.toLowerCase().includes(q)
      );
    });
  }, [pool, query, installed, installedOnly]);

  const grouped = useMemo(() => {
    const installedApps: AppCatalogEntry[] = [];
    const others: Record<string, AppCatalogEntry[]> = {};
    for (const a of visible) {
      if (installed[a.id]) {
        installedApps.push(a);
      } else {
        (others[a.category] ??= []).push(a);
      }
    }
    return { installedApps, others };
  }, [visible, installed]);

  // Foldable category sections. The catalog grew big (60+ apps across
  // ~12 categories) and an unbroken vertical wall of "Get" buttons is
  // overwhelming — testers asked us to collapse it. Rules:
  //   • "On your phone" is never collapsible (it's the most useful list)
  //   • All other category sections start collapsed
  //   • If the user types a search query, every section auto-expands so
  //     they actually see matching results — the open/closed state we
  //     keep is the user's manual override, search just shows everything
  //   • Tapping a section header toggles its open/closed state and that
  //     stays sticky after they clear the search
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isSearching = query.trim().length > 0;
  const toggleSection = (cat: string) => {
    setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const openStore = async (app: AppCatalogEntry) => {
    const url = getStoreUrl(app, Platform.OS === 'ios' ? 'ios' : 'android');
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      // Fall through silently — the user can search for the app themselves.
    }
  };

  const renderRow = (app: AppCatalogEntry) => {
    const isSelected = selectedIds.includes(app.id);
    const isInstalled = installed[app.id];
    const storeUrl = !isInstalled
      ? getStoreUrl(app, Platform.OS === 'ios' ? 'ios' : 'android')
      : undefined;
    return (
      <Pressable
        key={app.id}
        onPress={() => toggle(app.id)}
        style={({ pressed }) => [
          styles.row,
          { paddingVertical: r.vscale(12), paddingHorizontal: r.scale(16) },
          isSelected && styles.rowSelected,
          pressed && styles.rowPressed,
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`${app.label}${isInstalled ? ', installed on this device' : ', not installed'}`}
      >
        <View style={styles.rowMain}>
          <Text style={[styles.rowLabel, { fontSize: r.ms(16) }]} numberOfLines={1}>
            {app.label}
          </Text>
          {app.blurb ? (
            <Text style={[styles.rowBlurb, { fontSize: r.ms(12) }]} numberOfLines={1}>
              {app.blurb}
            </Text>
          ) : null}
        </View>
        {isInstalled ? (
          <View style={[styles.pill, { paddingHorizontal: r.scale(8) }]}>
            <Text style={[styles.pillText, { fontSize: r.ms(10) }]}>On your phone</Text>
          </View>
        ) : storeUrl ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              openStore(app);
            }}
            hitSlop={6}
            style={[styles.installPill, { paddingHorizontal: r.scale(10) }]}
            accessibilityLabel={`Get ${app.label} from the ${Platform.OS === 'ios' ? 'App Store' : 'Play Store'}`}
          >
            <Ionicons
              name={Platform.OS === 'ios' ? 'logo-apple-appstore' : 'logo-google-playstore'}
              size={r.ms(12)}
              color="#9B7BB8"
            />
            <Text style={[styles.installPillText, { fontSize: r.ms(11) }]}>Get</Text>
          </Pressable>
        ) : null}
        <View
          style={[
            styles.check,
            { width: r.scale(24), height: r.scale(24), borderRadius: r.scale(12) },
            isSelected && styles.checkOn,
          ]}
        >
          {isSelected ? <Ionicons name="checkmark" size={r.scale(16)} color="#fff" /> : null}
        </View>
      </Pressable>
    );
  };

  const categoryLabel = (cat: string) =>
    cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ');

  return (
    <View style={styles.container}>
      {title ? (
        <Text style={[styles.title, { fontSize: r.ms(22) }]}>{title}</Text>
      ) : null}
      {subtitle ? (
        <Text style={[styles.subtitle, { fontSize: r.ms(14) }]}>{subtitle}</Text>
      ) : null}

      <View style={[styles.searchBox, { paddingHorizontal: r.scale(12) }]}>
        <Ionicons name="search" size={r.scale(16)} color="#7A6F85" />
        <TextInput
          style={[styles.searchInput, { fontSize: r.ms(15) }]}
          placeholder="Search apps"
          placeholderTextColor="#9C91A8"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: r.vscale(24) }}
        keyboardShouldPersistTaps="handled"
      >
        {probing ? (
          <View style={styles.probing}>
            <ActivityIndicator color="#9B7BB8" />
            <Text style={[styles.probingText, { fontSize: r.ms(12) }]}>
              Looking at what you already have…
            </Text>
          </View>
        ) : null}

        {grouped.installedApps.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { fontSize: r.ms(12) }]}>
              On your phone
            </Text>
            {grouped.installedApps.map(renderRow)}
          </View>
        ) : null}

        {Object.entries(grouped.others).map(([cat, apps]) => {
          const isOpen = isSearching || expanded[cat];
          return (
            <View key={cat} style={styles.section}>
              <Pressable
                onPress={() => toggleSection(cat)}
                style={({ pressed }) => [
                  styles.sectionHeaderPressable,
                  { paddingVertical: r.scale(8), paddingHorizontal: r.scale(4) },
                  pressed && styles.sectionHeaderPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ expanded: !!isOpen }}
                accessibilityLabel={`${categoryLabel(cat)}, ${apps.length} apps, ${isOpen ? 'expanded' : 'collapsed'}`}
              >
                <Text style={[styles.sectionHeader, { fontSize: r.ms(12) }]}>
                  {categoryLabel(cat)}
                </Text>
                <View style={styles.sectionHeaderMeta}>
                  <Text style={[styles.sectionCount, { fontSize: r.ms(11) }]}>
                    {apps.length}
                  </Text>
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={r.scale(16)}
                    color="#9C91A8"
                  />
                </View>
              </Pressable>
              {isOpen ? apps.map(renderRow) : null}
            </View>
          );
        })}

        {!probing && visible.length === 0 ? (
          <Text style={[styles.empty, { fontSize: r.ms(14) }]}>
            Nothing matches that search.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontWeight: '700', color: '#2E2639', marginBottom: 6 },
  subtitle: { color: '#6D6378', marginBottom: 16, lineHeight: 20 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2EEF7',
    borderRadius: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, color: '#2E2639' },
  section: { marginBottom: 12 },
  sectionHeader: {
    fontWeight: '600',
    color: '#7A6F85',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionHeaderPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    borderRadius: 6,
  },
  sectionHeaderPressed: { backgroundColor: '#F2EEF7' },
  sectionHeaderMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionCount: {
    color: '#9C91A8',
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 6,
    gap: 10,
    borderWidth: 1,
    borderColor: '#EAE2F1',
  },
  rowSelected: { borderColor: '#9B7BB8', backgroundColor: '#F6EFFB' },
  rowPressed: { opacity: 0.85 },
  rowMain: { flex: 1 },
  rowLabel: { color: '#2E2639', fontWeight: '600' },
  rowBlurb: { color: '#7A6F85', marginTop: 2 },
  pill: {
    backgroundColor: '#E5F3E8',
    borderRadius: 999,
    paddingVertical: 3,
  },
  pillText: { color: '#3B7A4B', fontWeight: '700', letterSpacing: 0.4 },
  installPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F2EEF7',
    borderRadius: 999,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E2D7EC',
  },
  installPillText: { color: '#7A5BA0', fontWeight: '700', letterSpacing: 0.3 },
  check: {
    borderWidth: 2,
    borderColor: '#CFC5D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: '#9B7BB8', borderColor: '#9B7BB8' },
  probing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  probingText: { color: '#7A6F85' },
  empty: { color: '#7A6F85', textAlign: 'center', paddingVertical: 24 },
});
