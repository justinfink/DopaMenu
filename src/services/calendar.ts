import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import {
  AuthRequest,
  CodeChallengeMethod,
  Prompt,
  ResponseType,
} from 'expo-auth-session';
import * as Calendar from 'expo-calendar';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { secureStorage } from './storage';
import { useCalendarStore } from '../stores/calendarStore';
import {
  CalendarAccount,
  CalendarCreateInput,
  CalendarEventItem,
  CalendarProviderId,
  CalendarSource,
} from '../models/calendar';

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY_PREFIX = 'dopamenu-calendar-token';
const GOOGLE_SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar'];
const OUTLOOK_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Calendars.ReadWrite'];
const DEFAULT_RANGE_DAYS = 14;

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
};

const MICROSOFT_DISCOVERY = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}

interface ProviderConfig {
  googleIosClientId: string;
  googleAndroidClientId: string;
  googleWebClientId: string;
  microsoftClientId: string;
  redirectUri: string;
}

function getExtraString(key: string): string {
  const value = Constants.expoConfig?.extra?.[key];
  return typeof value === 'string' ? value : '';
}

function getRedirectUri(): string {
  const configured = getExtraString('calendarOAuthRedirectUri');
  if (configured) return configured;
  return AuthSession.makeRedirectUri({
    scheme: 'dopamenu',
    path: 'oauthredirect',
  });
}

function getProviderConfig(): ProviderConfig {
  return {
    googleIosClientId: getExtraString('googleCalendarIosClientId'),
    googleAndroidClientId: getExtraString('googleCalendarAndroidClientId'),
    googleWebClientId: getExtraString('googleCalendarWebClientId'),
    microsoftClientId: getExtraString('microsoftCalendarClientId'),
    redirectUri: getRedirectUri(),
  };
}

function getGoogleClientId(config = getProviderConfig()): string {
  if (Platform.OS === 'ios') return config.googleIosClientId || config.googleWebClientId;
  if (Platform.OS === 'android') return config.googleAndroidClientId || config.googleWebClientId;
  return config.googleWebClientId;
}

function tokenKey(accountId: string): string {
  return `${TOKEN_KEY_PREFIX}:${accountId}`;
}

async function saveToken(accountId: string, token: StoredToken): Promise<void> {
  await secureStorage.set(tokenKey(accountId), JSON.stringify(token));
}

