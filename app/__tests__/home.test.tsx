/**
 * Unit tests for app/(tabs)/home.tsx — the home screen.
 *
 * Covers: the reminder text input state via FormField handleChangeText, the
 * "/My Reminders" list data-binding (listReminders → CardReminder mapping),
 * loading + inline error/retry states, refetch on create and user switch, and
 * the existing modal gating behavior.
 *
 * The DAL is mocked (`@/lib/reminders`) so the real `useAppwrite` hook and the
 * screen's effect wiring are exercised end-to-end. Async fetches are flushed
 * with `flush()` inside act().
 *
 * Fake timers are used (same pattern as components/Table/__tests__/Table.test.tsx)
 * to suppress VirtualizedList's setTimeout-scheduled deferred re-renders that
 * would otherwise produce act() warnings. The initial render still renders
 * cells synchronously; only the deferred re-render is suppressed.
 *
 * react-native-reanimated is mocked via the shared manual mock. No expo-router
 * mock is needed (home.tsx does not import it).
 *
 * Rendered with raw react-test-renderer + act().
 */
jest.mock('react-native-reanimated');
jest.mock('@/lib/reminders', () => ({
  __esModule: true,
  listReminders: jest.fn(),
  updateReminder: jest.fn(),
  toggleReminderActive: jest.fn(),
  deleteReminder: jest.fn(),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { FlatList, TouchableOpacity, Image, Text } from 'react-native';
import type * as TestRendererNS from 'react-test-renderer';
import Home from '../(tabs)/home';
import { FormField } from '@/components/FormField';
import CustomButton from '@/components/CustomButton';
import CardReminder from '@/components/CardReminder/CardReminder';
import ReminderLocationModal from '@/components/ReminderLocationModal';
import EditReminderModal from '@/components/EditReminderModal';
import { User, UserContext } from '@/store/user';
import icons from '@/constants/icons';
import type { Reminder } from '@/lib/appwrite.types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listReminders, toggleReminderActive, deleteReminder } = require('@/lib/reminders');

type ListRemindersMock = jest.Mock<Promise<Reminder[]>, []>;
type ToggleActiveMock = jest.Mock<Promise<Reminder>, [string, boolean]>;
type DeleteReminderMock = jest.Mock<Promise<unknown>, [string]>;

function makeReminder(
  overrides: Partial<Reminder> & { $id: string }
): Reminder {
  return {
    userId: 'user-1',
    description: 'Buy milk',
    latitude: 1.23456,
    longitude: 2.34567,
    locationSource: 'map',
    locationLabel: 'Home',
    active: true,
    $createdAt: '2024-01-01T00:00:00.000Z',
    $updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function render() {
  let renderer!: TestRendererNS.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Home />);
  });
  return renderer;
}

function renderAs(user: User) {
  let renderer!: TestRendererNS.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <UserContext.Provider value={user}>
        <Home />
      </UserContext.Provider>
    );
  });
  return renderer;
}

function signedInUser(id = 'user-1'): User {
  const user = new User();
  user.login({
    session: { $id: id, isLoggedIn: true },
    email: `${id}@example.com`,
    userName: id,
    avatar: '',
  });
  return user;
}

