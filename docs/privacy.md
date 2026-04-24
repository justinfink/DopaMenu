# Privacy Policy

**Effective date:** April 24, 2026

DopaMenu is a digital wellbeing app built by Justin Fink. This policy explains what data the app collects, why, and how it's handled. The app is designed to keep your data on your device by default.

## What stays only on your device

The following data never leaves your phone. It is stored locally and is not transmitted to us, our servers, or any third party:

- The list of apps you choose to "catch" (e.g. Instagram, TikTok).
- The list of redirect alternatives you set up.
- Your intervention history — when DopaMenu prompted you, what you chose, and any cooldown timers.
- Settings and preferences you configure inside the app.
- Foreground app package names observed by Android's Accessibility Service and Usage Stats API. These are used in real time to decide whether to show an intervention. They are **not** logged, stored, or transmitted.

## What may be transmitted (analytics, opt-in only)

DopaMenu integrates [PostHog](https://posthog.com) for product analytics. **Analytics are off by default.** You can turn them on or off at any time in Settings.

When analytics are on, DopaMenu sends PostHog anonymous events about app usage — for example, "completed onboarding," "intervention shown," or "intervention accepted." These events do not include the names of the third-party apps you track, the contents of any screen, or any personal identifiers.

PostHog's privacy policy is available at https://posthog.com/privacy.

You can disable analytics at any time. When disabled, no data is transmitted to PostHog.

## What DopaMenu does NOT collect

- We do **not** read the contents of any screen. The Accessibility Service is configured with `canRetrieveWindowContent="false"`, which means Android does not give DopaMenu access to the text or visual content of any app.
- We do **not** capture passwords, typed text, or keystrokes.
- We do **not** collect your name, email address, phone number, or other personal identifiers. The app has no account system.
- We do **not** collect your location.
- We do **not** access your contacts, photos, microphone, or camera.
- We do **not** access the contents of your calendar entries (we only read free/busy time blocks if you grant calendar permission).
- We do **not** sell, rent, or share data with advertisers. DopaMenu has no ads.

## Permissions DopaMenu requests, and why

| Permission | Why DopaMenu needs it |
|---|---|
| **Accessibility Service** | To detect when an app you've chosen to intercept opens, so DopaMenu can show its intervention screen on top. Configured to NOT read screen content. |
| **Usage access (`PACKAGE_USAGE_STATS`)** | Backup detection of foreground apps in case Accessibility is unavailable. Used only in real time to decide whether to intervene. |
| **Foreground service** | To keep the detection running while the screen is off or DopaMenu isn't in the foreground. |
| **Full-screen intent** | To surface the intervention screen reliably, even from the lock screen. |
| **Notifications** | To deliver intervention prompts when direct screen launches are restricted by the OS. |
| **Calendar (read/write)** | Optional — only if you grant it — to understand your schedule and tailor intervention timing. Calendar event contents are not collected. |

## Children's privacy

DopaMenu is intended for users 18 and older. It is not directed at children, and we do not knowingly collect data from anyone under 18.

## Data retention and deletion

Local data stays on your device until you delete the app or clear its storage. To remove local data, uninstall DopaMenu or use Android's app storage settings.

If you have analytics enabled, anonymous PostHog events are retained according to PostHog's standard retention policy. To request deletion of analytics events tied to your device, contact us at the email below and include your DopaMenu install ID (Settings → About).

## Changes to this policy

If this policy changes in a meaningful way — for example, if a new data flow is added — we will update the effective date above and note the change in the app's release notes.

## Contact

Questions about this policy: justin.ryan.fink@gmail.com
