import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

// Define task names
const LOCATION_BACKGROUND_TASK = 'LOCATION_BACKGROUND_TASK';
const GEOFENCING_TASK = 'GEOFENCING_TASK';

// Define types
export interface LocationRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number; // in meters
  notifyOnEntry?: boolean;
  notifyOnExit?: boolean;
}

export interface LocationState {
  location: Location.LocationObject | null;
  errorMsg: string | null;
  foregroundPermission: Location.PermissionStatus | null;
  backgroundPermission: Location.PermissionStatus | null;
  isTracking: boolean;
  regions: LocationRegion[];
}

// Initial state
const initialState: LocationState = {
  location: null,
  errorMsg: null,
  foregroundPermission: null,
  backgroundPermission: null,
  isTracking: false,
  regions: [],
};

// Singleton instance
let locationState: LocationState = { ...initialState };

// Callback function type for location updates
type LocationCallback = (location: Location.LocationObject) => void;
type GeofenceCallback = (event: Location.GeofencingEventType, region: LocationRegion) => void;

// Callback registries
const locationCallbacks: LocationCallback[] = [];
const geofenceCallbacks: GeofenceCallback[] = [];

// Register background tasks
TaskManager.defineTask(LOCATION_BACKGROUND_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Location background task error:', error);
    return;
  }
  
  if (data) {
    // @ts-ignore - Type issue with TaskManager data
    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations[0];
    
    // Update the location state
    locationState.location = location;
    
    // Notify all registered callbacks
    locationCallbacks.forEach(callback => callback(location));
  }
});

TaskManager.defineTask(GEOFENCING_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Geofencing task error:', error);
    return;
  }
  
  if (data) {
    // @ts-ignore - Type issue with TaskManager data
    const { eventType, region } = data as { 
      eventType: Location.GeofencingEventType, 
      region: LocationRegion 
    };
    
    // Notify all registered geofence callbacks
    geofenceCallbacks.forEach(callback => callback(eventType, region));
  }
});

/**
 * Location Service for handling location tracking and geofencing
 */