async function readToken(accountId: string): Promise<StoredToken | null> {
  const raw = await secureStorage.get(tokenKey(accountId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredToken;
  } catch {
    return null;
  }
}

async function deleteToken(accountId: string): Promise<void> {
  await secureStorage.remove(tokenKey(accountId));
}

function toIso(value: string | Date | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeGoogleAccount(userInfo: Record<string, unknown>): Pick<CalendarAccount, 'id' | 'email' | 'displayName'> {
  const email = typeof userInfo.email === 'string' ? userInfo.email : undefined;
  const id = typeof userInfo.sub === 'string' ? userInfo.sub : email || `google-${Date.now()}`;
  return {
    id: `google:${id}`,
    email,
    displayName: typeof userInfo.name === 'string' ? userInfo.name : email,
  };
}

function normalizeOutlookAccount(profile: Record<string, unknown>): Pick<CalendarAccount, 'id' | 'email' | 'displayName'> {
  const email =
    typeof profile.mail === 'string'
      ? profile.mail
      : typeof profile.userPrincipalName === 'string'
      ? profile.userPrincipalName
      : undefined;
  const id = typeof profile.id === 'string' ? profile.id : email || `outlook-${Date.now()}`;
  return {
    id: `outlook:${id}`,
    email,
    displayName: typeof profile.displayName === 'string' ? profile.displayName : email,
  };
}

async function requestJson<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Calendar API request failed with ${response.status}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function normalizeGoogleCalendar(accountId: string, item: any): CalendarSource {
  return {
    id: item.id,
    provider: 'google',
    accountId,
    title: item.summary || 'Calendar',
    color: item.backgroundColor,
    owner: item.primary ? item.id : item.summaryOverride,
    allowsModifications: ['owner', 'writer'].includes(item.accessRole),
    isPrimary: !!item.primary,
    isSelected: !item.hidden,
  };
}

function normalizeGoogleEvent(accountId: string, calendarId: string, item: any): CalendarEventItem {
  const start = item.start?.dateTime || item.start?.date;
  const end = item.end?.dateTime || item.end?.date || start;
  return {
    id: `google:${calendarId}:${item.id}`,
    provider: 'google',
    accountId,
    calendarId,
    providerEventId: item.id,
    title: item.summary || '(No title)',
    notes: item.description,
    location: item.location,
    url: item.htmlLink,
    startDate: toIso(start),
    endDate: toIso(end),
    isAllDay: !!item.start?.date,
    availability: item.transparency === 'transparent' ? 'free' : 'busy',
    status: item.status,
    attendees: Array.isArray(item.attendees)
      ? item.attendees.map((a: any) => a.email).filter(Boolean)
      : undefined,
    organizer: item.organizer?.email,
    sourceUpdatedAt: item.updated,
  };
}

function normalizeOutlookCalendar(accountId: string, item: any): CalendarSource {
  return {
    id: item.id,
    provider: 'outlook',
    accountId,
    title: item.name || 'Calendar',
    color: item.hexColor,
    owner: item.owner?.name || item.owner?.address,
    allowsModifications: item.canEdit !== false,
    isPrimary: item.isDefaultCalendar,
    isSelected: true,
  };
}

function normalizeOutlookEvent(accountId: string, calendarId: string, item: any): CalendarEventItem {
  return {
    id: `outlook:${calendarId}:${item.id}`,
    provider: 'outlook',
    accountId,
    calendarId,
    providerEventId: item.id,
    title: item.subject || '(No title)',
    notes: item.bodyPreview || item.body?.content,
    location: item.location?.displayName,
    url: item.webLink,
    startDate: toIso(item.start?.dateTime),
    endDate: toIso(item.end?.dateTime),
    isAllDay: !!item.isAllDay,
    availability: item.showAs,
    status: item.isCancelled ? 'cancelled' : 'confirmed',
    attendees: Array.isArray(item.attendees)
      ? item.attendees.map((a: any) => a.emailAddress?.address).filter(Boolean)
      : undefined,
    organizer: item.organizer?.emailAddress?.address,
    sourceUpdatedAt: item.lastModifiedDateTime,
  };
}

function normalizeDeviceCalendar(accountId: string, item: Calendar.Calendar): CalendarSource {
  return {
    id: item.id,
    provider: 'device',
    accountId,
    title: item.title,
    color: item.color,
    owner: item.ownerAccount || item.source?.name,
    allowsModifications: item.allowsModifications,
    isPrimary: item.isPrimary,
    isSelected: true,
  };
}

function normalizeDeviceEvent(accountId: string, item: Calendar.Event): CalendarEventItem {
  return {
    id: `device:${item.calendarId}:${item.id}`,
    provider: 'device',
    accountId,
    calendarId: item.calendarId,
    providerEventId: item.id,
    title: item.title || '(No title)',
    notes: item.notes || undefined,
    location: item.location || undefined,
    url: item.url,
    startDate: toIso(item.startDate),
    endDate: toIso(item.endDate),
    isAllDay: !!item.allDay,
    availability: item.availability,
    status: item.status,
    organizer: item.organizerEmail || item.organizer?.name,
    sourceUpdatedAt: toIso(item.lastModifiedDate),
  };
}

async function exchangeCode(
  provider: CalendarProviderId,
  clientId: string,
  redirectUri: string,
  code: string,
  codeVerifier?: string,
): Promise<StoredToken> {
  const discovery = provider === 'google' ? GOOGLE_DISCOVERY : MICROSOFT_DISCOVERY;
  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code,
      redirectUri,
      scopes: provider === 'google' ? GOOGLE_SCOPES : OUTLOOK_SCOPES,
      extraParams: codeVerifier ? { code_verifier: codeVerifier } : undefined,
    },
    discovery,
  );
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresIn ? Date.now() + token.expiresIn * 1000 : undefined,
    scopes: token.scope?.split(' '),
  };
}

