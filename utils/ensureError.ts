function ensureError(value: unknown): Error {
  if (value instanceof Error) return value;

  let stringified = '[Unable to stringify the thrown value]';
  try {
    stringified = JSON.stringify(value);
  } catch {
    // Ignore stringify errors
  }

  return new Error(`Unknown error: ${stringified}`);
}

export default ensureError;
