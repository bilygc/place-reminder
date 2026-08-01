/// <reference types="jest" />
import {
  validateEmail,
  EMAIL_MIN_LENGTH,
  TLD_MIN_LENGTH,
} from '../validateEmail';

describe('validateEmail', () => {
  describe('valid input', () => {
    it('accepts a typical email like "user@example.com"', () => {
      expect(validateEmail('user@example.com')).toEqual({
        valid: true,
        value: 'user@example.com',
      });
    });

    it('accepts a subdomain email like "user@sub.example.com"', () => {
      expect(validateEmail('user@sub.example.com')).toEqual({
        valid: true,
        value: 'user@sub.example.com',
      });
    });

    it('accepts a multi-part TLD like "user@example.co.uk"', () => {
      expect(validateEmail('user@example.co.uk')).toEqual({
        valid: true,
        value: 'user@example.co.uk',
      });
    });

    it('trims surrounding whitespace and lowercases the result', () => {
      expect(validateEmail('  User@Example.COM  ')).toEqual({
        valid: true,
        value: 'user@example.com',
      });
    });

    it('accepts a short but valid email like "a@b.co"', () => {
      expect(validateEmail('a@b.co')).toEqual({
        valid: true,
        value: 'a@b.co',
      });
    });
  });

  describe('empty input', () => {
    it('rejects an empty string with the "empty" reason', () => {
      expect(validateEmail('')).toEqual({ valid: false, reason: 'empty' });
    });

    it('rejects a whitespace-only string with the "empty" reason', () => {
      expect(validateEmail('   ')).toEqual({ valid: false, reason: 'empty' });
    });
  });

  describe('invalid format', () => {
    it('rejects a string with no "@" like "userexample.com"', () => {
      expect(validateEmail('userexample.com')).toEqual({
        valid: false,
        reason: 'invalid-format',
      });
    });

    it('rejects a string with multiple "@" like "a@b@c.com"', () => {
      expect(validateEmail('a@b@c.com')).toEqual({
        valid: false,
        reason: 'invalid-format',
      });
    });

    it('rejects interior whitespace like "a b@c.com"', () => {
      expect(validateEmail('a b@c.com')).toEqual({
        valid: false,
        reason: 'invalid-format',
      });
    });

    it('rejects an empty local part like "@example.com"', () => {
      expect(validateEmail('@example.com')).toEqual({
        valid: false,
        reason: 'invalid-format',
      });
    });
  });

  describe('invalid domain', () => {
    it('rejects a domain with no dot like "user@example"', () => {
      expect(validateEmail('user@example')).toEqual({
        valid: false,
        reason: 'invalid-domain',
      });
    });

    it('rejects a domain ending with a dot like "user@example."', () => {
      expect(validateEmail('user@example.')).toEqual({
        valid: false,
        reason: 'invalid-domain',
      });
    });

    it('rejects a domain with a leading dot like "user@.com"', () => {
      expect(validateEmail('user@.com')).toEqual({
        valid: false,
        reason: 'invalid-domain',
      });
    });

    it('rejects a domain with consecutive dots like "user@sub..com"', () => {
      expect(validateEmail('user@sub..com')).toEqual({
        valid: false,
        reason: 'invalid-domain',
      });
    });

    it('rejects a 1-letter TLD like "user@example.c"', () => {
      expect(validateEmail('user@example.c')).toEqual({
        valid: false,
        reason: 'invalid-domain',
      });
    });

    it('rejects a numeric TLD like "user@example.123"', () => {
      expect(validateEmail('user@example.123')).toEqual({
        valid: false,
        reason: 'invalid-domain',
      });
    });
  });

  describe('bounds', () => {
    it('rejects a 2-character string like "ab" with the "too-short" reason', () => {
      expect(validateEmail('ab')).toEqual({ valid: false, reason: 'too-short' });
    });

    it('rejects a 1-character string like "a" with the "too-short" reason', () => {
      expect(validateEmail('a')).toEqual({ valid: false, reason: 'too-short' });
    });

    // The length floor is a loose early-out; a 3-character string clears it
    // and is then judged on structure, so "a@b" reports a domain problem
    // rather than "too-short".
    it('lets a 3-character string past the length floor (e.g. "a@b" -> invalid-domain)', () => {
      expect(validateEmail('a@b')).toEqual({
        valid: false,
        reason: 'invalid-domain',
      });
    });
  });

  it('exposes the minimum length and TLD bound constants', () => {
    expect(EMAIL_MIN_LENGTH).toBe(3);
    expect(TLD_MIN_LENGTH).toBe(2);
  });
});