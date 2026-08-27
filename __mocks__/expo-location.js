/**
 * Shared manual mock for `expo-location`.
 *
 * Opt into it with `jest.mock('expo-location')` (no factory). The stubs below
 * cover every export that lib/locationService.ts imports/uses:
 *   - requestForegroundPermissionsAsync / requestBackgroundPermissionsAsync
 *   - getCurrentPositionAsync
 *   - startLocationUpdatesAsync / stopLocationUpdatesAsync
 *   - startGeofencingAsync / stopGeofencingAsync
 *   - enums: Accuracy, ActivityType, GeofencingEventType, PermissionStatus
 *
 * Enum values mirror the real expo-location package so tests can assert
 * against them (e.g. Accuracy.Balanced === 3, PermissionStatus.GRANTED ===
 * 'granted'). The async stubs default to "granted" / resolved-undefined so
 * individual tests override only the values they care about.
 *
 * `hasServicesEnabledAsync` is stubbed too even though locationService.ts
 * doesn't currently call it — it's part of the public surface other callers
 * may reach for, and keeping it avoids surprises if a future test imports a
 * module that uses it.
 */
const PermissionStatus = {
  GRANTED: 'granted',
  UNDETERMINED: 'undetermined',
  DENIED: 'denied',
};

const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};

const ActivityType = {
  Other: 1,
  AutomotiveNavigation: 2,
  Fitness: 3,
  OtherNavigation: 4,
  Airborne: 5,
};

const GeofencingEventType = {
  Enter: 1,
  Exit: 2,
};

module.exports = {
  requestForegroundPermissionsAsync: jest.fn(async () => ({
    status: PermissionStatus.GRANTED,
    granted: true,
    expires: 'never',
  })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({
    status: PermissionStatus.GRANTED,
    granted: true,
    expires: 'never',
  })),
  getCurrentPositionAsync: jest.fn(async () => undefined),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  startGeofencingAsync: jest.fn(async () => undefined),
  stopGeofencingAsync: jest.fn(async () => undefined),
  reverseGeocodeAsync: jest.fn(async () => []),
  hasServicesEnabledAsync: jest.fn(async () => true),

  Accuracy,
  ActivityType,
  GeofencingEventType,
  PermissionStatus,
};