/**
 * Unit tests for components/LocationReminderManager/LocationReminderManager.tsx
 * — the core geofencing orchestrator.
 *
 * Covers:
 *  - foreground permission denied on mount -> Alert.alert('Location Permission
 *    Required') + onPermissionDenied('foreground'); the alert's "Open Settings"
 *    button invokes Linking.openSettings().
 *  - foreground granted but background denied -> Alert.alert('Background
 *    Location Permission Required') + onPermissionDenied('background').
 *  - both granted -> startBackgroundTracking + onGeofenceEvent registered +
 *    setInitialized(true); no Alert; isInitialized() returns true.
 *  - context value exposes add/remove/update/get/isInitialized and they
 *    delegate to LocationService via useLocation.
 *  - useLocationReminders() outside the provider returns the default context.
 *  - geofence event: the onGeofenceEvent callback closes over the mount-time
 *    `reminders` (=== []) because the registering effect has [] deps, so a
 *    matching region never finds a reminder -> no Alert, no onGeofenceEvent
 *    prop call. This stale-closure behavior is asserted honestly and noted as
 *    a source bug (not fixed here).
 *
 * Isolation: LocationService is a module-level singleton, so each test
 * re-imports a FRESH module via jest.resetModules() + require (same recipe as
 * lib/__tests__/locationService.test.ts). Because the manager + useLocation
 * use React hooks, react and react-test-renderer are ALSO re-required after
 * resetModules so the harness and the freshly-required components share ONE
 * React instance (two-React fix). Alert/Linking/Platform come from the same
 * fresh react-native instance the manager captured, so spies on them affect
 * the manager's calls.
 */
jest.mock('expo-location');
jest.mock('expo-task-manager');

import type * as TestRenderer from 'react-test-renderer';
import type { LocationCard } from '@/components/CardReminder/CardReminder.location.types';
import type { LocationReminderContextType } from '../LocationReminderManager';

type LocationModule = typeof import('expo-location');
type TaskManagerModule = typeof import('expo-task-manager');
type LocationServiceModule = typeof import('../../../lib/locationService');
type ManagerModule = typeof import('../LocationReminderManager');
type RNModule = typeof import('react-native');

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
  locationMock: LocationMock;
  taskManagerMock: TaskManagerMock;
  LocationService: LocationServiceModule['default'];
  LocationReminderManager: ManagerModule['default'];
  useLocationReminders: ManagerModule['useLocationReminders'];
  React: typeof import('react');
  TestRenderer: typeof import('react-test-renderer');
  act: typeof import('react-test-renderer')['act'];
  Alert: RNModule['Alert'];
  Linking: RNModule['Linking'];
  GeofencingEventType: LocationModule['GeofencingEventType'];
}

function loadFresh(): LoadResult {
  jest.resetModules();
  const locationMock: LocationMock = require('expo-location');
  const taskManagerMock: TaskManagerMock = require('expo-task-manager');
  const LocationService: LocationServiceModule['default'] = require('../../../lib/locationService').default;
  const mgr: ManagerModule = require('../LocationReminderManager');
  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  const { Alert, Linking } = require('react-native');
  return {
    locationMock,
    taskManagerMock,
    LocationService,
    LocationReminderManager: mgr.default,
    useLocationReminders: mgr.useLocationReminders,
    React,
    TestRenderer,
    act: TestRenderer.act,
    Alert,
    Linking,
    GeofencingEventType: locationMock.GeofencingEventType,
  };
}

const sampleLocation = {
  coords: { latitude: 40.7, longitude: -74.0, accuracy: 10 },
  timestamp: 1700000000000,
};

const sampleReminder = {
  $id: 'rem-1',
  at: 'Home',
  do: 'Buy milk',
  active: true,
  latitude: 40.7,
  longitude: -74.0,
  radius: 150,
  notifyOnEnter: true,
  notifyOnExit: false,
};

