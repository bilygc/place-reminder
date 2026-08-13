/**
 * Unit tests for components/Table/Table.tsx — an EXPERIMENTAL component that
 * takes a `user` prop shaped like a MobX store with changeEmail/getUser
 * methods (a shape the real store/user doesn't yet expose).
 *
 * The component does NOT crash on render when given a well-formed prop: it
 * receives `user` as props (typed TableUserStoreShape), seeds local email
 * state from user.user.email, and renders a FlatList with the user row plus
 * change-email / get-user Pressables. We test the honest behavior with a
 * complete mock prop (the "store API doesn't exist" concern is about real
 * store integration, not about the component crashing — it renders fine when
 * the prop is satisfied).
 *
 * Covers: renders userName + email, TextInput onChange updates local email
 * state, "Change email" Pressable calls user.user.changeEmail(email), "Get
 * User" Pressable console.logs user.user.getUser.
 *
 * Rendered with raw react-test-renderer + act().
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput, Pressable } from 'react-native';
import Table from '../Table';

interface MockUser {
  email: string;
  userName: string;
  changeEmail: jest.Mock;
  getUser: unknown;
}

/**
 * Build the INNER user object. The component's props are typed
 * TableUserStoreShape = { user: { email, userName, changeEmail, getUser } },
 * so the `user` prop we pass IS this inner object (props.user === this).
 */
function makeUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    email: 'a@b.com',
    userName: 'alice',
    changeEmail: jest.fn(),
    getUser: 'mock-user-data',
    ...overrides,
  };
}

function render(user: MockUser) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Table user={user} />);
  });
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

/** Find a Pressable whose descendant Text children include `text`. */
function findPressableByText(
  r: TestRenderer.ReactTestRenderer,
  text: string
): TestRenderer.ReactTestInstance {
  // Pressable is exported as memo(Pressable). In React 19, findAllByType
  // matches fiber.type which is the inner function, not the memo wrapper.
  // So we pass the unwrapped inner component to findAllByType.
  const PressableImpl = (Pressable as any).type;
  const pressables = r.root.findAllByType(PressableImpl);
  const match = pressables.find((p) => {
    const texts = p
      .findAllByType(Text)
      .flatMap((t) => extractStrings(t.props.children));
    return texts.some((s) => s.includes(text));
  });
  if (!match) throw new Error(`No Pressable with text "${text}"`);
  return match;
}

describe('Table', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Use fake timers so VirtualizedList's setTimeout-scheduled
    // _updateCellsToRender doesn't fire after the synchronous test body
    // (which would produce act() warnings). The initial render still
    // renders cells synchronously; only the deferred re-render is suppressed.
    jest.useFakeTimers();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleLogSpy.mockRestore();
    jest.useRealTimers();
  });

  it('renders without crashing when given a well-formed user prop', () => {
    expect(() => render(makeUser())).not.toThrow();
  });

  it('renders the userName and email from the user prop', () => {
    const r = render(makeUser());
    const texts = r.root
      .findAllByType(Text)
      .flatMap((t) => extractStrings(t.props.children));
    expect(texts).toContain('alice');
    expect(texts).toContain('a@b.com');
  });

  it('seeds the local email state from user.user.email', () => {
    const r = render(makeUser({ email: 'seed@x.com' }));
    const input = r.root.findByType(TextInput);
    expect(input.props.value).toBe('seed@x.com');
  });

  it('seeds local email state to empty string when user.user.email is empty', () => {
    const r = render(makeUser({ email: '' }));
    const input = r.root.findByType(TextInput);
    expect(input.props.value).toBe('');
  });

  it('updates the local email state when the TextInput onChange fires', () => {
    const r = render(makeUser());
    const input = r.root.findByType(TextInput);
    expect(input.props.value).toBe('a@b.com');

    act(() => {
      input.props.onChange({ nativeEvent: { text: 'new@x.com' } });
    });

    expect(input.props.value).toBe('new@x.com');
  });

  it('calls user.user.changeEmail with the current local email when "Change email" is pressed', () => {
    const changeEmail = jest.fn();
    const r = render(makeUser({ changeEmail }));
    const input = r.root.findByType(TextInput);

    act(() => {
      input.props.onChange({ nativeEvent: { text: 'updated@x.com' } });
    });

    const changeBtn = findPressableByText(r, 'Change email');
    act(() => {
      changeBtn.props.onPress();
    });

    expect(changeEmail).toHaveBeenCalledWith('updated@x.com');
  });

  it('console.logs user.user.getUser when the "Get User" Pressable is pressed', () => {
    const r = render(makeUser({ getUser: 'special-data' }));
    const getUserBtn = findPressableByText(r, 'Get User');

    act(() => {
      getUserBtn.props.onPress();
    });

    expect(consoleLogSpy).toHaveBeenCalledWith('special-data');
  });
});