/**
 * Validation utilities for reminder creation inputs.
 *
 * These are pure, synchronous checks used by createReminder() before any
 * Appwrite SDK call. Keeping them in a dedicated util makes the validation
 * rules trivial to unit-test and reuse from the UI for inline feedback.
 */

/** Maximum length of a trimmed reminder description. */
export const DESCRIPTION_MAX_LENGTH = 500;

/** Maximum length of a reverse-geocoded location label. */
export const LOCATION_LABEL_MAX_LENGTH = 255;

/**
 * Clamp a place/POI name to the persisted label limit. Same bound applied to
 * reverse-geocoded labels in `getLabelForCoordinates` — single place where
 * the truncation rule lives for caller-supplied names.
 */
export function clampLocationLabel(label: string): string {
  return label.length > LOCATION_LABEL_MAX_LENGTH
    ? label.slice(0, LOCATION_LABEL_MAX_LENGTH)
    : label;
}

/**
 * Check whether a description is non-empty after trimming and within the
 * allowed length.
 */
export function isDescriptionValid(s: string): boolean {
  const trimmed = s.trim();
  return trimmed.length > 0 && trimmed.length <= DESCRIPTION_MAX_LENGTH;
}

/**
 * Check whether latitude and longitude are finite numbers inside the valid
 * geographic ranges.
 */
export function isLocationValid(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}
