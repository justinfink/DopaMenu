import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Signal, SignalType } from '../models';
import { getTimeBucket } from '../utils/helpers';

// ============================================
// useSignals Hook
// Monitors app state and generates signals
// For MVP, this provides simulated signal detection
// ============================================

interface UseSignalsOptions {
  onSignal?: (signal: Signal) => void;
  enabled?: boolean;
}

interface UseSignalsReturn {
  lastSignal: Signal | null;
  signalCount: number;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

export function useSignals({
  onSignal,
  enabled = true,
}: UseSignalsOptions = {}): UseSignalsReturn {
  const lastSignalRef = useRef<Signal | null>(null);
  const signalCountRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const sessionStartRef = useRef<number>(Date.now());
  const unlockCountRef = useRef(0);

  const emitSignal = useCallback(
    (type: SignalType, payload: Record<string, unknown> = {}) => {
      const signal: Signal = {
        id: generateId(),
        type,
        timestamp: Date.now(),
        payload,
      };

      lastSignalRef.current = signal;
      signalCountRef.current += 1;

      if (onSignal) {
        onSignal(signal);
      }

      return signal;
    },
    [onSignal]
  );

  // Monitor app state changes
  useEffect(() => {
    if (!enabled) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const prevState = appStateRef.current;

      // App came to foreground
      if (prevState.match(/inactive|background/) && nextAppState === 'active') {
        unlockCountRef.current += 1;
        sessionStartRef.current = Date.now();

        emitSignal('DEVICE_UNLOCK', {
          unlockCount: unlockCountRef.current,
        });

        // If this is a repeated unlock in short time, emit APP_OPEN
        if (unlockCountRef.current > 2) {
          emitSignal('APP_OPEN', {
            repeated: true,
            count: unlockCountRef.current,
          });
        }
      }

      // App went to background
      if (nextAppState.match(/inactive|background/) && prevState === 'active') {
        const sessionDuration = Date.now() - sessionStartRef.current;

        emitSignal('APP_SESSION_DURATION', {
          durationMs: sessionDuration,
          durationMinutes: Math.round(sessionDuration / 60000),
        });

        // Long session detection
        if (sessionDuration > 15 * 60 * 1000) {
          // 15 minutes
          emitSignal('APP_SESSION_DURATION', {
            durationMs: sessionDuration,
            isLongSession: true,
          });
        }
      }

      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Emit initial time bucket signal
    emitSignal('TIME_OF_DAY_BUCKET', {
      bucket: getTimeBucket(),
    });

    return () => {
      subscription.remove();
    };
  }, [enabled, emitSignal]);

  // Periodic time bucket check
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const currentBucket = getTimeBucket();
      emitSignal('TIME_OF_DAY_BUCKET', {
        bucket: currentBucket,
      });
    }, 30 * 60 * 1000); // Every 30 minutes

    return () => clearInterval(interval);
  }, [enabled, emitSignal]);

  // Reset unlock count periodically
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      unlockCountRef.current = Math.max(0, unlockCountRef.current - 1);
    }, 10 * 60 * 1000); // Decay every 10 minutes

    return () => clearInterval(interval);
  }, [enabled]);

  return {
    lastSignal: lastSignalRef.current,
    signalCount: signalCountRef.current,
  };
}

export default useSignals;
