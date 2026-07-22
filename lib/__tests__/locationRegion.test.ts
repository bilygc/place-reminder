/// <reference types="jest" />
import { reminderToRegion } from '../locationRegion';
import type { LocationCard } from '@/components/CardReminder/CardReminder.location.types';

const base: LocationCard = {
  $id: 'rem-1',
  active: true,
  latitude: 40.7,
  longitude: -74.0,
  radius: 150,
  do: 'Buy milk',
  at: 'Store',
};

describe('reminderToRegion', () => {
  it('defaults notifyOnEnter true and notifyOnExit false', () => {
    expect(reminderToRegion(base)).toEqual({
      identifier: 'rem-1',
      latitude: 40.7,
      longitude: -74.0,
      radius: 150,
      notifyOnEnter: true,
      notifyOnExit: false,
    });
  });

  it('preserves explicit notify flags', () => {
    expect(
      reminderToRegion({ ...base, notifyOnEnter: false, notifyOnExit: true })
    ).toMatchObject({ notifyOnEnter: false, notifyOnExit: true });
  });

  it('passes through identifier and coordinates', () => {
    const region = reminderToRegion({
      ...base,
      $id: 'x',
      latitude: 1,
      longitude: 2,
      radius: 99,
    });
    expect(region.identifier).toBe('x');
    expect(region.latitude).toBe(1);
    expect(region.longitude).toBe(2);
    expect(region.radius).toBe(99);
  });
});