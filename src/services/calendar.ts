import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

// ============================================
// Calendar Service
// Read-only calendar integration
// ============================================

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  isAllDay: boolean;
}

export interface CalendarPermissions {
  granted: boolean;
  canAskAgain: boolean;
}

export const calendarService = {
  /**
   * Request calendar permissions
   */
  async requestPermissions(): Promise<CalendarPermissions> {
    const { status: existingStatus } = await Calendar.getCalendarPermissionsAsync();

    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      finalStatus = status;
    }

    return {
      granted: finalStatus === 'granted',
      canAskAgain: finalStatus !== 'denied',
    };
  },

  /**
   * Check current permission status
   */
  async checkPermissions(): Promise<CalendarPermissions> {
    const { status, canAskAgain } = await Calendar.getCalendarPermissionsAsync();

    return {
      granted: status === 'granted',
      canAskAgain,
    };
  },

  /**
   * Get all accessible calendars
   */
  async getCalendars(): Promise<Calendar.Calendar[]> {
    const { granted } = await this.checkPermissions();

    if (!granted) {
      return [];
    }

    try {
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      return calendars;
    } catch (error) {
      console.error('Failed to get calendars:', error);
      return [];
    }
  },

  /**
   * Get events for a date range
   * Note: We only read event timing, not content (privacy-first)
   */
  async getEvents(
    startDate: Date,
    endDate: Date,
    calendarIds?: string[]
  ): Promise<CalendarEvent[]> {
    const { granted } = await this.checkPermissions();

    if (!granted) {
      return [];
    }

    try {
      let ids = calendarIds;

      if (!ids || ids.length === 0) {
        const calendars = await this.getCalendars();
        ids = calendars.map((c) => c.id);
      }

      if (ids.length === 0) {
        return [];
      }

      const events = await Calendar.getEventsAsync(ids, startDate, endDate);

      // Transform to our minimal event format (privacy-first)
      return events.map((event) => ({
        id: event.id,
        title: 'Event', // We intentionally don't expose actual titles
        startDate: new Date(event.startDate),
        endDate: new Date(event.endDate),
        isAllDay: event.allDay || false,
      }));
    } catch (error) {
      console.error('Failed to get events:', error);
      return [];
    }
  },

  /**
   * Get today's events
   */
  async getTodayEvents(): Promise<CalendarEvent[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    return this.getEvents(startOfDay, endOfDay);
  },

  /**
   * Check if user is currently in a calendar event
   */
  async isInEvent(): Promise<boolean> {
    const now = new Date();
    const events = await this.getTodayEvents();

    return events.some(
      (event) =>
        !event.isAllDay &&
        event.startDate <= now &&
        event.endDate >= now
    );
  },

  /**
   * Get time until next event
   */
  async getTimeUntilNextEvent(): Promise<number | null> {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const events = await this.getEvents(now, endOfDay);

    const upcomingEvents = events
      .filter((e) => !e.isAllDay && e.startDate > now)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    if (upcomingEvents.length === 0) {
      return null;
    }

    return upcomingEvents[0].startDate.getTime() - now.getTime();
  },

  /**
   * Estimate cognitive load based on calendar density
   * Returns: 'low' | 'medium' | 'high'
   */
  async estimateCognitiveLoad(): Promise<'low' | 'medium' | 'high'> {
    const events = await this.getTodayEvents();
    const nonAllDayEvents = events.filter((e) => !e.isAllDay);

    // Calculate total meeting time
    const totalMeetingMinutes = nonAllDayEvents.reduce((total, event) => {
      const duration = (event.endDate.getTime() - event.startDate.getTime()) / 60000;
      return total + duration;
    }, 0);

    // Rough heuristic for cognitive load
    if (totalMeetingMinutes < 60) {
      return 'low';
    } else if (totalMeetingMinutes < 180) {
      return 'medium';
    } else {
      return 'high';
    }
  },
};

export default calendarService;
