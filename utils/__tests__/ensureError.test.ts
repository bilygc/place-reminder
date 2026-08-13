/// <reference types="jest" />
import ensureError from '../ensureError';

describe('ensureError', () => {
  describe('Error passthrough', () => {
    it('returns the same Error instance when given an Error', () => {
      const err = new Error('boom');
      expect(ensureError(err)).toBe(err);
    });

    it('returns the same reference for a subclass of Error', () => {
      const err = new TypeError('type problem');
      expect(ensureError(err)).toBe(err);
      expect(ensureError(err)).toBeInstanceOf(TypeError);
    });

    it('preserves the subclass identity (RangeError stays RangeError)', () => {
      const err = new RangeError('out of range');
      const result = ensureError(err);
      // Identity, not a fresh generic Error wrapping it.
      expect(result).toBe(err);
      expect(result.name).toBe('RangeError');
    });
  });

  describe('string values', () => {
    // ensureError does not special-case strings: every non-Error value is
    // run through JSON.stringify and prefixed with "Unknown error: ". A
    // string therefore comes back quoted, e.g. 'foo' -> Unknown error: "foo".
    it('wraps a non-empty string with its JSON-quoted form', () => {
      const result = ensureError('something failed');
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('Unknown error: "something failed"');
    });

    it('wraps an empty string as Unknown error: ""', () => {
      const result = ensureError('');
      expect(result.message).toBe('Unknown error: ""');
    });
  });

  describe('numbers and booleans', () => {
    it('wraps a number, stringifying it into the message', () => {
      const result = ensureError(42);
      expect(result.message).toBe('Unknown error: 42');
    });

    it('wraps zero', () => {
      const result = ensureError(0);
      expect(result.message).toBe('Unknown error: 0');
    });

    it('wraps NaN (JSON.stringify(NaN) === "null")', () => {
      const result = ensureError(NaN);
      expect(result.message).toBe('Unknown error: null');
    });

    it('wraps false', () => {
      const result = ensureError(false);
      expect(result.message).toBe('Unknown error: false');
    });

    it('wraps true', () => {
      const result = ensureError(true);
      expect(result.message).toBe('Unknown error: true');
    });
  });

  describe('null and undefined', () => {
    it('wraps null (JSON.stringify(null) === "null")', () => {
      const result = ensureError(null);
      expect(result.message).toBe('Unknown error: null');
    });

    it('wraps undefined (JSON.stringify(undefined) === undefined, coerced to "undefined")', () => {
      const result = ensureError(undefined);
      expect(result.message).toBe('Unknown error: undefined');
    });
  });

  describe('plain objects and arrays', () => {
    it('wraps a plain object with its JSON representation', () => {
      const result = ensureError({ a: 1 });
      expect(result.message).toBe('Unknown error: {"a":1}');
    });

    it('wraps an empty array as "Unknown error: []"', () => {
      const result = ensureError([]);
      expect(result.message).toBe('Unknown error: []');
    });

    it('wraps a non-empty array with its JSON representation', () => {
      const result = ensureError([1, 2]);
      expect(result.message).toBe('Unknown error: [1,2]');
    });

    it('wraps an object with nested values', () => {
      const result = ensureError({ code: 500, detail: { msg: 'bad' } });
      expect(result.message).toBe(
        'Unknown error: {"code":500,"detail":{"msg":"bad"}}'
      );
    });
  });

  describe('non-stringifiable values', () => {
    it('wraps a symbol (JSON.stringify(symbol) === undefined)', () => {
      const result = ensureError(Symbol('x'));
      expect(result.message).toBe('Unknown error: undefined');
    });

    it('wraps a function (JSON.stringify(function) === undefined)', () => {
      const result = ensureError(function foo() {});
      expect(result.message).toBe('Unknown error: undefined');
    });

    it('falls back to the placeholder when JSON.stringify throws on a BigInt', () => {
      // JSON.stringify(123n) throws "Do not know how to serialize a BigInt",
      // so `stringified` keeps its initial placeholder value and the message
      // becomes "Unknown error: [Unable to stringify the thrown value]".
      const result = ensureError(123n);
      expect(result.message).toBe(
        'Unknown error: [Unable to stringify the thrown value]'
      );
    });

    it('falls back to the placeholder when JSON.stringify throws on a circular reference', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const result = ensureError(circular);
      expect(result.message).toBe(
        'Unknown error: [Unable to stringify the thrown value]'
      );
    });
  });

  describe('return type', () => {
    it('always returns an Error instance (never throws, never returns null)', () => {
      const values: unknown[] = [
        null,
        undefined,
        0,
        '',
        Symbol('s'),
        123n,
        (() => {
          const o: Record<string, unknown> = {};
          o.o = o;
          return o;
        })(),
      ];
      for (const v of values) {
        expect(ensureError(v)).toBeInstanceOf(Error);
      }
    });
  });
});