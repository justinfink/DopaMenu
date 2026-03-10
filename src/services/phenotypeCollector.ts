import {
  PhenotypeSnapshot,
  PhenotypeProfile,
  PhenotypeSettings,
  PhenotypeTrend,
  PhenotypeAnomaly,
  PhenotypePattern,
  TrendDirection,
  ScreenTimeData,
  UnlockPatternData,
  SleepInferenceData,
  ActivityLevelData,
  TypingDynamicsData,
  TouchPatternData,
  SocialEngagementData,
  CognitiveLoadData,
  CircadianProfileData,
  NotificationBehaviorData,
  BatteryPatternData,
  AmbientContextData,
  MoodProxyData,
} from '../models';
import storage from './storage';
import { sensorsService } from './sensors';
import { interactionTracker } from './interactionTracker';
import { sleepInferenceService } from './sleepInference';

// ============================================
// Phenotype Collector Service
// Central orchestrator for digital phenotype
// data collection and aggregation. All data
// stays local on device.
// ============================================

const SNAPSHOT_STORAGE_KEY = 'dopamenu_phenotype_snapshots';
const PROFILE_STORAGE_KEY = 'dopamenu_phenotype_profile';

const generateId = () => Math.random().toString(36).substring(2, 11);

// ── Rolling accumulators (reset daily) ──────

interface DailyAccumulator {
  date: string;
  screenSessions: { start: number; end: number }[];
  unlocks: number[];
  notificationResponses: number[];
  notificationsReceived: number;
  notificationsIgnored: number;
  appSwitches: number;
  calendarEvents: number;
  socialAppMinutes: number;
  messagingSessions: number;
  socialMediaMinutes: number;
  batteryChargeTimes: string[];
  batteryDischargeTimes: string[];
  lowBatteryCount: number;
  brightnessReadings: number[];
  orientationChanges: number;
  firstDeviceUse: number | null;
  lastDeviceUse: number | null;
}

function createEmptyAccumulator(date: string): DailyAccumulator {
  return {
    date,
    screenSessions: [],
    unlocks: [],
    notificationResponses: [],
    notificationsReceived: 0,
    notificationsIgnored: 0,
    appSwitches: 0,
    calendarEvents: 0,
    socialAppMinutes: 0,
    messagingSessions: 0,
    socialMediaMinutes: 0,
    batteryChargeTimes: [],
    batteryDischargeTimes: [],
    lowBatteryCount: 0,
    brightnessReadings: [],
    orientationChanges: 0,
    firstDeviceUse: null,
    lastDeviceUse: null,
  };
}

class PhenotypeCollectorService {
  private snapshots: Map<string, PhenotypeSnapshot> = new Map();
  private profile: PhenotypeProfile | null = null;
  private accumulator: DailyAccumulator;
  private collectionTimer: ReturnType<typeof setInterval> | null = null;
  private loaded = false;

  constructor() {
    const today = new Date().toISOString().split('T')[0];
    this.accumulator = createEmptyAccumulator(today);
  }

  // ── Initialization ────────────────────────────

  async initialize(settings: PhenotypeSettings): Promise<void> {
    await this.load();

    // Check if we need a new day's accumulator
    const today = new Date().toISOString().split('T')[0];
    if (this.accumulator.date !== today) {
      // Finalize yesterday before starting new day
      await this.finalizeSnapshot();
      this.accumulator = createEmptyAccumulator(today);
    }

    // Start periodic collection (every 15 minutes)
    if (this.collectionTimer) clearInterval(this.collectionTimer);
    this.collectionTimer = setInterval(() => {
      this.collectPeriodicData(settings);
    }, 15 * 60 * 1000);

    // Start sensors if enabled
    if (settings.activityLevel) {
      await sensorsService.startPedometer();
    }
    if (settings.batteryPatterns) {
      await sensorsService.startBatteryMonitoring();
    }
  }