async function getFreshToken(account: CalendarAccount): Promise<string> {
  const token = await readToken(account.id);
  if (!token) throw new Error('Calendar account needs to be reconnected.');
  const freshEnough = !token.expiresAt || token.expiresAt > Date.now() + 60_000;
  if (freshEnough) return token.accessToken;
  if (!token.refreshToken) return token.accessToken;

  const clientId =
    account.provider === 'google'
      ? getGoogleClientId()
      : getProviderConfig().microsoftClientId;
  const refreshed = await AuthSession.refreshAsync(
    {
      clientId,
      refreshToken: token.refreshToken,
      scopes: account.provider === 'google' ? GOOGLE_SCOPES : OUTLOOK_SCOPES,
    },
    account.provider === 'google' ? GOOGLE_DISCOVERY : MICROSOFT_DISCOVERY,
  );
  const nextToken: StoredToken = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || token.refreshToken,
    expiresAt: refreshed.expiresIn ? Date.now() + refreshed.expiresIn * 1000 : undefined,
    scopes: refreshed.scope?.split(' ') || token.scopes,
  };
  await saveToken(account.id, nextToken);
  return nextToken.accessToken;
}

async function connectOAuthProvider(provider: 'google' | 'outlook'): Promise<CalendarAccount> {
  const config = getProviderConfig();
  const clientId =
    provider === 'google' ? getGoogleClientId(config) : config.microsoftClientId;
  if (!clientId) {
    throw new Error(
      provider === 'google'
        ? 'Missing Google Calendar OAuth client ID.'
        : 'Missing Microsoft Calendar OAuth client ID.',
    );
  }

  const request = new AuthRequest({
    clientId,
    responseType: ResponseType.Code,
    redirectUri: config.redirectUri,
    scopes: provider === 'google' ? GOOGLE_SCOPES : OUTLOOK_SCOPES,
    usePKCE: true,
    codeChallengeMethod: CodeChallengeMethod.S256,
    prompt: provider === 'google' ? Prompt.Consent : undefined,
    extraParams: provider === 'google' ? { access_type: 'offline' } : undefined,
  });
  const result = await request.promptAsync(
    provider === 'google' ? GOOGLE_DISCOVERY : MICROSOFT_DISCOVERY,
  );
  if (result.type !== 'success' || !result.params.code) {
    throw new Error('Calendar connection was cancelled.');
  }

  const token = await exchangeCode(
    provider,
    clientId,
    config.redirectUri,
    result.params.code,
    request.codeVerifier,
  );
  const userInfo =
    provider === 'google'
      ? await requestJson<Record<string, unknown>>(GOOGLE_DISCOVERY.userInfoEndpoint, token.accessToken)
      : await requestJson<Record<string, unknown>>('https://graph.microsoft.com/v1.0/me', token.accessToken);
  const normalized =
    provider === 'google'
      ? normalizeGoogleAccount(userInfo)
      : normalizeOutlookAccount(userInfo);
  const account: CalendarAccount = {
    ...normalized,
    provider,
    connectedAt: Date.now(),
    updatedAt: Date.now(),
    scopes: provider === 'google' ? GOOGLE_SCOPES : OUTLOOK_SCOPES,
    selectedCalendarIds: [],
  };
  await saveToken(account.id, token);
  useCalendarStore.getState().upsertAccount(account);
  await calendarService.syncAccount(account.id);
  return useCalendarStore.getState().accounts.find((a) => a.id === account.id) || account;
}

async function fetchGoogleCalendars(account: CalendarAccount, accessToken: string): Promise<CalendarSource[]> {
  const data = await requestJson<{ items?: any[] }>(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    accessToken,
  );
  return (data.items || []).map((item) => normalizeGoogleCalendar(account.id, item));
}

