import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useUserStore } from '../src/stores/userStore';

// ============================================
// Root Index - Navigation Router
// ============================================

export default function Index() {
  const { user } = useUserStore();

  // If no user or onboarding not completed, go to onboarding
  if (!user || !user.onboardingCompleted) {
    return <Redirect href="/onboarding" />;
  }

  // Otherwise go to main tabs
  return <Redirect href="/(tabs)" />;
}