  stop(): void {
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = null;
    }
    sensorsService.stopAll();
  }

  // ── Persistence ───────────────────────────────

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const snapshotData = await storage.get<PhenotypeSnapshot[]>(SNAPSHOT_STORAGE_KEY);
      if (snapshotData) {
        snapshotData.forEach(s => this.snapshots.set(s.date, s));
      }

      const profileData = await storage.get<PhenotypeProfile>(PROFILE_STORAGE_KEY);
      if (profileData) {
        this.profile = profileData;
      }
    } catch (e) {
      console.warn('[Phenotype] Error loading data:', e);
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    try {
      const snapshots = Array.from(this.snapshots.values());
      await storage.set(SNAPSHOT_STORAGE_KEY, snapshots);
      if (this.profile) {
        await storage.set(PROFILE_STORAGE_KEY, this.profile);
      }
    } catch (e) {
      console.warn('[Phenotype] Error saving data:', e);
    }
  }

  // ── Event Recording ───────────────────────────

  recordScreenOn(): void {
    const now = Date.now();
    this.ensureToday();
    this.accumulator.screenSessions.push({ start: now, end: 0 });
    if (!this.accumulator.firstDeviceUse) {
      this.accumulator.firstDeviceUse = now;
    }
    this.accumulator.lastDeviceUse = now;
    sleepInferenceService.recordScreenOn();
  }

  recordScreenOff(): void {
    this.ensureToday();
    const lastSession = this.accumulator.screenSessions[this.accumulator.screenSessions.length - 1];
    if (lastSession && lastSession.end === 0) {
      lastSession.end = Date.now();
    }
    this.accumulator.lastDeviceUse = Date.now();
    sleepInferenceService.recordScreenOff();
  }

  recordUnlock(): void {
    this.ensureToday();
    this.accumulator.unlocks.push(Date.now());
  }

  recordNotificationReceived(): void {
    this.ensureToday();
    this.accumulator.notificationsReceived++;
  }

  recordNotificationResponse(responseTimeMs: number): void {
    this.ensureToday();
    this.accumulator.notificationResponses.push(responseTimeMs);
  }

  recordNotificationIgnored(): void {
    this.ensureToday();
    this.accumulator.notificationsIgnored++;
  }

  recordAppSwitch(): void {
    this.ensureToday();
    this.accumulator.appSwitches++;
    this.accumulator.lastDeviceUse = Date.now();
  }

  recordCalendarEvent(): void {
    this.ensureToday();
    this.accumulator.calendarEvents++;
  }

  recordSocialAppUse(minutes: number, isMessaging: boolean): void {
    this.ensureToday();
    this.accumulator.socialAppMinutes += minutes;
    if (isMessaging) this.accumulator.messagingSessions++;
    else this.accumulator.socialMediaMinutes += minutes;
  }

  recordChargeStart(): void {
    this.ensureToday();
    const time = new Date();
    this.accumulator.batteryChargeTimes.push(
      `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`
    );
    sleepInferenceService.recordChargeStart();
  }

  recordChargeEnd(): void {
    this.ensureToday();
    const time = new Date();
    this.accumulator.batteryDischargeTimes.push(
      `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`
    );
    sleepInferenceService.recordChargeEnd();
  }

  recordLowBattery(): void {
    this.ensureToday();
    this.accumulator.lowBatteryCount++;
  }

  recordBrightness(value: number): void {
    this.ensureToday();
    this.accumulator.brightnessReadings.push(value);
  }

  recordOrientationChange(): void {
    this.ensureToday();
    this.accumulator.orientationChanges++;
  }

  // ── Periodic Collection ───────────────────────

  private async collectPeriodicData(settings: PhenotypeSettings): Promise<void> {
    if (settings.ambientContext) {
      const brightness = await sensorsService.getAmbientBrightness();
      if (brightness !== null) {
        this.recordBrightness(brightness);
      }
    }
  }

  // ── Snapshot Finalization ──────────────────────

  async finalizeSnapshot(): Promise<PhenotypeSnapshot | null> {
    await this.load();
    const acc = this.accumulator;
    if (!acc.date) return null;

    // Screen time
    const screenTime = this.computeScreenTime(acc);
    const unlockPatterns = this.computeUnlockPatterns(acc);
    const sleepInference = await sleepInferenceService.inferSleep();
    const activityLevel = await this.computeActivityLevel();
    const typingDynamics = interactionTracker.getDailyTypingDynamics();
    const touchPatterns = interactionTracker.getDailyTouchPatterns();
    const socialEngagement = this.computeSocialEngagement(acc);
    const cognitiveLoad = this.computeCognitiveLoad(acc);
    const circadianProfile = this.computeCircadianProfile(acc);
    const notificationBehavior = this.computeNotificationBehavior(acc);
    const batteryPatterns = this.computeBatteryPatterns(acc);
    const ambientContext = this.computeAmbientContext(acc);
    const moodProxy = this.computeMoodProxy(
      sleepInference, activityLevel, typingDynamics, socialEngagement, screenTime
    );

    const wellbeingScore = this.computeWellbeingScore(
      sleepInference, activityLevel, screenTime, moodProxy, cognitiveLoad
    );

    const snapshot: PhenotypeSnapshot = {
      id: generateId(),
      date: acc.date,
      timestamp: Date.now(),
      screenTime,
      unlockPatterns,
      sleepInference,
      activityLevel,
      typingDynamics,
      touchPatterns,
      socialEngagement,
      cognitiveLoad,
      circadianProfile,
      notificationBehavior,
      batteryPatterns,
      ambientContext,
      moodProxy,
      wellbeingScore,
    };

    this.snapshots.set(acc.date, snapshot);

    // Prune old snapshots
    this.pruneSnapshots(90);

    // Update profile
    this.updateProfile();

    await this.save();
    return snapshot;
  }

  // ── Computation Helpers ───────────────────────

  private computeScreenTime(acc: DailyAccumulator): ScreenTimeData {
    const hourly = new Array(24).fill(0);
    let totalMs = 0;

    for (const session of acc.screenSessions) {
      const end = session.end || Date.now();
      const durationMs = end - session.start;
      totalMs += durationMs;

      const startHour = new Date(session.start).getHours();
      hourly[startHour] += durationMs / 60000;
    }

    return {
      totalMinutes: Math.round(totalMs / 60000),
      sessionCount: acc.screenSessions.length,
      hourlyDistribution: hourly.map(m => Math.round(m)),
    };
  }

  private computeUnlockPatterns(acc: DailyAccumulator): UnlockPatternData {
    const hourly = new Array(24).fill(0);
    for (const ts of acc.unlocks) {
      const hour = new Date(ts).getHours();
      hourly[hour]++;
    }

    const avgSession = acc.screenSessions.length > 0
      ? acc.screenSessions.reduce((sum, s) => {
          const end = s.end || Date.now();
          return sum + (end - s.start);
        }, 0) / acc.screenSessions.length / 1000
      : 0;

    return {
      totalUnlocks: acc.unlocks.length,
      hourlyDistribution: hourly,
      averageSessionSeconds: Math.round(avgSession),
    };
  }

  private async computeActivityLevel(): Promise<ActivityLevelData> {
    const steps = await sensorsService.getTodaySteps();

    let classification: ActivityLevelData['activityClassification'] = 'sedentary';
    if (steps > 10000) classification = 'active';
    else if (steps > 5000) classification = 'moderate';
    else if (steps > 2000) classification = 'light';

    // Estimate movement minutes from steps (rough: 100 steps/min)
    const movementMinutes = Math.round(steps / 100);

    return {
      stepCount: steps,
      movementMinutes,
      sedentaryMinutes: Math.max(0, 16 * 60 - movementMinutes), // Assume 16 waking hours
      activityClassification: classification,
    };
  }

  private computeSocialEngagement(acc: DailyAccumulator): SocialEngagementData {
    return {
      messagingSessionCount: acc.messagingSessions,
      communicationAppMinutes: Math.round(acc.socialAppMinutes),
      socialMediaMinutes: Math.round(acc.socialMediaMinutes),
    };
  }

  private computeCognitiveLoad(acc: DailyAccumulator): CognitiveLoadData {
    const hoursActive = Math.max(1, acc.screenSessions.length > 0
      ? (Date.now() - (acc.firstDeviceUse || Date.now())) / 3600000
      : 1);

    return {
      calendarEventCount: acc.calendarEvents,
      appSwitchesPerHour: Math.round(acc.appSwitches / hoursActive * 10) / 10,
      multitaskingScore: Math.min(100, Math.round(acc.appSwitches / hoursActive * 5)),
    };
  }

  private computeCircadianProfile(acc: DailyAccumulator): CircadianProfileData {
    const firstUse = acc.firstDeviceUse
      ? (() => {
          const d = new Date(acc.firstDeviceUse);
          return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        })()
      : null;

    const lastUse = acc.lastDeviceUse
      ? (() => {
          const d = new Date(acc.lastDeviceUse);
          return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        })()
      : null;

    // Peak activity hour: hour with most unlocks
    const hourly = new Array(24).fill(0);
    for (const ts of acc.unlocks) {
      hourly[new Date(ts).getHours()]++;
    }
    const peakHour = hourly.indexOf(Math.max(...hourly));

    return {
      firstDeviceUse: firstUse,
      lastDeviceUse: lastUse,
      peakActivityHour: peakHour,
      regularityScore: 50, // Updated by profile computation
    };
  }

  private computeNotificationBehavior(acc: DailyAccumulator): NotificationBehaviorData {
    const avgResponse = acc.notificationResponses.length > 0
      ? acc.notificationResponses.reduce((a, b) => a + b, 0) / acc.notificationResponses.length
      : 0;

    return {
      averageResponseTimeMs: Math.round(avgResponse),
      ignoredCount: acc.notificationsIgnored,
      interactionRate: acc.notificationsReceived > 0
        ? acc.notificationResponses.length / acc.notificationsReceived
        : 0,
      totalReceived: acc.notificationsReceived,
    };
  }

  private computeBatteryPatterns(acc: DailyAccumulator): BatteryPatternData {
    return {
      chargeStartTimes: acc.batteryChargeTimes,
      chargeEndTimes: acc.batteryDischargeTimes,
      lowBatteryMoments: acc.lowBatteryCount,
      routineRegularity: 50, // Updated by profile
    };
  }

  private computeAmbientContext(acc: DailyAccumulator): AmbientContextData {
    const avgBrightness = acc.brightnessReadings.length > 0
      ? acc.brightnessReadings.reduce((a, b) => a + b, 0) / acc.brightnessReadings.length
      : 0.5;

    return {
      averageBrightness: Math.round(avgBrightness * 100) / 100,
      orientationChanges: acc.orientationChanges,
    };
  }

  private computeMoodProxy(
    sleep: SleepInferenceData,
    activity: ActivityLevelData,
    typing: TypingDynamicsData,
    social: SocialEngagementData,
    screen: ScreenTimeData,
  ): MoodProxyData {
    const contributors: MoodProxyData['contributors'] = [];
    let score = 50; // baseline

    // Sleep quality contributes positively
    if (sleep.qualityScore > 0) {
      const sleepInfluence = (sleep.qualityScore - 50) / 100; // -0.5 to +0.5
      score += sleepInfluence * 20;
      contributors.push({ factor: 'sleep', influence: sleepInfluence });
    }

    // Physical activity contributes positively
    const activityInfluence = Math.min(0.5, activity.stepCount / 20000);
    score += activityInfluence * 15;
    contributors.push({ factor: 'activity', influence: activityInfluence });

    // High typing speed suggests engagement (positive), high backspace ratio suggests frustration
    if (typing.sessionCount > 0) {
      const typingInfluence = typing.backspaceRatio > 0.3 ? -0.3 : 0.1;
      score += typingInfluence * 10;
      contributors.push({ factor: 'typing', influence: typingInfluence });
    }

    // Social engagement is generally positive (moderate amount)
    const socialInfluence = social.messagingSessionCount > 0
      ? Math.min(0.3, social.messagingSessionCount / 10)
      : -0.1;
    score += socialInfluence * 10;
    contributors.push({ factor: 'social', influence: socialInfluence });

    // Excessive screen time is negative
    if (screen.totalMinutes > 360) { // 6+ hours
      const screenInfluence = -Math.min(0.5, (screen.totalMinutes - 360) / 360);
      score += screenInfluence * 15;
      contributors.push({ factor: 'screenTime', influence: screenInfluence });
    }

    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      contributors,
    };
  }

  private computeWellbeingScore(
    sleep: SleepInferenceData,
    activity: ActivityLevelData,
    screen: ScreenTimeData,
    mood: MoodProxyData,
    cognitive: CognitiveLoadData,
  ): number {
    let score = 0;
    let weights = 0;

    // Sleep (25% weight)
    if (sleep.qualityScore > 0) {
      score += sleep.qualityScore * 0.25;
      weights += 0.25;
    }

    // Activity (20% weight)
    const activityScore = Math.min(100, activity.stepCount / 100);
    score += activityScore * 0.20;
    weights += 0.20;

    // Screen time (15% weight, inversely)
    const screenScore = Math.max(0, 100 - (screen.totalMinutes / 6)); // 600 min = 0
    score += screenScore * 0.15;
    weights += 0.15;

    // Mood proxy (25% weight)
    score += mood.score * 0.25;
    weights += 0.25;

    // Cognitive load (15% weight, moderate is good)
    const cogScore = cognitive.multitaskingScore > 70 ? 50 : cognitive.multitaskingScore > 30 ? 80 : 60;
    score += cogScore * 0.15;
    weights += 0.15;

    return weights > 0 ? Math.round(score / weights) : 50;
  }

  // ── Profile Update ────────────────────────────

  private updateProfile(): void {
    const allSnapshots = Array.from(this.snapshots.values())
      .sort((a, b) => a.timestamp - b.timestamp);

    const last7 = allSnapshots.slice(-7);
    const last30 = allSnapshots.slice(-30);

    const trends = this.computeTrends(last7, last30);
    const anomalies = this.detectAnomalies(allSnapshots);
    const patterns = this.detectPatterns(allSnapshots);

    const latestWellbeing = allSnapshots.length > 0
      ? allSnapshots[allSnapshots.length - 1].wellbeingScore
      : 50;

    const wellbeingTrend = this.getWellbeingTrend(last7);

    this.profile = {
      lastUpdated: Date.now(),
      averages7d: last7.length > 0 ? this.averageSnapshots(last7) : {},
      averages30d: last30.length > 0 ? this.averageSnapshots(last30) : {},
      trends,
      anomalies,
      patterns,
      wellbeingScore: latestWellbeing,
      wellbeingTrend,
    };
  }

  private computeTrends(last7: PhenotypeSnapshot[], last30: PhenotypeSnapshot[]): PhenotypeTrend[] {
    const trends: PhenotypeTrend[] = [];

    if (last7.length >= 3) {
      const firstHalf = last7.slice(0, Math.floor(last7.length / 2));
      const secondHalf = last7.slice(Math.floor(last7.length / 2));

      // Screen time trend
      const earlyScreen = this.avg(firstHalf.map(s => s.screenTime.totalMinutes));
      const lateScreen = this.avg(secondHalf.map(s => s.screenTime.totalMinutes));
      trends.push({
        dimension: 'screenTime',
        direction: this.trendDirection(earlyScreen, lateScreen, true),
        magnitude: Math.abs(lateScreen - earlyScreen) / Math.max(1, earlyScreen),
        period: '7d',
      });

      // Wellbeing trend
      const earlyWellbeing = this.avg(firstHalf.map(s => s.wellbeingScore));
      const lateWellbeing = this.avg(secondHalf.map(s => s.wellbeingScore));
      trends.push({
        dimension: 'wellbeing',
        direction: this.trendDirection(earlyWellbeing, lateWellbeing, false),
        magnitude: Math.abs(lateWellbeing - earlyWellbeing) / 100,
        period: '7d',
      });

      // Activity trend
      const earlySteps = this.avg(firstHalf.map(s => s.activityLevel.stepCount));
      const lateSteps = this.avg(secondHalf.map(s => s.activityLevel.stepCount));
      trends.push({
        dimension: 'activity',
        direction: this.trendDirection(earlySteps, lateSteps, false),
        magnitude: Math.abs(lateSteps - earlySteps) / Math.max(1, earlySteps),
        period: '7d',
      });
    }

    return trends;
  }

  private trendDirection(early: number, late: number, invertIsGood: boolean): TrendDirection {
    const diff = late - early;
    const threshold = early * 0.1; // 10% change threshold
    if (Math.abs(diff) < threshold) return 'stable';
    if (invertIsGood) {
      return diff > 0 ? 'declining' : 'improving';
    }
    return diff > 0 ? 'improving' : 'declining';
  }

  private detectAnomalies(snapshots: PhenotypeSnapshot[]): PhenotypeAnomaly[] {
    if (snapshots.length < 7) return [];
    const anomalies: PhenotypeAnomaly[] = [];
    const recent = snapshots[snapshots.length - 1];
    const baseline = snapshots.slice(-30, -1);

    // Screen time anomaly
    const avgScreen = this.avg(baseline.map(s => s.screenTime.totalMinutes));
    const stdScreen = this.stdDev(baseline.map(s => s.screenTime.totalMinutes));
    if (stdScreen > 0) {
      const screenDev = (recent.screenTime.totalMinutes - avgScreen) / stdScreen;
      if (Math.abs(screenDev) > 1.5) {
        anomalies.push({
          dimension: 'screenTime',
          deviation: screenDev,
          message: screenDev > 0
            ? `Screen time is ${Math.round(screenDev * 100) / 100} standard deviations above your average`
            : `Screen time is significantly below your usual pattern`,
          timestamp: recent.timestamp,
        });
      }
    }

    // Sleep anomaly
    const avgSleepQuality = this.avg(baseline.map(s => s.sleepInference.qualityScore));
    if (recent.sleepInference.qualityScore > 0 && avgSleepQuality > 0) {
      const sleepDiff = recent.sleepInference.qualityScore - avgSleepQuality;
      if (Math.abs(sleepDiff) > 20) {
        anomalies.push({
          dimension: 'sleep',
          deviation: sleepDiff / 20,
          message: sleepDiff < 0
            ? 'Your sleep quality was significantly lower than usual'
            : 'You slept better than your recent average',
          timestamp: recent.timestamp,
        });
      }
    }

    return anomalies;
  }

  private detectPatterns(snapshots: PhenotypeSnapshot[]): PhenotypePattern[] {
    if (snapshots.length < 7) return [];
    const patterns: PhenotypePattern[] = [];

    // Afternoon slump detection
    const recentScreenHourly = snapshots.slice(-7).map(s => s.screenTime.hourlyDistribution);
    const avgByHour = new Array(24).fill(0);
    recentScreenHourly.forEach(hourly => {
      hourly.forEach((mins, hour) => {
        avgByHour[hour] += mins / recentScreenHourly.length;
      });
    });

    // Check for afternoon spike (1pm-5pm)
    const morningAvg = this.avg(avgByHour.slice(8, 12));
    const afternoonAvg = this.avg(avgByHour.slice(13, 17));
    if (afternoonAvg > morningAvg * 1.5 && afternoonAvg > 15) {
      patterns.push({
        id: 'afternoon_slump',
        label: 'Afternoon Slump',
        description: 'You tend to use your phone more in the afternoon, possibly seeking distraction after lunch.',
        confidence: Math.min(1, (afternoonAvg / morningAvg - 1) / 2),
        triggerConditions: 'afternoon time bucket + high screen time',
      });
    }

    // Late night scrolling
    const lateNightAvg = this.avg(avgByHour.slice(22, 24).concat(avgByHour.slice(0, 2)));
    if (lateNightAvg > 10) {
      patterns.push({
        id: 'late_night_scroll',
        label: 'Late Night Scrolling',
        description: 'You have significant phone usage late at night, which may affect your sleep.',
        confidence: Math.min(1, lateNightAvg / 30),
        triggerConditions: 'night/late_night bucket + active screen',
      });
    }

    return patterns;
  }

  // ── Utility Helpers ───────────────────────────

  private avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = this.avg(values);
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  private getWellbeingTrend(recent: PhenotypeSnapshot[]): TrendDirection {
    if (recent.length < 3) return 'stable';
    const firstHalf = this.avg(recent.slice(0, Math.floor(recent.length / 2)).map(s => s.wellbeingScore));
    const secondHalf = this.avg(recent.slice(Math.floor(recent.length / 2)).map(s => s.wellbeingScore));
    const diff = secondHalf - firstHalf;
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }

  private averageSnapshots(snapshots: PhenotypeSnapshot[]): Partial<PhenotypeSnapshot> {
    if (snapshots.length === 0) return {};
    return {
      wellbeingScore: Math.round(this.avg(snapshots.map(s => s.wellbeingScore))),
      screenTime: {
        totalMinutes: Math.round(this.avg(snapshots.map(s => s.screenTime.totalMinutes))),
        sessionCount: Math.round(this.avg(snapshots.map(s => s.screenTime.sessionCount))),
        hourlyDistribution: new Array(24).fill(0),
      },
      activityLevel: {
        stepCount: Math.round(this.avg(snapshots.map(s => s.activityLevel.stepCount))),
        movementMinutes: Math.round(this.avg(snapshots.map(s => s.activityLevel.movementMinutes))),
        sedentaryMinutes: Math.round(this.avg(snapshots.map(s => s.activityLevel.sedentaryMinutes))),
        activityClassification: 'light',
      },
    };
  }

  private pruneSnapshots(maxDays: number): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxDays);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    for (const [date] of this.snapshots) {
      if (date < cutoffStr) {
        this.snapshots.delete(date);
      }
    }
  }

  private ensureToday(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.accumulator.date !== today) {
      this.finalizeSnapshot();
      this.accumulator = createEmptyAccumulator(today);
    }
  }

  // ── Public Data Access ────────────────────────

  async getProfile(): Promise<PhenotypeProfile | null> {
    await this.load();
    return this.profile;
  }

  async getSnapshot(date: string): Promise<PhenotypeSnapshot | null> {
    await this.load();
    return this.snapshots.get(date) || null;
  }

  async getRecentSnapshots(days = 7): Promise<PhenotypeSnapshot[]> {
    await this.load();
    return Array.from(this.snapshots.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-days);
  }

  async getTodaySnapshot(): Promise<PhenotypeSnapshot | null> {
    const today = new Date().toISOString().split('T')[0];
    return this.snapshots.get(today) || null;
  }

  async getCurrentWellbeingScore(): Promise<number> {
    const profile = await this.getProfile();
    return profile?.wellbeingScore ?? 50;
  }

  async clearAll(): Promise<void> {
    this.snapshots.clear();
    this.profile = null;
    this.accumulator = createEmptyAccumulator(new Date().toISOString().split('T')[0]);
    await storage.remove(SNAPSHOT_STORAGE_KEY);
    await storage.remove(PROFILE_STORAGE_KEY);
  }
}

export const phenotypeCollector = new PhenotypeCollectorService();
export default phenotypeCollector;
