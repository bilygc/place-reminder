import { useEffect, useState, useCallback } from 'react';
import LocationService, { LocationState, LocationRegion } from '../lib/locationService';
import * as Location from 'expo-location';

/**
 * Hook for using location services in React components
 */
export const useLocation = () => {
  const [state, setState] = useState<LocationState>(LocationService.getState());
  
  // Initialize location service
  useEffect(() => {
    let isMounted = true;
    
    const initializeLocation = async () => {
      const locationState = await LocationService.init();
      if (isMounted) {
        setState(locationState);
      }
    };
    
    initializeLocation();
    
    // Register for location updates
    const unsubscribeLocation = LocationService.onLocationUpdate((location) => {
      if (isMounted) {
        setState(prevState => ({
          ...prevState,
          location,
        }));
      }
    });
    
    // Cleanup
    return () => {
      isMounted = false;
      unsubscribeLocation();
    };
  }, []);
  
  // Start tracking location in the background
  const startBackgroundTracking = useCallback(async () => {
    const success = await LocationService.startBackgroundTracking();
    if (success) {
      setState(LocationService.getState());
    }
    return success;
  }, []);
  
  // Stop tracking location
  const stopTracking = useCallback(async () => {
    const success = await LocationService.stopTracking();
    if (success) {
      setState(LocationService.getState());
    }
    return success;
  }, []);
  
  // Add a geofence
  const addGeofence = useCallback(async (region: LocationRegion) => {
    const success = await LocationService.addGeofence(region);
    if (success) {
      setState(LocationService.getState());
    }
    return success;
  }, []);
  
  // Remove a geofence
  const removeGeofence = useCallback(async (identifier: string) => {
    const success = await LocationService.removeGeofence(identifier);
    if (success) {
      setState(LocationService.getState());
    }
    return success;
  }, []);
  
  // Clear all geofences
  const clearGeofences = useCallback(async () => {
    const success = await LocationService.clearGeofences();
    if (success) {
      setState(LocationService.getState());
    }
    return success;
  }, []);
  
  // Register for geofence events
  const onGeofenceEvent = useCallback((
    callback: (eventType: Location.GeofencingEventType, region: LocationRegion) => void
  ) => {
    return LocationService.onGeofenceEvent(callback);
  }, []);
  
  return {
    ...state,
    startBackgroundTracking,
    stopTracking,
    addGeofence,
    removeGeofence,
    clearGeofences,
    onGeofenceEvent,
  };
};

export default useLocation;