/**
 * Unit tests for hooks/useLocation.ts — the React binding over the
 * LocationService singleton.
 *
 * Covers: init on mount (LocationService.init called), subscription to
 * location updates (state updates when the service emits via the
 * LOCATION_BACKGROUND_TASK executor), memoized wrapper methods delegate to
 * the service with correct args, and cleanup/unsubscribe on unmount.
 *
 * Isolation: LocationService is a module-level singleton, so each test
 * re-imports a FRESH module via jest.resetModules() + require (same recipe as
 * lib/__tests__/locationService.test.ts). Because the hook uses React hooks,
 * we ALSO re-require `react` and `react-test-renderer` after resetModules so
 * the harness and the freshly-required hook share ONE React instance —
 * otherwise the hook's useState runs against a different React dispatcher
 * than react-test-renderer's reconciler ("Cannot read properties of null
 * (reading 'useState')"). The manual expo-location / expo-task-manager mocks
 * are re-evaluated fresh too, and the LOCATION_BACKGROUND_TASK executor
 * captured by the fresh task-manager mock drives the service's callback
 * registry.
 */
jest.mock('expo-location');
jest.mock('expo-task-manager');

import type * as TestRenderer from 'react-test-renderer';

type LocationModule = typeof import('expo-location');
type TaskManagerModule = typeof import('expo-task-manager');
type LocationServiceModule = typeof import('../../lib/locationService');
type UseLocationModule = typeof import('../useLocation');

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
  __getTaskExecutor: (name: string) => (body: { data: unknown; error: unknown }) => Promise<void>;
  __clearTaskExecutors: () => void;
  __taskExecutors: Map<string, (...args: unknown[]) => unknown>;
}

interface LoadResult {
  useLocation: () => ReturnType<UseLocationModule['useLocation']>;
  LocationService: LocationServiceModule['default'];
  locationMock: LocationMock;
  taskManagerMock: TaskManagerMock;
  React: typeof import('react');
  TestRenderer: typeof import('react-test-renderer');
  act: typeof import('react-test-renderer')['act'];
}

function loadFresh(): LoadResult {
  jest.resetModules();
  const locationMock: LocationMock = require('expo-location');
  const taskManagerMock: TaskManagerMock = require('expo-task-manager');
  const LocationService: LocationServiceModule['default'] = require('../../lib/locationService').default;
  const useLocation: () => ReturnType<UseLocationModule['useLocation']> = require('../useLocation').useLocation;
  // Re-require react + react-test-renderer AFTER resetModules so the harness
  // and the hook share the same fresh React instance (two-React fix).
  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  return {
    useLocation,
    LocationService,
    locationMock,
    taskManagerMock,
    React,
    TestRenderer,
    act: TestRenderer.act,
  };
}

const sampleLocation = {
  coords: { latitude: 40.7, longitude: -74.0, accuracy: 10 },
  timestamp: 1700000000000,
};

const sampleRegion = {
  identifier: 'rem-1',
  latitude: 40.7,
  longitude: -74.0,
  radius: 150,
  notifyOnEnter: true,
  notifyOnExit: false,
};

interface HookHandle<T> {
  result: { current: T };
  rerender: () => void;
  unmount: () => void;
}

function renderHook<T>(
  ctx: LoadResult,
  hookFn: () => T
): HookHandle<T> {
  const { React, TestRenderer, act } = ctx;
  const result = { current: undefined as unknown as T };
  const Harness = () => {
    result.current = hookFn();
    return null;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Harness />);
  });
  return {
    result,
    rerender: () => act(() => { renderer.update(<Harness />); }),
    unmount: () => act(() => { renderer.unmount(); }),
  };
}

