import {
  isDescriptionValid,
  isLocationValid,
  DESCRIPTION_MAX_LENGTH,
} from '../validateReminder';

describe('validateReminder', () => {
  describe('isDescriptionValid', () => {
    it('returns true for a normal non-empty description', () => {
      expect(isDescriptionValid('Buy milk')).toBe(true);
    });

    it('returns false for an empty string', () => {
      expect(isDescriptionValid('')).toBe(false);
    });

    it('returns false for whitespace-only input', () => {
      expect(isDescriptionValid('   ')).toBe(false);
      expect(isDescriptionValid('\t\n')).toBe(false);
    });

    it('returns true for a description of exactly 500 chars', () => {
      const description = 'a'.repeat(DESCRIPTION_MAX_LENGTH);
      expect(isDescriptionValid(description)).toBe(true);
    });

    it('returns false for a description of 501 chars', () => {
      const description = 'a'.repeat(DESCRIPTION_MAX_LENGTH + 1);
      expect(isDescriptionValid(description)).toBe(false);
    });

    it('trims leading/trailing whitespace before measuring length', () => {
      const inner = 'a'.repeat(DESCRIPTION_MAX_LENGTH);
      expect(isDescriptionValid(`  ${inner}  `)).toBe(true);
      const tooLong = 'a'.repeat(DESCRIPTION_MAX_LENGTH + 1);
      expect(isDescriptionValid(` ${tooLong} `)).toBe(false);
    });
  });

  describe('isLocationValid', () => {
    it('returns true for valid latitude/longitude pairs', () => {
      expect(isLocationValid(0, 0)).toBe(true);
      expect(isLocationValid(40.7128, -74.006)).toBe(true);
      expect(isLocationValid(-90, -180)).toBe(true);
      expect(isLocationValid(90, 180)).toBe(true);
    });

    it('returns false for out-of-range latitude', () => {
      expect(isLocationValid(-91, 0)).toBe(false);
      expect(isLocationValid(91, 0)).toBe(false);
    });

    it('returns false for out-of-range longitude', () => {
      expect(isLocationValid(0, -181)).toBe(false);
      expect(isLocationValid(0, 181)).toBe(false);
    });

    it('returns false for non-finite numbers', () => {
      expect(isLocationValid(NaN, 0)).toBe(false);
      expect(isLocationValid(0, NaN)).toBe(false);
      expect(isLocationValid(Infinity, 0)).toBe(false);
      expect(isLocationValid(0, -Infinity)).toBe(false);
    });

    it('returns false for non-number inputs', () => {
      expect(isLocationValid('0' as unknown as number, 0)).toBe(false);
      expect(isLocationValid(0, null as unknown as number)).toBe(false);
    });
  });

});
