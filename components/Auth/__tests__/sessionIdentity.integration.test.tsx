/**
 * Integration regression guard for the ATO-12 session-identity (id-space) fix.
 *
 * Production reality: the Appwrite *account* id (from `account.get()`) and the
 * *user-collection document* id (from `getCurrentUser()` / `createUser()`) live
 * in different id spaces. The user document carries the account id in its
 * `accountid` field. The MobX store's session identity MUST be the account id,
 * because `createReminder` derives ownership/permissions from `account.get()`
 * and treats a non-empty mismatched caller `userId` as a hard error.
 *
 * These tests wire the REAL pieces together (Auth provider -> MobX User store
 * -> real createReminder, SDK mocked at the boundary):
 *  - store populated from a realistic user document ($id 'doc-1',
 *    accountid 'acct-1') while the session is 'acct-1' -> creation SUCCEEDS.
 *  - a genuinely mismatched caller id still throws (cross-check kept).
 *  - a legacy document missing `accountid` never logs the user in.
 */
process.env.EXPO_PUBLIC_ENDPOINT = 'https://dummy.example/v1';
process.env.EXPO_PUBLIC_PLATFORM = 'com.dummy.app';
process.env.EXPO_PUBLIC_PROJECT_ID = 'dummy-project';
process.env.EXPO_PUBLIC_DATABASE_ID = 'dummy-db';
process.env.EXPO_PUBLIC_USER_COLLECTION_ID = 'dummy-users';
process.env.EXPO_PUBLIC_REMINDER_COLLECTION_ID = 'dummy-reminders';
process.env.EXPO_PUBLIC_STORAGE_ID = 'dummy-storage';

jest.mock('react-native-appwrite');

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import Auth from '../Auth';
import { User, UserContext } from '@/store/user';
import { createReminder } from '@/lib/appwrite';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appwriteModule = require('react-native-appwrite');
const accountInstance = appwriteModule.__account;
const databaseInstance = appwriteModule.__database;
const ID = appwriteModule.ID;

// Production-shaped ids: document id and account id are DIFFERENT values.
const DOC_ID = 'doc-1';
const ACCOUNT_ID = 'acct-1';

const userDoc = {
  $id: DOC_ID,
  accountid: ACCOUNT_ID,
  email: 'a@b.com',
  avatar: 'https://avatar',
};

/** Capture the User store instance Auth provides via context. */
function renderAuth(): { store: () => User | null } {
  let captured: User | null = null;
  const TestChild = () => {
    captured = React.useContext(UserContext);
    return <Text>child-marker</Text>;
  };
  act(() => {
    TestRenderer.create(
      <Auth>
        <TestChild />
      </Auth>
    );
  });
  return { store: () => captured };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('session identity wiring (account id, not document id)', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    ID.unique.mockReturnValue('gen-id');
    [accountInstance.get, databaseInstance.listDocuments].forEach(
      (fn: jest.Mock) => fn.mockReset()
    );
    databaseInstance.createDocument.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('stores the ACCOUNT id (from userDoc.accountid) as the session identity', async () => {
    accountInstance.get.mockResolvedValue({ $id: ACCOUNT_ID });
    databaseInstance.listDocuments.mockResolvedValue({ documents: [userDoc] });

    const { store } = renderAuth();
    await flush();

    expect(store()?.isLoggedIn).toBe(true);
    expect(store()?.userId).toBe(ACCOUNT_ID);
  });

  it('creation SUCCEEDS end-to-end when the store holds the account id and the session matches', async () => {
    accountInstance.get.mockResolvedValue({ $id: ACCOUNT_ID });
    databaseInstance.listDocuments.mockResolvedValue({ documents: [userDoc] });

    const { store } = renderAuth();
    await flush();

    const callerId = store()?.userId ?? '';
    expect(callerId).toBe(ACCOUNT_ID);

    databaseInstance.createDocument.mockResolvedValue({
      $id: 'rem-1',
      userId: ACCOUNT_ID,
      description: 'Buy milk',
      latitude: 10,
      longitude: 20,
      locationSource: 'current',
      active: true,
    });

    await expect(
      createReminder({
        description: 'Buy milk',
        latitude: 10,
        longitude: 20,
        locationSource: 'current',
        userId: callerId,
      })
    ).resolves.toBeTruthy();
    expect(databaseInstance.createDocument).toHaveBeenCalled();
  });

  it('creation still REJECTS a genuinely mismatched caller id (cross-check kept)', async () => {
    accountInstance.get.mockResolvedValue({ $id: ACCOUNT_ID });
    databaseInstance.createDocument.mockReset();

    await expect(
      createReminder({
        description: 'Buy milk',
        latitude: 10,
        longitude: 20,
        locationSource: 'current',
        userId: 'attacker-id',
      })
    ).rejects.toThrow(/match/i);

    expect(databaseInstance.createDocument).not.toHaveBeenCalled();
  });

  it('does NOT log in when the user document is missing its account id', async () => {
    accountInstance.get.mockResolvedValue({ $id: ACCOUNT_ID });
    databaseInstance.listDocuments.mockResolvedValue({
      documents: [{ $id: DOC_ID, email: 'a@b.com', avatar: 'https://avatar' }],
    });

    const { store } = renderAuth();
    await flush();

    expect(store()?.isLoggedIn).toBe(false);
    expect(store()?.userId).toBe('');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
