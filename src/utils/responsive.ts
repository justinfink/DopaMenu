/**
 * Device-size scaling utility.
 *
 * Baseline: iPhone 13/14 (390x844).
 * On smaller devices (iPhone SE = 375x667) we scale down type, spacing,
 * and vertical rhythm so content fits without overlap or clipping.
 *
 * Usage:
 *   import { scale, vscale, ms, useResponsive } from '@/utils/responsive';
 *   const styles = StyleSheet.create({ text: { fontSize: ms(16) } });
 *
 * Prefer hook form in components that need to re-render on rotation:
 *   const { isSmall, ms, scale } = useResponsive();
 */
import { Dimensions, PixelRatio, useWindowDimensions } from 'react-native';

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

const { width: initialW, height: initialH } = Dimensions.get('window');

function sanitize(n: number): number {
  return PixelRatio.roundToNearestPixel(n);
}

/** Horizontal scale — use for widths, horizontal padding, icon sizes */
export function scale(size: number, width: number = initialW): number {
  return sanitize((width / BASE_WIDTH) * size);
}

/** Vertical scale — use for heights, vertical padding */
export function vscale(size: number, height: number = initialH): number {
  return sanitize((height / BASE_HEIGHT) * size);
}

/**
 * Moderate scale — use for font sizes and things that shouldn't shrink too
 * aggressively. Scales at `factor` (0..1) of the full scale delta.
 */
export function ms(size: number, factor: number = 0.5, width: number = initialW): number {
  return sanitize(size + (scale(size, width) - size) * factor);
}

/** Hard cap so fonts don't blow up on large phones / tablets */
export function msCapped(size: number, max?: number, factor: number = 0.5): number {
  const result = ms(size, factor);
  return max !== undefined ? Math.min(result, max) : result;
}

export const SMALL_DEVICE_WIDTH = 380;
export const TINY_DEVICE_HEIGHT = 700; // iPhone SE is 667

export function isSmallDevice(width: number = initialW): boolean {
  return width < SMALL_DEVICE_WIDTH;
}

export function isTinyDevice(height: number = initialH): boolean {
  return height < TINY_DEVICE_HEIGHT;
}

/**
 * Hook version — re-renders on dimension change (rotation, split-screen).
 * Returns bound scaling functions tied to current window dimensions.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isSmall: isSmallDevice(width),
    isTiny: isTinyDevice(height),
    scale: (size: number) => scale(size, width),
    vscale: (size: number) => vscale(size, height),
    ms: (size: number, factor: number = 0.5) => ms(size, factor, width),
    msCapped: (size: number, max?: number, factor: number = 0.5) => {
      const result = ms(size, factor, width);
      return max !== undefined ? Math.min(result, max) : result;
    },
  };
}
