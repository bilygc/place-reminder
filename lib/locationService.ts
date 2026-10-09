import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

// Define task names
const LOCATION_BACKGROUND_TASK = 'LOCATION_BACKGROUND_TASK';
const GEOFENCING_TASK = 'GEOFENCING_TASK';

// Define types
// Matches expo-location's LocationRegion shape (uses notifyOnEnter, not notifyOnEntry).
export interface LocationRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number; // in meters
  notifyOnEnter?: boolean;
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

// ---------------------------------------------------------------------------
// Resilient position acquisition: check → fetch → retry → fallback
//
// Android emulators (and devices with a cold GPS) commonly fail the first
// getCurrentPositionAsync call with E_LOCATION_UNAVAILABLE ("no fix yet").
// Both init() and getCurrentLocationWithLabel() share this flow:
//   1. check    — hasServicesEnabledAsync(); never fetch when disabled
//   2. fetch    — getCurrentPositionAsync with bounded retries for transient
//                 "no fix yet" failures
//   3. fallback — getLastKnownPositionAsync before giving up
// ---------------------------------------------------------------------------

/** Location services (OS-level) are off — user must enable them in Settings. */
export const LOCATION_SERVICES_DISABLED_MESSAGE =
  'Location services are disabled. Please enable location in your device Settings and try again.';

/**
 * Permissions are fine and services are on, but the OS has no fix
 * (common right after boot or on an emulator with no mock location set).
 */
export const LOCATION_NO_FIX_MESSAGE =
  'Current location is unavailable. Wait a moment for a GPS fix (or set a mock location on an emulator), then try again.';

/** Retries around getCurrentPositionAsync for transient "no fix yet" errors. */
const MAX_POSITION_RETRIES = 2;
const POSITION_RETRY_DELAY_MS = 1000;
/** Freshness bound for the last-known-position fallback. */
const LAST_KNOWN_MAX_AGE_MS = 60000;

/**
 * Fetch accuracy for getCurrentPositionAsync.
 *
 * Android uses High: Balanced maps to PRIORITY_BALANCED_POWER_ACCURACY, which
 * leans on the network provider — on emulators (no real WiFi/cell signals) it
 * frequently never resolves even when a mock GPS location is set. High maps to
 * PRIORITY_HIGH_ACCURACY, which uses the GPS provider that receives mock
 * locations. iOS/web keep Balanced (lower power, same behavior there).
 */
function fetchAccuracy(): Location.Accuracy {
  return Platform.OS === 'android'
    ? Location.Accuracy.High
    : Location.Accuracy.Balanced;
}

// One-time dev hint flag (module lifetime = app session; fresh per test module).
let devEmulatorHintLogged = false;

/**
 * Log once per session in __DEV__ when a fix can't be obtained, reminding
 * that an emulator needs an explicit mock location. Log-only — never injects
 * fake coordinates into app state.
 */
