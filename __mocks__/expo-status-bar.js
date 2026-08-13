/**
 * Shared manual mock for `expo-status-bar`.
 *
 * Opt into it with `jest.mock('expo-status-bar')` (no factory). The real
 * StatusBar is a native component that renders nothing in the test renderer;
 * this stub renders a Text tagged `expo-status-bar` so tests can find it and
 * assert its props (e.g. style="light").
 *
 * Defined as a manual mock (rather than an inline jest.mock factory) because
 * NativeWind's babel plugin injects a module-scope `_ReactNativeCSSInterop`
 * reference that babel-plugin-jest-hoist rejects as out-of-scope inside an
 * inline factory.
 */
const React = require('react');
const { Text } = require('react-native');

function StatusBar(props) {
  return React.createElement(
    Text,
    { testID: 'expo-status-bar', ...props },
    'StatusBar'
  );
}

module.exports = { StatusBar };