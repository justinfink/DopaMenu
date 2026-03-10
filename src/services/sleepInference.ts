import { SleepInferenceData, BatterySnapshot } from '../models';
import storage from './storage';

// ============================================
// Sleep Inference Service
// Infers sleep patterns from device usage gaps,
// battery charging patterns, and activity data.
// All inference is local and probabilistic.
// ============================================

const STORAGE_KEY = 'dopamenu_sleep_data';

interface DeviceEvent {
  type: 'screen_on' | 'screen_off' | 'charge_start' | 'charge_end';
  timestamp: number;
}

interface SleepRecord {
  date: string; // YYYY-MM-DD
  estimatedBedtime: string | null; // HH:mm
  estimatedWakeTime: string | null; // HH:mm
  durationMinutes: number | null;
  confidence: number; // 0-1
}

class SleepInferenceService {
  private deviceEvents: DeviceEvent[] = [];
  private sleepRecords: SleepRecord[] = [];
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const data = await storage.get<{ sleepRecords: SleepRecord[] }>(STORAGE_KEY);
      if (data) {
        this.sleepRecords = data.sleepRecords || [];
        // Prune records older than 90 days
        const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        this.sleepRecords = this.sleepRecords.filter(r => {
          const d = new Date(r.date);
          return d.getTime() > cutoff;
        });
      }
    } catch (e) {
      console.warn('[Sleep] Error loading data:', e);
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    try {
      await storage.set(STORAGE_KEY, {
        sleepRecords: this.sleepRecords,
      });
    } catch (e) {
      console.warn('[Sleep] Error saving data:', e);
    }
  }

  // ── Event Recording ───────────────────────────

  recordScreenOn(): void {
    this.deviceEvents.push({ type: 'screen_on', timestamp: Date.now() });
    this.pruneEvents();
  }

  recordScreenOff(): void {
    this.deviceEvents.push({ type: 'screen_off', timestamp: Date.now() });
    this.pruneEvents();
  }

  recordChargeStart(): void {
    this.deviceEvents.push({ type: 'charge_start', timestamp: Date.now() });
    this.pruneEvents();
  }

  recordChargeEnd(): void {
    this.deviceEvents.push({ type: 'charge_end', timestamp: Date.now() });
    this.pruneEvents();
  }

  private pruneEvents(): void {
    // Keep only last 48 hours of events
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    this.deviceEvents = this.deviceEvents.filter(e => e.timestamp > cutoff);
  }

  // ── Sleep Inference ───────────────────────────

  async inferSleep(): Promise<SleepInferenceData> {
    await this.load();

    // Look for the longest screen-off gap in the last 24 hours
    // that falls between 8pm-12pm (typical sleep window)
    const now = Date.now();
    const yesterday = now - 24 * 60 * 60 * 1000;

    const recentEvents = this.deviceEvents
      .filter(e => e.timestamp > yesterday)
      .sort((a, b) => a.timestamp - b.timestamp);

    let longestGap = 0;
    let gapStart = 0;
    let gapEnd = 0;

    for (let i = 0; i < recentEvents.length - 1; i++) {
      if (recentEvents[i].type === 'screen_off' && recentEvents[i + 1].type === 'screen_on') {
        const gap = recentEvents[i + 1].timestamp - recentEvents[i].timestamp;
        const offHour = new Date(recentEvents[i].timestamp).getHours();

        // Sleep is most likely if the gap starts between 8pm-3am
        const isSleepWindow = offHour >= 20 || offHour <= 3;
        const minSleepMs = 3 * 60 * 60 * 1000; // At least 3 hours

        if (gap > minSleepMs && (gap > longestGap || (isSleepWindow && gap > minSleepMs))) {
          if (isSleepWindow || gap > longestGap) {
            longestGap = gap;
            gapStart = recentEvents[i].timestamp;
            gapEnd = recentEvents[i + 1].timestamp;
          }
        }
      }
    }

    // Also check charging patterns as confirmation
    const chargeStart = recentEvents.find(
      e => e.type === 'charge_start' && Math.abs(e.timestamp - gapStart) < 30 * 60 * 1000
    );
    const hasChargingConfirmation = !!chargeStart;

    if (longestGap === 0) {
      return {
        estimatedBedtime: null,
        estimatedWakeTime: null,
        estimatedDurationMinutes: null,
        qualityScore: 0,
        regularity: this.calculateRegularity(),
      };
    }

    const bedtime = new Date(gapStart);
    const wakeTime = new Date(gapEnd);
    const durationMinutes = Math.round(longestGap / 60000);

    const bedtimeStr = `${bedtime.getHours().toString().padStart(2, '0')}:${bedtime.getMinutes().toString().padStart(2, '0')}`;
    const wakeTimeStr = `${wakeTime.getHours().toString().padStart(2, '0')}:${wakeTime.getMinutes().toString().padStart(2, '0')}`;

    // Quality score based on duration and consistency
    let quality = 0;
    if (durationMinutes >= 420 && durationMinutes <= 540) quality = 90; // 7-9 hours = great
    else if (durationMinutes >= 360 && durationMinutes <= 600) quality = 70; // 6-10 hours = ok
    else if (durationMinutes >= 300) quality = 50; // 5+ hours = poor
    else quality = 30; // <5 hours = very poor

    if (hasChargingConfirmation) quality = Math.min(100, quality + 10);

    // Save record
    const today = new Date().toISOString().split('T')[0];
    const existingIdx = this.sleepRecords.findIndex(r => r.date === today);
    const record: SleepRecord = {
      date: today,
      estimatedBedtime: bedtimeStr,
      estimatedWakeTime: wakeTimeStr,
      durationMinutes,
      confidence: hasChargingConfirmation ? 0.8 : 0.6,
    };

    if (existingIdx >= 0) {
      this.sleepRecords[existingIdx] = record;
    } else {
      this.sleepRecords.push(record);
    }
    this.save();

    return {
      estimatedBedtime: bedtimeStr,
      estimatedWakeTime: wakeTimeStr,
      estimatedDurationMinutes: durationMinutes,
      qualityScore: quality,
      regularity: this.calculateRegularity(),
    };
  }

  // ── Regularity Score ──────────────────────────

  private calculateRegularity(): number {
    if (this.sleepRecords.length < 3) return 50; // Not enough data

    const recent = this.sleepRecords.slice(-7);
    const bedtimes = recent
      .filter(r => r.estimatedBedtime)
      .map(r => {
        const [h, m] = r.estimatedBedtime!.split(':').map(Number);
        // Normalize: if after midnight, add 24
        return h < 12 ? h + 24 + m / 60 : h + m / 60;
      });

    if (bedtimes.length < 2) return 50;

    // Calculate standard deviation of bedtimes
    const mean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
    const variance = bedtimes.reduce((sum, bt) => sum + (bt - mean) ** 2, 0) / bedtimes.length;
    const stdDev = Math.sqrt(variance);

    // Lower std dev = more regular = higher score
    // 0 hours std dev = 100, 3+ hours = 0
    return Math.max(0, Math.min(100, Math.round(100 - stdDev * 33)));
  }

  // ── Data Access ───────────────────────────────

  async getLastNightSleep(): Promise<SleepInferenceData> {
    return this.inferSleep();
  }

  async getSleepHistory(days = 7): Promise<SleepRecord[]> {
    await this.load();
    return this.sleepRecords.slice(-days);
  }

  async clearAll(): Promise<void> {
    this.deviceEvents = [];
    this.sleepRecords = [];
    await storage.remove(STORAGE_KEY);
  }
}

export const sleepInferenceService = new SleepInferenceService();
export default sleepInferenceService;
