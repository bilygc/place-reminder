/**
 * Shared manual mock for `react-native-reanimated`.
 *
 * Opt into it with `jest.mock('react-native-reanimated')` (no factory) in any
 * suite that renders a screen importing reanimated (sign-in, sign-up, index,
 * home). Reanimated v4 pulls in `react-native-worklets` whose native module
 * isn't available under react-test-renderer; this lightweight stub provides
 * just the surface the screens use (Animated.View/Text, useSharedValue,
 * useAnimatedStyle, withTiming/withSequence/withDelay) without loading the
 * real index, so worklets is never reached and no native module is touched.
 *
 * Manual mocks for node_modules are opt-in in this repo (see the
 * expo-router mock header), so creating this file does NOT affect suites
 * that don't call jest.mock('react-native-reanimated').
 */
const React = require('react');
const { View, Text, Animated } = require('react-native');

const NOOP = () => {};
const ID = (v) => v;

const AnimatedNamespace = {
  ...Animated,
  View,
  Text,
  ScrollView: require('react-native').ScrollView,
  createAnimatedComponent: (Component) => Component,
};

module.exports = {
  __esModule: true,
  default: AnimatedNamespace,
  useSharedValue: (init) => ({ value: init }),
  useAnimatedStyle: (cb) => (typeof cb === 'function' ? cb() : {}),
  useAnimatedProps: () => ({}),
  useAnimatedScrollHandler: () => NOOP,
  useAnimatedReaction: NOOP,
  useAnimatedRef: () => ({ current: null }),
  useDerivedValue: (cb) => ({ value: typeof cb === 'function' ? cb() : 0 }),
  withTiming: ID,
  withSpring: ID,
  withSequence: (...vals) => (vals.length ? vals[0] : 0),
  withDelay: (_, val) => val,
  withDecay: ID,
  Easing: { bezier: () => NOOP, ease: NOOP, linear: NOOP },
  runOnJS: ID,
  runOnUI: ID,
  useReducedMotion: () => false,
  interpolate: NOOP,
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
};