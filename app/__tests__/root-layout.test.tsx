/**
 * Unit tests for app/_layout.tsx — the root layout.
 *
 * Covers:
 *  - SplashScreen.preventAutoHideAsync is called at module scope.
 *  - When fonts are loading (useFonts returns [false, undefined]) the layout
 *    returns null (renders nothing).
 *  - When fonts are loaded (useFonts returns [true, undefined]) the layout
 *    renders a Stack with three Stack.Screen routes (index, (auth), (tabs)),
 *    each with headerShown:false, and calls SplashScreen.hideAsync.
 *
 * expo-font is mocked so useFonts is a controllable jest.fn(). expo-router is
 * mocked via the shared manual mock (Stack / SplashScreen are inspectable).
 * components/Auth and components/LocationReminderManager are mocked as
 * passthroughs (render children) so their internal imports (appwrite SDK,
 * expo-location, etc.) are never loaded. The '../global.css' import is handled
 * by the styleMock moduleNameMapper.
 *
 * Rendered with raw react-test-renderer + act().
 */
jest.mock('expo-router');
jest.mock('react-native-reanimated');
jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, undefined]),
}));
jest.mock('@/components/Auth', () => ({
  Auth: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/components/LocationReminderManager/LocationReminderManager', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type * as TestRendererNS from 'react-test-renderer';
import RootLayout from '../_layout';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Stack, SplashScreen } = require('expo-router');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useFonts } = require('expo-font');

function render() {
  let renderer!: TestRendererNS.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RootLayout />);
  });
  return renderer;
}

describe('app/_layout (RootLayout)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useFonts.mockReturnValue([true, undefined]);
  });

  it('calls SplashScreen.preventAutoHideAsync at module scope', () => {
    // app/_layout.tsx calls SplashScreen.preventAutoHideAsync() at MODULE LOAD
    // (top-level statement). The top-level import in this file ran that call
    // once, but jest.clearAllMocks() in beforeEach wiped the call record. We
    // re-require the layout inside an isolated module registry so the
    // module-scope call re-runs AFTER clearAllMocks, then assert on the
    // SplashScreen instance from that SAME isolated registry.
    let capturedSplash: { preventAutoHideAsync: jest.Mock } | undefined;
    jest.isolateModules(() => {
      require('../_layout');
      capturedSplash = require('expo-router').SplashScreen;
    });
    if (!capturedSplash) {
      throw new Error('SplashScreen not captured from isolated registry');
    }
    expect(capturedSplash.preventAutoHideAsync).toHaveBeenCalled();
  });

  it('returns null while fonts are loading (fontsLoaded=false, no error)', () => {
    useFonts.mockReturnValue([false, undefined]);
    const r = render();
    // No Stack rendered.
    expect(r.root.findAllByType(Stack)).toHaveLength(0);
    // The root has no children (null render).
    expect(r.root.children).toEqual([]);
  });

  it('renders a Stack with three Stack.Screen routes when fonts are loaded', () => {
    const r = render();
    const screens = r.root.findAllByType(Stack.Screen);
    expect(screens).toHaveLength(3);
    expect(screens.map((s) => s.props.name).sort()).toEqual([
      '(auth)',
      '(tabs)',
      'index',
    ]);
  });

  it('sets headerShown:false on each Stack.Screen', () => {
    const r = render();
    const screens = r.root.findAllByType(Stack.Screen);
    for (const s of screens) {
      expect(s.props.options).toEqual({ headerShown: false });
    }
  });

  it('calls SplashScreen.hideAsync once fonts are loaded', () => {
    render();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it('does not call SplashScreen.hideAsync while fonts are still loading', () => {
    useFonts.mockReturnValue([false, undefined]);
    render();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });
});