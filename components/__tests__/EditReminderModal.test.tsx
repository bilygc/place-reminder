/**
 * Unit tests for components/EditReminderModal.tsx (ATO-14 "Edit reminder flow").
 *
 * Covers: pre-fill from the persisted reminder (description + location preview),
 * Save gating on `isDescriptionValid` (disabled while empty/whitespace-only),
 * persistence via `updateReminder` with the location patch, no `active` in the
 * patch, immediate close via `onUpdated`, Cancel discarding with no mutation,
 * failure behavior (inline error, popup stays open, edits preserved for retry),
 * and the shared location-choice UI (current location + MapPicker).
 *
 * `@/lib/reminders`, `@/lib/locationService`, and `react-native-maps` are
 * mocked. Rendered with raw react-test-renderer + act().
 */
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import EditReminderModal from '../EditReminderModal';
import MapPicker from '../MapPicker';
import { FormField } from '@/components/FormField';
import type { Reminder } from '@/lib/appwrite.types';

jest.mock('react-native-maps');
jest.mock('@/lib/reminders', () => ({
  __esModule: true,
  updateReminder: jest.fn(),
}));
jest.mock('@/lib/locationService', () => {
  class LocationPermissionDeniedError extends Error {}
  class LocationUnavailableError extends Error {
    constructor(
      message = 'Location unavailable — make sure location services are enabled'
    ) {
      super(message);
      this.name = 'LocationUnavailableError';
    }
  }
  return {
    __esModule: true,
    default: {
      getState: jest.fn(),
      onLocationUpdate: jest.fn(),
    },
    getCurrentLocationWithLabel: jest.fn(),
    getLabelForCoordinates: jest.fn(async () => null),
    LocationPermissionDeniedError,
    LocationUnavailableError,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { updateReminder } = require('@/lib/reminders');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LocationService = require('@/lib/locationService').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCurrentLocationWithLabel } = require('@/lib/locationService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getLabelForCoordinates } = require('@/lib/locationService');

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    $id: 'r1',
    userId: 'user-1',
    description: 'Buy milk',
    latitude: 1.23456,
    longitude: 2.34567,
    locationSource: 'map',
    locationLabel: 'Home',
    active: true,
    $createdAt: '2026-01-01T00:00:00.000Z',
    $updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderModal(props?: {
  reminder?: Reminder;
  onClose?: jest.Mock;
  onUpdated?: jest.Mock;
}) {
  const reminder = props?.reminder ?? makeReminder();
  const onClose = props?.onClose ?? jest.fn();
  const onUpdated = props?.onUpdated ?? jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <EditReminderModal
        visible
        reminder={reminder}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    );
  });
  return { renderer, onClose, onUpdated, reminder };
}

function descriptionField(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByType(FormField);
}

function pressButton(
  renderer: TestRenderer.ReactTestRenderer,
  title: string
) {
  const btn = renderer.root.findByProps({ title });
  act(() => {
    btn.props.handlePress();
  });
}

async function pressButtonAsync(
  renderer: TestRenderer.ReactTestRenderer,
  title: string
) {
  const btn = renderer.root.findByProps({ title });
  await act(async () => {
    await btn.props.handlePress();
  });
}

function saveButton(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ title: 'Save' });
}

function visibleTexts(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).map((t) => {
    const children = t.props.children;
    return Array.isArray(children)
      ? children.map(String).join('')
      : String(children ?? '');
  });
}