async function fetchGoogleEvents(
  account: CalendarAccount,
  calendars: CalendarSource[],
  accessToken: string,
  startDate: Date,
  endDate: Date,
): Promise<CalendarEventItem[]> {
  const selectedIds = account.selectedCalendarIds.length
    ? new Set(account.selectedCalendarIds)
    : new Set(calendars.map((calendar) => calendar.id));
  const events: CalendarEventItem[] = [];
  for (const calendar of calendars) {
    if (!selectedIds.has(calendar.id)) continue;
    const params = new URLSearchParams({
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    });
    const data = await requestJson<{ items?: any[] }>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${params}`,
      accessToken,
    );
    events.push(...(data.items || []).map((item) => normalizeGoogleEvent(account.id, calendar.id, item)));
  }
  return events;
}

async function fetchOutlookCalendars(account: CalendarAccount, accessToken: string): Promise<CalendarSource[]> {
  const data = await requestJson<{ value?: any[] }>(
    'https://graph.microsoft.com/v1.0/me/calendars',
    accessToken,
  );
  return (data.value || []).map((item) => normalizeOutlookCalendar(account.id, item));
}

async function fetchOutlookEvents(
  account: CalendarAccount,
  calendars: CalendarSource[],
  accessToken: string,
  startDate: Date,
  endDate: Date,
): Promise<CalendarEventItem[]> {
  const selectedIds = account.selectedCalendarIds.length
    ? new Set(account.selectedCalendarIds)
    : new Set(calendars.map((calendar) => calendar.id));
  const events: CalendarEventItem[] = [];
  for (const calendar of calendars) {
    if (!selectedIds.has(calendar.id)) continue;
    let url =
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendar.id)}` +
      `/calendarView?startDateTime=${encodeURIComponent(startDate.toISOString())}` +
      `&endDateTime=${encodeURIComponent(endDate.toISOString())}&$top=100`;
    while (url) {
      const data = await requestJson<{ value?: any[]; '@odata.nextLink'?: string }>(url, accessToken, {
        headers: { Prefer: 'outlook.timezone="UTC"' },
      });
      events.push(...(data.value || []).map((item) => normalizeOutlookEvent(account.id, calendar.id, item)));
      url = data['@odata.nextLink'] || '';
    }
  }
  return events;
}

async function connectDeviceCalendar(): Promise<CalendarAccount> {
  const permissions = await calendarService.requestPermissions();
  if (!permissions.granted) throw new Error('Calendar permission was not granted.');
  const account: CalendarAccount = {
    id: 'device:local',
    provider: 'device',
    displayName: 'Device calendars',
    connectedAt: Date.now(),
    updatedAt: Date.now(),
    scopes: ['device-calendar-readwrite'],
    selectedCalendarIds: [],
  };
  useCalendarStore.getState().upsertAccount(account);
  await calendarService.syncAccount(account.id);
  return useCalendarStore.getState().accounts.find((a) => a.id === account.id) || account;
}

async function fetchDeviceCalendars(account: CalendarAccount): Promise<CalendarSource[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars.map((calendar) => normalizeDeviceCalendar(account.id, calendar));
}

async function fetchDeviceEvents(
  account: CalendarAccount,
  calendars: CalendarSource[],
  startDate: Date,
  endDate: Date,
): Promise<CalendarEventItem[]> {
  const selectedIds = account.selectedCalendarIds.length
    ? account.selectedCalendarIds
    : calendars.map((calendar) => calendar.id);
  if (selectedIds.length === 0) return [];
  const events = await Calendar.getEventsAsync(selectedIds, startDate, endDate);
  return events.map((event) => normalizeDeviceEvent(account.id, event));
}

export interface CalendarPermissions {
  granted: boolean;
  canAskAgain: boolean;
}

