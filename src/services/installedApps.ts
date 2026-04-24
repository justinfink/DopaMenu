/**
 * Installed-app probe service.
 *
 * iOS: uses Linking.canOpenURL against each app's scheme. Requires the scheme
 *      to be listed in Info.plist LSApplicationQueriesSchemes (see app.config.js).
 * Android: uses NativeModules.DopaMenuAppUsage.isPackageInstalled if available,
 *      falls back to Linking.canOpenURL of the intent:// form.
 *
 * Returns a Record<appId, boolean> so UIs can show installed-indicators and
 * filter irrelevant suggestions.
 */
import { Platform, Linking, NativeModules } from 'react-native';
import { APP_CATALOG, AppCatalogEntry } from '@/constants/appCatalog';

type ProbeResult = Record<string, boolean>;

interface AndroidUsageModule {
  isPackageInstalled?: (pkg: string) => Promise<boolean>;
}

const AndroidModule: AndroidUsageModule | null =
  Platform.OS === 'android' ? NativeModules.DopaMenuAppUsage : null;

async function probeOne(entry: AppCatalogEntry): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      if (!entry.iosScheme) return false;
      return await Linking.canOpenURL(entry.iosScheme);
    }
    if (Platform.OS === 'android') {
      if (!entry.androidPackage) return false;
      if (AndroidModule?.isPackageInstalled) {
        return await AndroidModule.isPackageInstalled(entry.androidPackage);
      }
      // Fallback: ask Linking whether the package's intent can be opened.
      const intentUrl = `intent://#Intent;package=${entry.androidPackage};end`;
      return await Linking.canOpenURL(intentUrl);
    }
    return false;
  } catch {
    return false;
  }
}

export const installedAppsService = {
  /** Probe a list of catalog entries; returns { [id]: installed } */
  async probe(entries: AppCatalogEntry[] = APP_CATALOG): Promise<ProbeResult> {
    const results = await Promise.all(
      entries.map(async (e) => [e.id, await probeOne(e)] as const)
    );
    return Object.fromEntries(results);
  },

  /** Probe a single id */
  async isInstalled(id: string): Promise<boolean> {
    const entry = APP_CATALOG.find((a) => a.id === id);
    if (!entry) return false;
    return probeOne(entry);
  },
};
