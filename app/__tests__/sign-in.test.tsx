/**
 * Unit tests for app/(auth)/sign-in.tsx — the sign-in form screen.
 *
 * Covers: form state (email/password FormField inputs update local state),
 * submit wiring (pressing "Log In" calls signIn with the current email and
 * password via the useAppwrite refetch → fn() chain), loading overlay
 * (GreenLoading renders when isLoading is true, absent when false), error
 * resilience (screen renders without crashing when the hook reports an error),
 * and the two navigation Links ("Forgot password?" → /reset-pwd, "Sign up" →
 * /sign-up).
 *
 * expo-router is mocked via the shared manual mock (Link is inspectable).
 * react-native-reanimated is mocked via the shared manual mock (no native
 * worklet runtime). useAppwrite is mocked with a controllable factory whose
 * refetch invokes the captured fn so the signIn call can be asserted.
 *
 * Rendered with raw react-test-renderer + act().
 */
jest.mock('expo-router');
jest.mock('react-native-reanimated');
jest.mock('@/lib/appwrite', () => ({
  signIn: jest.fn(),
}));
jest.mock('@/hooks/useAppwrite', () => ({
  useAppwrite: jest.fn((fn) => ({
    refetch: () => fn(),
    isLoading: false,
    data: [],
    error: null,
  })),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type * as TestRendererNS from 'react-test-renderer';
import SignIn from '../(auth)/sign-in';
import { FormField } from '@/components/FormField';
import { GreenLoading } from '@/components/Loading/Loading';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Link } = require('expo-router');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signIn } = require('@/lib/appwrite');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useAppwrite } = require('@/hooks/useAppwrite');

let lastRenderer: TestRendererNS.ReactTestRenderer | null = null;

function render() {
  let renderer!: TestRendererNS.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SignIn />);
  });
  lastRenderer = renderer;
  return renderer;
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

function findField(
  r: TestRendererNS.ReactTestRenderer,
  title: string
): TestRendererNS.ReactTestInstance {
  const fields = r.root.findAllByType(FormField);
  const field = fields.find((f) => f.props.title === title);
  if (!field) throw new Error(`No FormField with title "${title}"`);
  return field;
}

function findButton(
  r: TestRendererNS.ReactTestRenderer,
  title: string
): TestRendererNS.ReactTestInstance {
  const buttons = r.root.findAllByType(TouchableOpacity);
  const btn = buttons.find((b) => {
    const texts = b
      .findAllByType(Text)
      .flatMap((t) => extractStrings(t.props.children));
    return texts.some((s) => s.includes(title));
  });
  if (!btn) throw new Error(`No button with title "${title}"`);
  return btn;
}

describe('app/(auth)/sign-in', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // Re-establish the default useAppwrite implementation after clearAllMocks.
    useAppwrite.mockImplementation((fn: any) => ({
      refetch: () => fn(),
      isLoading: false,
      data: [],
      error: null,
    }));
  });

  afterEach(() => {
    if (lastRenderer) {
      act(() => {
        lastRenderer!.unmount();
      });
      lastRenderer = null;
    }
    jest.useRealTimers();
  });

  it('renders without crashing', () => {
    expect(() => render()).not.toThrow();
  });

  it('updates the Email FormField value when its handleChangeText fires', () => {
    const r = render();
    const emailField = findField(r, 'Email');
    expect(emailField.props.value).toBe('');

    act(() => {
      emailField.props.handleChangeText('user@example.com');
    });

    expect(findField(r, 'Email').props.value).toBe('user@example.com');
  });

  it('updates the Password FormField value when its handleChangeText fires', () => {
    const r = render();
    const pwdField = findField(r, 'Password');
    expect(pwdField.props.value).toBe('');

    act(() => {
      pwdField.props.handleChangeText('secret123');
    });

    expect(findField(r, 'Password').props.value).toBe('secret123');
  });

  it('calls signIn with the current email and password when "Log In" is pressed', () => {
    const r = render();
    act(() => {
      findField(r, 'Email').props.handleChangeText('user@example.com');
    });
    act(() => {
      findField(r, 'Password').props.handleChangeText('secret123');
    });

    act(() => {
      findButton(r, 'Log In').props.onPress();
    });

    expect(signIn).toHaveBeenCalledWith('user@example.com', 'secret123');
  });

  it('renders the GreenLoading overlay when isLoading is true', () => {
    useAppwrite.mockImplementation(() => ({
      refetch: jest.fn(),
      isLoading: true,
      data: [],
      error: null,
    }));
    const r = render();
    expect(r.root.findAllByType(GreenLoading)).toHaveLength(1);
  });

  it('does not render the GreenLoading overlay when isLoading is false', () => {
    const r = render();
    expect(r.root.findAllByType(GreenLoading)).toHaveLength(0);
  });

  it('renders without crashing when the hook reports an error', () => {
    useAppwrite.mockImplementation(() => ({
      refetch: jest.fn(),
      isLoading: false,
      data: [],
      error: 'Invalid credentials',
    }));
    expect(() => render()).not.toThrow();
  });

  it('renders a "Forgot password?" Link pointing to /reset-pwd', () => {
    const r = render();
    const links = r.root.findAllByType(Link);
    const forgot = links.find((l: any) => l.props.children === 'Forgot password?');
    if (!forgot) throw new Error('Forgot password? Link not found');
    expect(forgot.props.href).toBe('/reset-pwd');
  });

  it('renders a "Sign up" Link pointing to /sign-up', () => {
    const r = render();
    const links = r.root.findAllByType(Link);
    const signUp = links.find((l: any) =>
      String(l.props.children).includes('Sign up')
    );
    if (!signUp) throw new Error('Sign up Link not found');
    expect(signUp.props.href).toBe('/sign-up');
  });
});