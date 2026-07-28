import React, { useEffect, useState, useCallback } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import useLocation from '@/hooks/useLocation';
import { LocationCard } from '@/components/CardReminder/CardReminder.location.types';
import { reminderToRegion } from '@/lib/locationRegion';

interface LocationReminderManagerProps {
  children: React.ReactNode;
  onPermissionDenied?: (type: 'foreground' | 'background') => void;
  onGeofenceEvent?: (
    eventType: 'enter' | 'exit',
    reminder: LocationCard
  ) => void;
}

/**
 * Component to manage location-based reminders with geofencing
 */
const LocationReminderManager: React.FC<LocationReminderManagerProps> = ({
  children,
  onPermissionDenied,
  onGeofenceEvent,
}) => {
  const location = useLocation();
  const [initialized, setInitialized] = useState(false);
  const [reminders, setReminders] = useState<LocationCard[]>([]);

  // Initialize location tracking on component mount
  useEffect(() => {
    const initializeLocation = async () => {
      try {
        // Check permissions
        if (location.foregroundPermission !== 'granted') {
          onPermissionDenied?.('foreground');
          Alert.alert(
            'Location Permission Required',
            'Place Reminder needs access to your location to trigger reminders when you enter or leave specific places. Please enable location permission in Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => Linking.openSettings(),
              },
            ]
          );
          return;
        }

        if (location.backgroundPermission !== 'granted') {
          onPermissionDenied?.('background');
          const bgMessage =
            Platform.OS === 'android'
              ? 'Place Reminder needs background location access to notify you when you enter or leave reminder locations. On Android 11+, open Settings and choose "Allow all the time" for background location.'
              : 'Place Reminder needs background location access to notify you when you enter or leave reminder locations. Please enable "Always" under Location in Settings.';
          Alert.alert(
            'Background Location Permission Required',
            bgMessage,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => Linking.openSettings(),
              },
            ]
          );
          return;
        }

        // Start background tracking
        await location.startBackgroundTracking();

        // Register for geofence events
        location.onGeofenceEvent((eventType, region) => {
          // Find the reminder associated with this region
          const reminder = reminders.find((r) => r.$id === region.identifier);
          if (reminder) {
            // Convert expo-location event type to our app's event type
            const appEventType: 'enter' | 'exit' =
              eventType === Location.GeofencingEventType.Enter
                ? 'enter'
                : 'exit';

            // Call the onGeofenceEvent callback
            onGeofenceEvent?.(appEventType, reminder);

            // Show a notification
            if (
              (eventType === Location.GeofencingEventType.Enter &&
                reminder.notifyOnEnter) ||
              (eventType === Location.GeofencingEventType.Exit &&
                reminder.notifyOnExit)
            ) {
              // In a real app, you would use expo-notifications here
              Alert.alert(
                `Reminder: ${reminder.do}`,
                `You are ${appEventType === 'enter' ? 'at' : 'leaving'} ${
                  reminder.at
                }`,
                [{ text: 'OK' }]
              );
            }
          }
        });

        setInitialized(true);
      } catch (error) {
        console.error('Error initializing location tracking:', error);
        Alert.alert(
          'Location Error',
          'There was an error initializing location tracking. Please try again.',
          [{ text: 'OK' }]
        );
      }
    };

    initializeLocation();

    // Cleanup on unmount
    return () => {
      location.stopTracking();
    };
  }, []);

  useEffect(() => {
    if (__DEV__) {
      console.log('Foreground permission in LocationReminderManager:', location.foregroundPermission); // Log foreground permission
      console.log('Background permission in LocationReminderManager:', location.backgroundPermission); // Log background permission
    }

    if (!location.foregroundPermission || location.foregroundPermission !== 'granted') {
      onPermissionDenied?.('foreground');
    }

    if (!location.backgroundPermission || location.backgroundPermission !== 'granted') {
      onPermissionDenied?.('background');
    }
  }, [location.foregroundPermission, location.backgroundPermission, onPermissionDenied]);

  // Add a location-based reminder
  const addLocationReminder = useCallback(
    async (reminder: LocationCard) => {
      try {
        // Convert reminder to geofence region
        const region = reminderToRegion(reminder);

        // Add the geofence
        const success = await location.addGeofence(region);

        if (success) {
          // Add to local state
          setReminders((prev) => [...prev, reminder]);
          return true;
        }

        return false;
      } catch (error) {
        console.error('Error adding location reminder:', error);
        return false;
      }
    },
    [location]
  );

  // Remove a location-based reminder
  const removeLocationReminder = useCallback(
    async (reminderId: string) => {
      try {
        // Remove the geofence
        const success = await location.removeGeofence(reminderId);

        if (success) {
          // Remove from local state
          setReminders((prev) => prev.filter((r) => r.$id !== reminderId));
          return true;
        }

        return false;
      } catch (error) {
        console.error('Error removing location reminder:', error);
        return false;
      }
    },
    [location]
  );

  // Update a location-based reminder
  const updateLocationReminder = useCallback(
    async (reminder: LocationCard) => {
      try {
        // First remove the existing geofence
        await location.removeGeofence(reminder.$id);

        // Then add the updated geofence
        const region = reminderToRegion(reminder);

        const success = await location.addGeofence(region);

        if (success) {
          // Update in local state
          setReminders((prev) =>
            prev.map((r) => (r.$id === reminder.$id ? reminder : r))
          );
          return true;
        }

        return false;
      } catch (error) {
        console.error('Error updating location reminder:', error);
        return false;
      }
    },
    [location]
  );

  // Get all location-based reminders
  const getLocationReminders = useCallback(() => {
    return [...reminders];
  }, [reminders]);

  // Check if location tracking is initialized
  const isInitialized = useCallback(() => {
    return initialized;
  }, [initialized]);

  // Provide the location reminder methods to children via context
  const contextValue = {
    addLocationReminder,
    removeLocationReminder,
    updateLocationReminder,
    getLocationReminders,
    isInitialized,
    currentLocation: location.location,
  };

  return (
    <LocationReminderContext.Provider value={contextValue}>
      {children}
    </LocationReminderContext.Provider>
  );
};

// Create a context for location reminders
export interface LocationReminderContextType {
  addLocationReminder: (reminder: LocationCard) => Promise<boolean>;
  removeLocationReminder: (reminderId: string) => Promise<boolean>;
  updateLocationReminder: (reminder: LocationCard) => Promise<boolean>;
  getLocationReminders: () => LocationCard[];
  isInitialized: () => boolean;
  currentLocation: any; // Using any to avoid circular dependency
}

export const LocationReminderContext =
  React.createContext<LocationReminderContextType>({
    addLocationReminder: async () => false,
    removeLocationReminder: async () => false,
    updateLocationReminder: async () => false,
    getLocationReminders: () => [],
    isInitialized: () => false,
    currentLocation: null,
  });

// Hook for using location reminders
export const useLocationReminders = () => {
  return React.useContext(LocationReminderContext);
};

export default LocationReminderManager;