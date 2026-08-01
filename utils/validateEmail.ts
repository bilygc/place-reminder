/**
 * Validation utility for the email input field.
 *
 * This performs a practical, deliberately non-RFC-5322 validation: it is
 * strict enough to catch the common classes of bad input (missing domain,
 * missing TLD, interior whitespace, multiple '@') while staying readable.
 * Like `validateRadius`, it returns a discriminated union so callers can
 * branch on the failure reason rather than parsing a sentinel value.
 */

/** Loose minimum length of a trimmed email. The shortest genuinely valid
 *  address under these rules (e.g. "a@b.co") is 6 characters, so 3 is only
 *  an early-out floor that rejects degenerate fragments like "a" or "a@". */
export const EMAIL_MIN_LENGTH = 3;

/** Minimum length of the top-level domain (the label after the last dot).
 *  Two is the shortest TLD in the wild (e.g. ".io", ".ai"); anything shorter
 *  is a typo or a fragment. */
export const TLD_MIN_LENGTH = 2;

export type EmailValidationReason =
  | 'empty'
  | 'too-short'
  | 'invalid-format'
  | 'invalid-domain';

export type EmailValidationResult =
  | { valid: true; value: string }
  | { valid: false; reason: EmailValidationReason };

// A TLD is letters only; digits or mixed alphanumerics are not valid TLDs.
const TLD_LETTERS_PATTERN = /^[a-z]+$/i;

/**
 * Validate a raw email string and return a discriminated result.
 *
 * Parsing rules (in evaluation order):
 *  - Whitespace is trimmed first; empty-after-trim yields "empty".
 *  - A trimmed length below EMAIL_MIN_LENGTH yields "too-short". This check
 *    runs before the structural checks so that fragments like "a" or "a@"
 *    report "too-short" rather than a less helpful domain/format reason.
 *  - The address must contain no interior whitespace and exactly one '@',
 *    with a non-empty local part; otherwise "invalid-format".
 *  - The domain must contain at least one dot, no empty labels, and a TLD of
 *    TLD_MIN_LENGTH or more letters; otherwise "invalid-domain".
 *
 * On success the value is normalized: trimmed and lowercased.
 */
export function validateEmail(input: string): EmailValidationResult {
  const trimmed = input.trim();

  if (trimmed === '') {
    return { valid: false, reason: 'empty' };
  }

  if (trimmed.length < EMAIL_MIN_LENGTH) {
    return { valid: false, reason: 'too-short' };
  }

  // No interior whitespace is permitted anywhere in the address.
  if (/\s/.test(trimmed)) {
    return { valid: false, reason: 'invalid-format' };
  }

  const at = trimmed.indexOf('@');
  if (at === -1 || trimmed.indexOf('@', at + 1) !== -1) {
    return { valid: false, reason: 'invalid-format' };
  }

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  if (local === '') {
    return { valid: false, reason: 'invalid-format' };
  }

  // The domain must split into two or more non-empty dot-separated labels.
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) => label === '')) {
    return { valid: false, reason: 'invalid-domain' };
  }

  const tld = labels[labels.length - 1];
  if (tld.length < TLD_MIN_LENGTH || !TLD_LETTERS_PATTERN.test(tld)) {
    return { valid: false, reason: 'invalid-domain' };
  }

  return { valid: true, value: trimmed.toLowerCase() };
}