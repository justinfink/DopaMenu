# DopaMenu

A contextual behavior router that intercepts automatic digital habits at high-leverage moments and offers a single, effort-appropriate alternative—or conscious continuation—based on your goals, energy, and context.

## Quick Start

```bash
# Install dependencies
npm install

# Start the development server
npx expo start

# Run on iOS simulator (Mac only)
npx expo start --ios

# Run on Android emulator
npx expo start --android

# Run in web browser
npx expo start --web
```

## Features

### MVP Scope

- **Chat-based Onboarding** - Conversational identity anchor setup
- **Contextual Intervention Engine** - Detects situations and suggests alternatives
- **Single-Suggestion Intercept UI** - One ranked recommendation with "see other options"
- **Daily Portfolio Reflection** - Category-based check-in (not tasks)
- **User Preferences** - Intervention frequency, tone, quiet hours

### Design Principles

1. **Autonomy First** - Conscious continuation is always a valid outcome
2. **Silence Is Success** - Over-intervention causes uninstall
3. **Single Strong Suggestion** - One ranked recommendation
4. **Isomorphic Replacement** - Interventions match the effort budget
5. **User-Owned System** - Inspectable and configurable

## Project Structure

```
DopaMenu/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation
│   │   ├── index.tsx      # Dashboard
│   │   ├── portfolio.tsx  # Daily reflection
│   │   └── settings.tsx   # Preferences
│   ├── onboarding/        # Onboarding flow
│   └── intervention.tsx   # Intervention modal
├── src/
│   ├── components/        # UI components
│   ├── models/            # TypeScript domain models
│   ├── engine/            # Intervention logic
│   ├── stores/            # Zustand state stores
│   ├── services/          # Calendar, notifications, storage
│   ├── hooks/             # Custom React hooks
│   └── constants/         # Theme and default data
└── assets/                # Images and fonts
```

## Tech Stack

- **Framework**: React Native + Expo SDK 52
- **Language**: TypeScript
- **Navigation**: Expo Router
- **State**: Zustand with AsyncStorage persistence
- **UI**: Custom components with purple theme

## Color Palette

- Primary: `#9B7BB8` (purple)
- Primary Light: `#B8A4C9`
- Primary Dark: `#7B5B9B`
- Background: `#F8F6FA`
- Surface: `#FFFFFF`

## Demo

The app includes a demo mode accessible from the dashboard. Tap "Demo" to trigger a simulated intervention and see how the intercept UI works.

## Privacy

- No raw GPS storage
- No calendar content parsing (only timing)
- Semantic states only
- Local-first inference
- All data stays on device
