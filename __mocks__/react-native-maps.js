/**
 * Manual Jest mock for `react-native-maps`.
 *
 * Provides dumb React components for MapView and Marker so that suites
 * rendering components that import 'react-native-maps' (e.g. MapPicker,
 * ReminderLocationModal) can render via react-test-renderer without loading
 * the real native module (which requires native linking and Expo config).
 *
 * Opt into this mock with `jest.mock('react-native-maps')` (no factory) in any
 * suite that renders a component importing 'react-native-maps'. Because this file
 * lives in __mocks__/, Jest will automatically resolve that call to this file.
 *
 * MapView and Marker simply render their children inside a host element named
 * 'MapView' / 'Marker' so that tests can query via findByType or inspect props.
 */

const React = require('react');

function MockMapView(props) {
  const { children, testID, onPress, ...rest } = props;
  // Render a plain host element so test-renderer can traverse it.
  // Preserve onPress and other props for test assertions.
  return React.createElement('MapView', { testID: testID || 'mock-map-view', onPress, ...rest }, children);
}

function MockMarker(props) {
  return React.createElement('Marker', props, props.children);
}

function MockCallout(props) {
  return React.createElement('Callout', props, props.children);
}

function MockPolyline(props) {
  return React.createElement('Polyline', props, null);
}

function MockCircle(props) {
  return React.createElement('Circle', props, null);
}

module.exports = {
  __esModule: true,
  default: MockMapView,
  MapView: MockMapView,
  Marker: MockMarker,
  Callout: MockCallout,
  Polyline: MockPolyline,
  Circle: MockCircle,
  PROVIDER_GOOGLE: 'google',
  PROVIDER_DEFAULT: 'default',
};
