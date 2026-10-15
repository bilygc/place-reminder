import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import ReminderLocationModal from '../ReminderLocationModal';
import MapPicker from '../MapPicker';

jest.mock('react-native-maps');
jest.mock('@/lib/appwrite', () => ({
  __esModule: true,
  createReminder: jest.fn(),
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
const LocationService = require('@/lib/locationService').default;

const SF_REGION = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

function locationObject(latitude: number, longitude: number) {
  return { coords: { latitude, longitude } };
}

function renderModal() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ReminderLocationModal
        visible
        description="Buy milk"
        userId="user-1"
        onClose={jest.fn()}
        onCreated={jest.fn()}
      />
    );
  });
  return renderer;
}

function openMap(renderer: TestRenderer.ReactTestRenderer) {
  act(() => {
    renderer.root.findByProps({ title: 'Select on map' }).props.handlePress();
  });
}

describe('ReminderLocationModal map initial region', () => {
  beforeEach(() => {
    LocationService.getState.mockReturnValue({ location: null });
    LocationService.onLocationUpdate.mockReturnValue(jest.fn());
  });

  it('centers the map on the cached current location instead of the SF default', () => {
    LocationService.getState.mockReturnValue({
      location: locationObject(10, 20),
    });
    const r = renderModal();
    openMap(r);

    const map = r.root.findByProps({ testID: 'mock-map-view' });
    expect(map.props.initialRegion).toEqual({
      latitude: 10,
      longitude: 20,
      latitudeDelta: 0.0922,
      longitudeDelta: 0.0421,
    });
  });

  it('falls back to the SF default when no current location is cached', () => {
    const r = renderModal();
    openMap(r);

    // undefined initialRegion lets MapPicker fall back to its SF DEFAULT_REGION.
    expect(r.root.findByType(MapPicker).props.initialRegion).toBeUndefined();
    expect(r.root.findByProps({ testID: 'mock-map-view' }).props.initialRegion).toEqual(
      SF_REGION
    );
  });

  it('uses a location that arrives after the modal opened', () => {
    let listener: ((location: unknown) => void) | null = null;
    LocationService.onLocationUpdate.mockImplementation(
      (cb: (location: unknown) => void) => {
        listener = cb;
        return jest.fn();
      }
    );
    const r = renderModal();

    act(() => {
      listener?.(locationObject(30, 40));
    });
    openMap(r);

    expect(r.root.findByProps({ testID: 'mock-map-view' }).props.initialRegion).toEqual({
      latitude: 30,
      longitude: 40,
      latitudeDelta: 0.0922,
      longitudeDelta: 0.0421,
    });
  });
});