function flush(ctx: LoadResult): Promise<void> {
  return ctx.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function grantBoth(locationMock: LocationMock) {
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

interface RenderOpts {
  onPermissionDenied?: (type: 'foreground' | 'background') => void;
  onGeofenceEvent?: (eventType: 'enter' | 'exit', reminder: LocationCard) => void;
}

function renderManager(
  ctx: LoadResult,
  opts: RenderOpts = {},
  captured: { current: LocationReminderContextType | null } = { current: null }
): TestRenderer.ReactTestRenderer {
  const Consumer = () => {
    captured.current = ctx.useLocationReminders();
    return null;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  ctx.act(() => {
    renderer = ctx.TestRenderer.create(
      <ctx.LocationReminderManager
        onPermissionDenied={opts.onPermissionDenied}
        onGeofenceEvent={opts.onGeofenceEvent}
      >
        <Consumer />
      </ctx.LocationReminderManager>
    );
  });
  return renderer;
}

describe('LocationReminderManager', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;
  let ctx: LoadResult;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = loadFresh();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('permission denied (foreground null on mount)', () => {
    it('alerts "Location Permission Required" and calls onPermissionDenied("foreground")', async () => {
      // Deny foreground so init() records a denied status.
      ctx.locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
        granted: false,
        expires: 'never',
      });
      ctx.locationMock.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
        granted: false,
        expires: 'never',
      });
      const alertSpy = jest.spyOn(ctx.Alert, 'alert').mockImplementation(() => {});
      const onPermissionDenied = jest.fn();

      renderManager(ctx, { onPermissionDenied });
      await flush(ctx);

      expect(alertSpy).toHaveBeenCalledWith(
        'Location Permission Required',
        expect.stringContaining('Place Reminder needs access to your location'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
          expect.objectContaining({ text: 'Open Settings' }),
        ])
      );
      expect(onPermissionDenied).toHaveBeenCalledWith('foreground');
    });

    it('the "Open Settings" alert button opens Linking.openSettings()', async () => {
      ctx.locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
        granted: false,
        expires: 'never',
      });
      ctx.locationMock.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
        granted: false,
        expires: 'never',
      });
      const alertSpy = jest.spyOn(ctx.Alert, 'alert').mockImplementation(() => {});
      const openSettingsSpy = jest
        .spyOn(ctx.Linking, 'openSettings')
        .mockImplementation(() => Promise.resolve(true) as any);

      renderManager(ctx);
      await flush(ctx);

      expect(alertSpy).toHaveBeenCalled();
      const buttons = alertSpy.mock.calls[0][2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      const openSettingsButton = buttons.find((b) => b.text === 'Open Settings');
      expect(openSettingsButton?.onPress).toBeInstanceOf(Function);

      ctx.act(() => {
        openSettingsButton!.onPress!();
      });
      expect(openSettingsSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('background permission denied (foreground granted)', () => {
    it('alerts "Background Location Permission Required" and calls onPermissionDenied("background")', async () => {
      // Pre-init the service so the manager sees foreground=granted,
      // background=denied at mount time (before useLocation's init re-runs).
      ctx.locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        granted: true,
        expires: 'never',
      });
      ctx.locationMock.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
        granted: false,
        expires: 'never',
      });
      await ctx.LocationService.init();

      const alertSpy = jest.spyOn(ctx.Alert, 'alert').mockImplementation(() => {});
      const onPermissionDenied = jest.fn();

      renderManager(ctx, { onPermissionDenied });
      await flush(ctx);

      expect(alertSpy).toHaveBeenCalledWith(
        'Background Location Permission Required',
        expect.stringContaining('background location'),
        expect.any(Array)
      );
      expect(onPermissionDenied).toHaveBeenCalledWith('background');
      // Foreground was granted, so the foreground-denied alert must NOT fire.
      expect(alertSpy).not.toHaveBeenCalledWith(
        'Location Permission Required',
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('both permissions granted', () => {
    it('starts background tracking, registers geofence events, and marks initialized (no Alert)', async () => {
      grantBoth(ctx.locationMock);
      await ctx.LocationService.init();

      const alertSpy = jest.spyOn(ctx.Alert, 'alert').mockImplementation(() => {});
      const onPermissionDenied = jest.fn();
      const startSpy = jest
        .spyOn(ctx.LocationService, 'startBackgroundTracking')
        .mockResolvedValue(true);
      const onGeofenceSpy = jest
        .spyOn(ctx.LocationService, 'onGeofenceEvent')
        .mockReturnValue(jest.fn());

      const captured: { current: LocationReminderContextType | null } = {
        current: null,
      };
      renderManager(ctx, { onPermissionDenied }, captured);
      await flush(ctx);

      expect(alertSpy).not.toHaveBeenCalled();
      expect(onPermissionDenied).not.toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(onGeofenceSpy).toHaveBeenCalledTimes(1);
      expect(onGeofenceSpy.mock.calls[0][0]).toBeInstanceOf(Function);
      expect(captured.current?.isInitialized()).toBe(true);
    });
  });

  describe('context value', () => {
    async function setupGranted(captured: { current: LocationReminderContextType | null }) {
      grantBoth(ctx.locationMock);
      await ctx.LocationService.init();
      jest.spyOn(ctx.Alert, 'alert').mockImplementation(() => {});
      jest.spyOn(ctx.LocationService, 'startBackgroundTracking').mockResolvedValue(true);
      jest.spyOn(ctx.LocationService, 'onGeofenceEvent').mockReturnValue(jest.fn());
      renderManager(ctx, {}, captured);
      await flush(ctx);
    }

    it('exposes add/remove/update/get/isInitialized/currentLocation', async () => {
      const captured: { current: LocationReminderContextType | null } = {
        current: null,
      };
      await setupGranted(captured);

      const c = captured.current!;
      expect(typeof c.addLocationReminder).toBe('function');
      expect(typeof c.removeLocationReminder).toBe('function');
      expect(typeof c.updateLocationReminder).toBe('function');
      expect(typeof c.getLocationReminders).toBe('function');
      expect(typeof c.isInitialized).toBe('function');
      expect(c.currentLocation).toBe(sampleLocation);
    });

    it('addLocationReminder delegates to LocationService.addGeofence with the mapped region and records the reminder', async () => {
      const captured: { current: LocationReminderContextType | null } = {
        current: null,
      };
      await setupGranted(captured);
      const addGeofenceSpy = jest
        .spyOn(ctx.LocationService, 'addGeofence')
        .mockResolvedValue(true);

      let ok: boolean | undefined;
      await ctx.act(async () => {
        ok = await captured.current!.addLocationReminder(sampleReminder);
      });
      await flush(ctx);

      expect(ok).toBe(true);
      expect(addGeofenceSpy).toHaveBeenCalledWith({
        identifier: 'rem-1',
        latitude: 40.7,
        longitude: -74.0,
        radius: 150,
        notifyOnEnter: true,
        notifyOnExit: false,
      });
      expect(captured.current!.getLocationReminders()).toEqual([sampleReminder]);
    });

    it('addLocationReminder returns false (and does not record) when addGeofence fails', async () => {
      const captured: { current: LocationReminderContextType | null } = {
        current: null,
      };
      await setupGranted(captured);
      jest.spyOn(ctx.LocationService, 'addGeofence').mockResolvedValue(false);

      let ok: boolean | undefined;
      await ctx.act(async () => {
        ok = await captured.current!.addLocationReminder(sampleReminder);
      });
      await flush(ctx);

      expect(ok).toBe(false);
      expect(captured.current!.getLocationReminders()).toEqual([]);
    });

    it('removeLocationReminder delegates to LocationService.removeGeofence and drops the reminder', async () => {
      const captured: { current: LocationReminderContextType | null } = {
        current: null,
      };
      await setupGranted(captured);
      const addGeofenceSpy = jest
        .spyOn(ctx.LocationService, 'addGeofence')
        .mockResolvedValue(true);
      const removeGeofenceSpy = jest
        .spyOn(ctx.LocationService, 'removeGeofence')
        .mockResolvedValue(true);

      // Add then remove.
      await ctx.act(async () => {
        await captured.current!.addLocationReminder(sampleReminder);
      });
      await flush(ctx);
      expect(captured.current!.getLocationReminders()).toHaveLength(1);

      let ok: boolean | undefined;
      await ctx.act(async () => {
        ok = await captured.current!.removeLocationReminder('rem-1');
      });
      await flush(ctx);

      expect(ok).toBe(true);
      expect(removeGeofenceSpy).toHaveBeenCalledWith('rem-1');
      expect(captured.current!.getLocationReminders()).toEqual([]);
      // addGeofence was called during add; sanity.
      expect(addGeofenceSpy).toHaveBeenCalled();
    });

    it('updateLocationReminder removes the old geofence then adds the updated one', async () => {
      const captured: { current: LocationReminderContextType | null } = {
        current: null,
      };
      await setupGranted(captured);
      const addGeofenceSpy = jest
        .spyOn(ctx.LocationService, 'addGeofence')
        .mockResolvedValue(true);
      const removeGeofenceSpy = jest
        .spyOn(ctx.LocationService, 'removeGeofence')
        .mockResolvedValue(true);

      // Seed an existing reminder in state.
      await ctx.act(async () => {
        await captured.current!.addLocationReminder(sampleReminder);
      });
      await flush(ctx);

      const updated = { ...sampleReminder, do: 'Buy bread', radius: 300 };
      let ok: boolean | undefined;
      await ctx.act(async () => {
        ok = await captured.current!.updateLocationReminder(updated);
      });
      await flush(ctx);

      expect(ok).toBe(true);
      // removeGeofence called with the reminder id, then addGeofence with the
      // updated region.
      expect(removeGeofenceSpy).toHaveBeenCalledWith('rem-1');
      expect(addGeofenceSpy).toHaveBeenLastCalledWith({
        identifier: 'rem-1',
        latitude: 40.7,
        longitude: -74.0,
        radius: 300,
        notifyOnEnter: true,
        notifyOnExit: false,
      });
      const list = captured.current!.getLocationReminders();
      expect(list).toHaveLength(1);
      expect(list[0].do).toBe('Buy bread');
    });

    it('isInitialized() returns false before the granted init path completes', async () => {
      // Denied path: initialized never set to true.
      ctx.locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
        granted: false,
        expires: 'never',
      });
      ctx.locationMock.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
        granted: false,
        expires: 'never',
      });
      jest.spyOn(ctx.Alert, 'alert').mockImplementation(() => {});
      const captured: { current: LocationReminderContextType | null } = {
        current: null,
      };
      renderManager(ctx, {}, captured);
      await flush(ctx);

      expect(captured.current?.isInitialized()).toBe(false);
    });
  });

  describe('useLocationReminders outside the provider', () => {
    it('returns the default context (no-op methods, isInitialized false)', () => {
      const Outside = () => {
        const value = ctx.useLocationReminders();
        return null;
      };
      let renderer!: TestRenderer.ReactTestRenderer;
      expect(() => {
        ctx.act(() => {
          renderer = ctx.TestRenderer.create(<Outside />);
        });
      }).not.toThrow();

      // The default context: isInitialized() === false, getLocationReminders() === [].
      // We re-render to read it via a captured ref.
      const captured: { current: LocationReminderContextType | null } = {
        current: null,
      };
      const Outside2 = () => {
        captured.current = ctx.useLocationReminders();
        return null;
      };
      ctx.act(() => {
        renderer = ctx.TestRenderer.create(<Outside2 />);
      });
      expect(captured.current?.isInitialized()).toBe(false);
      expect(captured.current?.getLocationReminders()).toEqual([]);
      expect(captured.current?.currentLocation).toBeNull();
    });
  });

  describe('geofence event (stale-closure honest behavior)', () => {
    it('does NOT alert or call onGeofenceEvent when a geofence event fires (reminders closure is empty at mount)', async () => {
      // NOTE: the onGeofenceEvent callback is registered in the []-deps effect,
      // so it closes over the mount-time `reminders` (=== []). Even after a
      // reminder is added via addLocationReminder (which updates state), the
      // callback's closure still sees []. So reminders.find(...) is always
      // undefined -> no alert, no onGeofenceEvent prop call. This is a
      // stale-closure bug in the source; we assert the honest behavior here.
      grantBoth(ctx.locationMock);
      await ctx.LocationService.init();
      const alertSpy = jest.spyOn(ctx.Alert, 'alert').mockImplementation(() => {});
      jest.spyOn(ctx.LocationService, 'startBackgroundTracking').mockResolvedValue(true);
      jest.spyOn(ctx.LocationService, 'onGeofenceEvent').mockReturnValue(jest.fn());
      const onGeofenceEvent = jest.fn();

      const captured: { current: LocationReminderContextType | null } = {
        current: null,
      };
      renderManager(ctx, { onGeofenceEvent }, captured);
      await flush(ctx);

      // Add a reminder so the state has one (but the callback closure won't see it).
      jest.spyOn(ctx.LocationService, 'addGeofence').mockResolvedValue(true);
      await ctx.act(async () => {
        await captured.current!.addLocationReminder(sampleReminder);
      });
      await flush(ctx);
      expect(captured.current!.getLocationReminders()).toHaveLength(1);

      // Fire a geofence event matching the reminder's id via the service's
      // GEOFENCING_TASK executor (drives the geofenceCallbacks registry).
      const executor = ctx.taskManagerMock.__getTaskExecutor('GEOFENCING_TASK');
      await ctx.act(async () => {
        await executor({
          data: {
            eventType: ctx.GeofencingEventType.Enter,
            region: {
              identifier: 'rem-1',
              latitude: 40.7,
              longitude: -74.0,
              radius: 150,
            },
          },
          error: null,
        });
      });

      // Honest behavior: no reminder alert, no onGeofenceEvent prop call
      // (the callback's stale reminders=[] found no match).
      expect(onGeofenceEvent).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalledWith(
        'Reminder: Buy milk',
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('cleanup on unmount', () => {
    it('calls stopTracking on unmount', async () => {
      grantBoth(ctx.locationMock);
      await ctx.LocationService.init();
      jest.spyOn(ctx.Alert, 'alert').mockImplementation(() => {});
      jest.spyOn(ctx.LocationService, 'startBackgroundTracking').mockResolvedValue(true);
      jest.spyOn(ctx.LocationService, 'onGeofenceEvent').mockReturnValue(jest.fn());
      const stopSpy = jest.spyOn(ctx.LocationService, 'stopTracking').mockResolvedValue(true);

      const renderer = renderManager(ctx);
      await flush(ctx);

      ctx.act(() => {
        renderer.unmount();
      });

      expect(stopSpy).toHaveBeenCalledTimes(1);
    });
  });
});