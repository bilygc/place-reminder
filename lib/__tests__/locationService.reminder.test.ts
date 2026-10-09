/**
 * Unit tests for the create-reminder location helpers in lib/locationService.ts:
 *  - LocationPermissionDeniedError
 *  - getCurrentLocationWithLabel
 *
 * These are isolated from the LocationService singleton state and only need the
 * expo-location mock.
 */

jest.mock('expo-location');

import type { LocationGeocodedAddress } from 'expo-location';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const locationMock = require('expo-location');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  LocationPermissionDeniedError,
  LocationUnavailableError,
  LOCATION_NO_FIX_MESSAGE,
  LOCATION_SERVICES_DISABLED_MESSAGE,
  getCurrentLocationWithLabel,
} = require('../locationService');

describe('LocationPermissionDeniedError', () => {
  it('is an Error subclass', () => {
    const err = new LocationPermissionDeniedError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LocationPermissionDeniedError);
  });
});

describe('LocationUnavailableError', () => {
  it('is an Error subclass with a friendly default message', () => {
    const err = new LocationUnavailableError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LocationUnavailableError);
    expect(err.message).toBe(
      'Location unavailable — make sure location services are enabled'
    );
  });
});

describe('getCurrentLocationWithLabel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The mock module instance is shared across tests in this file (no
    // resetModules), so restore the defaults that individual tests override.
    locationMock.hasServicesEnabledAsync.mockResolvedValue(true);
    locationMock.getLastKnownPositionAsync.mockResolvedValue(null);
  });

  it('returns coordinates and a geocoded label when permission is granted', async () => {
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      expires: 'never',
    });
    locationMock.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.7128, longitude: -74.006 },
      timestamp: 1700000000000,
    });
    const address: LocationGeocodedAddress = {
      street: '123 Main St',
      city: 'New York',
      region: 'NY',
      country: 'USA',
      name: null,
      postalCode: null,
      subregion: null,
      isoCountryCode: null,
      timezone: null,
      district: null,
      streetNumber: null,
      formattedAddress: null,
    };
    locationMock.reverseGeocodeAsync.mockResolvedValue([address]);

    const result = await getCurrentLocationWithLabel();

    expect(locationMock.requestForegroundPermissionsAsync).toHaveBeenCalled();
    expect(locationMock.getCurrentPositionAsync).toHaveBeenCalledWith({
      accuracy: locationMock.Accuracy.Balanced,
    });
    expect(locationMock.reverseGeocodeAsync).toHaveBeenCalledWith({
      latitude: 40.7128,
      longitude: -74.006,
    });
    expect(result).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
      label: '123 Main St, New York',
    });
  });

  it('throws LocationPermissionDeniedError when permission is denied', async () => {
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      expires: 'never',
    });

    await expect(getCurrentLocationWithLabel()).rejects.toThrow(
      LocationPermissionDeniedError
    );

    expect(locationMock.hasServicesEnabledAsync).not.toHaveBeenCalled();
    expect(locationMock.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(locationMock.reverseGeocodeAsync).not.toHaveBeenCalled();
  });

  it('returns label: null when reverse geocoding returns an empty array', async () => {
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      expires: 'never',
    });
    locationMock.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.7128, longitude: -74.006 },
      timestamp: 1700000000000,
    });
    locationMock.reverseGeocodeAsync.mockResolvedValue([]);

    const result = await getCurrentLocationWithLabel();

    expect(result).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
      label: null,
    });
  });

  it('returns label: null when reverse geocoding throws', async () => {
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      expires: 'never',
    });
    locationMock.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.7128, longitude: -74.006 },
      timestamp: 1700000000000,
    });
    locationMock.reverseGeocodeAsync.mockRejectedValue(
      new Error('geocoding unavailable')
    );

    const result = await getCurrentLocationWithLabel();

    expect(result).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
      label: null,
    });
  });

  it('throws LocationUnavailableError with the services-disabled message without fetching when services are disabled', async () => {
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      expires: 'never',
    });
    locationMock.hasServicesEnabledAsync.mockResolvedValue(false);

    await expect(getCurrentLocationWithLabel()).rejects.toThrow(
      LocationUnavailableError
    );
    await expect(getCurrentLocationWithLabel()).rejects.toThrow(
      LOCATION_SERVICES_DISABLED_MESSAGE
    );

    expect(locationMock.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(locationMock.getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(locationMock.reverseGeocodeAsync).not.toHaveBeenCalled();
  });

  it('retries getCurrentPositionAsync on a transient failure then succeeds', async () => {
    jest.useFakeTimers();
    try {
      locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        granted: true,
        expires: 'never',
      });
      locationMock.getCurrentPositionAsync
        .mockRejectedValueOnce(new Error('no fix yet'))
        .mockResolvedValueOnce({
          coords: { latitude: 40.7128, longitude: -74.006 },
          timestamp: 1700000000000,
        });
      locationMock.reverseGeocodeAsync.mockResolvedValue([]);

      const pending = getCurrentLocationWithLabel();
      await jest.advanceTimersByTimeAsync(5000);
      const result = await pending;

      expect(locationMock.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
      expect(locationMock.getLastKnownPositionAsync).not.toHaveBeenCalled();
      expect(result).toEqual({
        latitude: 40.7128,
        longitude: -74.006,
        label: null,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls back to the last-known position when the fetch keeps failing', async () => {
    jest.useFakeTimers();
    try {
      locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        granted: true,
        expires: 'never',
      });
      locationMock.getCurrentPositionAsync.mockRejectedValue(
        new Error(
          'Current location is unavailable. Make sure location services are enabled.'
        )
      );
      locationMock.getLastKnownPositionAsync.mockResolvedValue({
        coords: { latitude: 51.5074, longitude: -0.1278 },
        timestamp: 1700000000000,
      });
      locationMock.reverseGeocodeAsync.mockResolvedValue([]);

      const pending = getCurrentLocationWithLabel();
      await jest.advanceTimersByTimeAsync(10000);
      const result = await pending;

      expect(locationMock.getCurrentPositionAsync).toHaveBeenCalledTimes(3);
      expect(locationMock.getLastKnownPositionAsync).toHaveBeenCalledWith({
        maxAge: 60000,
      });
      expect(result).toEqual({
        latitude: 51.5074,
        longitude: -0.1278,
        label: null,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('throws LocationUnavailableError with a no-fix message when getCurrentPositionAsync fails with E_LOCATION_UNAVAILABLE and there is no cached fix', async () => {
    jest.useFakeTimers();
    try {
      locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        granted: true,
        expires: 'never',
      });
      const locationError = new Error('Current location is unavailable. Make sure location services are enabled.');
      (locationError as Error & { code?: string }).code = 'E_LOCATION_UNAVAILABLE';
      locationMock.getCurrentPositionAsync.mockRejectedValue(locationError);
      locationMock.getLastKnownPositionAsync.mockResolvedValue(null);

      // Attach the rejection handler BEFORE advancing timers: the rejection
      // fires while timers advance, and an un-observed rejection in that
      // window is reported as an uncaught failure.
      const pending = getCurrentLocationWithLabel();
      const assertion = expect(pending).rejects.toThrow(LOCATION_NO_FIX_MESSAGE);
      await jest.advanceTimersByTimeAsync(10000);
      await assertion;
      await expect(pending).rejects.toThrow(LocationUnavailableError);

      expect(locationMock.reverseGeocodeAsync).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('throws LocationUnavailableError with a no-fix message for any other getCurrentPositionAsync rejection when the fallback also fails', async () => {
    jest.useFakeTimers();
    try {
      locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        granted: true,
        expires: 'never',
      });
      locationMock.getCurrentPositionAsync.mockRejectedValue(
        new Error('gps timeout')
      );
      locationMock.getLastKnownPositionAsync.mockResolvedValue(null);

      // Attach the rejection handler BEFORE advancing timers (see above).
      const pending = getCurrentLocationWithLabel();
      const assertion = expect(pending).rejects.toThrow(LOCATION_NO_FIX_MESSAGE);
      await jest.advanceTimersByTimeAsync(10000);
      await assertion;
      await expect(pending).rejects.toThrow(LocationUnavailableError);

      expect(locationMock.reverseGeocodeAsync).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
