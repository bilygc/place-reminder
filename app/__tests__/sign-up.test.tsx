/**
 * Unit tests for app/(auth)/sign-up.tsx — the sign-up form screen (observer).
 *
 * Covers the LOCAL VALIDATION matrix exercised by the submit() handler:
 *   - empty fields rejected          → alert('Please fill all fields')
 *   - invalid email rejected         → alert('Please enter a valid email address')
 *   - password regex boundaries:
 *       7 chars                      → rejected (regex requires {8,})
 *       8 chars, no uppercase        → rejected (regex requires (?=.*[A-Z]))
 *       8 chars, no digit            → rejected (regex requires (?=.*[0-9]))
 *       valid (Abcdef12)             → passes
 *   - password mismatch              → alert('Passwords do not match')
 *   - success                        → createUser called + MobX user.login
 *                                      populated + router.replace('/home')
 *   - createUser rejects             → console.error called, no navigation
 *
 * The password regex in the source is:
 *   /^(?=.*[A-Z])(?=.*[0-9])[A-Za-z0-9]{8,}$/
 *
 * global.alert is stubbed (source calls lowercase alert()). createUser is
 * mocked via @/lib/appwrite. The MobX User store is real (provided via
 * UserContext.Provider) so user.login can be asserted. expo-router is mocked
 * via the shared manual mock (router.replace is a jest.fn()). reanimated is
 * mocked via the shared manual mock.
 *
 * Rendered with raw react-test-renderer + act().
 */
jest.mock('expo-router');
jest.mock('react-native-reanimated');
jest.mock('@/lib/appwrite', () => ({
  createUser: jest.fn(),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type * as TestRendererNS from 'react-test-renderer';
import SignUp from '../(auth)/sign-up';
import { FormField } from '@/components/FormField';
import { User, UserContext } from '@/store/user';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { router } = require('expo-router');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createUser } = require('@/lib/appwrite');

function render(user?: User) {
  const providerValue = user ?? new User();
  let renderer!: TestRendererNS.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <UserContext.Provider value={providerValue}>
        <SignUp />
      </UserContext.Provider>
    );
  });
  return renderer;
}

function findField(
  r: TestRendererNS.ReactTestRenderer,
  title: string
): TestRendererNS.ReactTestInstance {
  const fields = r.root.findAllByType(FormField);
  const field = fields.find((f) => f.props.title === title);
  if (!field) throw new Error(`No FormField with title "${title}"`);
  return field;
}

function fill(
  r: TestRendererNS.ReactTestRenderer,
  title: string,
  value: string
) {
  act(() => {
    findField(r, title).props.handleChangeText(value);
  });
}

/** Recursively extract string leaves from a children tree. */
function extractStrings(children: unknown): string[] {
  if (typeof children === 'string') return [children];
  if (typeof children === 'number') return [String(children)];
  if (Array.isArray(children)) return children.flatMap(extractStrings);
  if (children && typeof children === 'object' && 'props' in (children as any)) {
    return extractStrings((children as any).props.children);
  }
  return [];
}

function findButton(
  r: TestRendererNS.ReactTestRenderer
): TestRendererNS.ReactTestInstance {
  const buttons = r.root.findAllByType(TouchableOpacity);
  const btn = buttons.find((b) => {
    const texts = b
      .findAllByType(Text)
      .flatMap((t) => extractStrings(t.props.children));
    return texts.some((s) => s.includes('Sign Up'));
  });
  if (!btn) throw new Error('No "Sign Up" button');
  return btn;
}