const LocationService = {
  /**
   * Initialize the location service
   */
  async init(): Promise<LocationState> {
    // Request foreground permission first
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    console.log('Foreground permission status:', foregroundStatus); // Log foreground status
    locationState.foregroundPermission = foregroundStatus;
    
    if (foregroundStatus !== 'granted') {
      locationState.errorMsg = 'Permission to access location was denied';
      return locationState;
    }
    
    // Then request background permission
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    console.log('Background permission status:', backgroundStatus); // Log background status
    locationState.backgroundPermission = backgroundStatus;
    
    if (backgroundStatus !== 'granted') {
      locationState.errorMsg = 'Permission to access location in the background was denied';
      return locationState;
    }
    
    // Get current location
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      locationState.location = location;
    } catch (error) {
      locationState.errorMsg = 'Error getting current location';
      console.error('Error getting location:', error);
    }
    
    return locationState;
  },
  
  /**
   * Start tracking location in the foreground
   */
  async startForegroundTracking(): Promise<boolean> {
    if (locationState.foregroundPermission !== 'granted') {
      console.error('Foreground permission not granted');
      return false;
    }
    
    try {
      await Location.startLocationUpdatesAsync(LOCATION_BACKGROUND_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5 * 60 * 1000, // 5 minutes
        distanceInterval: 100, // 100 meters
        foregroundService: {
          notificationTitle: 'Location Tracking',
          notificationBody: 'Tracking your location for reminders',
          notificationColor: '#fff',
        },
      });
      
      locationState.isTracking = true;
      return true;
    } catch (error) {
      console.error('Error starting location tracking:', error);
      return false;
    }
  },
  
  /**
   * Start tracking location in the background
   */
  async startBackgroundTracking(): Promise<boolean> {
    if (locationState.backgroundPermission !== 'granted') {
      console.error('Background permission not granted');
      return false;
    }
    
    try {
      // Configure background location updates
      await Location.startLocationUpdatesAsync(LOCATION_BACKGROUND_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5 * 60 * 1000, // 5 minutes as requested
        distanceInterval: 100, // 100 meters minimum distance
        // Only use foregroundService on Android
        ...(Platform.OS === 'android' && {
          foregroundService: {
            notificationTitle: 'Location Tracking',
            notificationBody: 'Tracking your location for reminders',
            notificationColor: '#fff',
          },
        }),
        // Optimize for battery
        pausesUpdatesAutomatically: true,
        activityType: Location.ActivityType.Other,
        showsBackgroundLocationIndicator: false, // iOS only
      });
      
      locationState.isTracking = true;
      return true;
    } catch (error) {
      console.error('Error starting background location tracking:', error);
      return false;
    }
  },
  
  /**
   * Stop tracking location
   */
  async stopTracking(): Promise<boolean> {
    try {
      const isTaskDefined = await TaskManager.isTaskRegisteredAsync(LOCATION_BACKGROUND_TASK);
      
      if (isTaskDefined) {
        await Location.stopLocationUpdatesAsync(LOCATION_BACKGROUND_TASK);
      }
      
      locationState.isTracking = false;
      return true;
    } catch (error) {
      console.error('Error stopping location tracking:', error);
      return false;
    }
  },
  
  /**
   * Add a geofence region to monitor
   */
  async addGeofence(region: LocationRegion): Promise<boolean> {
    if (locationState.backgroundPermission !== 'granted') {
      console.error('Background permission not granted');
      return false;
    }
    
    try {
      // Check if geofencing is already started
      const isGeofencingStarted = await TaskManager.isTaskRegisteredAsync(GEOFENCING_TASK);
      
      // Add the region to our state
      const existingRegionIndex = locationState.regions.findIndex(
        r => r.identifier === region.identifier
      );
      
      if (existingRegionIndex >= 0) {
        // Update existing region
        locationState.regions[existingRegionIndex] = region;
      } else {
        // Add new region
        locationState.regions.push(region);
      }
      
      // Start geofencing if not already started
      if (!isGeofencingStarted) {
        await Location.startGeofencingAsync(GEOFENCING_TASK, locationState.regions);
      } else {
        // Update regions
        await Location.startGeofencingAsync(GEOFENCING_TASK, locationState.regions);
      }
      
      return true;
    } catch (error) {
      console.error('Error adding geofence:', error);
      return false;
    }
  },
  
  /**
   * Remove a geofence region
   */
  async removeGeofence(identifier: string): Promise<boolean> {
    try {
      // Remove the region from our state
      locationState.regions = locationState.regions.filter(
        region => region.identifier !== identifier
      );
      
      // Update geofencing
      if (locationState.regions.length > 0) {
        await Location.startGeofencingAsync(GEOFENCING_TASK, locationState.regions);
      } else {
        // Stop geofencing if no regions left
        await Location.stopGeofencingAsync(GEOFENCING_TASK);
      }
      
      return true;
    } catch (error) {
      console.error('Error removing geofence:', error);
      return false;
    }
  },
  
  /**
   * Clear all geofences
   */
  async clearGeofences(): Promise<boolean> {
    try {
      locationState.regions = [];
      await Location.stopGeofencingAsync(GEOFENCING_TASK);
      return true;
    } catch (error) {
      console.error('Error clearing geofences:', error);
      return false;
    }
  },
  
  /**
   * Register a callback for location updates
   */
  onLocationUpdate(callback: LocationCallback): () => void {
    locationCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = locationCallbacks.indexOf(callback);
      if (index > -1) {
        locationCallbacks.splice(index, 1);
      }
    };
  },
  
  /**
   * Register a callback for geofence events
   */
  onGeofenceEvent(callback: GeofenceCallback): () => void {
    geofenceCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = geofenceCallbacks.indexOf(callback);
      if (index > -1) {
        geofenceCallbacks.splice(index, 1);
      }
    };
  },
  
  /**
   * Get the current location state
   */
  getState(): LocationState {
    return { ...locationState };
  },
};

export default LocationService;