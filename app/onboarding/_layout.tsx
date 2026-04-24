import { Stack } from 'expo-router';
import { colors } from '../../src/constants/theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="pick-problem-apps" />
      <Stack.Screen name="pick-redirect-apps" />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="chat-intake" />
      <Stack.Screen name="complete" />
    </Stack>
  );
}
