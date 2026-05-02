// Ionicon name → emoji for Android widget RemoteViews (no custom font rendering).
const ICON_MAP: Record<string, string> = {
  'leaf': '🍃',
  'sunny': '☀️',
  'body': '🧘',
  'document-text': '📄',
  'chatbubble': '💬',
  'walk': '🚶',
  'sparkles': '✨',
  'fitness': '💪',
  'create': '✏️',
  'musical-notes': '🎵',
  'flower': '🌸',
  'brush': '🎨',
  'call': '📞',
  'rocket': '🚀',
  'headset': '🎧',
  'game-controller': '🎮',
  'open-outline': '↗️',
  'book': '📖',
  'bicycle': '🚴',
  'bulb': '💡',
  'camera': '📷',
  'heart': '❤���',
  'pizza': '🍕',
  'paw': '🐾',
  'globe': '🌍',
  'code-slash': '💻',
  'mic': '🎤',
  'pencil': '✏️',
};

export function getWidgetIcon(ionicon?: string): string {
  if (!ionicon) return '✨';
  return ICON_MAP[ionicon] ?? '✨';
}

const TIME_BUCKET_ICONS: Record<string, string> = {
  early_morning: '🌅',
  morning: '☀️',
  afternoon: '🌤️',
  evening: '🌇',
  night: '🌙',
  late_night: '🌙',
};

export function getTimeBucketIcon(bucket: string): string {
  return TIME_BUCKET_ICONS[bucket] ?? '☀️';
}

const TIME_BUCKET_LABELS: Record<string, string> = {
  early_morning: 'Early morning',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
  late_night: 'Late night',
};

export function getTimeBucketLabel(bucket: string): string {
  return TIME_BUCKET_LABELS[bucket] ?? 'Now';
}

export const EFFORT_LABELS: Record<string, string> = {
  very_low: 'Quick',
  low: 'Easy',
  medium: 'Moderate',
  high: 'Committed',
};