/** Flush in-flight microtasks so a resolved/rejected fetch applies. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function typeValidReminder(renderer: TestRendererNS.ReactTestRenderer) {
  act(() => {
    renderer.root.findByType(FormField).props.handleChangeText('Buy milk');
  });
}

function pressAddReminder(renderer: TestRendererNS.ReactTestRenderer) {
  const btn = renderer.root
    .findAllByType(CustomButton)
    .find((b) => b.props.title === 'Add reminder');
  act(() => {
    btn?.props.handlePress();
  });
}

function findRetry(renderer: TestRendererNS.ReactTestRenderer) {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .find((t) => t.props.testID === 'reminders-retry');
}

function allText(renderer: TestRendererNS.ReactTestRenderer): string[] {
  const extract = (children: unknown): string[] => {
    if (typeof children === 'string') return [children];
    if (typeof children === 'number') return [String(children)];
    if (Array.isArray(children)) return children.flatMap(extract);
    if (children && typeof children === 'object' && 'props' in (children as any)) {
      return extract((children as any).props.children);
    }
    return [];
  };
  return renderer.root
    .findAllByType(Text)
    .flatMap((t) => extract(t.props.children));
}

describe('app/(tabs)/home', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    (listReminders as ListRemindersMock).mockReset();
    (listReminders as ListRemindersMock).mockResolvedValue([]);
    (toggleReminderActive as ToggleActiveMock).mockReset();
    (toggleReminderActive as ToggleActiveMock).mockImplementation(
      async (_id: string, active: boolean) =>
        makeReminder({
          $id: _id,
          active,
          $updatedAt: '2026-02-01T00:00:00.000Z',
        })
    );
    (deleteReminder as DeleteReminderMock).mockReset();
    (deleteReminder as DeleteReminderMock).mockResolvedValue(undefined);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  it('renders without crashing', () => {
    expect(() => render()).not.toThrow();
  });

  it('updates the reminder FormField value when handleChangeText fires', () => {
    const r = render();
    const field = r.root.findByType(FormField);
    expect(field.props.value).toBe('');

    act(() => {
      field.props.handleChangeText('Buy milk');
    });

    expect(r.root.findByType(FormField).props.value).toBe('Buy milk');
  });

  describe('input focus stability (header remount regression)', () => {
    // Regression test: the reminder-name TextInput lives inside FlatList's
    // header. If ListHeaderComponent is an inline arrow function, every
    // keystroke (setReminder → re-render) gives FlatList a NEW component
    // type, so React unmounts/remounts the whole header subtree and the
    // TextInput loses focus after every character. The header must be a
    // stable component type receiving fresh values via props instead.
    const headerTypeOf = (header: unknown): unknown =>
      header !== null &&
      typeof header === 'object' &&
      '$$typeof' in (header as Record<string, unknown>)
        ? (header as { type: unknown }).type
        : header;

    it('does NOT remount the FormField when its value changes', () => {
      const r = render();
      const before = r.root.findByType(FormField);

      act(() => {
        before.props.handleChangeText('B');
      });
      act(() => {
        r.root.findByType(FormField).props.handleChangeText('Bu');
      });

      const after = r.root.findByType(FormField);
      expect(after.props.value).toBe('Bu');
      // Compare by boolean (not toBe on instances) so a failure prints
      // true/false instead of trying to serialize an unmounted node.
      expect(after === (before as unknown)).toBe(true);
    });

    it('keeps a stable ListHeaderComponent/ListEmptyComponent type across renders', () => {
      const r = render();
      const flatList = () => r.root.findByType(FlatList);
      const headerBefore = headerTypeOf(flatList().props.ListHeaderComponent);
      const emptyBefore = headerTypeOf(flatList().props.ListEmptyComponent);

      act(() => {
        r.root.findByType(FormField).props.handleChangeText('Buy milk');
      });

      const headerAfter = headerTypeOf(flatList().props.ListHeaderComponent);
      const emptyAfter = headerTypeOf(flatList().props.ListEmptyComponent);
      expect(headerAfter).toBe(headerBefore);
      expect(emptyAfter).toBe(emptyBefore);
    });
  });

  it('renders an "Add reminder" CustomButton', () => {
    const r = render();
    const btn = r.root
      .findAllByType(CustomButton)
      .find((b) => b.props.title === 'Add reminder');
    expect(btn).toBeTruthy();
  });

  it('renders a mic TouchableOpacity with the mic icon source', () => {
    const r = render();
    const touchables = r.root.findAllByType(TouchableOpacity);
    const micBtn = touchables.find((t) => {
      const imgs = t.findAllByType(Image);
      return imgs.some((img) => img.props.source === icons.mic);
    });
    expect(micBtn).toBeTruthy();
  });

  describe('reminder list', () => {
    it('does not fetch when signed out', () => {
      const r = render();
      expect(listReminders).not.toHaveBeenCalled();
      expect(r.root.findAllByType(CardReminder)).toHaveLength(0);
    });

    it('fetches the current user reminders and renders one card each, newest first', async () => {
      const newest = makeReminder({
        $id: 'r-new',
        description: 'Newest',
        $createdAt: '2024-02-01T00:00:00.000Z',
      });
      const oldest = makeReminder({
        $id: 'r-old',
        description: 'Oldest',
        $createdAt: '2024-01-01T00:00:00.000Z',
      });
      (listReminders as ListRemindersMock).mockResolvedValue([newest, oldest]);

      const r = renderAs(signedInUser('user-1'));
      await flush();

      expect(listReminders).toHaveBeenCalledWith();
      const cards = r.root.findAllByType(CardReminder);
      expect(cards).toHaveLength(2);
      expect(cards[0].props.card.$id).toBe('r-new');
      expect(cards[1].props.card.$id).toBe('r-old');
    });

    it('maps locationLabel → At and description → Do', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', locationLabel: 'Home', description: 'Buy milk' }),
      ]);

      const r = renderAs(signedInUser());
      await flush();

      const card = r.root.findByType(CardReminder).props.card;
      expect(card.at).toBe('Home');
      expect(card.do).toBe('Buy milk');
      expect(card.active).toBe(true);
    });

    it('falls back to a lat,lng string when locationLabel is null', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({
          $id: 'r1',
          locationLabel: null,
          latitude: 1.23456,
          longitude: 2.34567,
        }),
      ]);

      const r = renderAs(signedInUser());
      await flush();

      expect(r.root.findByType(CardReminder).props.card.at).toBe(
        '1.2346, 2.3457'
      );
    });

    it('falls back to Unknown location when locationLabel and coords are null', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({
          $id: 'r1',
          locationLabel: null,
          latitude: null as unknown as number,
          longitude: null as unknown as number,
        }),
      ]);

      let r!: TestRendererNS.ReactTestRenderer;
      expect(() => {
        r = renderAs(signedInUser());
      }).not.toThrow();
      await flush();

      expect(r.root.findByType(CardReminder).props.card.at).toBe(
        'Unknown location'
      );
    });

    it('falls back to Unknown location when coords are non-numeric', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({
          $id: 'r1',
          locationLabel: null,
          latitude: NaN,
          longitude: 'oops' as unknown as number,
        }),
      ]);

      let r!: TestRendererNS.ReactTestRenderer;
      expect(() => {
        r = renderAs(signedInUser());
      }).not.toThrow();
      await flush();

      expect(r.root.findByType(CardReminder).props.card.at).toBe(
        'Unknown location'
      );
    });

    it('shows a loading indicator while the initial fetch is in flight', async () => {
      let resolveFetch: (value: Reminder[]) => void = () => {};
      (listReminders as ListRemindersMock).mockReturnValue(
        new Promise<Reminder[]>((resolve) => {
          resolveFetch = resolve;
        })
      );

      const r = renderAs(signedInUser());
      expect(
        r.root.findAllByProps({ testID: 'reminders-loading' }).length
      ).toBeGreaterThan(0);

      await act(async () => {
        resolveFetch([]);
        await Promise.resolve();
      });

      expect(
        r.root.findAllByProps({ testID: 'reminders-loading' })
      ).toHaveLength(0);
    });

    it('shows an inline error with retry and recovers on retry', async () => {
      (listReminders as ListRemindersMock).mockRejectedValueOnce(
        new Error('Failed to list reminders')
      );

      const r = renderAs(signedInUser());
      await flush();

      expect(allText(r)).toContain('Failed to list reminders');
      const retry = findRetry(r);
      expect(retry).toBeTruthy();

      (listReminders as ListRemindersMock).mockResolvedValueOnce([
        makeReminder({ $id: 'r1' }),
      ]);
      await act(async () => {
        retry?.props.onPress();
        await Promise.resolve();
      });
      await flush();

      expect(listReminders).toHaveBeenCalledTimes(2);
      expect(allText(r)).not.toContain('Failed to list reminders');
      expect(r.root.findAllByType(CardReminder)).toHaveLength(1);
    });

    it('refetches the list after a reminder is created', async () => {
      const r = renderAs(signedInUser());
      await flush();
      expect(listReminders).toHaveBeenCalledTimes(1);

      typeValidReminder(r);
      pressAddReminder(r);
      const modal = r.root.findByType(ReminderLocationModal);

      await act(async () => {
        modal.props.onCreated();
        await Promise.resolve();
      });
      await flush();

      expect(listReminders).toHaveBeenCalledTimes(2);
    });

    it('does not leak the previous user rows after switching accounts', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', userId: 'user-1' }),
      ]);

      const r = renderAs(signedInUser('user-1'));
      await flush();
      expect(r.root.findAllByType(CardReminder)).toHaveLength(1);

      // Switch to user-2; the DAL (worst case) still returns user-1 rows for
      // the new call — the screen must filter them out, not show them.
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', userId: 'user-1' }),
      ]);
      const userB = signedInUser('user-2');
      act(() => {
        r.update(
          <UserContext.Provider value={userB}>
            <Home />
          </UserContext.Provider>
        );
      });
      await flush();

      expect(listReminders).toHaveBeenLastCalledWith();
      expect(r.root.findAllByType(CardReminder)).toHaveLength(0);
    });
  });

  describe('location modal gating', () => {
    it('does not open the location modal when signed out, even with a valid description', () => {
      const r = render();
      typeValidReminder(r);
      pressAddReminder(r);

      expect(r.root.findAllByType(ReminderLocationModal)).toHaveLength(0);
    });

    it('opens the location modal with the typed session userId when signed in', async () => {
      const r = renderAs(signedInUser('user-1'));
      await flush();
      typeValidReminder(r);
      pressAddReminder(r);

      const modals = r.root.findAllByType(ReminderLocationModal);
      expect(modals).toHaveLength(1);
      expect(modals[0].props.userId).toBe('user-1');
      expect(modals[0].props.description).toBe('Buy milk');
    });

    it('does not open the location modal when signed in but the description is invalid', async () => {
      const r = renderAs(signedInUser());
      await flush();
      pressAddReminder(r);

      expect(r.root.findAllByType(ReminderLocationModal)).toHaveLength(0);
    });
  });

  describe('card tap targets', () => {
    it('passes callbacks that accept the reminder id', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
      ]);
      const r = renderAs(signedInUser());
      await flush();

      const card = r.root.findByType(CardReminder);
      expect(typeof card.props.onPressBody).toBe('function');
      expect(typeof card.props.onPressBell).toBe('function');
      expect(typeof card.props.onPressTrash).toBe('function');
      expect(() => {
        card.props.onPressTrash('r1');
      }).not.toThrow();
    });

    it('trash opens the delete confirmation — never a one-tap delete or toggle write', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
      ]);
      const r = renderAs(signedInUser());
      await flush();

      act(() => {
        r.root.findByType(CardReminder).props.onPressTrash('r1');
      });
      // Confirmation popup opens; nothing is deleted or toggled yet.
      expect(
        r.root.findAllByProps({ testID: 'delete-confirm-modal' }).length
      ).toBeGreaterThan(0);
      expect(deleteReminder).not.toHaveBeenCalled();
      expect(toggleReminderActive).not.toHaveBeenCalled();
      expect(r.root.findByType(CardReminder).props.card.active).toBe(true);
    });
  });

  describe('bell toggle active/inactive (ATO-15)', () => {
    it('optimistically flips active immediately and persists via toggleReminderActive', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', active: true }),
      ]);
      let resolveToggle!: (value: Reminder) => void;
      (toggleReminderActive as ToggleActiveMock).mockReturnValue(
        new Promise<Reminder>((resolve) => {
          resolveToggle = resolve;
        })
      );
      const r = renderAs(signedInUser());
      await flush();
      expect(r.root.findByType(CardReminder).props.card.active).toBe(true);

      // Tap: UI must flip BEFORE the network resolves (optimistic).
      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      expect(r.root.findByType(CardReminder).props.card.active).toBe(false);
      expect(toggleReminderActive).toHaveBeenCalledTimes(1);
      expect(toggleReminderActive).toHaveBeenLastCalledWith('r1', false);

      await act(async () => {
        resolveToggle(
          makeReminder({
            $id: 'r1',
            active: false,
            $updatedAt: '2026-02-01T00:00:00.000Z',
          })
        );
        await Promise.resolve();
      });
      await flush();
      expect(r.root.findByType(CardReminder).props.card.active).toBe(false);
    });

    it('toggles false → true', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', active: false }),
      ]);
      const r = renderAs(signedInUser());
      await flush();
      expect(r.root.findByType(CardReminder).props.card.active).toBe(false);

      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      expect(r.root.findByType(CardReminder).props.card.active).toBe(true);
      expect(toggleReminderActive).toHaveBeenLastCalledWith('r1', true);

      await flush();
      expect(r.root.findByType(CardReminder).props.card.active).toBe(true);
    });

    it('reverts the UI and shows the inline error when persistence fails (actionable message passes through)', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', active: true }),
      ]);
      (toggleReminderActive as ToggleActiveMock).mockRejectedValueOnce(
        new Error('Cannot update reminder: session expired. Please sign in and try again.')
      );
      const r = renderAs(signedInUser());
      await flush();

      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      // Optimistic flip happens first even though the request will fail.
      expect(r.root.findByType(CardReminder).props.card.active).toBe(false);

      await flush();

      // Reverted to the previous state, with the actionable message inline.
      expect(r.root.findByType(CardReminder).props.card.active).toBe(true);
      const errors = r.root.findAllByProps({ testID: 'toggle-reminder-error' });
      expect(errors.length).toBeGreaterThan(0);
      const extract = (children: unknown): string => {
        if (typeof children === 'string') return children;
        if (Array.isArray(children)) return children.map(extract).join('');
        if (
          children &&
          typeof children === 'object' &&
          'props' in (children as Record<string, unknown>)
        ) {
          return extract(
            (children as { props: { children: unknown } }).props.children
          );
        }
        return '';
      };
      const text = errors.map((e) => extract(e.props.children)).join(' ');
      expect(text).toContain('Cannot update reminder:');
    });

    it('shows a generic inline error and reverts when persistence fails with an unknown error', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', active: true }),
      ]);
      (toggleReminderActive as ToggleActiveMock).mockRejectedValueOnce(
        new Error('boom')
      );
      const r = renderAs(signedInUser());
      await flush();

      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      await flush();

      expect(r.root.findByType(CardReminder).props.card.active).toBe(true);
      expect(
        r.root.findAllByProps({ testID: 'toggle-reminder-error' }).length
      ).toBeGreaterThan(0);
    });

    it('does NOT open any confirmation or the edit popup from the bell', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', active: true }),
      ]);
      const r = renderAs(signedInUser());
      await flush();

      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      await flush();

      expect(r.root.findAllByType(EditReminderModal)).toHaveLength(0);
    });

    it('rapid double-tap ends with the last requested state persisted (last-write-wins)', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', active: true }),
      ]);
      const calls: boolean[] = [];
      let firstResolve!: (value: Reminder) => void;
      (toggleReminderActive as ToggleActiveMock).mockImplementationOnce(
        () =>
          new Promise<Reminder>((resolve) => {
            firstResolve = resolve;
          })
      );
      (toggleReminderActive as ToggleActiveMock).mockImplementation(
        async (_id: string, active: boolean) => {
          calls.push(active);
          return makeReminder({
            $id: _id,
            active,
            $updatedAt: '2026-02-01T00:00:00.000Z',
          });
        }
      );
      const r = renderAs(signedInUser());
      await flush();

      // First tap: true → false (in-flight, held open).
      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      expect(r.root.findByType(CardReminder).props.card.active).toBe(false);

      // Second tap before the first resolves: false → true.
      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      expect(r.root.findByType(CardReminder).props.card.active).toBe(true);

      // Resolve the first request with the stale intermediate value; the
      // chase must follow up with the last requested value (true).
      await act(async () => {
        firstResolve(
          makeReminder({
            $id: 'r1',
            active: false,
            $updatedAt: '2026-02-01T00:00:00.000Z',
          })
        );
        await Promise.resolve();
      });
      await flush();

      expect(r.root.findByType(CardReminder).props.card.active).toBe(true);
      const persistedValues = (
        toggleReminderActive as ToggleActiveMock
      ).mock.calls.map((c) => c[1]);
      expect(persistedValues[0]).toBe(false);
      expect(persistedValues[persistedValues.length - 1]).toBe(true);
    });

    it('toggle preserves pending edit fields and edit save preserves a pending toggle', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({
          $id: 'r1',
          description: 'Buy milk',
          locationLabel: 'Home',
          active: true,
        }),
      ]);
      const r = renderAs(signedInUser());
      await flush();

      // Apply a local edit first (description change, still active).
      act(() => {
        r.root.findByType(CardReminder).props.onPressBody('r1');
      });
      const edited = makeReminder({
        $id: 'r1',
        description: 'Buy oat milk',
        locationLabel: 'Home',
        active: true,
        $updatedAt: '2026-01-02T00:00:00.000Z',
      });
      await act(async () => {
        r.root.findByType(EditReminderModal).props.onUpdated(edited);
        await Promise.resolve();
      });

      // Toggle must flip ONLY active, keeping the edited description.
      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      const afterToggle = r.root.findByType(CardReminder).props.card;
      expect(afterToggle.active).toBe(false);
      expect(afterToggle.do).toBe('Buy oat milk');
      await flush();

      // Reverse direction: toggle pending, then an edit save lands — the
      // toggled active value must survive the edit merge.
      let resolveToggle!: (value: Reminder) => void;
      (toggleReminderActive as ToggleActiveMock).mockReturnValueOnce(
        new Promise<Reminder>((resolve) => {
          resolveToggle = resolve;
        })
      );
      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      // r1 is currently false (after the first toggle); this flips to true
      // and holds the request open.
      expect(r.root.findByType(CardReminder).props.card.active).toBe(true);

      const concurrentEdit = makeReminder({
        $id: 'r1',
        description: 'Buy soy milk',
        locationLabel: 'Home',
        active: false,
        $updatedAt: '2026-01-03T00:00:00.000Z',
      });
      await act(async () => {
        // Simulate the edit modal saving while the toggle is in flight by
        // reopening from the body target is not needed — call the merge path
        // via a body-press + onUpdated round trip.
        r.root.findByType(CardReminder).props.onPressBody('r1');
        await Promise.resolve();
      });
      await act(async () => {
        r.root.findByType(EditReminderModal).props.onUpdated(concurrentEdit);
        await Promise.resolve();
      });
      // The pending toggle (true) wins over the stale edit snapshot (false),
      // while the edit's description is kept.
      const merged = r.root.findByType(CardReminder).props.card;
      expect(merged.active).toBe(true);
      expect(merged.do).toBe('Buy soy milk');

      await act(async () => {
        resolveToggle(
          makeReminder({
            $id: 'r1',
            active: true,
            description: 'Buy soy milk',
            locationLabel: 'Home',
            $updatedAt: '2026-02-01T00:00:00.000Z',
          })
        );
        await Promise.resolve();
      });
      await flush();
      const final = r.root.findByType(CardReminder).props.card;
      expect(final.active).toBe(true);
      expect(final.do).toBe('Buy soy milk');
    });

    it('is a no-op for an unknown id', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', active: true }),
      ]);
      const r = renderAs(signedInUser());
      await flush();

      expect(() => {
        r.root.findByType(CardReminder).props.onPressBell('missing');
      }).not.toThrow();
      expect(toggleReminderActive).not.toHaveBeenCalled();
      expect(r.root.findByType(CardReminder).props.card.active).toBe(true);
    });

    it('does not pin a stale active when the device clock is ahead (refetch converges to server)', async () => {
      // A device clock running ahead must never let a local override outrank
      // the server: after the toggle settles, a refetch carrying a NEWER
      // server document wins, even when it disagrees with the toggle.
      jest.setSystemTime(new Date('2100-06-01T00:00:00.000Z'));
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({
          $id: 'r1',
          active: true,
          $updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ]);
      (toggleReminderActive as ToggleActiveMock).mockResolvedValue(
        makeReminder({
          $id: 'r1',
          active: false,
          $updatedAt: '2026-01-02T00:00:00.000Z',
        })
      );
      const r = renderAs(signedInUser());
      await flush();

      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      await flush();
      expect(r.root.findByType(CardReminder).props.card.active).toBe(false);

      // Another writer re-enabled the reminder after our toggle; the server
      // document is newer than the toggle's persisted snapshot.
      (listReminders as ListRemindersMock).mockResolvedValueOnce([
        makeReminder({
          $id: 'r1',
          active: true,
          $updatedAt: '2026-01-03T00:00:00.000Z',
        }),
      ]);
      typeValidReminder(r);
      pressAddReminder(r);
      await act(async () => {
        r.root.findByType(ReminderLocationModal).props.onCreated();
        await Promise.resolve();
      });
      await flush();

      expect(r.root.findByType(CardReminder).props.card.active).toBe(true);
    });

    it('keeps the optimistic flip across a mid-flight refetch, then holds it once settled', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({
          $id: 'r1',
          active: true,
          $updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ]);
      let resolveToggle!: (value: Reminder) => void;
      (toggleReminderActive as ToggleActiveMock).mockReturnValue(
        new Promise<Reminder>((resolve) => {
          resolveToggle = resolve;
        })
      );
      const r = renderAs(signedInUser());
      await flush();

      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      expect(r.root.findByType(CardReminder).props.card.active).toBe(false);

      // A refetch resolving with the same pre-toggle snapshot mid-flight must
      // not flicker the just-applied flip back.
      (listReminders as ListRemindersMock).mockResolvedValueOnce([
        makeReminder({
          $id: 'r1',
          active: true,
          $updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ]);
      typeValidReminder(r);
      pressAddReminder(r);
      await act(async () => {
        r.root.findByType(ReminderLocationModal).props.onCreated();
        await Promise.resolve();
      });
      await flush();
      expect(r.root.findByType(CardReminder).props.card.active).toBe(false);

      await act(async () => {
        resolveToggle(
          makeReminder({
            $id: 'r1',
            active: false,
            $updatedAt: '2026-01-02T00:00:00.000Z',
          })
        );
        await Promise.resolve();
      });
      await flush();
      expect(r.root.findByType(CardReminder).props.card.active).toBe(false);
    });

    it('clears the toggle error and local overrides on account switch', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', active: true }),
      ]);
      (toggleReminderActive as ToggleActiveMock).mockRejectedValueOnce(
        new Error('boom')
      );
      const r = renderAs(signedInUser('user-1'));
      await flush();

      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      await flush();
      expect(
        r.root.findAllByProps({ testID: 'toggle-reminder-error' }).length
      ).toBeGreaterThan(0);

      (listReminders as ListRemindersMock).mockResolvedValue([]);
      act(() => {
        r.update(
          <UserContext.Provider value={signedInUser('user-2')}>
            <Home />
          </UserContext.Provider>
        );
      });
      await flush();

      expect(
        r.root.findAllByProps({ testID: 'toggle-reminder-error' })
      ).toHaveLength(0);
      expect(r.root.findAllByType(CardReminder)).toHaveLength(0);
    });

    it('ignores a stale in-flight toggle result after account switch', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({
          $id: 'r1',
          userId: 'user-1',
          active: true,
          $updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ]);
      let resolveToggle!: (value: Reminder) => void;
      (toggleReminderActive as ToggleActiveMock).mockReturnValue(
        new Promise<Reminder>((resolve) => {
          resolveToggle = resolve;
        })
      );
      const r = renderAs(signedInUser('user-1'));
      await flush();

      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      expect(r.root.findByType(CardReminder).props.card.active).toBe(false);

      // Switch away mid-flight; the late write must be ignored afterwards.
      (listReminders as ListRemindersMock).mockResolvedValue([]);
      act(() => {
        r.update(
          <UserContext.Provider value={signedInUser('user-2')}>
            <Home />
          </UserContext.Provider>
        );
      });
      await flush();

      await act(async () => {
        resolveToggle(
          makeReminder({
            $id: 'r1',
            userId: 'user-1',
            active: false,
            $updatedAt: '2026-01-02T00:00:00.000Z',
          })
        );
        await Promise.resolve();
      });
      await flush();
      expect(
        r.root.findAllByProps({ testID: 'toggle-reminder-error' })
      ).toHaveLength(0);

      // Switch back: the server still says active:true and no stale override
      // may shadow it.
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({
          $id: 'r1',
          userId: 'user-1',
          active: true,
          $updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ]);
      act(() => {
        r.update(
          <UserContext.Provider value={signedInUser('user-1')}>
            <Home />
          </UserContext.Provider>
        );
      });
      await flush();

      expect(r.root.findByType(CardReminder).props.card.active).toBe(true);
    });
  });

  describe('edit reminder flow (ATO-14)', () => {
    it('does not open the edit popup when signed out', () => {
      const r = render();
      expect(r.root.findAllByType(EditReminderModal)).toHaveLength(0);
    });

    it('opens the edit popup pre-filled with the reminder when the body is pressed', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({
          $id: 'r1',
          description: 'Buy milk',
          locationLabel: 'Home',
        }),
      ]);
      const r = renderAs(signedInUser());
      await flush();

      act(() => {
        r.root.findByType(CardReminder).props.onPressBody('r1');
      });

      const modals = r.root.findAllByType(EditReminderModal);
      expect(modals).toHaveLength(1);
      expect(modals[0].props.reminder.$id).toBe('r1');
      expect(modals[0].props.reminder.description).toBe('Buy milk');
      expect(modals[0].props.reminder.locationLabel).toBe('Home');
    });

    it('does NOT open the edit popup from the trash target (it opens the delete confirmation instead)', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
      ]);
      const r = renderAs(signedInUser());
      await flush();

      act(() => {
        r.root.findByType(CardReminder).props.onPressTrash('r1');
      });
      expect(r.root.findAllByType(EditReminderModal)).toHaveLength(0);
      expect(
        r.root.findAllByProps({ testID: 'delete-confirm-modal' }).length
      ).toBeGreaterThan(0);
    });

    it('closes the edit popup on cancel without mutating or refetching', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
      ]);
      const r = renderAs(signedInUser());
      await flush();
      expect(listReminders).toHaveBeenCalledTimes(1);

      act(() => {
        r.root.findByType(CardReminder).props.onPressBody('r1');
      });
      await act(async () => {
        r.root.findByType(EditReminderModal).props.onClose();
        await Promise.resolve();
      });

      expect(r.root.findAllByType(EditReminderModal)).toHaveLength(0);
      expect(listReminders).toHaveBeenCalledTimes(1);
    });

    it('merges the updated reminder into the card without a full refetch', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({
          $id: 'r1',
          description: 'Buy milk',
          locationLabel: 'Home',
        }),
      ]);
      const r = renderAs(signedInUser());
      await flush();
      expect(listReminders).toHaveBeenCalledTimes(1);

      act(() => {
        r.root.findByType(CardReminder).props.onPressBody('r1');
      });

      const updated = makeReminder({
        $id: 'r1',
        description: 'Buy oat milk',
        locationLabel: 'Work',
      });
      await act(async () => {
        r.root.findByType(EditReminderModal).props.onUpdated(updated);
        await Promise.resolve();
      });

      // No refetch — the merge is local.
      expect(listReminders).toHaveBeenCalledTimes(1);
      // Popup closed and the one card reflects the new values immediately.
      expect(r.root.findAllByType(EditReminderModal)).toHaveLength(0);
      const card = r.root.findByType(CardReminder).props.card;
      expect(card.do).toBe('Buy oat milk');
      expect(card.at).toBe('Work');
    });

    it('reopen after save prefills the saved values so a second save cannot revert them', async () => {
      const fetched = makeReminder({
        $id: 'r1',
        description: 'Old description',
        locationLabel: 'Home',
        latitude: 1,
        longitude: 2,
        locationSource: 'map',
        $updatedAt: '2026-01-01T00:00:00.000Z',
      });
      (listReminders as ListRemindersMock).mockResolvedValue([fetched]);
      const r = renderAs(signedInUser());
      await flush();

      // First edit: move location A→B and clear the label.
      act(() => {
        r.root.findByType(CardReminder).props.onPressBody('r1');
      });
      const firstSave = makeReminder({
        $id: 'r1',
        description: 'Old description',
        locationLabel: null,
        latitude: 10,
        longitude: 20,
        locationSource: 'map',
        $updatedAt: '2026-01-02T00:00:00.000Z',
      });
      await act(async () => {
        r.root.findByType(EditReminderModal).props.onUpdated(firstSave);
        await Promise.resolve();
      });

      // Reopen: the popup must prefill the SAVED document, not the stale
      // fetched doc (the bug: reopening from `reminderList` alone).
      act(() => {
        r.root.findByType(CardReminder).props.onPressBody('r1');
      });
      const reopened = r.root.findByType(EditReminderModal).props
        .reminder as Reminder;
      expect(reopened.latitude).toBe(10);
      expect(reopened.longitude).toBe(20);
      expect(reopened.locationLabel).toBeNull();

      // Second edit changes ONLY the description; the full-snapshot save must
      // keep location B, not revert to A (which prefilling from stale data
      // would cause).
      const secondSave = makeReminder({
        ...firstSave,
        description: 'New description',
        $updatedAt: '2026-01-03T00:00:00.000Z',
      });
      await act(async () => {
        r.root.findByType(EditReminderModal).props.onUpdated(secondSave);
        await Promise.resolve();
      });

      const card = r.root.findByType(CardReminder).props.card;
      expect(card.do).toBe('New description');
      // Label cleared → coordinates fallback, NOT the stale "Home".
      expect(card.at).toBe('10.0000, 20.0000');
      // Purely local merge; the stale fetch was never re-read.
      expect(listReminders).toHaveBeenCalledTimes(1);
    });

    it('drops a stale local override when a refetch returns a newer server document', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({
          $id: 'r1',
          description: 'Fetched',
          $updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ]);
      const r = renderAs(signedInUser());
      await flush();

      // Local edit newer than the fetched doc.
      act(() => {
        r.root.findByType(CardReminder).props.onPressBody('r1');
      });
      await act(async () => {
        r.root.findByType(EditReminderModal).props.onUpdated(
          makeReminder({
            $id: 'r1',
            description: 'Local',
            $updatedAt: '2026-01-02T00:00:00.000Z',
          })
        );
        await Promise.resolve();
      });
      expect(r.root.findByType(CardReminder).props.card.do).toBe('Local');

      // A later refetch returns a NEWER server document (edited elsewhere);
      // the stale local override must not shadow it.
      (listReminders as ListRemindersMock).mockResolvedValueOnce([
        makeReminder({
          $id: 'r1',
          description: 'Server newer',
          $updatedAt: '2026-01-05T00:00:00.000Z',
        }),
      ]);
      typeValidReminder(r);
      pressAddReminder(r);
      await act(async () => {
        r.root.findByType(ReminderLocationModal).props.onCreated();
        await Promise.resolve();
      });
      await flush();

      expect(listReminders).toHaveBeenCalledTimes(2);
      expect(r.root.findByType(CardReminder).props.card.do).toBe('Server newer');
    });
  });

  describe('delete reminder flow (ATO-16)', () => {
    function pressTrash(
      renderer: TestRendererNS.ReactTestRenderer,
      id = 'r1'
    ) {
      const card = renderer.root
        .findAllByType(CardReminder)
        .find((c) => c.props.card.$id === id);
      act(() => {
        card?.props.onPressTrash(id);
      });
    }

    function pressPopupButton(
      renderer: TestRendererNS.ReactTestRenderer,
      title: string
    ) {
      const btn = renderer.root
        .findAllByType(CustomButton)
        .find((b) => b.props.title === title);
      act(() => {
        btn?.props.handlePress();
      });
    }

    function popupButton(
      renderer: TestRendererNS.ReactTestRenderer,
      title: string
    ) {
      return renderer.root
        .findAllByType(CustomButton)
        .find((b) => b.props.title === title);
    }

    it('opens the confirmation popup on trash press with zero network calls', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
      ]);
      const r = renderAs(signedInUser());
      await flush();

      pressTrash(r, 'r1');

      expect(
        r.root.findAllByProps({ testID: 'delete-confirm-modal' }).length
      ).toBeGreaterThan(0);
      expect(allText(r)).toContain('Delete this reminder?');
      expect(popupButton(r, 'Confirm')).toBeTruthy();
      expect(popupButton(r, 'Cancel')).toBeTruthy();
      // No delete fired by opening the popup alone.
      expect(deleteReminder).not.toHaveBeenCalled();
    });

    it('cancel closes the popup with zero network calls and leaves the list untouched', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
      ]);
      const r = renderAs(signedInUser());
      await flush();
      expect(listReminders).toHaveBeenCalledTimes(1);

      pressTrash(r, 'r1');
      // NOTE: the RN Modal host duplicates its subtree in the test renderer,
      // so presence is asserted as >0 (closed-state assertions stay exact 0).
      expect(
        r.root.findAllByProps({ testID: 'delete-confirm-modal' }).length
      ).toBeGreaterThan(0);

      pressPopupButton(r, 'Cancel');

      expect(r.root.findAllByProps({ testID: 'delete-confirm-modal' })).toHaveLength(0);
      expect(deleteReminder).not.toHaveBeenCalled();
      expect(listReminders).toHaveBeenCalledTimes(1);
      expect(r.root.findAllByType(CardReminder)).toHaveLength(1);
    });

    it('confirm deletes and removes only that card with no refetch and no duplicates', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', description: 'First' }),
        makeReminder({ $id: 'r2', description: 'Second' }),
      ]);
      const r = renderAs(signedInUser());
      await flush();
      expect(r.root.findAllByType(CardReminder)).toHaveLength(2);

      pressTrash(r, 'r1');
      pressPopupButton(r, 'Confirm');
      await flush();

      expect(deleteReminder).toHaveBeenCalledTimes(1);
      expect(deleteReminder).toHaveBeenLastCalledWith('r1');
      // Pessimistic local removal: popup closed, one card left, no refetch.
      expect(r.root.findAllByProps({ testID: 'delete-confirm-modal' })).toHaveLength(0);
      expect(listReminders).toHaveBeenCalledTimes(1);
      const cards = r.root.findAllByType(CardReminder);
      expect(cards).toHaveLength(1);
      expect(cards[0].props.card.$id).toBe('r2');
    });

    it('keeps the card and shows the actionable error verbatim when delete fails', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
      ]);
      (deleteReminder as DeleteReminderMock).mockRejectedValueOnce(
        new Error(
          'Cannot delete reminder: session expired. Please sign in and try again.'
        )
      );
      const r = renderAs(signedInUser());
      await flush();

      pressTrash(r, 'r1');
      pressPopupButton(r, 'Confirm');
      await flush();

      // Card stays, popup stays open with the pass-through message inline.
      expect(r.root.findAllByType(CardReminder)).toHaveLength(1);
      const errors = r.root.findAllByProps({ testID: 'delete-reminder-error' });
      expect(errors.length).toBeGreaterThan(0);
      expect(allText(r)).toContain(
        'Cannot delete reminder: session expired. Please sign in and try again.'
      );
      expect(listReminders).toHaveBeenCalledTimes(1);
    });

    it('shows a generic inline error when delete fails with an unknown error', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
      ]);
      (deleteReminder as DeleteReminderMock).mockRejectedValueOnce(
        new Error('boom')
      );
      const r = renderAs(signedInUser());
      await flush();

      pressTrash(r, 'r1');
      pressPopupButton(r, 'Confirm');
      await flush();

      expect(r.root.findAllByType(CardReminder)).toHaveLength(1);
      expect(
        r.root.findAllByProps({ testID: 'delete-reminder-error' }).length
      ).toBeGreaterThan(0);
      expect(allText(r)).toContain('Failed to delete reminder. Please try again.');
    });

    it('renders the empty state after deleting the last reminder', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
      ]);
      const r = renderAs(signedInUser());
      await flush();
      expect(r.root.findAllByType(CardReminder)).toHaveLength(1);

      pressTrash(r, 'r1');
      pressPopupButton(r, 'Confirm');
      await flush();

      expect(r.root.findAllByType(CardReminder)).toHaveLength(0);
      expect(allText(r)).toContain('No reminders yet — add one above');
    });

    it('guards double-confirm: one network call, confirm disabled in flight', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
      ]);
      let resolveDelete!: (value: unknown) => void;
      (deleteReminder as DeleteReminderMock).mockReturnValue(
        new Promise<unknown>((resolve) => {
          resolveDelete = resolve;
        })
      );
      const r = renderAs(signedInUser());
      await flush();

      pressTrash(r, 'r1');
      // Two rapid confirms before the first resolves.
      pressPopupButton(r, 'Confirm');
      expect(popupButton(r, 'Confirm')?.props.isLoading).toBe(true);
      pressPopupButton(r, 'Confirm');

      expect(deleteReminder).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveDelete(undefined);
        await Promise.resolve();
      });
      await flush();

      expect(r.root.findAllByType(CardReminder)).toHaveLength(0);
      expect(r.root.findAllByProps({ testID: 'delete-confirm-modal' })).toHaveLength(0);
    });

    it('guards same-tick double-confirm: one network call when invoked twice without re-render', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
      ]);
      let resolveDelete!: (value: unknown) => void;
      (deleteReminder as DeleteReminderMock).mockReturnValue(
        new Promise<unknown>((resolve) => {
          resolveDelete = resolve;
        })
      );
      const r = renderAs(signedInUser());
      await flush();

      pressTrash(r, 'r1');
      // Two invocations from the SAME render closure in one tick: with a
      // state-only guard both would read stale `null` and fire. The
      // synchronous ref must block the second.
      const confirm = popupButton(r, 'Confirm');
      act(() => {
        confirm?.props.handlePress();
        confirm?.props.handlePress();
      });

      expect(deleteReminder).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveDelete(undefined);
        await Promise.resolve();
      });
      await flush();

      expect(deleteReminder).toHaveBeenCalledTimes(1);
      expect(r.root.findAllByType(CardReminder)).toHaveLength(0);
      expect(r.root.findAllByProps({ testID: 'delete-confirm-modal' })).toHaveLength(0);
    });

    it('ignores repeat trash presses for the id while its delete is in flight', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
        makeReminder({ $id: 'r2' }),
      ]);
      let resolveDelete!: (value: unknown) => void;
      (deleteReminder as DeleteReminderMock).mockReturnValue(
        new Promise<unknown>((resolve) => {
          resolveDelete = resolve;
        })
      );
      const r = renderAs(signedInUser());
      await flush();

      pressTrash(r, 'r1');
      pressPopupButton(r, 'Confirm');
      expect(deleteReminder).toHaveBeenCalledTimes(1);

      // Repeat trash taps for the in-flight id fire nothing extra.
      pressTrash(r, 'r1');
      pressTrash(r, 'r1');
      expect(deleteReminder).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveDelete(undefined);
        await Promise.resolve();
      });
      await flush();

      const cards = r.root.findAllByType(CardReminder);
      expect(cards).toHaveLength(1);
      expect(cards[0].props.card.$id).toBe('r2');
    });

    it('clears the delete popup and error on account switch', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1', userId: 'user-1' }),
      ]);
      (deleteReminder as DeleteReminderMock).mockRejectedValueOnce(
        new Error('boom')
      );
      const r = renderAs(signedInUser('user-1'));
      await flush();

      pressTrash(r, 'r1');
      pressPopupButton(r, 'Confirm');
      await flush();
      expect(
        r.root.findAllByProps({ testID: 'delete-reminder-error' }).length
      ).toBeGreaterThan(0);

      (listReminders as ListRemindersMock).mockResolvedValue([]);
      act(() => {
        r.update(
          <UserContext.Provider value={signedInUser('user-2')}>
            <Home />
          </UserContext.Provider>
        );
      });
      await flush();

      expect(r.root.findAllByProps({ testID: 'delete-confirm-modal' })).toHaveLength(0);
      expect(r.root.findAllByProps({ testID: 'delete-reminder-error' })).toHaveLength(0);
    });
  });

  describe('empty state (ATO-17)', () => {
    const EMPTY_COPY = 'No reminders yet — add one above';

    function emptyMarkers(renderer: TestRendererNS.ReactTestRenderer) {
      return renderer.root.findAllByProps({ testID: 'reminders-empty' });
    }

    it('shows the placeholder copy after the initial fetch returns zero results', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([]);
      const r = renderAs(signedInUser());
      await flush();

      expect(r.root.findAllByType(CardReminder)).toHaveLength(0);
      expect(emptyMarkers(r).length).toBeGreaterThan(0);
      expect(allText(r)).toContain(EMPTY_COPY);
    });

    it('does NOT show the empty state while the initial fetch is loading', async () => {
      let resolveFetch: (value: Reminder[]) => void = () => {};
      (listReminders as ListRemindersMock).mockReturnValue(
        new Promise<Reminder[]>((resolve) => {
          resolveFetch = resolve;
        })
      );

      const r = renderAs(signedInUser());
      // Loading spinner is up; the placeholder must not flash alongside it.
      expect(
        r.root.findAllByProps({ testID: 'reminders-loading' }).length
      ).toBeGreaterThan(0);
      expect(emptyMarkers(r)).toHaveLength(0);
      expect(allText(r)).not.toContain(EMPTY_COPY);

      await act(async () => {
        resolveFetch([]);
        await Promise.resolve();
      });
      await flush();

      // After the fetch settles empty, the placeholder appears.
      expect(emptyMarkers(r).length).toBeGreaterThan(0);
      expect(allText(r)).toContain(EMPTY_COPY);
    });

    it('does NOT show the empty state when the fetch fails (error state wins)', async () => {
      (listReminders as ListRemindersMock).mockRejectedValueOnce(
        new Error('Failed to list reminders')
      );

      const r = renderAs(signedInUser());
      await flush();

      expect(allText(r)).toContain('Failed to list reminders');
      expect(emptyMarkers(r)).toHaveLength(0);
      expect(allText(r)).not.toContain(EMPTY_COPY);
    });

    it('transitions from empty to populated when the first reminder is created', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([]);
      const r = renderAs(signedInUser());
      await flush();
      expect(r.root.findAllByType(CardReminder)).toHaveLength(0);
      expect(emptyMarkers(r).length).toBeGreaterThan(0);

      // The create modal's onCreated triggers a refetch that now returns one row.
      (listReminders as ListRemindersMock).mockResolvedValueOnce([
        makeReminder({ $id: 'r1', description: 'First one' }),
      ]);
      typeValidReminder(r);
      pressAddReminder(r);
      await act(async () => {
        r.root.findByType(ReminderLocationModal).props.onCreated();
        await Promise.resolve();
      });
      await flush();

      const cards = r.root.findAllByType(CardReminder);
      expect(cards).toHaveLength(1);
      expect(cards[0].props.card.$id).toBe('r1');
      expect(emptyMarkers(r)).toHaveLength(0);
      expect(allText(r)).not.toContain(EMPTY_COPY);
    });

    it('keeps the Add reminder form visible alongside the empty state', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([]);
      const r = renderAs(signedInUser());
      await flush();

      expect(emptyMarkers(r).length).toBeGreaterThan(0);
      // AC-5: the header form is never replaced by the empty state.
      expect(r.root.findAllByType(FormField)).toHaveLength(1);
      const addBtn = r.root
        .findAllByType(CustomButton)
        .find((b) => b.props.title === 'Add reminder');
      expect(addBtn).toBeTruthy();
      expect(allText(r)).toContain('My Reminders');
    });
  });
});
