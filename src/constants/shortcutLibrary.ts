/**
 * iCloud share URLs for the Shortcuts automations DopaMenu ships.
 *
 * Each entry points to a pre-built .shortcut file hosted on iCloud that, when
 * imported via `shortcuts://import-shortcut?url=<ENCODED>`, creates an
 * automation that fires `dopamenu://intervention?app=<bundleId>` when the
 * named app is opened. This eliminates the copy-paste step — one tap imports
 * the shortcut, one more tap installs it.
 *
 * FILL IN WITH PROD URLS: create each shortcut in the Shortcuts app, then
 * "Share → Copy iCloud Link", then paste the https://www.icloud.com/shortcuts/<id>
 * URL here. When these are empty, the UI falls back to the manual copy-paste
 * flow for that app.
 *
 * Generic fallback works for any app when its specific shortcut isn't yet
 * hosted — it takes the bundle id as user input and builds the dopamenu:// URL.
 */

export interface ShortcutEntry {
  /** Tracked-app iOS bundle id */
  bundleId: string;
  /** iCloud share URL for a pre-built automation for this app, e.g.
   *  "https://www.icloud.com/shortcuts/abc123..." */
  iCloudUrl?: string;
}

export const SHORTCUT_LIBRARY: ShortcutEntry[] = [
  { bundleId: 'com.burbn.instagram', iCloudUrl: undefined },
  { bundleId: 'com.atebits.Tweetie2', iCloudUrl: undefined },
  { bundleId: 'com.zhiliaoapp.musically', iCloudUrl: undefined },
  { bundleId: 'com.facebook.Facebook', iCloudUrl: undefined },
  { bundleId: 'com.reddit.Reddit', iCloudUrl: undefined },
  { bundleId: 'com.toyopagroup.picaboo', iCloudUrl: undefined },
  { bundleId: 'com.google.ios.youtube', iCloudUrl: undefined },
  { bundleId: 'com.netflix.Netflix', iCloudUrl: undefined },
  { bundleId: 'com.burbn.barcelona', iCloudUrl: undefined },
];

/** Generic template that prompts the user for a bundle id, then builds the
 *  dopamenu:// URL. A stop-gap until per-app shortcuts are hosted. */
export const GENERIC_SHORTCUT_ICLOUD_URL: string | undefined = undefined;

export function iCloudUrlFor(bundleId?: string): string | undefined {
  if (!bundleId) return GENERIC_SHORTCUT_ICLOUD_URL;
  const hit = SHORTCUT_LIBRARY.find((s) => s.bundleId === bundleId);
  return hit?.iCloudUrl || GENERIC_SHORTCUT_ICLOUD_URL;
}

/** Build the shortcuts://import-shortcut URL. Returns undefined when no
 *  iCloud URL is registered (caller should fall back to manual flow). */
export function buildImportShortcutUrl(bundleId?: string): string | undefined {
  const icloud = iCloudUrlFor(bundleId);
  if (!icloud) return undefined;
  return `shortcuts://import-shortcut?url=${encodeURIComponent(icloud)}`;
}
