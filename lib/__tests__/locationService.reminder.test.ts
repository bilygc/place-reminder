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
  getCurrentLocationWithLabel,
} = require('../locationService');

describe('LocationPermissionDeniedError', () => {
  it('is an Error subclass', () => {
    const err = new LocationPermissionDeniedError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LocationPermissionDeniedError);
  });
});

describe('getCurrentLocationWithLabel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
