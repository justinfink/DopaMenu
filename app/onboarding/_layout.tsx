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
      <Stack.Screen name="chat-intake" />
      <Stack.Screen name="complete" />
    </Stack>
  );
}
