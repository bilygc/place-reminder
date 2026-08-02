/**
 * Appwrite smoke test.
 *
 * Three layers:
 * 1. Config validation (always runs, no network) — catches the silent
 *    empty-string fallback bug that only used to explode at runtime.
 * 2. Live ping (runs only if EXPO_PUBLIC_* env vars are present, e.g. in CI
 *    with GitHub Secrets configured) — catches wrong/expired credentials,
 *    unreachable endpoint, or a misconfigured project/platform.
 * 3. Auth input validation (always runs, no network) — catches the class
 *    of bug where signIn()/createUser() are called with malformed input
 *    (bad email, empty password) and the resulting error is swallowed or
 *    surfaces only as an unhandled "Invalid `email` param" deep in an
 *    Appwrite SDK call, invisible to typecheck/lint/build. Root-caused
 *    2026-08: an emulator test run passed a non-email string to signIn()
 *    and the failure was only visible as a runtime console.error, with
 *    no test in this suite catching it beforehand.
 *
 * If env vars are missing, layer 2 is SKIPPED (not failed) so this test
 * suite doesn't break for contributors without a .env file. Layer 3 needs
 * no env vars and no network, so it always runs.
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

describe('Appwrite auth input validation (layer 3: no network, no credentials)', () => {
  // Root cause (2026-08): signIn() forwarded email/password straight to
  // account.createEmailPasswordSession() with no validation of its own.
  // In production this surfaced as an unhandled Appwrite SDK error
  // ("Invalid `email` param: Value must be a valid email address") thrown
  // from deep inside the network call. Under Jest, react-native-appwrite
  // resolves through whatever mock/transform is configured for the RN
  // native layer, so asserting against the SDK's own validation behavior
  // here is not reliable — it can silently resolve instead of throwing.
  //
  // The actual fix is for signIn() to validate with the project's own
  // utils/validateEmail() *before* calling into the SDK at all. These
  // tests assert that local validation, so they need no env vars, no
  // network, and no dependency on how react-native-appwrite behaves
  // under test.

  it('signIn rejects a malformed email before touching Appwrite', async () => {
    const { signIn } = require('../appwrite');
    await expect(signIn('not-an-email', 'some-password')).rejects.toThrow(
      /email/i
    );
  });

  it('signIn rejects an empty email', async () => {
    const { signIn } = require('../appwrite');
    await expect(signIn('', 'some-password')).rejects.toThrow(/email/i);
  });

  it('signIn rejects an empty password', async () => {
    const { signIn } = require('../appwrite');
    await expect(signIn('valid@example.com', '')).rejects.toThrow(
      /password/i
    );
  });

  it('signIn does not reject a well-formed email on the email-format check', async () => {
    // We deliberately don't assert success/failure of the overall call —
    // under Jest, react-native-appwrite is not exercised against a real
    // network, so whether the SDK call resolves or rejects here says
    // nothing about our own validation. We only assert that IF it
    // rejects, the rejection is not our own email-format error. That's
    // the one thing this layer is responsible for.
    const { signIn } = require('../appwrite');
    try {
      await signIn('valid@example.com', 'some-password');
      // Resolved (e.g. mocked SDK) — validation was not the blocker. Pass.
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toMatch(/invalid email/i);
    }
  });

  it('createUser rejects a malformed email before touching Appwrite', async () => {
    const { createUser } = require('../appwrite');
    await expect(createUser('not-an-email', 'some-password')).rejects.toThrow(
      /email/i
    );
  });

  it('createUser rejects an empty email', async () => {
    const { createUser } = require('../appwrite');
    await expect(createUser('', 'some-password')).rejects.toThrow(/email/i);
  });

  it('createUser rejects an empty password', async () => {
    const { createUser } = require('../appwrite');
    await expect(createUser('valid@example.com', '')).rejects.toThrow(
      /password/i
    );
  });

  it('createUser does not reject a well-formed email on the email-format check', async () => {
    // We deliberately don't assert success/failure of the overall call —
    // under Jest, react-native-appwrite is not exercised against a real
    // network, so whether the SDK call resolves or rejects here says
    // nothing about our own validation. We only assert that IF it
    // rejects, the rejection is not our own email-format error. That's
    // the one thing this layer is responsible for.
    const { createUser } = require('../appwrite');
    try {
      await createUser('valid@example.com', 'some-password');
      // Resolved (e.g. mocked SDK) — validation was not the blocker. Pass.
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toMatch(/invalid email/i);
    }
  });
});