describe('ReminderLocationModal createReminder error passthrough', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createReminder } = require('@/lib/appwrite');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getCurrentLocationWithLabel } = require('@/lib/locationService');

  const SESSION_EXPIRED =
    'Cannot create reminder: no active session. Please sign in and try again.';

  function renderModalForCreate(callbacks?: {
    onClose?: jest.Mock;
    onCreated?: jest.Mock;
  }) {
    const onClose = callbacks?.onClose ?? jest.fn();
    const onCreated = callbacks?.onCreated ?? jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ReminderLocationModal
          visible
          description="Buy milk"
          userId="acct-1"
          onClose={onClose}
          onCreated={onCreated}
        />
      );
    });
    return { renderer, onClose, onCreated };
  }

  async function chooseCurrentLocation(
    renderer: TestRenderer.ReactTestRenderer
  ) {
    getCurrentLocationWithLabel.mockResolvedValue({
      latitude: 10,
      longitude: 20,
      label: 'Home',
    });
    await act(async () => {
      await renderer.root
        .findByProps({ title: 'Use current location' })
        .props.handlePress();
    });
  }

  async function pressAddReminder(renderer: TestRenderer.ReactTestRenderer) {
    await act(async () => {
      await renderer.root
        .findByProps({ title: 'Add reminder' })
        .props.handlePress();
    });
  }

  function visibleTexts(renderer: TestRenderer.ReactTestRenderer): string[] {
    return renderer.root.findAllByType(Text).map((t) => {
      const children = t.props.children;
      return Array.isArray(children)
        ? children.map(String).join('')
        : String(children ?? '');
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    LocationService.getState.mockReturnValue({ location: null });
    LocationService.onLocationUpdate.mockReturnValue(jest.fn());
  });

  it('shows the actionable session-expired message and keeps the modal open', async () => {
    createReminder.mockRejectedValue(new Error(SESSION_EXPIRED));
    const { renderer, onCreated, onClose } = renderModalForCreate();

    await chooseCurrentLocation(renderer);
    await pressAddReminder(renderer);

    expect(createReminder).toHaveBeenCalled();
    // The friendly createReminder message passes through verbatim.
    expect(visibleTexts(renderer)).toContain(SESSION_EXPIRED);
    // Retry state is preserved: nothing closed, nothing "created".
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      renderer.root.findByProps({ title: 'Add reminder' })
    ).toBeTruthy();
  });

  it('keeps the generic message for unknown (non-actionable) errors', async () => {
    createReminder.mockRejectedValue(new Error('boom'));
    const { renderer, onCreated } = renderModalForCreate();

    await chooseCurrentLocation(renderer);
    await pressAddReminder(renderer);

    expect(visibleTexts(renderer)).toContain(
      'Failed to create reminder. Please try again.'
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe('ReminderLocationModal map-pin reverse-geocoding', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createReminder } = require('@/lib/appwrite');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getLabelForCoordinates } = require('@/lib/locationService');

  function renderModalForMap() {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ReminderLocationModal
          visible
          description="Buy milk"
          userId="acct-1"
          onClose={jest.fn()}
          onCreated={jest.fn()}
        />
      );
    });
    return renderer;
  }

  async function confirmPin(
    renderer: TestRenderer.ReactTestRenderer,
    coords: { latitude: number; longitude: number }
  ) {
    await act(async () => {
      renderer.root.findByType(MapPicker).props.onConfirm(coords);
      // Flush the background getLabelForCoordinates promise chain.
      await Promise.resolve();
    });
  }

  function visibleTexts(renderer: TestRenderer.ReactTestRenderer): string[] {
    return renderer.root.findAllByType(Text).map((t) => {
      const children = t.props.children;
      return Array.isArray(children)
        ? children.map(String).join('')
        : String(children ?? '');
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    LocationService.getState.mockReturnValue({ location: null });
    LocationService.onLocationUpdate.mockReturnValue(jest.fn());
    getLabelForCoordinates.mockResolvedValue(null);
  });

  it('shows the reverse-geocoded label and saves it with the reminder on success', async () => {
    getLabelForCoordinates.mockResolvedValue('Grand Mall');
    createReminder.mockResolvedValue({ $id: 'r1' });
    const renderer = renderModalForMap();
    openMap(renderer);

    await confirmPin(renderer, { latitude: 10, longitude: 20 });

    expect(getLabelForCoordinates).toHaveBeenCalledWith({
      latitude: 10,
      longitude: 20,
    });
    expect(visibleTexts(renderer)).toContain('Grand Mall');

    await act(async () => {
      await renderer.root
        .findByProps({ title: 'Add reminder' })
        .props.handlePress();
    });

    expect(createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 10,
        longitude: 20,
        locationSource: 'map',
        locationLabel: 'Grand Mall',
      })
    );
  });

  it('falls back to coordinates and omits locationLabel when geocoding returns null', async () => {
    getLabelForCoordinates.mockResolvedValue(null);
    createReminder.mockResolvedValue({ $id: 'r1' });
    const renderer = renderModalForMap();
    openMap(renderer);

    await confirmPin(renderer, { latitude: 10, longitude: 20 });

    expect(visibleTexts(renderer)).toContain('10.0000, 20.0000');

    await act(async () => {
      await renderer.root
        .findByProps({ title: 'Add reminder' })
        .props.handlePress();
    });

    expect(createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 10,
        longitude: 20,
        locationSource: 'map',
      })
    );
    const input = createReminder.mock.calls[0][0];
    expect(input.locationLabel).toBeUndefined();
  });

  it('falls back to coordinates (no crash, no unhandled rejection) when geocoding rejects', async () => {
    getLabelForCoordinates.mockRejectedValue(new Error('sdk down'));
    createReminder.mockResolvedValue({ $id: 'r1' });
    const renderer = renderModalForMap();
    openMap(renderer);

    await confirmPin(renderer, { latitude: 10, longitude: 20 });

    // The rejection is swallowed: preview falls back, creation still works.
    expect(visibleTexts(renderer)).toContain('10.0000, 20.0000');

    await act(async () => {
      await renderer.root
        .findByProps({ title: 'Add reminder' })
        .props.handlePress();
    });

    expect(createReminder).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 10, longitude: 20 })
    );
    expect(createReminder.mock.calls[0][0].locationLabel).toBeUndefined();
  });

  it('ignores a stale geocode result when the user picks another pin meanwhile', async () => {
    let resolveFirst!: (value: string | null) => void;
    const firstPending = new Promise<string | null>((resolve) => {
      resolveFirst = resolve;
    });
    getLabelForCoordinates
      .mockReturnValueOnce(firstPending)
      .mockResolvedValueOnce('Second Place');
    const renderer = renderModalForMap();
    openMap(renderer);

    // First pin: geocode stays pending.
    act(() => {
      renderer.root
        .findByType(MapPicker)
        .props.onConfirm({ latitude: 10, longitude: 20 });
    });
    // Pick a second pin before the first geocode resolves.
    act(() => {
      renderer.root.findByProps({ title: 'Select on map' }).props.handlePress();
    });
    await act(async () => {
      renderer.root
        .findByType(MapPicker)
        .props.onConfirm({ latitude: 30, longitude: 40 });
      await Promise.resolve();
    });
    expect(visibleTexts(renderer)).toContain('Second Place');

    // The stale first result must not overwrite the second pin.
    await act(async () => {
      resolveFirst('First Place');
      await firstPending;
      await Promise.resolve();
    });
    expect(visibleTexts(renderer)).toContain('Second Place');
    expect(visibleTexts(renderer)).not.toContain('First Place');
  });
});