/** Flush microtasks so the async LocationService.init() continuation applies. */
function flush(ctx: LoadResult): Promise<void> {
  return ctx.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function grant(locationMock: LocationMock) {
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
}

describe('useLocation', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('initial state', () => {
    it('seeds useState with the service initial state (all-null, not tracking)', () => {
      const ctx = loadFresh();
      const { result } = renderHook(ctx, () => ctx.useLocation());

      expect(result.current.foregroundPermission).toBeNull();
      expect(result.current.backgroundPermission).toBeNull();
      expect(result.current.isTracking).toBe(false);
      expect(result.current.regions).toEqual([]);
      expect(result.current.location).toBeNull();
    });
  });

  describe('init on mount', () => {
    it('calls LocationService.init() and updates state once permissions are granted', async () => {
      const ctx = loadFresh();
      grant(ctx.locationMock);
      const initSpy = jest.spyOn(ctx.LocationService, 'init');

      const { result } = renderHook(ctx, () => ctx.useLocation());
      await flush(ctx);

      expect(initSpy).toHaveBeenCalledTimes(1);
      expect(result.current.foregroundPermission).toBe('granted');
      expect(result.current.backgroundPermission).toBe('granted');
      expect(result.current.location).toBe(sampleLocation);
    });

    it('exposes the stable action methods regardless of init outcome', () => {
      const ctx = loadFresh();
      const { result } = renderHook(ctx, () => ctx.useLocation());

      expect(typeof result.current.startBackgroundTracking).toBe('function');
      expect(typeof result.current.stopTracking).toBe('function');
      expect(typeof result.current.addGeofence).toBe('function');
      expect(typeof result.current.removeGeofence).toBe('function');
      expect(typeof result.current.clearGeofences).toBe('function');
      expect(typeof result.current.onGeofenceEvent).toBe('function');
    });
  });

  describe('location update subscription', () => {
    it('updates state.location when the service emits a location update', async () => {
      const ctx = loadFresh();
      grant(ctx.locationMock);
      ctx.locationMock.getCurrentPositionAsync.mockResolvedValue(null);

      const { result } = renderHook(ctx, () => ctx.useLocation());
      await flush(ctx);

      expect(result.current.location).toBeNull();

      const executor = ctx.taskManagerMock.__getTaskExecutor('LOCATION_BACKGROUND_TASK');
      await ctx.act(async () => {
        await executor({ data: { locations: [sampleLocation] }, error: null });
      });

      expect(result.current.location).toBe(sampleLocation);
    });

    it('merges the new location without dropping the rest of state', async () => {
      const ctx = loadFresh();
      grant(ctx.locationMock);
      ctx.locationMock.getCurrentPositionAsync.mockResolvedValue(null);

      const { result } = renderHook(ctx, () => ctx.useLocation());
      await flush(ctx);

      expect(result.current.foregroundPermission).toBe('granted');

      const executor = ctx.taskManagerMock.__getTaskExecutor('LOCATION_BACKGROUND_TASK');
      await ctx.act(async () => {
        await executor({ data: { locations: [sampleLocation] }, error: null });
      });

      // location updated, permissions preserved (spread merge).
      expect(result.current.location).toBe(sampleLocation);
      expect(result.current.foregroundPermission).toBe('granted');
      expect(result.current.backgroundPermission).toBe('granted');
    });

    it('does not update state after unmount (unsubscribe stops callbacks)', async () => {
      const ctx = loadFresh();
      grant(ctx.locationMock);

      const { result, unmount } = renderHook(ctx, () => ctx.useLocation());
      await flush(ctx);
      const before = result.current.location;

      unmount();

      await ctx.act(async () => {
        await ctx.taskManagerMock
          .__getTaskExecutor('LOCATION_BACKGROUND_TASK')
          ({ data: { locations: [sampleLocation] }, error: null });
      });
      // The unmounted hook's result object is untouched.
      expect(result.current.location).toBe(before);
    });
  });

  describe('delegation to LocationService', () => {
    it('startBackgroundTracking delegates to LocationService.startBackgroundTracking and returns its result', async () => {
      const ctx = loadFresh();
      grant(ctx.locationMock);
      const spy = jest.spyOn(ctx.LocationService, 'startBackgroundTracking').mockResolvedValue(true);
      const { result } = renderHook(ctx, () => ctx.useLocation());
      await flush(ctx);

      let out: boolean | undefined;
      await ctx.act(async () => {
        out = await result.current.startBackgroundTracking();
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(out).toBe(true);
    });

    it('stopTracking delegates to LocationService.stopTracking', async () => {
      const ctx = loadFresh();
      grant(ctx.locationMock);
      const spy = jest.spyOn(ctx.LocationService, 'stopTracking').mockResolvedValue(true);
      const { result } = renderHook(ctx, () => ctx.useLocation());
      await flush(ctx);

      let out: boolean | undefined;
      await ctx.act(async () => {
        out = await result.current.stopTracking();
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(out).toBe(true);
    });

    it('addGeofence delegates with the provided region and returns its result', async () => {
      const ctx = loadFresh();
      grant(ctx.locationMock);
      const spy = jest.spyOn(ctx.LocationService, 'addGeofence').mockResolvedValue(true);
      const { result } = renderHook(ctx, () => ctx.useLocation());
      await flush(ctx);

      let out: boolean | undefined;
      await ctx.act(async () => {
        out = await result.current.addGeofence(sampleRegion);
      });

      expect(spy).toHaveBeenCalledWith(sampleRegion);
      expect(out).toBe(true);
    });

    it('removeGeofence delegates with the identifier string', async () => {
      const ctx = loadFresh();
      grant(ctx.locationMock);
      const spy = jest.spyOn(ctx.LocationService, 'removeGeofence').mockResolvedValue(true);
      const { result } = renderHook(ctx, () => ctx.useLocation());
      await flush(ctx);

      let out: boolean | undefined;
      await ctx.act(async () => {
        out = await result.current.removeGeofence('rem-1');
      });

      expect(spy).toHaveBeenCalledWith('rem-1');
      expect(out).toBe(true);
    });

    it('clearGeofences delegates with no args', async () => {
      const ctx = loadFresh();
      grant(ctx.locationMock);
      const spy = jest.spyOn(ctx.LocationService, 'clearGeofences').mockResolvedValue(true);
      const { result } = renderHook(ctx, () => ctx.useLocation());
      await flush(ctx);

      let out: boolean | undefined;
      await ctx.act(async () => {
        out = await result.current.clearGeofences();
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(out).toBe(true);
    });

    it('onGeofenceEvent delegates to LocationService.onGeofenceEvent and returns its unsubscribe', () => {
      const ctx = loadFresh();
      grant(ctx.locationMock);
      const unsub = jest.fn();
      const spy = jest.spyOn(ctx.LocationService, 'onGeofenceEvent').mockReturnValue(unsub);
      const { result } = renderHook(ctx, () => ctx.useLocation());

      const cb = jest.fn();
      const returned = result.current.onGeofenceEvent(cb);

      expect(spy).toHaveBeenCalledWith(cb);
      expect(returned).toBe(unsub);
    });

    it('does NOT call startBackgroundTracking on mount (init only requests permissions)', async () => {
      const ctx = loadFresh();
      grant(ctx.locationMock);
      const startSpy = jest.spyOn(ctx.LocationService, 'startBackgroundTracking');
      renderHook(ctx, () => ctx.useLocation());
      await flush(ctx);

      expect(startSpy).not.toHaveBeenCalled();
    });
  });

  describe('cleanup on unmount', () => {
    it('unsubscribes the location-update callback on unmount', async () => {
      const ctx = loadFresh();
      grant(ctx.locationMock);
      const onLocationUpdateSpy = jest.spyOn(ctx.LocationService, 'onLocationUpdate');
      const { unmount } = renderHook(ctx, () => ctx.useLocation());
      await flush(ctx);

      expect(onLocationUpdateSpy).toHaveBeenCalledTimes(1);
      const unsubscribe = onLocationUpdateSpy.mock.results[0].value as () => void;
      expect(typeof unsubscribe).toBe('function');

      unmount();

      // After unmount, firing the executor does not throw — the cleanup ran
      // and the callback was removed from the service's registry.
      await ctx.act(async () => {
        await ctx.taskManagerMock
          .__getTaskExecutor('LOCATION_BACKGROUND_TASK')
          ({ data: { locations: [sampleLocation] }, error: null });
      });
      expect(typeof unsubscribe).toBe('function');
    });
  });
});