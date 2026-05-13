import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../src/constants/theme';

// Real route for dopamenu://widget-launch?id=...
// The root deep-link listener performs the actual launch. This prevents Expo
// Router from showing its unmatched-route error during the handoff.
export default function WidgetLaunchRoute() {
  useEffect(() => {
    const timeout = setTimeout(() => {
      router.replace('/(tabs)');
    }, 1800);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
