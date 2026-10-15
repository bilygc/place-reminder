import React from 'react';
import { Platform } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Marker } from 'react-native-maps';
import MapPicker from '../MapPicker';

jest.mock('react-native-maps');

function render(props: React.ComponentProps<typeof MapPicker>) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MapPicker {...props} />);
  });
  return renderer;
}

describe('MapPicker', () => {
  const originalOS = Platform.OS;

  function setPlatformOS(os: typeof Platform.OS) {
    Object.defineProperty(Platform, 'OS', {
      value: os,
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => {
    setPlatformOS(originalOS);
  });

  it('renders MapView with flex-1 className, absolute-fill style, and default region', () => {
    const r = render({ onConfirm: jest.fn(), onCancel: jest.fn() });
    const map = r.root.findByProps({ testID: 'mock-map-view' });

    expect(map.props.className).toContain('flex-1');
    expect(map.props.style).toEqual({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    });
    expect(map.props.initialRegion).toEqual({
      latitude: 37.78825,
      longitude: -122.4324,
      latitudeDelta: 0.0922,
      longitudeDelta: 0.0421,
    });
  });

  it('renders MapView inside a parent container with explicit flex dimensions', () => {
    const r = render({ onConfirm: jest.fn(), onCancel: jest.fn() });
    const map = r.root.findByProps({ testID: 'mock-map-view' });

    // The host MapView is wrapped by the mocked MapView composite; its parent's
    // parent is the real map container View that owns flex: 1.
    expect(map.parent?.parent?.props.style).toEqual(expect.objectContaining({ flex: 1 }));
    expect(r.root.findByProps({ testID: 'map-picker-root' }).props.style).toEqual(
      expect.objectContaining({ flex: 1 }),
    );
  });

  it('uses Google provider on Android', () => {
    setPlatformOS('android');
    const r = render({ onConfirm: jest.fn(), onCancel: jest.fn() });
    const map = r.root.findByProps({ testID: 'mock-map-view' });

    expect(map.props.provider).toBe('google');
  });

  it('leaves provider undefined on iOS to preserve Apple Maps default', () => {
    setPlatformOS('ios');
    const r = render({ onConfirm: jest.fn(), onCancel: jest.fn() });
    const map = r.root.findByProps({ testID: 'mock-map-view' });

    expect(map.props.provider).toBeUndefined();
  });

  it('drops a Marker when the map is pressed and confirms the pin location', () => {
    const onConfirm = jest.fn();
    const r = render({ onConfirm, onCancel: jest.fn() });
    const map = r.root.findByProps({ testID: 'mock-map-view' });

    act(() => {
      map.props.onPress({ nativeEvent: { coordinate: { latitude: 1, longitude: 2 } } });
    });

    const marker = r.root.findByType(Marker);
    expect(marker.props.coordinate).toEqual({ latitude: 1, longitude: 2 });

    const confirmButton = r.root.findByProps({ title: 'Confirm' });
    expect(confirmButton.props.isLoading).toBe(false);

    act(() => {
      confirmButton.props.handlePress();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      latitude: 1,
      longitude: 2,
      label: null,
      placeId: null,
      source: 'tap',
    });
  });

  it('does not confirm when no pin has been dropped', () => {
    const onConfirm = jest.fn();
    const r = render({ onConfirm, onCancel: jest.fn() });
    const confirmButton = r.root.findByProps({ title: 'Confirm' });

    expect(confirmButton.props.isLoading).toBe(true);

    act(() => {
      confirmButton.props.handlePress();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fires onCancel when the Cancel button is pressed', () => {
    const onCancel = jest.fn();
    const r = render({ onConfirm: jest.fn(), onCancel });
    const cancelButton = r.root.findByProps({ title: 'Cancel' });

    act(() => {
      cancelButton.props.handlePress();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows the user location dot and my-location button', () => {
    const r = render({ onConfirm: jest.fn(), onCancel: jest.fn() });
    const map = r.root.findByProps({ testID: 'mock-map-view' });

    expect(map.props.showsUserLocation).toBe(true);
    expect(map.props.showsMyLocationButton).toBe(true);
  });

  it('renders a web fallback instead of MapView on web', () => {
    setPlatformOS('web');
    const r = render({ onConfirm: jest.fn(), onCancel: jest.fn() });

    expect(() => r.root.findByProps({ testID: 'mock-map-view' })).toThrow();

    const fallbackHeading = r.root.findByProps({
      children: 'Map selection is not available on web.',
    });
    expect(fallbackHeading).toBeTruthy();

    const fallbackSubtext = r.root.findByProps({
      children: 'Please use the iOS or Android app to select a location on the map.',
    });
    expect(fallbackSubtext).toBeTruthy();
  });

  describe('POI tap selection', () => {
    const poiEvent = {
      nativeEvent: {
        placeId: 'p1',
        name: 'Test Mall',
        coordinate: { latitude: 1, longitude: 2 },
      },
    };

    function confirm(r: TestRenderer.ReactTestRenderer) {
      const confirmButton = r.root.findByProps({ title: 'Confirm' });
      act(() => {
        confirmButton.props.handlePress();
      });
    }

    it('selects the POI place via onPoiClick and confirms label/source/placeId', () => {
      const onConfirm = jest.fn();
      const r = render({ onConfirm, onCancel: jest.fn() });
      const map = r.root.findByProps({ testID: 'mock-map-view' });

      expect(map.props.onPoiClick).toBeInstanceOf(Function);

      act(() => {
        map.props.onPoiClick(poiEvent);
      });

      // The pin marker sits on the POI coordinate.
      const marker = r.root.findByType(Marker);
      expect(marker.props.coordinate).toEqual({ latitude: 1, longitude: 2 });

      confirm(r);
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith({
        latitude: 1,
        longitude: 2,
        label: 'Test Mall',
        placeId: 'p1',
        source: 'poi',
      });
    });

    it('ignores the trailing onPress double-fire right after a POI click (Android)', () => {
      const onConfirm = jest.fn();
      const r = render({ onConfirm, onCancel: jest.fn() });
      const map = r.root.findByProps({ testID: 'mock-map-view' });

      act(() => {
        map.props.onPoiClick(poiEvent);
      });
      // The Android backend fires onPress for the same touch immediately after
      // onPoiClick — it must not override the POI pick.
      act(() => {
        map.props.onPress({
          nativeEvent: { coordinate: { latitude: 9, longitude: 9 } },
        });
      });

      const marker = r.root.findByType(Marker);
      expect(marker.props.coordinate).toEqual({ latitude: 1, longitude: 2 });

      confirm(r);
      expect(onConfirm).toHaveBeenCalledWith({
        latitude: 1,
        longitude: 2,
        label: 'Test Mall',
        placeId: 'p1',
        source: 'poi',
      });
    });

    it('clears the POI label when a raw tap arrives after the guard window', () => {
      const nowSpy = jest.spyOn(Date, 'now');
      try {
        let now = 1_000_000;
        nowSpy.mockImplementation(() => now);
        const onConfirm = jest.fn();
        const r = render({ onConfirm, onCancel: jest.fn() });
        const map = r.root.findByProps({ testID: 'mock-map-view' });

        act(() => {
          map.props.onPoiClick(poiEvent);
        });
        // A genuine later tap, beyond the double-fire window.
        now += 1000;
        act(() => {
          map.props.onPress({
            nativeEvent: { coordinate: { latitude: 3, longitude: 4 } },
          });
        });

        confirm(r);
        expect(onConfirm).toHaveBeenCalledWith({
          latitude: 3,
          longitude: 4,
          label: null,
          placeId: null,
          source: 'tap',
        });
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('clears the POI label/placeId when the pin is dragged', () => {
      const onConfirm = jest.fn();
      const r = render({ onConfirm, onCancel: jest.fn() });
      const map = r.root.findByProps({ testID: 'mock-map-view' });

      // Jump past the double-fire window so the drag setup isn't affected.
      const nowSpy = jest.spyOn(Date, 'now');
      try {
        let now = 2_000_000;
        nowSpy.mockImplementation(() => now);
        act(() => {
          map.props.onPoiClick(poiEvent);
        });
        now += 1000;
        act(() => {
          r.root.findByType(Marker).props.onDragEnd({
            nativeEvent: { coordinate: { latitude: 5, longitude: 6 } },
          });
        });
      } finally {
        nowSpy.mockRestore();
      }

      confirm(r);
      expect(onConfirm).toHaveBeenCalledWith({
        latitude: 5,
        longitude: 6,
        label: null,
        placeId: null,
        source: 'drag',
      });
    });
  });
});
