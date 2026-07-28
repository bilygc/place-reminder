/// <reference types="jest" />
import {
  validateRadius,
  RADIUS_MIN_METERS,
  RADIUS_MAX_METERS,
} from '../validateRadius';

describe('validateRadius', () => {
  describe('valid input', () => {
    it('accepts a typical radius like "100"', () => {
      expect(validateRadius('100')).toEqual({ valid: true, value: 100 });
    });

    it('accepts exactly the minimum boundary (10)', () => {
      expect(validateRadius('10')).toEqual({ valid: true, value: 10 });
    });

    it('accepts exactly the maximum boundary (10000)', () => {
      expect(validateRadius('10000')).toEqual({ valid: true, value: 10000 });
    });

    it('trims surrounding whitespace before parsing', () => {
      expect(validateRadius('  250  ')).toEqual({ valid: true, value: 250 });
    });
  });

  describe('empty input', () => {
    it('rejects an empty string with the "empty" reason', () => {
      expect(validateRadius('')).toEqual({ valid: false, reason: 'empty' });
    });

    it('rejects a whitespace-only string with the "empty" reason', () => {
      expect(validateRadius('   ')).toEqual({ valid: false, reason: 'empty' });
    });
  });

  describe('non-numeric input', () => {
    it('rejects a non-numeric string with the "not-a-number" reason', () => {
      expect(validateRadius('abc')).toEqual({ valid: false, reason: 'not-a-number' });
    });

    // Decimal input is rejected as not-a-number: geofence radius is an integer
    // meter value, and accepting fractional meters would imply sub-meter
    // geofence precision the platform does not meaningfully support.
    it('rejects decimal input like "12.5" as not-a-number', () => {
      expect(validateRadius('12.5')).toEqual({ valid: false, reason: 'not-a-number' });
    });

    it('rejects a string with trailing junk like "100abc" (the parseInt bug)', () => {
      expect(validateRadius('100abc')).toEqual({ valid: false, reason: 'not-a-number' });
    });

    it('rejects a negative number like "-5" (minus is not a digit)', () => {
      expect(validateRadius('-5')).toEqual({ valid: false, reason: 'not-a-number' });
    });
  });

  describe('bound checks', () => {
    it('rejects zero with the "too-small" reason', () => {
      expect(validateRadius('0')).toEqual({ valid: false, reason: 'too-small' });
    });

    it('rejects a value below the minimum (9) with the "too-small" reason', () => {
      expect(validateRadius('9')).toEqual({ valid: false, reason: 'too-small' });
    });

    it('rejects a value above the maximum (10001) with the "too-large" reason', () => {
      expect(validateRadius('10001')).toEqual({ valid: false, reason: 'too-large' });
    });
  });

  it('exposes the minimum and maximum bound constants', () => {
    expect(RADIUS_MIN_METERS).toBe(10);
    expect(RADIUS_MAX_METERS).toBe(10000);
  });
});