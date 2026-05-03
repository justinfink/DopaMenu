import { Linking, Platform } from 'react-native';
import { InterventionCandidate } from '../models';

// ============================================
// Intervention launch logic — shared between the in-app intervention modal
// and the home screen widget deep-link handler. Single source of truth so
// both paths get identical behavior (intent fallback, Play Store rescue, etc).
// ============================================

// deepLinkUri is an optional in-app path like "strava://activities/new" that
// opens the target app directly to a specific screen instead of its launcher.
// Backward-compatible: callers that only pass packageName get the simple
// "open the app" intent.
export function buildAndroidIntentUrl(
  packageName: string,
  fallbackUrl?: string,
  deepLinkUri?: string,
): string {
  const fallback = fallbackUrl
    ? `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};`
    : '';

  if (deepLinkUri) {
    // Parse "strava://activities/new" → scheme=strava, host+path=activities/new
    // We split on "://" rather than URL-parse because RN's URL polyfill
    // doesn't always handle custom schemes cleanly.
    const schemeIdx = deepLinkUri.indexOf('://');
    if (schemeIdx > 0) {
      const scheme = deepLinkUri.substring(0, schemeIdx);
      const rest = deepLinkUri.substring(schemeIdx + 3);
      return `intent://${rest}#Intent;scheme=${scheme};package=${packageName};${fallback}end`;
    }
  }

  return `intent://#Intent;package=${packageName};${fallback}end`;
}

export async function launchIntervention(
  intervention: InterventionCandidate,
): Promise<boolean> {
  const { launchAppPackage, launchIosScheme, launchTarget, launchAndroidUri } =
    intervention;

  if (!launchAppPackage && !launchIosScheme && !launchTarget) return false;

  if (Platform.OS === 'android' && launchAppPackage) {
    const intentUrl = buildAndroidIntentUrl(
      launchAppPackage,
      launchTarget,
      launchAndroidUri,
    );
    try {
      await Linking.openURL(intentUrl);
      return true;
    } catch {
      // Fall through to web fallback below.
    }
  }

  if (Platform.OS === 'ios' && launchIosScheme) {
    try {
      const supported = await Linking.canOpenURL(launchIosScheme);
      if (supported) {
        await Linking.openURL(launchIosScheme);
        return true;
      }
    } catch {
      // Fall through to web fallback.
    }
  }

  if (launchTarget) {
    try {
      await Linking.openURL(launchTarget);
      return true;
    } catch {
      // Fall through to Play Store rescue.
    }
  }

  // Last resort on Android: if the user picked a redirect app they don't have
  // installed yet, send them to the Play Store listing instead of failing
  // silently. Better to land them somewhere actionable than nowhere.
  if (Platform.OS === 'android' && launchAppPackage) {
    try {
      const playUrl = `https://play.google.com/store/apps/details?id=${launchAppPackage}`;
      await Linking.openURL(playUrl);
      return true;
    } catch {
      // Out of options.
    }
  }
  return false;
}
