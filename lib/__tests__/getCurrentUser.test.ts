/**
 * Unit test for getCurrentUser() — the function targeted by ATO-9
 * (lodash get() swap for `documents[0]` access).
 *
 * This is a behavior-preserving regression guard: it pins the contract
 * that getCurrentUser() returns the first document from the user
 * collection query, so the `get(currentUser, 'documents[0]')` swap
 * can't silently change what callers receive.
 *
 * The react-native-appwrite SDK is fully mocked via the shared manual mock
 * at `__mocks__/react-native-appwrite.js` (no real network, no real
 * credentials). Non-empty placeholder env vars are set only so appwrite.ts's
 * module-level requireEnv() config validation passes at import time.
 *
 * Error-path coverage for getCurrentUser() lives in appwrite.api.test.ts to
 * avoid duplication; this file keeps the two happy-path regression guards.
 */

// Non-empty placeholders so appwrite.ts module-level requireEnv() passes.
// No real values needed — every SDK call is mocked below.
process.env.EXPO_PUBLIC_ENDPOINT = 'https://dummy.example/v1';
process.env.EXPO_PUBLIC_PLATFORM = 'com.dummy.app';
process.env.EXPO_PUBLIC_PROJECT_ID = 'dummy-project';
process.env.EXPO_PUBLIC_DATABASE_ID = 'dummy-db';
process.env.EXPO_PUBLIC_USER_COLLECTION_ID = 'dummy-users';
process.env.EXPO_PUBLIC_REMINDER_COLLECTION_ID = 'dummy-reminders';
process.env.EXPO_PUBLIC_STORAGE_ID = 'dummy-storage';

// Use the shared manual mock (no factory) — see __mocks__/react-native-appwrite.js.
jest.mock('react-native-appwrite');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appwriteModule = require('react-native-appwrite');
const accountInstance = appwriteModule.__account;
const databaseInstance = appwriteModule.__database;

describe('getCurrentUser (ATO-9: lodash get() swap regression guard)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset implementations so mockResolvedValue from one test can't leak
    // into another; each test sets the resolution it needs.
    [accountInstance.get, databaseInstance.listDocuments].forEach((fn) =>
      fn.mockReset()
    );
  });

  it('returns the first document from the user collection query', async () => {
    const firstDoc = { $id: 'user-1', username: 'alice' };
    accountInstance.get.mockResolvedValue({ $id: 'acc-1' });
    databaseInstance.listDocuments.mockResolvedValue({
      documents: [firstDoc, { $id: 'user-2', username: 'bob' }],
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCurrentUser } = require('../appwrite');
    const user = await getCurrentUser();

    expect(user).toBe(firstDoc);
    expect(databaseInstance.listDocuments).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when the user collection query has no documents', async () => {
    // Matches the pre-swap behavior of `currentUser.documents[0]` (which
    // is `undefined` for an empty array) and of lodash `get(..., 'documents[0]')`.
    accountInstance.get.mockResolvedValue({ $id: 'acc-1' });
    databaseInstance.listDocuments.mockResolvedValue({ documents: [] });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCurrentUser } = require('../appwrite');
    const user = await getCurrentUser();

    expect(user).toBeUndefined();
  });
});