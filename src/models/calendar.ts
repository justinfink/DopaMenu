export type CalendarProviderId = 'google' | 'outlook' | 'device';

export interface CalendarAccount {
  id: string;
  provider: CalendarProviderId;
  email?: string;
  displayName?: string;
  connectedAt: number;
  updatedAt: number;
  scopes: string[];
  selectedCalendarIds: string[];
  writableCalendarId?: string;
}

export interface CalendarSource {
  id: string;
  provider: CalendarProviderId;
  accountId: string;
  title: string;
  color?: string;
  owner?: string;
  allowsModifications: boolean;
  isPrimary?: boolean;
  isSelected: boolean;
}

export interface CalendarEventItem {
  id: string;
  provider: CalendarProviderId;
  accountId: string;
  calendarId: string;
  providerEventId: string;
  title: string;
  notes?: string;
  location?: string;
  url?: string;
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  availability?: string;
  status?: string;
  attendees?: string[];
  organizer?: string;
  sourceUpdatedAt?: string;
}

export interface CalendarInsight {
  connected: boolean;
  currentEvent?: CalendarEventItem;
  nextEvent?: CalendarEventItem;
  freeMinutesUntilNext: number | null;
  eventsToday: number;
  scheduledMinutesToday: number;
  cognitiveLoad: 'low' | 'medium' | 'high';
  lastSyncedAt?: number;
}

export interface CalendarCreateInput {
  title: string;
  notes?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  allDay?: boolean;
}
