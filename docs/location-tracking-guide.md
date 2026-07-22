# Location Tracking and Geofencing Implementation Guide

This guide explains how to implement location tracking and geofencing functionality in your Place Reminder app.

## Overview

The implementation consists of several components:

1. **LocationService**: A service for handling location tracking and geofencing
2. **useLocation Hook**: A React hook for using the location service in components
3. **LocationReminderManager**: A component for managing location-based reminders with geofencing
4. **LocationReminderExample**: An example component showing how to use location-based reminders

## Installation

First, install the required packages:

```bash
npx expo install expo-location expo-task-manager
```

> **SDK Compatibility**: This guide is written for **Expo SDK 57** (`~57.0.7`) with React 19.2.3 and React Native 0.86.0. Earlier SDK versions may have different API surfaces (e.g., `notifyOnEntry` was renamed to `notifyOnEnter` in the `GeofenceRegion` type).

## Dev Build Required

**Background location tracking and geofencing do not work in Expo Go on Android.** You must use a development build to test location-based reminders on an Android device. This is because Expo Go does not include the native modules required for background location services and geofencing.

To create a dev build:

```bash
# Using EAS (creates a dev client build with the "development" profile)
eas build --platform android --profile development

# Or run directly on a connected device / emulator
npx expo run:android
```

The project includes three EAS build profiles in `eas.json`:

| Profile | Use case |
|---------|----------|
| `development` | Dev client with `developmentClient: true` — use for local testing of background location features |
| `preview` | Internal distribution for testers |
| `production` | Store-ready build for submission |

## Integration Steps

### 1. Add the LocationReminderManager to your app

Wrap your app with the LocationReminderManager component in your `_layout.tsx` file:

```tsx
import LocationReminderManager from '@/components/LocationReminderManager/LocationReminderManager';

export default function RootLayout() {
  return (
    <LocationReminderManager
      onPermissionDenied={(type) => {
        console.log(`${type} permission denied`);
      }}
      onGeofenceEvent={(eventType, reminder) => {
        console.log(`Geofence event: ${eventType} for reminder: ${reminder.do}`);
      }}
    >
      {/* Your existing app structure */}
    </LocationReminderManager>
  );
}
```

### 2. Use the useLocationReminders hook in your components

```tsx
import { useLocationReminders } from '@/components/LocationReminderManager/LocationReminderManager';

function MyComponent() {
  const {
    addLocationReminder,
    removeLocationReminder,
    updateLocationReminder,
    getLocationReminders,
    currentLocation,
  } = useLocationReminders();
  
  // Use these functions to manage location-based reminders
}
```

### 3. Configure your app.json for location permissions

Add the following to your `app.json` file:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow Place Reminder to use your location to trigger reminders when you enter or leave specific places.",
          "locationAlwaysPermission": "Allow Place Reminder to use your location in the background to trigger reminders when you enter or leave specific places.",
          "locationWhenInUsePermission": "Allow Place Reminder to use your location to trigger reminders when you enter or leave specific places.",
          "isIosBackgroundLocationEnabled": true,
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true
        }
      ]
    ],
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["location", "fetch"]
      }
    },
    "android": {
      "permissions": [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION"
      ]
    }
  }
}
```

## Creating Location-Based Reminders

To create a location-based reminder, use the `addLocationReminder` function:

```tsx
const newReminder = {
  $id: `reminder-${Date.now()}`, // Generate a unique ID
  at: 'Home', // Location name
  do: 'Take out the trash', // Reminder text
  active: true,
  latitude: 37.7749, // Location coordinates
  longitude: -122.4194,
  radius: 100, // Geofence radius in meters
  notifyOnEnter: true, // Notify when entering the geofence
  notifyOnExit: false, // Don't notify when exiting the geofence
};

await addLocationReminder(newReminder);
```

## Handling Geofence Events

The LocationReminderManager component accepts an `onGeofenceEvent` callback that is called when a user enters or exits a geofence:

```tsx
<LocationReminderManager
  onGeofenceEvent={(eventType, reminder) => {
    if (eventType === 'enter') {
      // User entered the geofence
      showNotification(`Reminder: ${reminder.do}`);
    } else if (eventType === 'exit') {
      // User exited the geofence
      showNotification(`You're leaving: ${reminder.at}`);
    }
  }}
>
  {/* Your app */}
</LocationReminderManager>
```

## Battery Optimization

The location tracking is configured to balance accuracy and battery usage:

- Updates every 5 minutes in the background
- Uses a distance filter of 100 meters
- Automatically pauses updates when possible
- Uses balanced accuracy mode

You can adjust these settings in the `locationService.ts` file to meet your specific requirements.

## Testing

### Unit Tests

Run the unit test suite with:

```bash
npm test
```

This executes `jest --ci` and runs all test files, including the unit tests for the `reminderToRegion` helper in `lib/__tests__/locationRegion.test.ts`. These tests verify:

- Default values: `notifyOnEnter` defaults to `true` and `notifyOnExit` defaults to `false`
- Explicit flags: custom `notifyOnEnter` / `notifyOnExit` values are preserved
- Field passthrough: `identifier`, `latitude`, `longitude`, and `radius` are correctly mapped

### Manual Testing

To test geofencing on a device:

1. Build and install a development build (Expo Go on Android does not support background geofencing)
2. Add a location-based reminder at your current location
3. Move away from the location (more than the specified radius)
4. Return to the location

You should receive notifications when entering or exiting the geofence, depending on your notification settings.

## Permission Denial UX

When the user denies location permissions, the `LocationReminderManager` component handles the flow:

1. **Foreground permission denied**: An `Alert` is shown explaining that location access is required. The user can tap **Open Settings** to navigate to the app's system settings via `Linking.openSettings()`.

2. **Background permission denied**: An `Alert` is shown with platform-specific guidance:
   - **Android**: The message instructs the user to choose **"Allow all the time"** in Settings (required for background location on Android 11+).
   - **iOS**: The message instructs the user to enable **"Always"** under Location in Settings.
   
   Tapping **Open Settings** deep-links into the app's system settings on both platforms.

In both cases, the `onPermissionDenied` callback is called with the permission type (`"foreground"` or `"background"`) for custom handling.

## Troubleshooting

- **Location permissions denied**: The app shows an Alert with an **Open Settings** button that deep-links to the system settings. On Android, make sure to select "Allow all the time" for background location. Verify `app.json` includes `isAndroidForegroundServiceEnabled: true` and the `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION` permissions.
- **Geofencing not working**: Background geofencing requires a **development build** — it does not work in Expo Go on Android. Use `eas build --profile development` or `npx expo run:android`. Also ensure the geofence radius is appropriate for your use case.
- **Battery drain**: Adjust the update interval and distance filter in `lib/locationService.ts` to reduce battery usage.

## Additional Resources

- [Expo Location Documentation](https://docs.expo.dev/versions/latest/sdk/location/)
- [Expo TaskManager Documentation](https://docs.expo.dev/versions/latest/sdk/task-manager/)