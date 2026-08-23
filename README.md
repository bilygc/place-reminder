# Place Reminder

Location-based reminder app built with [Expo](https://expo.dev) and [Expo Router](https://docs.expo.dev/router/introduction/).

## Features

- **Create reminder flow (ATO-12)**: Type a description, pick a location via current GPS or map pin picker, and create an owner-scoped reminder. See [docs/create-reminder-flow.md](docs/create-reminder-flow.md).
- **Location-based reminders**: Set reminders that trigger when you enter or leave specific places using geofencing.
- **Background location tracking**: Reminders fire even when the app is in the background (requires a development build on Android).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
    npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

> **Note**: Background location tracking and geofencing **do not work in Expo Go on Android**. Use a development build (`eas build --profile development` or `npx expo run:android`) to test location-based reminders.

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Testing

```bash
npm test
```

Runs the Jest unit test suite in CI mode (`jest --ci`, preset `jest-expo`). Baseline after ATO-12: **366 tests / 33 suites green**.

New coverage includes the create-reminder flow: `lib/__tests__/createReminder.test.ts` (owner-scoped `createReminder` contract and validation), `lib/__tests__/locationService.reminder.test.ts` (`getCurrentLocationWithLabel` and `LocationPermissionDeniedError`), `utils/__tests__/validateReminder.test.ts` (description/location validation), and `__mocks__/react-native-maps.js` for `MapPicker` tests. See [docs/create-reminder-flow.md](docs/create-reminder-flow.md) for details.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Documentation

- [Create Reminder Flow (ATO-12)](docs/create-reminder-flow.md) — user flow, `createReminder` API, location helpers, validation, components, Appwrite schema/permissions, `react-native-maps` setup, and testing notes.
- [Location Tracking & Geofencing Guide](docs/location-tracking-guide.md) — background tracking, geofencing, and `LocationService` singleton.
- [Known Issues](docs/known-issues.md) — deferred tech-debt log.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.