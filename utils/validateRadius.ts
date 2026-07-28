/**
 * Validation utility for the geofence radius input field.
 *
 * The previous implementation used `parseInt(radius, 10) || 100`, which
 * silently mangles invalid input: `parseInt('100abc', 10) === 100` and
 * `parseInt('12.9', 10) === 12`, so nonsensical values were never surfaced
 * to the user. This function performs a strict, full-string parse and
 * returns a discriminated union so callers can branch on the failure
 * reason.
 */

/** Inclusive lower bound, in meters. Sits at/near typical GPS noise with
 *  Accuracy.Balanced; anything smaller would fire on positioning jitter. */
export const RADIUS_MIN_METERS = 10;

/** Inclusive upper bound, in meters. Keeps fences at place scale and avoids
 *  Android geofence reliability/quota issues with very large regions. */
export const RADIUS_MAX_METERS = 10000;

export type RadiusValidationReason =
  | 'empty'
  | 'not-a-number'
  | 'too-small'
  | 'too-large';

export type RadiusValidationResult =
  | { valid: true; value: number }
  | { valid: false; reason: RadiusValidationReason };

// Full-string integer match. Rejects "100abc", "12.5", "-5", and other
// non-integer inputs that bare parseInt would silently mangle.
const INTEGER_PATTERN = /^\d+$/;

/**
 * Validate a raw radius string and return a discriminated result.
 *
 * Parsing rules:
 *  - Whitespace is trimmed first; empty-after-trim yields the "empty" reason.
 *  - The trimmed string must be a pure run of digits (no sign, no decimal,
 *    no trailing junk). This is a deliberate departure from `parseInt`,
 *    which would accept "100abc" as 100.
 *  - The integer must fall within [RADIUS_MIN_METERS, RADIUS_MAX_METERS].
 */
export function validateRadius(input: string): RadiusValidationResult {
  const trimmed = input.trim();

  if (trimmed === '') {
    return { valid: false, reason: 'empty' };
  }

  if (!INTEGER_PATTERN.test(trimmed)) {
    return { valid: false, reason: 'not-a-number' };
  }

  // Safe: INTEGER_PATTERN guarantees a finite non-negative integer string.
  const value = Number(trimmed);

  if (value < RADIUS_MIN_METERS) {
    return { valid: false, reason: 'too-small' };
  }

  if (value > RADIUS_MAX_METERS) {
    return { valid: false, reason: 'too-large' };
  }

  return { valid: true, value };
}