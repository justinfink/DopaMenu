import { useCallback, useRef } from 'react';
import { NativeSyntheticEvent, NativeScrollEvent, TextInputKeyPressEventData } from 'react-native';
import { interactionTracker } from '../services/interactionTracker';

// ============================================
// useInteractionTracking Hook
// Provides handlers for tracking typing and
// touch interactions for digital phenotype.
// ============================================

interface UseInteractionTrackingReturn {
  // Typing tracking handlers
  onKeyPress: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => void;
  onTextInputBlur: () => void;

  // Touch tracking handlers
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onPress: () => void;
  onTouchEnd: () => void;
}

export function useInteractionTracking(enabled = true): UseInteractionTrackingReturn {
  const lastScrollY = useRef(0);
  const lastScrollTime = useRef(Date.now());

  const onKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (!enabled) return;
      const isBackspace = e.nativeEvent.key === 'Backspace';
      interactionTracker.recordKeystroke(isBackspace);
    },
    [enabled]
  );

  const onTextInputBlur = useCallback(() => {
    if (!enabled) return;
    interactionTracker.endTypingSession();
  }, [enabled]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!enabled) return;
      const currentY = e.nativeEvent.contentOffset.y;
      const currentTime = Date.now();
      const timeDelta = currentTime - lastScrollTime.current;

      if (timeDelta > 0) {
        const velocity = Math.abs(currentY - lastScrollY.current) / timeDelta;
        interactionTracker.recordScroll(velocity);
      }

      lastScrollY.current = currentY;
      lastScrollTime.current = currentTime;
    },
    [enabled]
  );

  const onPress = useCallback(() => {
    if (!enabled) return;
    interactionTracker.recordTap();
  }, [enabled]);

  const onTouchEnd = useCallback(() => {
    // No-op for now, could end touch session
  }, []);

  return {
    onKeyPress,
    onTextInputBlur,
    onScroll,
    onPress,
    onTouchEnd,
  };
}

export default useInteractionTracking;
