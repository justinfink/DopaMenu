import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CalendarAccount,
  CalendarEventItem,
  CalendarInsight,
  CalendarSource,
} from '../models/calendar';

interface CalendarState {
  accounts: CalendarAccount[];
  calendars: CalendarSource[];
  events: CalendarEventItem[];
  lastSyncedAt?: number;
  isSyncing: boolean;
  error?: string;

  upsertAccount: (account: CalendarAccount) => void;
  removeAccount: (accountId: string) => void;
  setCalendarsForAccount: (accountId: string, calendars: CalendarSource[]) => void;
  setEventsForAccount: (accountId: string, events: CalendarEventItem[]) => void;
  toggleCalendarSelection: (accountId: string, calendarId: string) => void;
  setWritableCalendar: (accountId: string, calendarId: string) => void;
  setSyncing: (isSyncing: boolean) => void;
  setError: (error?: string) => void;
  getInsight: () => CalendarInsight;
  reset: () => void;
}

function todayBounds(): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  return { start, end };
}

function calculateInsight(
  events: CalendarEventItem[],
  lastSyncedAt?: number,
): CalendarInsight {
  const now = Date.now();
  const { start, end } = todayBounds();
  const timedToday = events
    .filter((event) => !event.isAllDay)
    .map((event) => ({
      event,
      start: new Date(event.startDate).getTime(),
      end: new Date(event.endDate).getTime(),
    }))
    .filter(({ end: eventEnd, start: eventStart }) => eventEnd >= start && eventStart <= end)
    .sort((a, b) => a.start - b.start);

  const current = timedToday.find(({ start: eventStart, end: eventEnd }) => {
    return eventStart <= now && eventEnd >= now;
  });
  const next = timedToday.find(({ start: eventStart }) => eventStart > now);
  const scheduledMinutesToday = timedToday.reduce((total, { start: eventStart, end: eventEnd }) => {
    const clippedStart = Math.max(eventStart, start);
    const clippedEnd = Math.min(eventEnd, end);
    return total + Math.max(0, Math.round((clippedEnd - clippedStart) / 60000));
  }, 0);
  const freeMinutesUntilNext = next
    ? Math.max(0, Math.round((next.start - now) / 60000))
    : null;
  const cognitiveLoad =
    scheduledMinutesToday >= 240 || timedToday.length >= 6
      ? 'high'
      : scheduledMinutesToday >= 120 || timedToday.length >= 3
      ? 'medium'
      : 'low';

  return {
    connected: true,
    currentEvent: current?.event,
    nextEvent: next?.event,
    freeMinutesUntilNext,
    eventsToday: timedToday.length,
    scheduledMinutesToday,
    cognitiveLoad,
    lastSyncedAt,
  };
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      accounts: [],
      calendars: [],
      events: [],
      lastSyncedAt: undefined,
      isSyncing: false,
      error: undefined,

      upsertAccount: (account) => {
        set((state) => {
          const exists = state.accounts.some((a) => a.id === account.id);
          return {
            accounts: exists
              ? state.accounts.map((a) => (a.id === account.id ? account : a))
              : [...state.accounts, account],
          };
        });
      },

      removeAccount: (accountId) => {
        set((state) => ({
          accounts: state.accounts.filter((a) => a.id !== accountId),
          calendars: state.calendars.filter((c) => c.accountId !== accountId),
          events: state.events.filter((e) => e.accountId !== accountId),
        }));
      },

      setCalendarsForAccount: (accountId, calendars) => {
        set((state) => ({
          calendars: [
            ...state.calendars.filter((c) => c.accountId !== accountId),
            ...calendars,
          ],
        }));
      },

      setEventsForAccount: (accountId, events) => {
        set((state) => ({
          events: [
            ...state.events.filter((e) => e.accountId !== accountId),
            ...events,
          ],
          lastSyncedAt: Date.now(),
        }));
      },

      toggleCalendarSelection: (accountId, calendarId) => {
        set((state) => {
          const accounts = state.accounts.map((account) => {
            if (account.id !== accountId) return account;
            const selected = new Set(account.selectedCalendarIds);
            if (selected.has(calendarId)) selected.delete(calendarId);
            else selected.add(calendarId);
            return {
              ...account,
              selectedCalendarIds: [...selected],
              updatedAt: Date.now(),
            };
          });
          const calendars = state.calendars.map((calendar) =>
            calendar.accountId === accountId && calendar.id === calendarId
              ? { ...calendar, isSelected: !calendar.isSelected }
              : calendar,
          );
          return { accounts, calendars };
        });
      },

      setWritableCalendar: (accountId, calendarId) => {
        set((state) => ({
          accounts: state.accounts.map((account) =>
            account.id === accountId
              ? { ...account, writableCalendarId: calendarId, updatedAt: Date.now() }
              : account,
          ),
        }));
      },

      setSyncing: (isSyncing) => set({ isSyncing }),
      setError: (error) => set({ error }),

      getInsight: () => {
        const state = get();
        if (state.accounts.length === 0) {
          return {
            connected: false,
            freeMinutesUntilNext: null,
            eventsToday: 0,
            scheduledMinutesToday: 0,
            cognitiveLoad: 'low',
            lastSyncedAt: state.lastSyncedAt,
          };
        }
        return calculateInsight(state.events, state.lastSyncedAt);
      },

      reset: () => {
        set({
          accounts: [],
          calendars: [],
          events: [],
          lastSyncedAt: undefined,
          isSyncing: false,
          error: undefined,
        });
      },
    }),
    {
      name: 'dopamenu-calendar-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export default useCalendarStore;
