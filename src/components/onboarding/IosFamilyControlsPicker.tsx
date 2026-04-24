import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Button } from '../Button';
import { colors, spacing, typography } from '../../constants/theme';
import {
  getAuthorizationStatus,
  hasProblemAppSelection,
  requestFamilyControlsAuthorization,
} from '../../services/iosFamilyControls';
import { IOS_FAMILY_ACTIVITY_SELECTION_ID } from '../../constants/appGroup';

// Avoid a static import — the module is iOS-only and pulls in native view
// managers that blow up on Android / web / jest.
let DeviceActivitySelectionSheetViewPersisted: React.ComponentType<any> | null = null;
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    DeviceActivitySelectionSheetViewPersisted =
      require('react-native-device-activity/build/DeviceActivitySelectionSheetViewPersisted')
        .default;
  } catch {
    DeviceActivitySelectionSheetViewPersisted = null;
  }
}

type Props = {
  title?: string;
  subtitle?: string;
  onSelectionChange?: (count: number) => void;
};

/**
 * iOS-only. Wraps Apple's native FamilyActivityPicker (the only way to choose
 * apps on iOS — tokens are opaque and bundle IDs aren't exposed).
 *
 * - Walks the user through Screen Time auth first, if needed.
 * - Persists selection into App Group shared defaults under
 *   IOS_FAMILY_ACTIVITY_SELECTION_ID so extensions can resolve it by id.
 */
export default function IosFamilyControlsPicker({
  title = 'Pick the apps that pull you in',
  subtitle = 'We use Apple\u2019s Screen Time so this stays private to your device. DopaMenu never sees which apps you chose.',
  onSelectionChange,
}: Props) {
  const [authStatus, setAuthStatus] = useState(getAuthorizationStatus());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectionCount, setSelectionCount] = useState(
    hasProblemAppSelection() ? 1 : 0,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAuthStatus(getAuthorizationStatus());
  }, []);

  const handleGrantAuth = async () => {
    setBusy(true);
    const ok = await requestFamilyControlsAuthorization();
    setAuthStatus(getAuthorizationStatus());
    setBusy(false);
    if (ok) setPickerOpen(true);
  };

  if (Platform.OS !== 'ios' || !DeviceActivitySelectionSheetViewPersisted) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {authStatus !== 'approved' ? (
        <View style={styles.authBlock}>
          <Text style={styles.authBody}>
            DopaMenu needs your Screen Time permission to intercept the apps
            you choose. You\u2019ll enter your Screen Time passcode once.
          </Text>
          <Button
            title={busy ? 'Waiting\u2026' : 'Grant Screen Time'}
            onPress={handleGrantAuth}
            disabled={busy}
            size="large"
            fullWidth
          />
          {busy ? (
            <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary} />
          ) : null}
        </View>
      ) : (
        <View style={styles.pickerBlock}>
          <Text style={styles.selectionSummary}>
            {selectionCount > 0
              ? 'Your selection is saved. Tap below to edit it.'
              : 'No apps selected yet.'}
          </Text>
          <Button
            title={selectionCount > 0 ? 'Edit selection' : 'Choose apps'}
            onPress={() => setPickerOpen(true)}
            size="large"
            fullWidth
          />
        </View>
      )}

      {pickerOpen ? (
        <DeviceActivitySelectionSheetViewPersisted
          familyActivitySelectionId={IOS_FAMILY_ACTIVITY_SELECTION_ID}
          headerText="Pick the apps DopaMenu should intercept"
          footerText="You can change this any time in settings."
          includeEntireCategory
          onSelectionChange={() => {
            const next = hasProblemAppSelection() ? 1 : 0;
            setSelectionCount(next);
            onSelectionChange?.(next);
          }}
          onDismissRequest={() => setPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  authBlock: {
    gap: spacing.sm,
  },
  authBody: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  pickerBlock: {
    gap: spacing.sm,
  },
  selectionSummary: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
});
