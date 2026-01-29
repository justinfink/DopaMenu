import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';
import { TimeBucket } from '../models';

// ============================================
// Utility Functions
// ============================================

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

export const getTimeBucket = (date: Date = new Date()): TimeBucket => {
  const hour = date.getHours();

  if (hour >= 5 && hour < 8) return 'early_morning';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  if (hour >= 21 || hour < 0) return 'night';
  return 'late_night';
};

export const getGreeting = (): string => {
  const bucket = getTimeBucket();

  switch (bucket) {
    case 'early_morning':
    case 'morning':
      return 'Good morning';
    case 'afternoon':
      return 'Good afternoon';
    case 'evening':
      return 'Good evening';
    case 'night':
    case 'late_night':
      return 'Good night';
    default:
      return 'Hello';
  }
};

export const formatDate = (date: Date | number | string): string => {
  const d = new Date(date);

  if (isToday(d)) {
    return 'Today';
  }

  if (isYesterday(d)) {
    return 'Yesterday';
  }

  return format(d, 'EEEE, MMM d');
};

export const formatTime = (date: Date | number | string): string => {
  return format(new Date(date), 'h:mm a');
};

export const formatRelativeTime = (date: Date | number | string): string => {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
};

export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

export const lerp = (a: number, b: number, t: number): number => {
  return a + (b - a) * clamp(t, 0, 1);
};

export const formatPercentage = (value: number, decimals: number = 0): string => {
  return `${(value * 100).toFixed(decimals)}%`;
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Debounce function
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

// Capitalize first letter
export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Get initials from name
export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
};
