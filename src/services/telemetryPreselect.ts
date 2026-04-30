/**
 * Telemetry-driven preselection for the AppPicker.
 *
 * Apple architecturally forbids reading per-app Screen Time minutes back into
 * the host app (DeviceActivityReport is one-way data flow into a sandboxed
 * extension; see project_ios_phase2_architecture). So we can't smart-rank
 * "apps you actually waste time on" using OS-level data.
 *
 * What we CAN do — and what this module is for — is rank apps by DopaMenu's
 * OWN telemetry: every intervention recorded in interventionStore stamps the
 * trigger app's catalog id (when known). That gives us a per-user signal of
 * "which apps consistently break my user's resolve" — high-trigger + high-
 * continued-rate apps are the ones DopaMenu should pre-check on first
 * onboarding/settings entry, regardless of what `popular: true` is hard-coded
 * in the catalog.
 *
 * Falls back to the catalog's `popular` flag when the user has fewer than a
 * minimum-confidence number of telemetry-attributed outcomes (TELEMETRY_FLOOR).
 * That preserves the new-user experience while letting returning users get a
 * personalized first-paint.
 *
 * GATE: aggregation runs ONLY when `analyticsEnabled` is on. We don't compute
 * scores from outcomes the user opted out of recording.
 */
import { Outcome } from '../models';

/**
 * Ranked score for a single catalog app, computed across the user's recent
 * intervention outcomes.
 */
export interface AppPriorScore {
  catalogId: string;
  /** Total interventions where this app fired the trigger. */
  triggers: number;
  /** Of those, how many ended with the user heading to a redirect ("accepted"). */
  acceptedCount: number;
  /** Of those, how many ended with the user blowing past ("continued_default"). */
  continuedCount: number;
  /** Of those, how many ended dismissed (just closed the modal). */
  dismissedCount: number;
  /**
   * Composite score: triggers × (0.5 + continuedRate). Apps the user
   * struggles to resist (high continuedRate) are weighted up so they
   * surface in preselection. An app the user always Accepts on still
   * scores positively (it's a valid trigger), just lower.
   */
  score: number;
}

/**
 * Minimum number of trigger-attributed outcomes the user must have logged
 * before we trust the telemetry over the catalog's hardcoded popular flag.
 * Below this, the user effectively has no usage history and we should
 * fall back to the static "Instagram, TikTok, YouTube, Reddit" defaults.
 *
 * Picked empirically: 6 outcomes ≈ 2 days of moderate use, low enough that
 * returning users see personalized preselection quickly, high enough that
 * a single rage-tap on Continue doesn't dominate the ranking.
 */
const TELEMETRY_FLOOR = 6;

/**
 * Build a per-catalog score map across the supplied outcomes. Outcomes
 * without a `triggerCatalogId` are silently ignored (the iOS tap-free path
 * doesn't always surface the trigger app, and pre-1.0.x outcomes lack the
 * field entirely).
 */
export function scoreCatalogPriors(
  outcomes: Outcome[],
): Map<string, AppPriorScore> {
  const out = new Map<string, AppPriorScore>();
  for (const o of outcomes) {
    if (!o.triggerCatalogId) continue;
    const id = o.triggerCatalogId;
    let entry = out.get(id);
    if (!entry) {
      entry = {
        catalogId: id,
        triggers: 0,
        acceptedCount: 0,
        continuedCount: 0,
        dismissedCount: 0,
        score: 0,
      };
      out.set(id, entry);
    }
    entry.triggers += 1;
    if (o.actionTaken === 'accepted') entry.acceptedCount += 1;
    else if (o.actionTaken === 'continued_default') entry.continuedCount += 1;
    else if (o.actionTaken === 'dismissed') entry.dismissedCount += 1;
  }
  // Score pass: triggers × (0.5 + continuedRate). Add 0.5 baseline so an app
  // with zero continueds still ranks above an app with no triggers at all.
  for (const e of out.values()) {
    const continuedRate = e.triggers > 0 ? e.continuedCount / e.triggers : 0;
    e.score = e.triggers * (0.5 + continuedRate);
  }
  return out;
}

/**
 * Pick which catalog ids to seed `selected` with on a fresh AppPicker mount.
 *
 *   1. If telemetry is gated off (analyticsEnabled=false) or the user has
 *      fewer than TELEMETRY_FLOOR attributed outcomes, fall back to
 *      `fallbackPopular` filtered by `installedIds`.
 *   2. Else rank by score and intersect with `installedIds` — never seed
 *      an app the user doesn't have on this device.
 *   3. Cap at `maxCount` (default 6) so we don't overwhelm the picker.
 *
 * Always returns a list of catalog ids. Empty array is valid (means
 * "don't preselect anything"; the user picks from scratch).
 */
export function getPreselectIdsFromTelemetry(args: {
  outcomes: Outcome[];
  analyticsEnabled: boolean;
  installedIds: string[];
  fallbackPopular: string[];
  maxCount?: number;
}): string[] {
  const { outcomes, analyticsEnabled, installedIds, fallbackPopular } = args;
  const maxCount = args.maxCount ?? 6;
  const installedSet = new Set(installedIds);

  // Guard: telemetry off, or not enough data → fallback popular flow.
  // Match by catalog id and intersect installed.
  const popularInstalled = fallbackPopular
    .filter((id) => installedSet.has(id))
    .slice(0, maxCount);

  if (!analyticsEnabled) return popularInstalled;

  const scores = scoreCatalogPriors(outcomes);
  const attributedTotal = Array.from(scores.values()).reduce(
    (sum, s) => sum + s.triggers,
    0,
  );
  if (attributedTotal < TELEMETRY_FLOOR) return popularInstalled;

  // Sorted list of catalog ids by score, intersected with installed apps.
  // We deliberately do NOT union with the popular fallback here — if the
  // user has telemetry, that telemetry is the truth about THIS user, even
  // if it disagrees with the global popular set.
  const ranked = Array.from(scores.values())
    .filter((s) => installedSet.has(s.catalogId))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
    .map((s) => s.catalogId);

  // Edge case: user has telemetry but all the high-score apps are uninstalled
  // now (uninstalled the worst offenders — good for them). Fall back to
  // popular installed so the picker isn't empty.
  if (ranked.length === 0) return popularInstalled;
  return ranked;
}

/**
 * Helper for the iOS 16+ "Suggested for you" hint above Apple's picker.
 * Returns a small list of {label, score, continuedCount} suitable for
 * rendering as chips in the preflight UI. iOS 16+ can't preselect into
 * Apple's picker (we only get opaque tokens back), so we surface the
 * suggestions as guidance instead.
 */
export interface PreselectHint {
  catalogId: string;
  triggers: number;
  continuedCount: number;
}

export function getPreselectHints(args: {
  outcomes: Outcome[];
  analyticsEnabled: boolean;
  installedIds: string[];
  maxCount?: number;
}): PreselectHint[] {
  const { outcomes, analyticsEnabled, installedIds } = args;
  const maxCount = args.maxCount ?? 3;
  if (!analyticsEnabled) return [];
  const installedSet = new Set(installedIds);
  const scores = scoreCatalogPriors(outcomes);
  const total = Array.from(scores.values()).reduce(
    (sum, s) => sum + s.triggers,
    0,
  );
  if (total < TELEMETRY_FLOOR) return [];
  return Array.from(scores.values())
    .filter((s) => installedSet.has(s.catalogId))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
    .map((s) => ({
      catalogId: s.catalogId,
      triggers: s.triggers,
      continuedCount: s.continuedCount,
    }));
}
