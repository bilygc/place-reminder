/**
 * Appwrite smoke test.
 *
 * Two layers:
 * 1. Config validation (always runs, no network) — catches the silent
 *    empty-string fallback bug that only used to explode at runtime.
 * 2. Live ping (runs only if EXPO_PUBLIC_* env vars are present, e.g. in CI
 *    with GitHub Secrets configured) — catches wrong/expired credentials,
 *    unreachable endpoint, or a misconfigured project/platform.
 *
 * If env vars are missing, layer 2 is SKIPPED (not failed) so this test
 * suite doesn't break for contributors without a .env file.
 */
import { Client, Account } from 'react-native-appwrite';

const REQUIRED_VARS = [
  'EXPO_PUBLIC_ENDPOINT',
  'EXPO_PUBLIC_PLATFORM',
  'EXPO_PUBLIC_PROJECT_ID',
  'EXPO_PUBLIC_DATABASE_ID',
  'EXPO_PUBLIC_USER_COLLECTION_ID',
  'EXPO_PUBLIC_REMINDER_COLLECTION_ID',
  'EXPO_PUBLIC_STORAGE_ID',
] as const;

const hasAllEnvVars = REQUIRED_VARS.every(
  (key) => !!process.env[key] && process.env[key]!.trim() !== ''
);

describe('Appwrite config (layer 1: static validation, no network)', () => {
  it.each(REQUIRED_VARS)('%s is set and non-empty', (key) => {
    // This is the exact check that used to silently fall back to "".
    // If this fails, the build should NOT proceed to a PR.
    expect(process.env[key]).toBeDefined();
    expect(process.env[key]?.trim()).not.toBe('');
  });

  it('endpoint looks like a valid URL', () => {
    if (!process.env.EXPO_PUBLIC_ENDPOINT) return; // covered by test above
    expect(() => new URL(process.env.EXPO_PUBLIC_ENDPOINT!)).not.toThrow();
  });

  it('EXPO_PUBLIC_PLATFORM matches app.json android.package', () => {
    // Regression guard: EXPO_PUBLIC_PLATFORM must match the package name
    // that actually ships in the compiled APK (app.json -> android.package).
    // A mismatch here means Appwrite's registered platform won't match the
    // app's real origin at runtime, and every request will be rejected —
    // even though build, typecheck, and mocked tests all pass fine.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const appJson = require('../../app.json');
    const compiledPackage = appJson?.expo?.android?.package;
    expect(compiledPackage).toBeDefined();
    expect(process.env.EXPO_PUBLIC_PLATFORM).toBe(compiledPackage);
  });

  it('client initializes without throwing given current env', () => {
    // Re-import fresh so module-level requireEnv() checks run now.
    expect(() => {
      jest.isolateModules(() => {
        require('../appwrite');
      });
    }).not.toThrow();
  });
});

describe('Appwrite live ping (layer 2: real network call)', () => {
  const maybeIt = hasAllEnvVars ? it : it.skip;

  maybeIt(
    'reaches the Appwrite endpoint and confirms the project accepts requests',
    async () => {
      const client = new Client()
        .setEndpoint(process.env.EXPO_PUBLIC_ENDPOINT!)
        .setProject(process.env.EXPO_PUBLIC_PROJECT_ID!)
        .setPlatform(process.env.EXPO_PUBLIC_PLATFORM!);

      const account = new Account(client);

      // account.get() with no active session correctly throws a 401
      // "user not authorized" — that's a SUCCESS signal: it means the
      // endpoint, project ID, and platform were all accepted by Appwrite's
      // API, and the SDK could talk to it. Any other failure (network
      // error, DNS failure, 404 project not found, CORS/platform
      // mismatch) means something in the config is actually broken.
      try {
        await account.get();
        // If it somehow succeeds (e.g. anonymous session already active
        // in this environment), that's also fine — endpoint is reachable.
      } catch (err: any) {
        const status = err?.code ?? err?.response?.status;
        if (status === 401) {
          // Expected: reached Appwrite, correctly rejected unauthenticated call.
          return;
        }
        throw new Error(
          `Appwrite live ping failed unexpectedly (status: ${status}). ` +
            'This usually means a wrong endpoint, invalid project ID, or ' +
            `platform mismatch. Original error: ${err?.message ?? err}`
        );
      }
    },
    15000 // network calls get more headroom than the default 5s
  );

  if (!hasAllEnvVars) {
    it('skipped live ping: env vars not present in this environment', () => {
      console.warn(
        '[appwrite smoke test] Skipping live ping — EXPO_PUBLIC_* vars not ' +
          'found. This is expected locally without a .env, but CI should ' +
          'have these as GitHub Secrets for the live check to run.'
      );
    });
  }
});