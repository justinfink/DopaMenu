/**
 * AppPicker — universal app-selection UI used in onboarding and settings.
 *
 * Shows a searchable, category-grouped list of apps from the catalog. On
 * mount it probes which apps are installed on the device (iOS canOpenURL,
 * Android PackageManager) and surfaces those first with an "Installed" pill.
 *
 * Callers pass:
 *   - role: 'problem' | 'redirect' — filters the catalog
 *   - selectedIds: currently selected catalog ids
 *   - onChange: called with the new selection set
 *   - title / subtitle: header copy
 *
 * Design notes (responsive):
 *   - uses useResponsive() so it renders cleanly on iPhone SE (375x667)
 *   - card rows collapse padding and type on small devices
 *   - installed-indicator adapts to row width
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { APP_CATALOG, AppCatalogEntry, getAppsByRole } from '@/constants/appCatalog';
import { installedAppsService } from '@/services/installedApps';
import { useResponsive } from '@/utils/responsive';

interface Props {
  role: 'problem' | 'redirect';
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  title?: string;
  subtitle?: string;
  /** Hide apps that aren't installed on device (default: false) */
  installedOnly?: boolean;
}

export default function AppPicker({
  role,
  selectedIds,
  onChange,
  title,
  subtitle,
  installedOnly = false,
}: Props) {
  const r = useResponsive();
  const [query, setQuery] = useState('');
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const [probing, setProbing] = useState(true);

  const pool = useMemo(() => getAppsByRole(role), [role]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await installedAppsService.probe(pool);
      if (!cancelled) {
        setInstalled(result);
        setProbing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pool]);

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

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const renderRow = (app: AppCatalogEntry) => {
    const isSelected = selectedIds.includes(app.id);
    const isInstalled = installed[app.id];
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
        accessibilityLabel={`${app.label}${isInstalled ? ', installed' : ''}`}
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
            <Text style={[styles.pillText, { fontSize: r.ms(10) }]}>Installed</Text>
          </View>
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
              {Platform.OS === 'ios'
                ? 'Checking which apps you have…'
                : 'Loading apps…'}
            </Text>
          </View>
        ) : null}

        {grouped.installedApps.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { fontSize: r.ms(12) }]}>
              On your device
            </Text>
            {grouped.installedApps.map(renderRow)}
          </View>
        ) : null}

        {Object.entries(grouped.others).map(([cat, apps]) => (
          <View key={cat} style={styles.section}>
            <Text style={[styles.sectionHeader, { fontSize: r.ms(12) }]}>
              {categoryLabel(cat)}
            </Text>
            {apps.map(renderRow)}
          </View>
        ))}

        {!probing && visible.length === 0 ? (
          <Text style={[styles.empty, { fontSize: r.ms(14) }]}>No matches.</Text>
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
  section: { marginBottom: 16 },
  sectionHeader: {
    fontWeight: '600',
    color: '#7A6F85',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
    paddingHorizontal: 4,
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
