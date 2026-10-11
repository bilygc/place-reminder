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
const { listReminders } = require('@/lib/reminders');

type ListRemindersMock = jest.Mock<Promise<Reminder[]>, []>;

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
        card.props.onPressBell('r1');
        card.props.onPressTrash('r1');
      }).not.toThrow();
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

    it('does NOT open the edit popup from the bell or trash targets', async () => {
      (listReminders as ListRemindersMock).mockResolvedValue([
        makeReminder({ $id: 'r1' }),
      ]);
      const r = renderAs(signedInUser());
      await flush();

      act(() => {
        r.root.findByType(CardReminder).props.onPressBell('r1');
      });
      expect(r.root.findAllByType(EditReminderModal)).toHaveLength(0);

      act(() => {
        r.root.findByType(CardReminder).props.onPressTrash('r1');
      });
      expect(r.root.findAllByType(EditReminderModal)).toHaveLength(0);
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
});
