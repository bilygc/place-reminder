/// <reference types="jest" />
/**
 * Unit tests for lib/locationService.ts — a stateful singleton with
 * module-level state and callback registries, plus two TaskManager task
 * executors defined at module load time.
 *
 * Isolation strategy: `jest.resetModules()` in beforeEach clears the module
 * cache, so each test's `loadService()` re-evaluates locationService (fresh
 * module-level `locationState` + callback arrays) AND re-evaluates the
 * manual expo-location / expo-task-manager mocks (fresh jest.fn instances).
 * We use plain `require` (not jest.isolateModules) so every require in a
 * test shares ONE module registry — this matters for the android test,
 * where mutating `require('react-native').Platform.OS` must reach the same
 * `Platform` object locationService captured. (jest.isolateModules gives
 * locationService a distinct react-native instance, so the mutation never
 * arrived — root-caused during batch 1.)
 *
 * `jest.mock('expo-location')` / `jest.mock('expo-task-manager')` are hoisted
 * above imports by babel-jest, so the mocks are active before locationService
 * is imported — this matters because `TaskManager.defineTask()` runs at
 * locationService's module load time.
 *
 * The task executors close over the fresh module's `locationState` /
 * `locationCallbacks` / `geofenceCallbacks`, so we drive them by retrieving
 * the captured executor via `__getTaskExecutor(name)` and invoking it with a
 * synthetic task body, then asserting on `service.getState()` and the
 * registered callbacks.
 */
jest.mock('expo-location');
jest.mock('expo-task-manager');

import type { LocationRegion } from '../locationService';

type LocationModule = typeof import('expo-location');
type TaskManagerModule = typeof import('expo-task-manager');
type LocationService = typeof import('../locationService').default;

/**
 * The manual mock at `__mocks__/expo-location.js` replaces every async
 * function with a `jest.fn()`, but `typeof import('expo-location')` gives the
 * REAL module type — whose function signatures don't include `mockResolvedValue`
 * / `mockRejectedValue` / `.mock`. We extend the real module type, overriding
 * only the mocked functions with `jest.Mock` (which carries all the mock
 * methods) while keeping the enum objects (Accuracy, ActivityType,
 * GeofencingEventType, PermissionStatus) at their real types so assertions
 * like `locationMock.Accuracy.Balanced` still type-check.
 */
interface LocationMock
  extends Omit<
    LocationModule,
    | 'requestForegroundPermissionsAsync'
    | 'requestBackgroundPermissionsAsync'
    | 'getCurrentPositionAsync'
    | 'startLocationUpdatesAsync'
    | 'stopLocationUpdatesAsync'
    | 'startGeofencingAsync'
    | 'stopGeofencingAsync'
    | 'hasServicesEnabledAsync'
  > {
  requestForegroundPermissionsAsync: jest.Mock;
  requestBackgroundPermissionsAsync: jest.Mock;
  getCurrentPositionAsync: jest.Mock;
  startLocationUpdatesAsync: jest.Mock;
  stopLocationUpdatesAsync: jest.Mock;
  startGeofencingAsync: jest.Mock;
  stopGeofencingAsync: jest.Mock;
  hasServicesEnabledAsync: jest.Mock;
}

/**
 * Same pattern as LocationMock: override the mocked functions with `jest.Mock`
 * and add the custom test helpers (`__getTaskExecutor`, `__clearTaskExecutors`,
 * `__taskExecutors`) that the manual mock exposes but the real module type
 * doesn't declare.
 */
interface TaskManagerMock
  extends Omit<
    TaskManagerModule,
    | 'defineTask'
    | 'isTaskRegisteredAsync'
    | 'isTaskDefined'
    | 'getTaskOptionsAsync'
    | 'getRegisteredTasksAsync'
    | 'unregisterTaskAsync'
  > {
  defineTask: jest.Mock;
  isTaskRegisteredAsync: jest.Mock;
  isTaskDefined: jest.Mock;
  getTaskOptionsAsync: jest.Mock;
  getRegisteredTasksAsync: jest.Mock;
  unregisterTaskAsync: jest.Mock;
  __getTaskExecutor: (
    name: string
  ) => (body: { data: unknown; error: unknown }) => Promise<void>;
  __clearTaskExecutors: () => void;
  __taskExecutors: Map<string, (...args: unknown[]) => unknown>;
}

interface LoadResult {
  service: LocationService;
  locationMock: LocationMock;
  taskManagerMock: TaskManagerMock;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Platform: any;
}

