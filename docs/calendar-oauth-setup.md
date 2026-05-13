# Calendar OAuth Setup

DopaMenu calendar integration uses OAuth code + PKCE. Tokens are stored in
`expo-secure-store`; calendar/account/event metadata is cached in AsyncStorage.

## Redirect URI

Default app redirect:

```text
dopamenu://oauthredirect
```

Override with:

```text
CALENDAR_OAUTH_REDIRECT_URI=<registered redirect>
```

## Google Calendar

Create OAuth clients in Google Cloud Console for the DopaMenu iOS and Android
apps, enable the Google Calendar API, and add the production package/bundle IDs.

Scopes requested:

```text
openid
email
profile
https://www.googleapis.com/auth/calendar
```

Environment variables:

```text
GOOGLE_CALENDAR_IOS_CLIENT_ID=
GOOGLE_CALENDAR_ANDROID_CLIENT_ID=
GOOGLE_CALENDAR_WEB_CLIENT_ID=
```

The app uses the platform-specific client ID first and falls back to the web
client ID only when needed.

## Microsoft Outlook

Create an app registration in Microsoft Entra ID and allow public client/native
mobile flows with the redirect URI above.

Scopes requested:

```text
openid
profile
email
offline_access
User.Read
Calendars.ReadWrite
```

Environment variable:

```text
MICROSOFT_CALENDAR_CLIENT_ID=
```

## Local Smoke Test

After setting credentials:

```powershell
npx tsc --noEmit
npx expo export --platform android --output-dir dist-codex-check --clear
npx expo export --platform ios --output-dir dist-codex-check-ios --clear
```
