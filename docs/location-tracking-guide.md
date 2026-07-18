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
          "isAndroidBackgroundLocationEnabled": true
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
        "ACCESS_BACKGROUND_LOCATION"
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

To test geofencing:

1. Add a location-based reminder at your current location
2. Move away from the location (more than the specified radius)
3. Return to the location

You should receive notifications when entering or exiting the geofence, depending on your notification settings.

## Troubleshooting

- **Location permissions denied**: Make sure you've configured your app.json correctly and that the user has granted location permissions.
- **Geofencing not working**: Ensure that background location is enabled and that the geofence radius is appropriate for your use case.
- **Battery drain**: Adjust the update interval and distance filter in locationService.ts to reduce battery usage.

## Additional Resources

- [Expo Location Documentation](https://docs.expo.dev/versions/latest/sdk/location/)
- [Expo TaskManager Documentation](https://docs.expo.dev/versions/latest/sdk/task-manager/)