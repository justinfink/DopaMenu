import { Redirect } from 'expo-router';
import { useUserStore } from '../src/stores/userStore';
import type { OnboardingStepKey } from '../src/models';

// ============================================
// Root Index - Navigation Router
// Routes cold starts to the last onboarding step the user was on.
// Without this, an OS-killed process mid-onboarding snaps users back to the
// welcome screen — confusing and a huge friction point when they're just
// coming back from granting a system permission.
// ============================================

const STEP_TO_ROUTE: Record<OnboardingStepKey, string> = {
  welcome: '/onboarding',
  'pick-problem-apps': '/onboarding/pick-problem-apps',
  'pick-redirect-apps': '/onboarding/pick-redirect-apps',
  permissions: '/onboarding/permissions',
  // 'complete' never actually routes to onboarding — we return tabs for that
  // case below. Mapped here so the type is exhaustive.
  complete: '/(tabs)',
};

export default function Index() {
  const { user } = useUserStore();

  if (!user || !user.onboardingCompleted) {
    const step = user?.preferences.onboardingProgress?.currentStep ?? 'welcome';
    const target = STEP_TO_ROUTE[step] ?? '/onboarding';
    return <Redirect href={target as any} />;
  }

  return <Redirect href="/(tabs)" />;
}
