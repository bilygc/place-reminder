/**
 * Shared manual mock for `expo-router`.
 *
 * Opt into it with `jest.mock('expo-router')` (no factory) in any suite that
 * renders an `app/*` screen. Stubs exactly the surface the screens use:
 *   - router (push/replace/back) — assertable jest.fn()s
 *   - Link — renders children inside a Text, preserves `href` on props
 *   - Redirect — renders a Text tagged `expo-redirect-<href>` so presence is
 *     assertable via findAllByType / testID
 *   - Stack / Tabs — render children in a Fragment; Stack.Screen / Tabs.Screen
 *     are distinct named function components that render a Text tagged
 *     `expo-stack-screen-<name>` / `expo-tabs-screen-<name>`, so tests can find
 *     them by type and read `.props.name` / `.props.options` to assert route
 *     configuration
 *   - SplashScreen — preventAutoHideAsync / hideAsync as jest.fn()s
 *   - useLocalSearchParams / useNavigation / usePathname / useRouter — jest.fn()s
 *
 * Manual mocks for node_modules are opt-in in this repo (see the
 * react-native-appwrite mock header), so creating this file does NOT affect
 * suites that don't call jest.mock('expo-router').
 */
const React = require('react');
const { Text } = require('react-native');

const router = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};

function Link({ href, children, ...props }) {
  return React.createElement(Text, { ...props, href }, children);
}

function Redirect({ href }) {
  return React.createElement(
    Text,
    { testID: `expo-redirect-${href}` },
    `Redirect:${href}`
  );
}

function StackScreen({ name, options, ...props }) {
  return React.createElement(
    Text,
    { testID: `expo-stack-screen-${name}` },
    `stack-screen:${name}`
  );
}

function TabsScreen({ name, options, ...props }) {
  return React.createElement(
    Text,
    { testID: `expo-tabs-screen-${name}` },
    `tabs-screen:${name}`
  );
}

function Stack({ children, ...props }) {
  return React.createElement(React.Fragment, null, children);
}
Stack.Screen = StackScreen;

function Tabs({ children, ...props }) {
  return React.createElement(React.Fragment, null, children);
}
Tabs.Screen = TabsScreen;

const SplashScreen = {
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
};

module.exports = {
  router,
  Link,
  Redirect,
  Stack,
  Tabs,
  SplashScreen,
  useLocalSearchParams: jest.fn(() => ({})),
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    goBack: jest.fn(),
  })),
  usePathname: jest.fn(() => '/'),
  useRouter: jest.fn(() => router),
  useSegments: jest.fn(() => []),
  useFocusEffect: jest.fn((cb) => (typeof cb === 'function' ? cb() : undefined)),
};