export const calendarService = {
  getRedirectUri,
  getProviderConfig,
  googleScopes: GOOGLE_SCOPES,
  outlookScopes: OUTLOOK_SCOPES,

  async requestPermissions(): Promise<CalendarPermissions> {
    const { status: existingStatus } = await Calendar.getCalendarPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      finalStatus = status;
    }
    return { granted: finalStatus === 'granted', canAskAgain: finalStatus !== 'denied' };
  },

  async checkPermissions(): Promise<CalendarPermissions> {
    const { status, canAskAgain } = await Calendar.getCalendarPermissionsAsync();
    return { granted: status === 'granted', canAskAgain };
  },

  async connectGoogle(): Promise<CalendarAccount> {
    return connectOAuthProvider('google');
  },

  async connectOutlook(): Promise<CalendarAccount> {
    return connectOAuthProvider('outlook');
  },

  async connectDevice(): Promise<CalendarAccount> {
    return connectDeviceCalendar();
  },

  async disconnect(accountId: string): Promise<void> {
    await deleteToken(accountId);
    useCalendarStore.getState().removeAccount(accountId);
  },

  async syncAll(): Promise<void> {
    const store = useCalendarStore.getState();
    store.setSyncing(true);
    store.setError(undefined);
    try {
      for (const account of store.accounts) {
        await this.syncAccount(account.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Calendar sync failed.';
      useCalendarStore.getState().setError(message);
      throw error;
    } finally {
      useCalendarStore.getState().setSyncing(false);
    }
  },

  async syncAccount(accountId: string): Promise<void> {
    const account = useCalendarStore.getState().accounts.find((a) => a.id === accountId);
    if (!account) return;
    const startDate = addDays(new Date(), -1);
    const endDate = addDays(new Date(), DEFAULT_RANGE_DAYS);
    let calendars: CalendarSource[] = [];
    let events: CalendarEventItem[] = [];

    if (account.provider === 'device') {
      calendars = await fetchDeviceCalendars(account);
      events = await fetchDeviceEvents(account, calendars, startDate, endDate);
    } else if (account.provider === 'google') {
      const accessToken = await getFreshToken(account);
      calendars = await fetchGoogleCalendars(account, accessToken);
      events = await fetchGoogleEvents(account, calendars, accessToken, startDate, endDate);
    } else {
      const accessToken = await getFreshToken(account);
      calendars = await fetchOutlookCalendars(account, accessToken);
      events = await fetchOutlookEvents(account, calendars, accessToken, startDate, endDate);
    }

    const selectedCalendarIds = account.selectedCalendarIds.length
      ? account.selectedCalendarIds
      : calendars.map((calendar) => calendar.id);
    const writableCalendarId =
      account.writableCalendarId ||
      calendars.find((calendar) => calendar.isPrimary && calendar.allowsModifications)?.id ||
      calendars.find((calendar) => calendar.allowsModifications)?.id;
    const selectedCalendars = calendars.map((calendar) => ({
      ...calendar,
      isSelected: selectedCalendarIds.includes(calendar.id),
    }));
    useCalendarStore.getState().upsertAccount({
      ...account,
      selectedCalendarIds,
      writableCalendarId,
      updatedAt: Date.now(),
    });
    useCalendarStore.getState().setCalendarsForAccount(account.id, selectedCalendars);
    useCalendarStore.getState().setEventsForAccount(account.id, events);
  },

  async createEvent(accountId: string, input: CalendarCreateInput): Promise<string> {
    const account = useCalendarStore.getState().accounts.find((a) => a.id === accountId);
    if (!account) throw new Error('Calendar account not found.');
    const calendarId = account.writableCalendarId || account.selectedCalendarIds[0];
    if (!calendarId) throw new Error('Choose a writable calendar first.');

    if (account.provider === 'device') {
      return Calendar.createEventAsync(calendarId, {
        title: input.title,
        notes: input.notes,
        location: input.location,
        startDate: input.startDate,
        endDate: input.endDate,
        allDay: input.allDay,
      });
    }

    const accessToken = await getFreshToken(account);
    if (account.provider === 'google') {
      const result = await requestJson<{ id: string }>(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            summary: input.title,
            description: input.notes,
            location: input.location,
            start: input.allDay
              ? { date: input.startDate.toISOString().slice(0, 10) }
              : { dateTime: input.startDate.toISOString() },
            end: input.allDay
              ? { date: input.endDate.toISOString().slice(0, 10) }
              : { dateTime: input.endDate.toISOString() },
          }),
        },
      );
      await this.syncAccount(account.id);
      return result.id;
    }

    const result = await requestJson<{ id: string }>(
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          subject: input.title,
          body: { contentType: 'text', content: input.notes || '' },
          location: input.location ? { displayName: input.location } : undefined,
          isAllDay: input.allDay,
          start: { dateTime: input.startDate.toISOString(), timeZone: 'UTC' },
          end: { dateTime: input.endDate.toISOString(), timeZone: 'UTC' },
        }),
      },
    );
    await this.syncAccount(account.id);
    return result.id;
  },
};

export default calendarService;