function logDevEmulatorHint(reason: string): void {
  if (!__DEV__ || devEmulatorHintLogged) {
    return;
  }
  devEmulatorHintLogged = true;
  console.log(
    `[locationService] ${reason} ` +
      '(dev hint: on an Android emulator you must set a mock location via ' +
      'Extended Controls → Location, or `adb emu geo fix <lon> <lat>`; then retry. ' +
      'No mock location is used in app state.)'
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns true when OS location services are enabled. If the check itself
 * throws (unknown state), returns true so the fetch still gets a chance —
 * getCurrentPositionAsync will surface the real failure with retry/fallback.
 */
async function areLocationServicesEnabled(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return true;
  }
}

/**
 * Fetch the current position with bounded retries, then fall back to the
 * last known position. Throws the last fetch error only when both fail.
 */
async function getPositionWithRetryAndFallback(): Promise<Location.LocationObject> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_POSITION_RETRIES; attempt++) {
    try {
      return await Location.getCurrentPositionAsync({
        accuracy: fetchAccuracy(),
      });
    } catch (error) {
      lastError = error;
      if (attempt < MAX_POSITION_RETRIES) {
        await delay(POSITION_RETRY_DELAY_MS);
      }
    }
  }

  try {
    // No requiredAccuracy gate: accept any cached fix younger than maxAge.
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
    });
    if (lastKnown) {
      return lastKnown;
    }
  } catch {
    // Fall through to throw the original fetch error below.
  }

  throw lastError;
}

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
    const { locations } = data as { locations: Location.LocationObject[] };
    // Guard against malformed task data before using locations[0]
    if (!Array.isArray(locations) || locations.length === 0) {
      return;
    }
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
    const { eventType, region } = data as { 
      eventType: Location.GeofencingEventType, 
      region: LocationRegion 
    };
    // Guard against malformed task data before invoking callbacks
    if (!region || typeof region.identifier !== 'string') {
      return;
    }
    
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
    if (__DEV__) {
      console.log('Foreground permission status:', foregroundStatus); // Log foreground status
    }
    locationState.foregroundPermission = foregroundStatus;
    
    if (foregroundStatus !== 'granted') {
      locationState.errorMsg = 'Permission to access location was denied';
      return locationState;
    }
    
    // Then request background permission
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (__DEV__) {
      console.log('Background permission status:', backgroundStatus); // Log background status
    }
    locationState.backgroundPermission = backgroundStatus;
    
    if (backgroundStatus !== 'granted') {
      locationState.errorMsg = 'Permission to access location in the background was denied';
      return locationState;
    }
    
    // Check that OS location services are enabled before fetching —
    // this is distinct from permissions (which passed above).
    if (!(await areLocationServicesEnabled())) {
      locationState.errorMsg = LOCATION_SERVICES_DISABLED_MESSAGE;
      logDevEmulatorHint('Location services are disabled.');
      return locationState;
    }

    // Get current location (fetch → bounded retry → last-known fallback).
    try {
      const location = await getPositionWithRetryAndFallback();
      locationState.location = location;
      locationState.errorMsg = null;
    } catch (error) {
      locationState.errorMsg = LOCATION_NO_FIX_MESSAGE;
      console.error('Error getting location:', error);
      logDevEmulatorHint('Could not obtain a location fix.');
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
        // Only use foregroundService on Android
        ...(Platform.OS === 'android' && {
          foregroundService: {
            notificationTitle: 'Location Tracking',
            notificationBody: 'Tracking your location for reminders',
            notificationColor: '#fff',
          },
        }),
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
        showsBackgroundLocationIndicator: true, // iOS only
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

/**
 * Error thrown when the user denies foreground location permission during
 * the create-reminder flow. Callers should show an inline error and keep the
 * popup open rather than sending the user to Settings.
 */
export class LocationPermissionDeniedError extends Error {}

/**
 * Error thrown when the device cannot retrieve a current position (e.g.
 * location services are disabled or the OS returns E_LOCATION_UNAVAILABLE).
 * Callers should show an inline error and keep the popup open.
 */
export class LocationUnavailableError extends Error {
  constructor(
    message = 'Location unavailable — make sure location services are enabled'
  ) {
    super(message);
    this.name = 'LocationUnavailableError';
  }
}

/**
 * Build a concise human-readable label from a reverse-geocoded address.
 * Prefers "Street, City" but falls back to whatever combination is available.
 */
function buildLocationLabel(
  address: Location.LocationGeocodedAddress
): string {
  const parts: string[] = [];
  if (address.street) parts.push(address.street);
  if (address.city) parts.push(address.city);
  if (address.region) parts.push(address.region);
  if (address.country) parts.push(address.country);

  const unique = parts.filter(
    (value, index, self) => self.indexOf(value) === index
  );
  return unique.slice(0, 2).join(', ');
}

/**
 * Request foreground location permission, verify location services, fetch the
 * current position (with bounded retries + last-known fallback), and attempt
 * to reverse-geocode it into a label.
 *
 * - Permission denied → throws LocationPermissionDeniedError.
 * - Location services disabled → throws LocationUnavailableError with
 *   LOCATION_SERVICES_DISABLED_MESSAGE (no fetch is attempted).
 * - No fix (all retries + last-known fallback fail) → throws
 *   LocationUnavailableError with LOCATION_NO_FIX_MESSAGE.
 * - Geocoding fails or returns nothing → returns label: null; the caller can
 *   fall back to raw coordinates.
 */
export async function getCurrentLocationWithLabel(): Promise<{
  latitude: number;
  longitude: number;
  label: string | null;
}> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new LocationPermissionDeniedError();
  }

  if (!(await areLocationServicesEnabled())) {
    logDevEmulatorHint('Location services are disabled.');
    throw new LocationUnavailableError(LOCATION_SERVICES_DISABLED_MESSAGE);
  }

  let position: Location.LocationObject;
  try {
    position = await getPositionWithRetryAndFallback();
  } catch (error) {
    if (__DEV__) {
      console.error('Failed to get current position:', error);
    }
    logDevEmulatorHint('Could not obtain a location fix.');
    throw new LocationUnavailableError(LOCATION_NO_FIX_MESSAGE);
  }

  const { latitude, longitude } = position.coords;

  try {
    const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
    const first = geocode?.[0];
    if (!first) {
      return { latitude, longitude, label: null };
    }
    const label = buildLocationLabel(first);
    return { latitude, longitude, label };
  } catch {
    return { latitude, longitude, label: null };
  }
}

export default LocationService;