describe('EditReminderModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LocationService.getState.mockReturnValue({ location: null });
    LocationService.onLocationUpdate.mockReturnValue(jest.fn());
    getLabelForCoordinates.mockResolvedValue(null);
  });

  describe('pre-fill', () => {
    it('pre-fills the description field from the reminder', () => {
      const { renderer } = renderModal({
        reminder: makeReminder({ description: 'Walk the dog' }),
      });

      expect(descriptionField(renderer).props.value).toBe('Walk the dog');
    });

    it('pre-fills the location preview with the stored label', () => {
      const { renderer } = renderModal({
        reminder: makeReminder({ locationLabel: 'Home' }),
      });

      expect(visibleTexts(renderer)).toContain('Home');
    });

    it('falls back to a lat,lng preview when the stored label is absent', () => {
      const { renderer } = renderModal({
        reminder: makeReminder({
          locationLabel: null,
          latitude: 1.23456,
          longitude: 2.34567,
        }),
      });

      expect(visibleTexts(renderer)).toContain('1.2346, 2.3457');
    });
  });

  describe('save gating', () => {
    it('disables Save when the description is emptied', () => {
      const { renderer } = renderModal();

      act(() => {
        descriptionField(renderer).props.handleChangeText('');
      });

      expect(saveButton(renderer).props.isLoading).toBe(true);
    });

    it('disables Save when the description is whitespace-only', () => {
      const { renderer } = renderModal();

      act(() => {
        descriptionField(renderer).props.handleChangeText('   ');
      });

      expect(saveButton(renderer).props.isLoading).toBe(true);
    });

    it('keeps Save enabled for a valid (trimmed non-empty) description', () => {
      const { renderer } = renderModal();

      act(() => {
        descriptionField(renderer).props.handleChangeText('Buy oat milk');
      });

      expect(saveButton(renderer).props.isLoading).toBe(false);
    });

    it('does not call updateReminder when Save is pressed while invalid', async () => {
      const { renderer } = renderModal();

      act(() => {
        descriptionField(renderer).props.handleChangeText('   ');
      });
      // CustomButton short-circuits presses while isLoading; simulate the
      // platform by not invoking handlePress. Assert the guard directly.
      expect(saveButton(renderer).props.isLoading).toBe(true);
      expect(updateReminder).not.toHaveBeenCalled();
    });
  });

  describe('save persistence', () => {
    it('persists description + location via updateReminder and reports the result', async () => {
      const updated = makeReminder({ description: 'Buy oat milk' });
      (updateReminder as jest.Mock).mockResolvedValue(updated);
      const { renderer, onUpdated, onClose } = renderModal();

      act(() => {
        descriptionField(renderer).props.handleChangeText('Buy oat milk');
      });
      await pressButtonAsync(renderer, 'Save');

      expect(updateReminder).toHaveBeenCalledTimes(1);
      expect(updateReminder).toHaveBeenCalledWith('r1', {
        description: 'Buy oat milk',
        latitude: 1.23456,
        longitude: 2.34567,
        locationSource: 'map',
        locationLabel: 'Home',
      });
      expect(onUpdated).toHaveBeenCalledWith(updated);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('never includes an `active` key in the update patch', async () => {
      (updateReminder as jest.Mock).mockResolvedValue(makeReminder());
      const { renderer } = renderModal();

      await pressButtonAsync(renderer, 'Save');

      const patch = (updateReminder as jest.Mock).mock.calls[0][1];
      expect(Object.keys(patch)).not.toContain('active');
    });

    it('sends an empty label when a map pin replaces a previously-labelled location', async () => {
      (updateReminder as jest.Mock).mockResolvedValue(makeReminder());
      const { renderer } = renderModal({
        reminder: makeReminder({ locationLabel: 'Home', locationSource: 'current' }),
      });

      pressButton(renderer, 'Select on map');
      act(() => {
        renderer.root
          .findByType(MapPicker)
          .props.onConfirm({ latitude: 10, longitude: 20 });
      });
      await pressButtonAsync(renderer, 'Save');

      expect(updateReminder).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          latitude: 10,
          longitude: 20,
          locationSource: 'map',
          locationLabel: '',
        })
      );
    });
  });

  describe('cancel', () => {
    it('calls onClose and performs no mutation', () => {
      const { renderer, onClose, onUpdated } = renderModal();

      act(() => {
        descriptionField(renderer).props.handleChangeText('Changed');
      });
      pressButton(renderer, 'Cancel');

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onUpdated).not.toHaveBeenCalled();
      expect(updateReminder).not.toHaveBeenCalled();
    });
  });

  describe('failure handling', () => {
    it('shows an inline error, keeps the popup open and preserves the edit', async () => {
      (updateReminder as jest.Mock).mockRejectedValue(new Error('boom'));
      const { renderer, onUpdated, onClose } = renderModal();

      act(() => {
        descriptionField(renderer).props.handleChangeText('Edited description');
      });
      await pressButtonAsync(renderer, 'Save');

      expect(visibleTexts(renderer)).toContain(
        'Failed to update reminder. Please try again.'
      );
      // Popup stays open: the Save control is still present, nothing closed.
      expect(renderer.root.findByProps({ title: 'Save' })).toBeTruthy();
      expect(onUpdated).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      // In-progress edit is preserved for retry.
      expect(descriptionField(renderer).props.value).toBe('Edited description');
    });

    it('passes an actionable session-expired message through verbatim', async () => {
      const SESSION_EXPIRED =
        'Cannot update reminder: session expired. Please sign in and try again.';
      (updateReminder as jest.Mock).mockRejectedValue(new Error(SESSION_EXPIRED));
      const { renderer, onUpdated } = renderModal();

      await pressButtonAsync(renderer, 'Save');

      expect(visibleTexts(renderer)).toContain(SESSION_EXPIRED);
      expect(onUpdated).not.toHaveBeenCalled();
    });

    it('recovers when a retry after failure succeeds', async () => {
      (updateReminder as jest.Mock)
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(makeReminder({ description: 'Buy oat milk' }));
      const { renderer, onUpdated } = renderModal();

      act(() => {
        descriptionField(renderer).props.handleChangeText('Buy oat milk');
      });
      await pressButtonAsync(renderer, 'Save');
      expect(visibleTexts(renderer)).toContain(
        'Failed to update reminder. Please try again.'
      );

      await pressButtonAsync(renderer, 'Save');

      expect(updateReminder).toHaveBeenCalledTimes(2);
      expect(onUpdated).toHaveBeenCalledTimes(1);
    });
  });

  describe('no active control', () => {
    it('renders no control referencing the active state', () => {
      const { renderer } = renderModal();
      const texts = visibleTexts(renderer);

      expect(texts).not.toContain('Active');
      expect(texts).not.toContain('ON');
      expect(texts).not.toContain('OFF');
    });
  });

  describe('location choice UI', () => {
    it('updates the preview and source from the current location', async () => {
      getCurrentLocationWithLabel.mockResolvedValue({
        latitude: 5,
        longitude: 6,
        label: 'Work',
      });
      (updateReminder as jest.Mock).mockResolvedValue(makeReminder());
      const { renderer } = renderModal();

      await pressButtonAsync(renderer, 'Use current location');

      expect(visibleTexts(renderer)).toContain('Work');

      await pressButtonAsync(renderer, 'Save');
      expect(updateReminder).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          latitude: 5,
          longitude: 6,
          locationSource: 'current',
          locationLabel: 'Work',
        })
      );
    });

    it('centers the map on the reminder location and confirms a new pin', () => {
      const { renderer } = renderModal({
        reminder: makeReminder({ latitude: 40, longitude: -74, locationLabel: 'NYC' }),
      });

      pressButton(renderer, 'Select on map');

      const map = renderer.root.findByType(MapPicker);
      expect(map.props.initialRegion).toEqual({
        latitude: 40,
        longitude: -74,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      });

      act(() => {
        map.props.onConfirm({ latitude: 3, longitude: 4 });
      });

      expect(visibleTexts(renderer)).toContain('3.0000, 4.0000');
    });

    it('returns to the location view without saving when the map is cancelled', () => {
      const { renderer, onUpdated } = renderModal();

      pressButton(renderer, 'Select on map');
      act(() => {
        renderer.root.findByType(MapPicker).props.onCancel();
      });

      expect(renderer.root.findByProps({ title: 'Save' })).toBeTruthy();
      expect(onUpdated).not.toHaveBeenCalled();
      expect(updateReminder).not.toHaveBeenCalled();
    });

    it('shows the permission-denied message inline when location is denied', async () => {
      const denied = new Error('denied');
      denied.name = 'LocationPermissionDeniedError';
      getCurrentLocationWithLabel.mockRejectedValue(denied);
      const { renderer } = renderModal();

      await pressButtonAsync(renderer, 'Use current location');

      expect(visibleTexts(renderer)).toContain(
        'Location permission denied. Please grant location permission in Settings and try again.'
      );
    });

    it('reverse-geocodes a map pin and saves the label', async () => {
      getLabelForCoordinates.mockResolvedValue('Fancy Mall');
      (updateReminder as jest.Mock).mockResolvedValue(makeReminder());
      const { renderer } = renderModal({
        reminder: makeReminder({ locationLabel: 'Home', locationSource: 'current' }),
      });

      pressButton(renderer, 'Select on map');
      await act(async () => {
        renderer.root
          .findByType(MapPicker)
          .props.onConfirm({ latitude: 10, longitude: 20 });
        await Promise.resolve();
      });

      expect(getLabelForCoordinates).toHaveBeenCalledWith({
        latitude: 10,
        longitude: 20,
      });
      expect(visibleTexts(renderer)).toContain('Fancy Mall');

      await pressButtonAsync(renderer, 'Save');
      expect(updateReminder).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          latitude: 10,
          longitude: 20,
          locationSource: 'map',
          locationLabel: 'Fancy Mall',
        })
      );
    });

    it('sends an empty label when map-pin geocoding rejects (no crash, stale label cleared)', async () => {
      getLabelForCoordinates.mockRejectedValue(new Error('sdk down'));
      (updateReminder as jest.Mock).mockResolvedValue(makeReminder());
      const { renderer } = renderModal({
        reminder: makeReminder({ locationLabel: 'Home', locationSource: 'current' }),
      });

      pressButton(renderer, 'Select on map');
      await act(async () => {
        renderer.root
          .findByType(MapPicker)
          .props.onConfirm({ latitude: 10, longitude: 20 });
        await Promise.resolve();
      });

      // Failure leaves label null: coords fallback in the preview.
      expect(visibleTexts(renderer)).toContain('10.0000, 20.0000');

      await pressButtonAsync(renderer, 'Save');
      expect(updateReminder).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          latitude: 10,
          longitude: 20,
          locationSource: 'map',
          locationLabel: '',
        })
      );
    });
  });

  describe('POI-tap selection', () => {
    it('saves the POI name directly and skips reverse-geocoding', async () => {
      (updateReminder as jest.Mock).mockResolvedValue(makeReminder());
      const { renderer } = renderModal({
        reminder: makeReminder({ locationLabel: 'Home', locationSource: 'current' }),
      });

      pressButton(renderer, 'Select on map');
      await act(async () => {
        renderer.root.findByType(MapPicker).props.onConfirm({
          latitude: 1,
          longitude: 2,
          label: 'Test Mall',
          placeId: 'p1',
          source: 'poi',
        });
        await Promise.resolve();
      });

      expect(getLabelForCoordinates).not.toHaveBeenCalled();
      expect(visibleTexts(renderer)).toContain('Test Mall');

      await pressButtonAsync(renderer, 'Save');
      expect(updateReminder).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          latitude: 1,
          longitude: 2,
          locationSource: 'map',
          locationLabel: 'Test Mall',
        })
      );
      // placeId is transient: never part of the update patch.
      expect(
        (updateReminder as jest.Mock).mock.calls[0][1]
      ).not.toHaveProperty('placeId');
    });

    it('clamps an over-long POI name to 255 characters', async () => {
      (updateReminder as jest.Mock).mockResolvedValue(makeReminder());
      const { renderer } = renderModal();

      pressButton(renderer, 'Select on map');
      await act(async () => {
        renderer.root.findByType(MapPicker).props.onConfirm({
          latitude: 1,
          longitude: 2,
          label: 'M'.repeat(300),
          placeId: 'p1',
          source: 'poi',
        });
        await Promise.resolve();
      });

      await pressButtonAsync(renderer, 'Save');
      const patch = (updateReminder as jest.Mock).mock.calls[0][1];
      expect(patch.locationLabel).toHaveLength(255);
    });

    it('falls back to reverse-geocoding when the POI name is empty', async () => {
      getLabelForCoordinates.mockResolvedValue('Geocoded Place');
      (updateReminder as jest.Mock).mockResolvedValue(makeReminder());
      const { renderer } = renderModal();

      pressButton(renderer, 'Select on map');
      await act(async () => {
        renderer.root.findByType(MapPicker).props.onConfirm({
          latitude: 1,
          longitude: 2,
          label: '',
          placeId: 'p1',
          source: 'poi',
        });
        await Promise.resolve();
      });

      expect(getLabelForCoordinates).toHaveBeenCalledWith({
        latitude: 1,
        longitude: 2,
      });
      expect(visibleTexts(renderer)).toContain('Geocoded Place');
    });

    it('re-geocodes after a drag following a POI pick (stale label cleared)', async () => {
      getLabelForCoordinates.mockResolvedValue(null);
      (updateReminder as jest.Mock).mockResolvedValue(makeReminder());
      const { renderer } = renderModal({
        reminder: makeReminder({ locationLabel: 'Home', locationSource: 'current' }),
      });

      pressButton(renderer, 'Select on map');
      await act(async () => {
        renderer.root.findByType(MapPicker).props.onConfirm({
          latitude: 1,
          longitude: 2,
          label: 'Test Mall',
          placeId: 'p1',
          source: 'poi',
        });
        await Promise.resolve();
      });
      expect(visibleTexts(renderer)).toContain('Test Mall');

      // A later drag clears the POI identity; the geocode path runs again and
      // the save clears the stale label with ''.
      pressButton(renderer, 'Select on map');
      await act(async () => {
        renderer.root.findByType(MapPicker).props.onConfirm({
          latitude: 3,
          longitude: 4,
          label: null,
          placeId: null,
          source: 'drag',
        });
        await Promise.resolve();
      });

      expect(getLabelForCoordinates).toHaveBeenCalledWith({
        latitude: 3,
        longitude: 4,
      });

      await pressButtonAsync(renderer, 'Save');
      expect(updateReminder).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          latitude: 3,
          longitude: 4,
          locationSource: 'map',
          locationLabel: '',
        })
      );
    });
  });
});
