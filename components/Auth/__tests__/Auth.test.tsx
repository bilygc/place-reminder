/**
 * Unit tests for components/Auth/Auth.tsx — the observer provider that calls
 * getCurrentUser() on mount and logs the user into the MobX User store.
 *
 * Covers:
 *  - user present -> user.login called with the mapped fields
 *    (session.$id = userData.$id, userName = userData.email, avatar, email).
 *  - no user (getCurrentUser resolves undefined) -> no login, children render.
 *  - getCurrentUser rejects -> console.error, no login, children render.
 *  - UserContext provides a User instance to children (before and after login).
 *
 * The react-native-appwrite SDK is mocked via the shared manual mock (no real
 * network). Non-empty placeholder env vars are set so appwrite.ts's
 * module-level requireEnv() config validation passes at import time (same
 * pattern as lib/__tests__/appwrite.api.test.ts).
 *
 * Rendered with raw react-test-renderer + act().
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appwriteModule = require('react-native-appwrite');
const accountInstance = appwriteModule.__account;
const databaseInstance = appwriteModule.__database;

/** Flush the microtask queue so getCurrentUser()'s async chain applies. */
function flush(): Promise<void> {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

interface Captured {
  current: User | null;
}

function renderAuth(captured: Captured) {
  const TestChild = () => {
    captured.current = React.useContext(UserContext);
    return <Text>child-marker</Text>;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Auth>
        <TestChild />
      </Auth>
    );
  });
  return renderer;
}

describe('Auth', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let loginSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    [accountInstance.get, databaseInstance.listDocuments].forEach((fn: jest.Mock) =>
      fn.mockReset()
    );
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    // Spy on the prototype so we can assert login() args regardless of which
    // User instance Auth constructs internally.
    loginSpy = jest.spyOn(User.prototype, 'login');
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    loginSpy.mockRestore();
  });

  it('calls getCurrentUser on mount', async () => {
    accountInstance.get.mockResolvedValue({ $id: 'acc-1' });
    databaseInstance.listDocuments.mockResolvedValue({ documents: [] });

    const captured: Captured = { current: null };
    renderAuth(captured);
    await flush();

    expect(accountInstance.get).toHaveBeenCalledTimes(1);
  });

  it('logs the user in with mapped fields when a user document is returned', async () => {
    const userData = { $id: 'user-1', email: 'a@b.com', avatar: 'https://avatar' };
    accountInstance.get.mockResolvedValue({ $id: 'acc-1' });
    databaseInstance.listDocuments.mockResolvedValue({ documents: [userData] });

    const captured: Captured = { current: null };
    renderAuth(captured);
    await flush();

    expect(loginSpy).toHaveBeenCalledTimes(1);
    expect(loginSpy).toHaveBeenCalledWith({
      session: { $id: 'user-1', isLoggedIn: true },
      email: 'a@b.com',
      // userName is mapped from userData.email (not a username field).
      userName: 'a@b.com',
      avatar: 'https://avatar',
    });
  });

  it('reflects the logged-in state on the UserContext instance', async () => {
    const userData = { $id: 'user-1', email: 'a@b.com', avatar: 'https://avatar' };
    accountInstance.get.mockResolvedValue({ $id: 'acc-1' });
    databaseInstance.listDocuments.mockResolvedValue({ documents: [userData] });

    const captured: Captured = { current: null };
    renderAuth(captured);
    await flush();

    expect(captured.current).toBeInstanceOf(User);
    expect(captured.current?.isLoggedIn).toBe(true);
    expect(captured.current?.userId).toBe('user-1');
    expect(captured.current?.email).toBe('a@b.com');
    expect(captured.current?.avatar).toBe('https://avatar');
  });

  it('does NOT call login when getCurrentUser resolves to undefined (no documents)', async () => {
    accountInstance.get.mockResolvedValue({ $id: 'acc-1' });
    databaseInstance.listDocuments.mockResolvedValue({ documents: [] });

    const captured: Captured = { current: null };
    const renderer = renderAuth(captured);
    await flush();

    expect(loginSpy).not.toHaveBeenCalled();
    // Children still render.
    expect(renderer.root.findByType(Text).props.children).toBe('child-marker');
    // Context still provides a User instance (just not logged in).
    expect(captured.current).toBeInstanceOf(User);
    expect(captured.current?.isLoggedIn).toBe(false);
  });

  it('does not call login or log an error when getCurrentUser returns null (unauthenticated)', async () => {
    accountInstance.get.mockRejectedValue(
      new Error('User (role: guests) missing scopes (["account"])')
    );

    const captured: Captured = { current: null };
    const renderer = renderAuth(captured);
    await flush();

    expect(loginSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    // Children still render in the logged-out state.
    expect(renderer.root.findByType(Text).props.children).toBe('child-marker');
    expect(captured.current).toBeInstanceOf(User);
    expect(captured.current?.isLoggedIn).toBe(false);
  });

  it('logs to console.error and does not call login when getCurrentUser rejects with a non-auth error', async () => {
    accountInstance.get.mockRejectedValue(new Error('network failure'));

    const captured: Captured = { current: null };
    const renderer = renderAuth(captured);
    await flush();

    expect(loginSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    // Children still render despite the error.
    expect(renderer.root.findByType(Text).props.children).toBe('child-marker');
    expect(captured.current).toBeInstanceOf(User);
    expect(captured.current?.isLoggedIn).toBe(false);
  });

  it('provides a UserContext instance to children before the fetch resolves', () => {
    // A never-resolving account.get keeps the fetch in flight.
    accountInstance.get.mockReturnValue(new Promise(() => {}));

    const captured: Captured = { current: null };
    renderAuth(captured);

    expect(captured.current).toBeInstanceOf(User);
    expect(captured.current?.isLoggedIn).toBe(false);
  });
});