/**
 * Re-import locationService against a fresh module cache and return the
 * fresh service plus the fresh mock modules (so each test configures only
 * the resolutions it needs). Requires expo-location / expo-task-manager /
 * react-native BEFORE locationService so locationService's internal requires
 * resolve to these same cached instances.
 */
function loadService(): LoadResult {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const locationMock: LocationMock = require('expo-location');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const taskManagerMock: TaskManagerMock = require('expo-task-manager');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Platform = require('react-native').Platform;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const service: LocationService = require('../locationService').default;
  return { service, locationMock, taskManagerMock, Platform };
}

const sampleLocation = {
  coords: { latitude: 40.7, longitude: -74.0, accuracy: 10 },
  timestamp: 1700000000000,
};

const sampleRegion: LocationRegion = {
  identifier: 'rem-1',
  latitude: 40.7,
  longitude: -74.0,
  radius: 150,
  notifyOnEnter: true,
  notifyOnExit: false,
};

describe('locationService', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // __DEV__ is true in the jest-expo env, so init() logs permission statuses;
    // error paths also console.error. Suppress both and assert on them where
    // relevant.
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('module load', () => {
    it('defines both TaskManager tasks at module load time', () => {
      const { taskManagerMock } = loadService();
      expect(taskManagerMock.defineTask).toHaveBeenCalledTimes(2);
      expect(taskManagerMock.defineTask).toHaveBeenCalledWith(
        'LOCATION_BACKGROUND_TASK',
        expect.any(Function)
      );
      expect(taskManagerMock.defineTask).toHaveBeenCalledWith(
        'GEOFENCING_TASK',
        expect.any(Function)
      );
    });

    it('exposes both task executors via the task-manager mock helper', () => {
      const { taskManagerMock } = loadService();
      expect(
        taskManagerMock.__getTaskExecutor('LOCATION_BACKGROUND_TASK')
      ).toBeInstanceOf(Function);
      expect(taskManagerMock.__getTaskExecutor('GEOFENCING_TASK')).toBeInstanceOf(
        Function
      );
    });

    it('starts with the default empty state', () => {
      const { service } = loadService();
      expect(service.getState()).toEqual({
        location: null,
        errorMsg: null,
        foregroundPermission: null,
        backgroundPermission: null,
        isTracking: false,
        regions: [],
      });
    });
  });

  describe('init()', () => {
    it('grants both permissions and captures the current position', async () => {
      const { service, locationMock } = loadService();
      locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        granted: true,
        expires: 'never',
      });
      locationMock.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        granted: true,
        expires: 'never',
      });
      locationMock.getCurrentPositionAsync.mockResolvedValue(sampleLocation);

      const state = await service.init();

      expect(state.foregroundPermission).toBe('granted');
      expect(state.backgroundPermission).toBe('granted');
      expect(state.location).toBe(sampleLocation);
      expect(state.errorMsg).toBeNull();
      expect(locationMock.getCurrentPositionAsync).toHaveBeenCalledWith({
        accuracy: locationMock.Accuracy.Balanced,
      });
    });

    it('fails early when foreground permission is denied (does not request background)', async () => {
      const { service, locationMock } = loadService();
      locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
        granted: false,
        expires: 'never',
      });

      const state = await service.init();

      expect(state.foregroundPermission).toBe('denied');
      expect(state.errorMsg).toBe('Permission to access location was denied');
      expect(state.location).toBeNull();
      // Background permission is never requested once foreground is denied.
      expect(
        locationMock.requestBackgroundPermissionsAsync
      ).not.toHaveBeenCalled();
      expect(locationMock.getCurrentPositionAsync).not.toHaveBeenCalled();
    });

    it('fails when foreground is granted but background is denied', async () => {
      const { service, locationMock } = loadService();
      locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        granted: true,
        expires: 'never',
      });
      locationMock.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
        granted: false,
        expires: 'never',
      });

      const state = await service.init();

      expect(state.backgroundPermission).toBe('denied');
      expect(state.errorMsg).toBe(
        'Permission to access location in the background was denied'
      );
      // getCurrentPositionAsync is only reached after both permissions pass.
      expect(locationMock.getCurrentPositionAsync).not.toHaveBeenCalled();
      expect(state.location).toBeNull();
    });

    it('records an error message (but does not throw) when getCurrentPositionAsync rejects', async () => {
      const { service, locationMock } = loadService();
      locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        granted: true,
        expires: 'never',
      });
      locationMock.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        granted: true,
        expires: 'never',
      });
      locationMock.getCurrentPositionAsync.mockRejectedValue(
        new Error('gps unavailable')
      );

      const state = await service.init();

      expect(state.errorMsg).toBe('Error getting current location');
      expect(state.location).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('logs permission statuses under __DEV__ (console.log called twice)', async () => {
      const { service, locationMock } = loadService();
      locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        granted: true,
        expires: 'never',
      });
      locationMock.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        granted: true,
        expires: 'never',
      });
      locationMock.getCurrentPositionAsync.mockResolvedValue(sampleLocation);

      await service.init();

      // One log for foreground status, one for background status.
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('startForegroundTracking()', () => {
    it('returns false without starting when foreground permission is not granted', async () => {
      const { service, locationMock } = loadService();
      // Fresh state: foregroundPermission is null (not 'granted').
      const result = await service.startForegroundTracking();
      expect(result).toBe(false);
      expect(locationMock.startLocationUpdatesAsync).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('starts location updates with Balanced accuracy and 5-min/100m intervals (ios: no foregroundService)', async () => {
      const { service, locationMock, Platform } = loadService();
      expect(Platform.OS).toBe('ios');
      await grantBackground(service, locationMock);

      const result = await service.startForegroundTracking();

      expect(result).toBe(true);
      expect(locationMock.startLocationUpdatesAsync).toHaveBeenCalledWith(
        'LOCATION_BACKGROUND_TASK',
        expect.objectContaining({
          accuracy: locationMock.Accuracy.Balanced,
          timeInterval: 5 * 60 * 1000,
          distanceInterval: 100,
        })
      );
      // ios path does not spread a foregroundService object.
      const callArgs = locationMock.startLocationUpdatesAsync.mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('foregroundService');
      expect(service.getState().isTracking).toBe(true);
    });

    it('includes a foregroundService notification config on android', async () => {
      const { service, locationMock, Platform } = loadService();
      await grantBackground(service, locationMock);
      // Mutate the same Platform object locationService captured (single
      // shared registry — see file header) to exercise the android branch.
      Platform.OS = 'android';
      try {
        const result = await service.startForegroundTracking();

        expect(result).toBe(true);
        const callArgs = locationMock.startLocationUpdatesAsync.mock.calls[0][1];
        expect(callArgs.foregroundService).toEqual({
          notificationTitle: 'Location Tracking',
          notificationBody: 'Tracking your location for reminders',
          notificationColor: '#fff',
        });
      } finally {
        Platform.OS = 'ios';
      }
    });

    it('returns false and logs when startLocationUpdatesAsync rejects', async () => {
      const { service, locationMock } = loadService();
      await grantBackground(service, locationMock);

      locationMock.startLocationUpdatesAsync.mockRejectedValue(
        new Error('already started')
      );
      const result = await service.startForegroundTracking();

      expect(result).toBe(false);
      expect(service.getState().isTracking).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('startBackgroundTracking()', () => {
    it('returns false without starting when background permission is not granted', async () => {
      const { service, locationMock } = loadService();
      const result = await service.startBackgroundTracking();
      expect(result).toBe(false);
      expect(locationMock.startLocationUpdatesAsync).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('starts with battery-optimization options and ActivityType.Other', async () => {
      const { service, locationMock, Platform } = loadService();
      expect(Platform.OS).toBe('ios');
      await grantBackground(service, locationMock);

      const result = await service.startBackgroundTracking();

      expect(result).toBe(true);
      expect(locationMock.startLocationUpdatesAsync).toHaveBeenCalledWith(
        'LOCATION_BACKGROUND_TASK',
        expect.objectContaining({
          accuracy: locationMock.Accuracy.Balanced,
          timeInterval: 5 * 60 * 1000,
          distanceInterval: 100,
          pausesUpdatesAutomatically: true,
          activityType: locationMock.ActivityType.Other,
          showsBackgroundLocationIndicator: true,
        })
      );
      expect(service.getState().isTracking).toBe(true);
    });
  });

  describe('stopTracking()', () => {
    it('stops location updates when the task is registered', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      await grantBackground(service, locationMock, taskManagerMock);
      await service.startForegroundTracking();

      taskManagerMock.isTaskRegisteredAsync.mockResolvedValue(true);

      const result = await service.stopTracking();

      expect(result).toBe(true);
      expect(locationMock.stopLocationUpdatesAsync).toHaveBeenCalledWith(
        'LOCATION_BACKGROUND_TASK'
      );
      expect(service.getState().isTracking).toBe(false);
    });

    it('skips stopLocationUpdatesAsync when the task is not registered', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      taskManagerMock.isTaskRegisteredAsync.mockResolvedValue(false);

      const result = await service.stopTracking();

      expect(result).toBe(true);
      expect(locationMock.stopLocationUpdatesAsync).not.toHaveBeenCalled();
      expect(service.getState().isTracking).toBe(false);
    });

    it('returns false when stopLocationUpdatesAsync rejects', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      taskManagerMock.isTaskRegisteredAsync.mockResolvedValue(true);
      locationMock.stopLocationUpdatesAsync.mockRejectedValue(new Error('boom'));

      const result = await service.stopTracking();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('addGeofence()', () => {
    it('returns false without starting geofencing when background permission is not granted', async () => {
      const { service, locationMock } = loadService();
      const result = await service.addGeofence(sampleRegion);
      expect(result).toBe(false);
      expect(locationMock.startGeofencingAsync).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('adds a new region and starts geofencing with the regions array', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      await grantBackground(service, locationMock, taskManagerMock);

      const result = await service.addGeofence(sampleRegion);

      expect(result).toBe(true);
      expect(service.getState().regions).toEqual([sampleRegion]);
      expect(locationMock.startGeofencingAsync).toHaveBeenCalledWith(
        'GEOFENCING_TASK',
        [sampleRegion]
      );
    });

    it('updates an existing region in place (no duplicate entries)', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      await grantBackground(service, locationMock, taskManagerMock);

      await service.addGeofence(sampleRegion);
      const updated: LocationRegion = { ...sampleRegion, radius: 500 };
      await service.addGeofence(updated);

      const regions = service.getState().regions;
      expect(regions).toHaveLength(1);
      expect(regions[0]).toEqual(updated);
      // startGeofencingAsync is called once per addGeofence (both branches call it).
      expect(locationMock.startGeofencingAsync).toHaveBeenCalledTimes(2);
    });

    it('accumulates multiple distinct regions', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      await grantBackground(service, locationMock, taskManagerMock);

      const r2: LocationRegion = { ...sampleRegion, identifier: 'rem-2' };
      await service.addGeofence(sampleRegion);
      await service.addGeofence(r2);

      expect(service.getState().regions).toEqual([sampleRegion, r2]);
      const lastCall = locationMock.startGeofencingAsync.mock.calls.at(-1);
      expect(lastCall?.[0]).toBe('GEOFENCING_TASK');
      expect(lastCall?.[1]).toEqual([sampleRegion, r2]);
    });

    it('returns false when startGeofencingAsync rejects', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      await grantBackground(service, locationMock, taskManagerMock);
      locationMock.startGeofencingAsync.mockRejectedValue(
        new Error('geofence fail')
      );

      const result = await service.addGeofence(sampleRegion);

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('removeGeofence()', () => {
    it('removes the region and re-starts geofencing with the remaining regions', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      await grantBackground(service, locationMock, taskManagerMock);
      const r1 = sampleRegion;
      const r2: LocationRegion = { ...sampleRegion, identifier: 'rem-2' };
      await service.addGeofence(r1);
      await service.addGeofence(r2);

      const result = await service.removeGeofence('rem-1');

      expect(result).toBe(true);
      expect(service.getState().regions).toEqual([r2]);
      expect(locationMock.startGeofencingAsync).toHaveBeenLastCalledWith(
        'GEOFENCING_TASK',
        [r2]
      );
    });

    it('stops geofencing when the last region is removed', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      await grantBackground(service, locationMock, taskManagerMock);
      await service.addGeofence(sampleRegion);

      const result = await service.removeGeofence(sampleRegion.identifier);

      expect(result).toBe(true);
      expect(service.getState().regions).toEqual([]);
      expect(locationMock.stopGeofencingAsync).toHaveBeenCalledWith(
        'GEOFENCING_TASK'
      );
    });

    it('is a no-op on regions when the identifier is not found (still succeeds)', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      await grantBackground(service, locationMock, taskManagerMock);
      await service.addGeofence(sampleRegion);

      const result = await service.removeGeofence('nonexistent');

      expect(result).toBe(true);
      // Region untouched.
      expect(service.getState().regions).toEqual([sampleRegion]);
      // Regions remain, so it re-starts geofencing rather than stopping.
      expect(locationMock.startGeofencingAsync).toHaveBeenLastCalledWith(
        'GEOFENCING_TASK',
        [sampleRegion]
      );
      expect(locationMock.stopGeofencingAsync).not.toHaveBeenCalled();
    });
  });

  describe('clearGeofences()', () => {
    it('clears all regions and stops geofencing', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      await grantBackground(service, locationMock, taskManagerMock);
      await service.addGeofence(sampleRegion);

      const result = await service.clearGeofences();

      expect(result).toBe(true);
      expect(service.getState().regions).toEqual([]);
      expect(locationMock.stopGeofencingAsync).toHaveBeenCalledWith(
        'GEOFENCING_TASK'
      );
    });

    it('returns false when stopGeofencingAsync rejects', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      await grantBackground(service, locationMock, taskManagerMock);
      locationMock.stopGeofencingAsync.mockRejectedValue(new Error('nope'));

      const result = await service.clearGeofences();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('onLocationUpdate()', () => {
    it('returns an unsubscribe function', () => {
      const { service } = loadService();
      const unsub = service.onLocationUpdate(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('fires registered callbacks when the location task executor runs with valid data', async () => {
      const { service, taskManagerMock } = loadService();
      const cb = jest.fn();
      service.onLocationUpdate(cb);

      const executor = taskManagerMock.__getTaskExecutor('LOCATION_BACKGROUND_TASK');
      await executor({
        data: { locations: [sampleLocation] },
        error: null,
      });

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(sampleLocation);
      expect(service.getState().location).toBe(sampleLocation);
    });

    it('unsubscribe stops further callbacks', async () => {
      const { service, taskManagerMock } = loadService();
      const cb = jest.fn();
      const unsub = service.onLocationUpdate(cb);
      unsub();

      const executor = taskManagerMock.__getTaskExecutor('LOCATION_BACKGROUND_TASK');
      await executor({ data: { locations: [sampleLocation] }, error: null });

      expect(cb).not.toHaveBeenCalled();
    });

    it('notifies multiple subscribers', async () => {
      const { service, taskManagerMock } = loadService();
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      service.onLocationUpdate(cb1);
      service.onLocationUpdate(cb2);

      const executor = taskManagerMock.__getTaskExecutor('LOCATION_BACKGROUND_TASK');
      await executor({ data: { locations: [sampleLocation] }, error: null });

      expect(cb1).toHaveBeenCalledWith(sampleLocation);
      expect(cb2).toHaveBeenCalledWith(sampleLocation);
    });

    it('does not fire callbacks and does not update state when the task body has an error', async () => {
      const { service, taskManagerMock } = loadService();
      const cb = jest.fn();
      service.onLocationUpdate(cb);

      const executor = taskManagerMock.__getTaskExecutor('LOCATION_BACKGROUND_TASK');
      await executor({
        data: null,
        error: { code: 'E', message: 'task failed' },
      });

      expect(cb).not.toHaveBeenCalled();
      expect(service.getState().location).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('ignores a task body with no data', async () => {
      const { service, taskManagerMock } = loadService();
      const cb = jest.fn();
      service.onLocationUpdate(cb);

      const executor = taskManagerMock.__getTaskExecutor('LOCATION_BACKGROUND_TASK');
      await executor({ data: null, error: null });

      expect(cb).not.toHaveBeenCalled();
      expect(service.getState().location).toBeNull();
    });

    it('ignores malformed locations (not an array)', async () => {
      const { service, taskManagerMock } = loadService();
      const cb = jest.fn();
      service.onLocationUpdate(cb);

      const executor = taskManagerMock.__getTaskExecutor('LOCATION_BACKGROUND_TASK');
      // locations is missing entirely
      await executor({ data: {}, error: null });

      expect(cb).not.toHaveBeenCalled();
      expect(service.getState().location).toBeNull();
    });

    it('ignores an empty locations array', async () => {
      const { service, taskManagerMock } = loadService();
      const cb = jest.fn();
      service.onLocationUpdate(cb);

      const executor = taskManagerMock.__getTaskExecutor('LOCATION_BACKGROUND_TASK');
      await executor({ data: { locations: [] }, error: null });

      expect(cb).not.toHaveBeenCalled();
      expect(service.getState().location).toBeNull();
    });
  });

  describe('onGeofenceEvent()', () => {
    it('returns an unsubscribe function', () => {
      const { service } = loadService();
      const unsub = service.onGeofenceEvent(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('fires registered callbacks with eventType and region on a geofence event', async () => {
      const { service, taskManagerMock, locationMock } = loadService();
      const cb = jest.fn();
      service.onGeofenceEvent(cb);

      const executor = taskManagerMock.__getTaskExecutor('GEOFENCING_TASK');
      await executor({
        data: {
          eventType: locationMock.GeofencingEventType.Enter,
          region: sampleRegion,
        },
        error: null,
      });

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(
        locationMock.GeofencingEventType.Enter,
        sampleRegion
      );
    });

    it('unsubscribe stops further geofence callbacks', async () => {
      const { service, taskManagerMock, locationMock } = loadService();
      const cb = jest.fn();
      const unsub = service.onGeofenceEvent(cb);
      unsub();

      const executor = taskManagerMock.__getTaskExecutor('GEOFENCING_TASK');
      await executor({
        data: {
          eventType: locationMock.GeofencingEventType.Exit,
          region: sampleRegion,
        },
        error: null,
      });

      expect(cb).not.toHaveBeenCalled();
    });

    it('does not fire callbacks when the task body has an error', async () => {
      const { service, taskManagerMock } = loadService();
      const cb = jest.fn();
      service.onGeofenceEvent(cb);

      const executor = taskManagerMock.__getTaskExecutor('GEOFENCING_TASK');
      await executor({
        data: null,
        error: { code: 'E', message: 'geofence failed' },
      });

      expect(cb).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('ignores a geofence event whose region has no string identifier', async () => {
      const { service, taskManagerMock, locationMock } = loadService();
      const cb = jest.fn();
      service.onGeofenceEvent(cb);

      const executor = taskManagerMock.__getTaskExecutor('GEOFENCING_TASK');
      // region missing entirely
      await executor({
        data: {
          eventType: locationMock.GeofencingEventType.Enter,
          region: undefined,
        },
        error: null,
      });

      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('getState()', () => {
    it('returns a shallow copy: reassigning a top-level prop does not leak', () => {
      const { service } = loadService();
      const state = service.getState();
      state.isTracking = true;
      state.errorMsg = 'tampered';

      // getState() does `{ ...locationState }`, so the returned object is a
      // fresh top-level copy — reassigning its primitive props does not affect
      // the internal singleton state.
      const fresh = service.getState();
      expect(fresh.isTracking).toBe(false);
      expect(fresh.errorMsg).toBeNull();
    });

    it('returns a shallow copy: the regions array is shared by reference', () => {
      // Documenting the shallow-copy contract honestly: nested objects/arrays
      // are NOT cloned, so mutating `state.regions` mutates the internal
      // singleton's regions too. This is a footgun for callers that assume
      // getState() returns a deep snapshot, but it is the actual behavior.
      const { service } = loadService();
      const state = service.getState();
      state.regions.push(sampleRegion);

      const fresh = service.getState();
      expect(fresh.regions).toEqual([sampleRegion]);
      // Clean up the shared array so it doesn't affect later assertions on
      // this same (fresh) service instance.
      state.regions.length = 0;
    });

    it('reflects mutations made through the service', async () => {
      const { service, locationMock, taskManagerMock } = loadService();
      await grantBackground(service, locationMock, taskManagerMock);
      await service.addGeofence(sampleRegion);

      const state = service.getState();
      expect(state.regions).toEqual([sampleRegion]);
    });
  });
});

/**
 * Helper: run init() with both permissions granted so background-dependent
 * methods (addGeofence, startBackgroundTracking) have the state they expect.
 * The taskManagerMock arg is optional (only needed by tests that assert on
 * isTaskRegisteredAsync).
 */
async function grantBackground(
  service: LocationService,
  locationMock: LocationMock,
  taskManagerMock?: TaskManagerMock
) {
  locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
    status: 'granted',
    granted: true,
    expires: 'never',
  });
  locationMock.requestBackgroundPermissionsAsync.mockResolvedValue({
    status: 'granted',
    granted: true,
    expires: 'never',
  });
  locationMock.getCurrentPositionAsync.mockResolvedValue(sampleLocation);
  // addGeofence checks isTaskRegisteredAsync; default false is fine.
  if (taskManagerMock) {
    taskManagerMock.isTaskRegisteredAsync.mockResolvedValue(false);
  }
  await service.init();
}