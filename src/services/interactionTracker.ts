import { TypingSession, TouchSession, TypingDynamicsData, TouchPatternData } from '../models';

// ============================================
// Interaction Tracker Service
// Tracks typing dynamics and touch patterns
// for digital phenotype. Aggregates locally,
// never stores raw input content.
// ============================================

class InteractionTrackerService {
  private typingSessions: TypingSession[] = [];
  private touchSessions: TouchSession[] = [];

  // Current tracking state
  private currentTyping: {
    startedAt: number;
    totalChars: number;
    backspaceCount: number;
    pauses: number[];
    lastKeystroke: number;
  } | null = null;

  private currentTouch: {
    startedAt: number;
    scrollEvents: number;
    tapEvents: number;
    scrollVelocities: number[];
  } | null = null;

  private readonly PAUSE_THRESHOLD_MS = 2000;
  private readonly SESSION_TIMEOUT_MS = 30000; // 30s of inactivity ends session

  // ── Typing Tracking ───────────────────────────

  recordKeystroke(isBackspace: boolean): void {
    const now = Date.now();

    if (!this.currentTyping) {
      this.currentTyping = {
        startedAt: now,
        totalChars: 0,
        backspaceCount: 0,
        pauses: [],
        lastKeystroke: now,
      };
    }

    // Check for pause
    const gap = now - this.currentTyping.lastKeystroke;
    if (gap > this.PAUSE_THRESHOLD_MS && gap < this.SESSION_TIMEOUT_MS) {
      this.currentTyping.pauses.push(gap);
    }

    // If gap is too long, end session and start new one
    if (gap >= this.SESSION_TIMEOUT_MS) {
      this.endTypingSession();
      this.currentTyping = {
        startedAt: now,
        totalChars: 0,
        backspaceCount: 0,
        pauses: [],
        lastKeystroke: now,
      };
    }

    if (isBackspace) {
      this.currentTyping.backspaceCount++;
    } else {
      this.currentTyping.totalChars++;
    }
    this.currentTyping.lastKeystroke = now;
  }

  endTypingSession(): void {
    if (!this.currentTyping) return;
    if (this.currentTyping.totalChars < 5) {
      // Too short to be meaningful
      this.currentTyping = null;
      return;
    }

    const session: TypingSession = {
      startedAt: this.currentTyping.startedAt,
      endedAt: this.currentTyping.lastKeystroke,
      totalChars: this.currentTyping.totalChars,
      backspaceCount: this.currentTyping.backspaceCount,
      pauseCount: this.currentTyping.pauses.length,
      averagePauseMs: this.currentTyping.pauses.length > 0
        ? this.currentTyping.pauses.reduce((a, b) => a + b, 0) / this.currentTyping.pauses.length
        : 0,
    };

    this.typingSessions.push(session);

    // Keep last 100 sessions
    if (this.typingSessions.length > 100) {
      this.typingSessions = this.typingSessions.slice(-100);
    }

    this.currentTyping = null;
  }

  // ── Touch Tracking ────────────────────────────

  recordScroll(velocity: number): void {
    const now = Date.now();

    if (!this.currentTouch) {
      this.currentTouch = {
        startedAt: now,
        scrollEvents: 0,
        tapEvents: 0,
        scrollVelocities: [],
      };
    }

    this.currentTouch.scrollEvents++;
    this.currentTouch.scrollVelocities.push(Math.abs(velocity));
  }

  recordTap(): void {
    const now = Date.now();

    if (!this.currentTouch) {
      this.currentTouch = {
        startedAt: now,
        scrollEvents: 0,
        tapEvents: 0,
        scrollVelocities: [],
      };
    }

    this.currentTouch.tapEvents++;
  }

