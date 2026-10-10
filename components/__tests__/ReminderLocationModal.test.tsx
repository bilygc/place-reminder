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
