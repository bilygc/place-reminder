/**
 * Unit tests for app/index.tsx — the landing / splash screen (observer).
 *
 * Covers:
 *  - "Continue with email" CTA navigates to /sign-in (router.push).
 *  - Redirect to /home when user.isLoggedIn (rendered with a UserContext
 *    carrying a logged-in User vs the default not-logged-in User).
 *
 * The source calls mobx.configure({ enforceActions: 'observed' }) at module
 * scope — harmless within this suite (jest isolates module registries per
 * file). expo-router is mocked via the shared manual mock (router.push and
 * Redirect are inspectable). reanimated is mocked via the shared manual mock.
 * The MobX User store is real (provided via UserContext.Provider) so the
 * isLoggedIn branch can be exercised.
 *
 * Rendered with raw react-test-renderer + act().
 */
jest.mock('expo-router');
jest.mock('react-native-reanimated');

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type * as TestRendererNS from 'react-test-renderer';
import { TouchableOpacity, Text } from 'react-native';
import SplashScreen from '../index';
import { User, UserContext } from '@/store/user';
import CustomButton from '@/components/CustomButton';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { router, Redirect } = require('expo-router');

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

function render(user?: User) {
  const providerValue = user ?? new User();
  let renderer!: TestRendererNS.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <UserContext.Provider value={providerValue}>
        <SplashScreen />
      </UserContext.Provider>
    );
  });
  return renderer;
}

describe('app/index (SplashScreen)', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('renders the "Continue with email" CTA when the user is not logged in', () => {
    const r = render();
    const buttons = r.root.findAllByType(CustomButton);
    const cta = buttons.find((b) => b.props.title === 'Continue with email');
    expect(cta).toBeTruthy();
  });

  it('navigates to /sign-in when "Continue with email" is pressed', () => {
    const r = render();
    // CustomButton renders a TouchableOpacity with onPress=handlePress. In
    // RN 0.86 TouchableOpacity is a plain function (not memo-wrapped), so
    // findAllByType(TouchableOpacity) finds it directly. We locate the one
    // whose Text subtree contains the CTA label, then invoke its onPress.
    const touchables = r.root.findAllByType(TouchableOpacity);
    const cta = touchables.find((t) => {
      const texts = t
        .findAllByType(Text)
        .flatMap((tt) => extractStrings(tt.props.children));
      return texts.some((s) => s === 'Continue with email');
    });
    if (!cta) throw new Error('"Continue with email" button not found');
    act(() => {
      cta.props.onPress();
    });
    expect(router.push).toHaveBeenCalledWith('/sign-in');
  });

  it('renders a Redirect to /home when the user is logged in', () => {
    const user = new User();
    user.login({
      session: { $id: 'user-1', isLoggedIn: true },
      email: 'a@b.com',
      userName: 'alice',
      avatar: '',
    });
    const r = render(user);
    const redirects = r.root.findAllByType(Redirect);
    expect(redirects).toHaveLength(1);
    expect(redirects[0].props.href).toBe('/home');
  });

  it('does not render the "Continue with email" CTA when the user is logged in', () => {
    const user = new User();
    user.login({
      session: { $id: 'user-1', isLoggedIn: true },
      email: 'a@b.com',
      userName: 'alice',
      avatar: '',
    });
    const r = render(user);
    const cta = r.root
      .findAllByType(CustomButton)
      .find((b) => b.props.title === 'Continue with email');
    expect(cta).toBeUndefined();
  });
});