  endTouchSession(): void {
    if (!this.currentTouch) return;
    if (this.currentTouch.scrollEvents + this.currentTouch.tapEvents < 3) {
      this.currentTouch = null;
      return;
    }

    const avgVelocity = this.currentTouch.scrollVelocities.length > 0
      ? this.currentTouch.scrollVelocities.reduce((a, b) => a + b, 0) / this.currentTouch.scrollVelocities.length
      : 0;

    const session: TouchSession = {
      startedAt: this.currentTouch.startedAt,
      endedAt: Date.now(),
      scrollEvents: this.currentTouch.scrollEvents,
      tapEvents: this.currentTouch.tapEvents,
      averageScrollVelocity: avgVelocity,
    };

    this.touchSessions.push(session);

    if (this.touchSessions.length > 100) {
      this.touchSessions = this.touchSessions.slice(-100);
    }

    this.currentTouch = null;
  }

  // ── Aggregation ───────────────────────────────

  getDailyTypingDynamics(): TypingDynamicsData {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const todaySessions = this.typingSessions.filter(s => s.startedAt >= todayMs);

    if (todaySessions.length === 0) {
      return {
        averageCharsPerMinute: 0,
        backspaceRatio: 0,
        averagePauseMs: 0,
        sessionCount: 0,
      };
    }

    const totalChars = todaySessions.reduce((sum, s) => sum + s.totalChars, 0);
    const totalBackspaces = todaySessions.reduce((sum, s) => sum + s.backspaceCount, 0);
    const totalDurationMs = todaySessions.reduce(
      (sum, s) => sum + (s.endedAt - s.startedAt),
      0
    );
    const totalPauseMs = todaySessions.reduce(
      (sum, s) => sum + s.averagePauseMs * s.pauseCount,
      0
    );
    const totalPauses = todaySessions.reduce((sum, s) => sum + s.pauseCount, 0);

    return {
      averageCharsPerMinute: totalDurationMs > 0
        ? (totalChars / (totalDurationMs / 60000))
        : 0,
      backspaceRatio: (totalChars + totalBackspaces) > 0
        ? totalBackspaces / (totalChars + totalBackspaces)
        : 0,
      averagePauseMs: totalPauses > 0 ? totalPauseMs / totalPauses : 0,
      sessionCount: todaySessions.length,
    };
  }

  getDailyTouchPatterns(): TouchPatternData {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const todaySessions = this.touchSessions.filter(s => s.startedAt >= todayMs);

    if (todaySessions.length === 0) {
      return {
        averageScrollVelocity: 0,
        tapFrequencyPerMinute: 0,
        interactionIntensity: 0,
      };
    }

    const totalScrolls = todaySessions.reduce((sum, s) => sum + s.scrollEvents, 0);
    const totalTaps = todaySessions.reduce((sum, s) => sum + s.tapEvents, 0);
    const totalVelocity = todaySessions.reduce((sum, s) => sum + s.averageScrollVelocity, 0);
    const totalDurationMs = todaySessions.reduce(
      (sum, s) => sum + (s.endedAt - s.startedAt),
      0
    );

    const tapFrequency = totalDurationMs > 0
      ? (totalTaps / (totalDurationMs / 60000))
      : 0;

    // Intensity: normalized score combining scroll speed and tap frequency
    const avgVelocity = todaySessions.length > 0 ? totalVelocity / todaySessions.length : 0;
    const intensity = Math.min(100, (avgVelocity / 10 + tapFrequency / 5) * 10);

    return {
      averageScrollVelocity: avgVelocity,
      tapFrequencyPerMinute: tapFrequency,
      interactionIntensity: Math.round(intensity),
    };
  }

  // ── Data Access ───────────────────────────────

  getTypingSessions(): TypingSession[] {
    return [...this.typingSessions];
  }

  getTouchSessions(): TouchSession[] {
    return [...this.touchSessions];
  }

  clearAll(): void {
    this.typingSessions = [];
    this.touchSessions = [];
    this.currentTyping = null;
    this.currentTouch = null;
  }
}

export const interactionTracker = new InteractionTrackerService();
export default interactionTracker;
