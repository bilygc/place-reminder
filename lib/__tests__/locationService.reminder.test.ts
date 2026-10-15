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
  getLabelForCoordinates,
  buildLocationLabel,
} = require('../locationService');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LOCATION_LABEL_MAX_LENGTH } = require('@/utils/validateReminder');

function makeAddress(
  overrides: Partial<LocationGeocodedAddress> = {}
): LocationGeocodedAddress {
  return {
    street: null,
    city: null,
    region: null,
    country: null,
    name: null,
    postalCode: null,
    subregion: null,
    isoCountryCode: null,
    timezone: null,
    district: null,
    streetNumber: null,
    formattedAddress: null,
    ...overrides,
  };
}

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

  it('prefers the POI name from the current-location geocode result', async () => {
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      expires: 'never',
    });
    locationMock.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.7128, longitude: -74.006 },
      timestamp: 1700000000000,
    });
    locationMock.reverseGeocodeAsync.mockResolvedValue([
      makeAddress({
        name: 'Grand Mall',
        street: '123 Main St',
        city: 'New York',
        region: 'NY',
        country: 'USA',
      }),
    ]);

    const result = await getCurrentLocationWithLabel();

    expect(result).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
      label: 'Grand Mall, 123 Main St',
    });
  });
});

describe('buildLocationLabel', () => {
  it('prefers the POI name first, then street', () => {
    expect(
      buildLocationLabel(
        makeAddress({
          name: 'Grand Mall',
          street: '123 Main St',
          city: 'Springfield',
          region: 'IL',
          country: 'USA',
        })
      )
    ).toBe('Grand Mall, 123 Main St');
  });

  it('falls back to name + city when no street is available', () => {
    expect(
      buildLocationLabel(
        makeAddress({ name: 'Starbucks', city: 'Seattle' })
      )
    ).toBe('Starbucks, Seattle');
  });

  it('keeps the existing Street, City output when no name is present', () => {
    expect(
      buildLocationLabel(
        makeAddress({
          name: null,
          street: '123 Main St',
          city: 'New York',
          region: 'NY',
          country: 'USA',
        })
      )
    ).toBe('123 Main St, New York');
  });

  it('ignores a blank name and falls back to Street, City', () => {
    expect(
      buildLocationLabel(
        makeAddress({ name: '   ', street: '123 Main St', city: 'New York' })
      )
    ).toBe('123 Main St, New York');
  });

  it('dedupes a name that repeats the street', () => {
    expect(
      buildLocationLabel(
        makeAddress({
          name: '123 Main St',
          street: '123 Main St',
          city: 'New York',
        })
      )
    ).toBe('123 Main St, New York');
  });

  it('returns an empty string when no address components exist', () => {
    expect(buildLocationLabel(makeAddress())).toBe('');
  });
});

describe('getLabelForCoordinates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    locationMock.hasServicesEnabledAsync.mockResolvedValue(true);
    locationMock.getLastKnownPositionAsync.mockResolvedValue(null);
  });

  it('returns the POI-preferred label for arbitrary coordinates', async () => {
    locationMock.reverseGeocodeAsync.mockResolvedValue([
      makeAddress({
        name: 'Grand Mall',
        street: '123 Main St',
        city: 'Springfield',
      }),
    ]);

    await expect(
      getLabelForCoordinates({ latitude: 10, longitude: 20 })
    ).resolves.toBe('Grand Mall, 123 Main St');
    expect(locationMock.reverseGeocodeAsync).toHaveBeenCalledWith({
      latitude: 10,
      longitude: 20,
    });
  });

  it('returns the Street, City fallback when the geocode has no name', async () => {
    locationMock.reverseGeocodeAsync.mockResolvedValue([
      makeAddress({ street: '123 Main St', city: 'New York' }),
    ]);

    await expect(
      getLabelForCoordinates({ latitude: 10, longitude: 20 })
    ).resolves.toBe('123 Main St, New York');
  });

  it('returns null (does not throw) when the SDK returns an empty array', async () => {
    locationMock.reverseGeocodeAsync.mockResolvedValue([]);

    await expect(
      getLabelForCoordinates({ latitude: 10, longitude: 20 })
    ).resolves.toBeNull();
  });

  it('returns null (does not throw) when the SDK rejects', async () => {
    locationMock.reverseGeocodeAsync.mockRejectedValue(
      new Error('geocoding unavailable')
    );

    await expect(
      getLabelForCoordinates({ latitude: 10, longitude: 20 })
    ).resolves.toBeNull();
  });

  it('returns null when the geocode result has no usable components', async () => {
    locationMock.reverseGeocodeAsync.mockResolvedValue([makeAddress()]);

    await expect(
      getLabelForCoordinates({ latitude: 10, longitude: 20 })
    ).resolves.toBeNull();
  });

  it('clamps a long label to LOCATION_LABEL_MAX_LENGTH', async () => {
    locationMock.reverseGeocodeAsync.mockResolvedValue([
      makeAddress({ name: 'a'.repeat(300), city: 'Seattle' }),
    ]);

    const label = await getLabelForCoordinates({ latitude: 10, longitude: 20 });

    expect(label).not.toBeNull();
    expect(label!.length).toBe(LOCATION_LABEL_MAX_LENGTH);
  });

  it.each([
    { latitude: NaN, longitude: 20 },
    { latitude: 10, longitude: Infinity },
  ])(
    'returns null without calling the SDK for invalid coords %p',
    async (coords) => {
      await expect(getLabelForCoordinates(coords)).resolves.toBeNull();
      expect(locationMock.reverseGeocodeAsync).not.toHaveBeenCalled();
    }
  );
});