/** Flush the microtask queue so createUser()'s async chain applies. */
function flush(): Promise<void> {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('app/(auth)/sign-up', () => {
  const originalAlert = (globalThis as any).alert;
  let alertMock: jest.Mock;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertMock = jest.fn();
    (globalThis as any).alert = alertMock;
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    (globalThis as any).alert = originalAlert;
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('validation', () => {
    it('rejects empty fields with "Please fill all fields"', () => {
      const r = render();
      act(() => {
        findButton(r).props.onPress();
      });
      expect(alertMock).toHaveBeenCalledWith('Please fill all fields');
      expect(createUser).not.toHaveBeenCalled();
    });

    it('rejects an invalid email with "Please enter a valid email address"', () => {
      const r = render();
      fill(r, 'Username', 'alice');
      fill(r, 'Email', 'not-an-email');
      fill(r, 'Password', 'Abcdef12');
      fill(r, 'Confirm password', 'Abcdef12');
      act(() => {
        findButton(r).props.onPress();
      });
      expect(alertMock).toHaveBeenCalledWith('Please enter a valid email address');
      expect(createUser).not.toHaveBeenCalled();
    });

    it('rejects a 7-character password (regex requires {8,})', () => {
      const r = render();
      fill(r, 'Username', 'alice');
      fill(r, 'Email', 'alice@example.com');
      fill(r, 'Password', 'Abcde12'); // 7 chars, has uppercase + digit
      fill(r, 'Confirm password', 'Abcde12');
      act(() => {
        findButton(r).props.onPress();
      });
      expect(alertMock).toHaveBeenCalledWith(
        'Password must be at least 6 characters long and contain at least one capital letter and one number'
      );
      expect(createUser).not.toHaveBeenCalled();
    });

    it('rejects an 8-character password with no uppercase', () => {
      const r = render();
      fill(r, 'Username', 'alice');
      fill(r, 'Email', 'alice@example.com');
      fill(r, 'Password', 'abcdef12'); // 8 chars, digit, no uppercase
      fill(r, 'Confirm password', 'abcdef12');
      act(() => {
        findButton(r).props.onPress();
      });
      expect(alertMock).toHaveBeenCalledWith(
        'Password must be at least 6 characters long and contain at least one capital letter and one number'
      );
      expect(createUser).not.toHaveBeenCalled();
    });

    it('rejects an 8-character password with no digit', () => {
      const r = render();
      fill(r, 'Username', 'alice');
      fill(r, 'Email', 'alice@example.com');
      fill(r, 'Password', 'Abcdefgh'); // 8 chars, uppercase, no digit
      fill(r, 'Confirm password', 'Abcdefgh');
      act(() => {
        findButton(r).props.onPress();
      });
      expect(alertMock).toHaveBeenCalledWith(
        'Password must be at least 6 characters long and contain at least one capital letter and one number'
      );
      expect(createUser).not.toHaveBeenCalled();
    });

    it('rejects mismatched passwords with "Passwords do not match"', () => {
      const r = render();
      fill(r, 'Username', 'alice');
      fill(r, 'Email', 'alice@example.com');
      fill(r, 'Password', 'Abcdef12');
      fill(r, 'Confirm password', 'Different12');
      act(() => {
        findButton(r).props.onPress();
      });
      expect(alertMock).toHaveBeenCalledWith('Passwords do not match');
      expect(createUser).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('calls createUser, logs the user into MobX, and navigates to /home', async () => {
      const user = new User();
      createUser.mockResolvedValue({
        $id: 'user-1',
        avatar: 'https://avatar',
      });
      const r = render(user);
      fill(r, 'Username', 'alice');
      fill(r, 'Email', 'alice@example.com');
      fill(r, 'Password', 'Abcdef12');
      fill(r, 'Confirm password', 'Abcdef12');

      await act(async () => {
        await findButton(r).props.onPress();
      });
      await flush();

      expect(createUser).toHaveBeenCalledWith(
        'alice@example.com',
        'Abcdef12',
        'alice'
      );
      expect(user.isLoggedIn).toBe(true);
      expect(user.userId).toBe('user-1');
      expect(user.email).toBe('alice@example.com');
      expect(user.userName).toBe('alice');
      expect(router.replace).toHaveBeenCalledWith('/home');
    });
  });

  describe('error path', () => {
    it('logs to console.error and does not navigate when createUser rejects', async () => {
      createUser.mockRejectedValue(new Error('Network failure'));
      const r = render();
      fill(r, 'Username', 'alice');
      fill(r, 'Email', 'alice@example.com');
      fill(r, 'Password', 'Abcdef12');
      fill(r, 'Confirm password', 'Abcdef12');

      await act(async () => {
        try {
          await findButton(r).props.onPress();
        } catch {
          /* submit re-throws — expected */
        }
      });
      await flush();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Network failure');
      expect(router.replace).not.toHaveBeenCalled();
    });
  });
});