describe('ReminderLocationModal POI-tap selection', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createReminder } = require('@/lib/appwrite');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getLabelForCoordinates } = require('@/lib/locationService');

  function renderModalForMap() {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ReminderLocationModal
          visible
          description="Buy milk"
          userId="acct-1"
          onClose={jest.fn()}
          onCreated={jest.fn()}
        />
      );
    });
    return renderer;
  }

  async function confirmPick(
    renderer: TestRenderer.ReactTestRenderer,
    pick: { latitude: number; longitude: number; label?: string | null; placeId?: string | null; source?: 'poi' | 'tap' | 'drag' }
  ) {
    await act(async () => {
      renderer.root.findByType(MapPicker).props.onConfirm(pick);
      await Promise.resolve();
    });
  }

  function visibleTexts(renderer: TestRenderer.ReactTestRenderer): string[] {
    return renderer.root.findAllByType(Text).map((t) => {
      const children = t.props.children;
      return Array.isArray(children)
        ? children.map(String).join('')
        : String(children ?? '');
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    LocationService.getState.mockReturnValue({ location: null });
    LocationService.onLocationUpdate.mockReturnValue(jest.fn());
    getLabelForCoordinates.mockResolvedValue(null);
  });

  it('saves the POI name directly and skips reverse-geocoding', async () => {
    createReminder.mockResolvedValue({ $id: 'r1' });
    const renderer = renderModalForMap();
    openMap(renderer);

    await confirmPick(renderer, {
      latitude: 1,
      longitude: 2,
      label: 'Test Mall',
      placeId: 'p1',
      source: 'poi',
    });

    expect(getLabelForCoordinates).not.toHaveBeenCalled();
    expect(visibleTexts(renderer)).toContain('Test Mall');

    await act(async () => {
      await renderer.root
        .findByProps({ title: 'Add reminder' })
        .props.handlePress();
    });

    expect(createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 1,
        longitude: 2,
        locationSource: 'map',
        locationLabel: 'Test Mall',
      })
    );
    // placeId is transient: never part of the create payload.
    expect(createReminder.mock.calls[0][0]).not.toHaveProperty('placeId');
  });

  it('clamps an over-long POI name to 255 characters', async () => {
    createReminder.mockResolvedValue({ $id: 'r1' });
    const renderer = renderModalForMap();
    openMap(renderer);

    await confirmPick(renderer, {
      latitude: 1,
      longitude: 2,
      label: 'M'.repeat(300),
      placeId: 'p1',
      source: 'poi',
    });

    await act(async () => {
      await renderer.root
        .findByProps({ title: 'Add reminder' })
        .props.handlePress();
    });

    const input = createReminder.mock.calls[0][0];
    expect(input.locationLabel).toHaveLength(255);
  });

  it('falls back to reverse-geocoding when the POI name is empty', async () => {
    getLabelForCoordinates.mockResolvedValue('Geocoded Place');
    createReminder.mockResolvedValue({ $id: 'r1' });
    const renderer = renderModalForMap();
    openMap(renderer);

    await confirmPick(renderer, {
      latitude: 1,
      longitude: 2,
      label: '',
      placeId: 'p1',
      source: 'poi',
    });

    expect(getLabelForCoordinates).toHaveBeenCalledWith({
      latitude: 1,
      longitude: 2,
    });
    expect(visibleTexts(renderer)).toContain('Geocoded Place');
  });

  it('re-geocodes after a drag following a POI pick (no stale label stored)', async () => {
    getLabelForCoordinates.mockResolvedValue(null);
    createReminder.mockResolvedValue({ $id: 'r1' });
    const renderer = renderModalForMap();
    openMap(renderer);

    await confirmPick(renderer, {
      latitude: 1,
      longitude: 2,
      label: 'Test Mall',
      placeId: 'p1',
      source: 'poi',
    });
    expect(visibleTexts(renderer)).toContain('Test Mall');

    // A later drag clears the POI identity; the geocode path runs again.
    act(() => {
      renderer.root.findByProps({ title: 'Select on map' }).props.handlePress();
    });
    await confirmPick(renderer, {
      latitude: 3,
      longitude: 4,
      label: null,
      placeId: null,
      source: 'drag',
    });

    expect(getLabelForCoordinates).toHaveBeenCalledWith({
      latitude: 3,
      longitude: 4,
    });
    expect(visibleTexts(renderer)).toContain('3.0000, 4.0000');

    await act(async () => {
      await renderer.root
        .findByProps({ title: 'Add reminder' })
        .props.handlePress();
    });

    const input = createReminder.mock.calls[0][0];
    expect(input.latitude).toBe(3);
    expect(input.locationLabel).toBeUndefined();
  });
});
