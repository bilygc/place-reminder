/**
 * Unit tests for app/(tabs)/home.tsx — the home screen.
 *
 * Covers: the reminder text input state updates via FormField
 * handleChangeText, the FlatList renders the hardcoded 3-item reminder data
 * (3 CardReminder components), the "Add reminder" CustomButton exists, and the
 * mic TouchableOpacity exists with the mic icon source.
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

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TouchableOpacity, Image } from 'react-native';
import type * as TestRendererNS from 'react-test-renderer';
import Home from '../(tabs)/home';
import { FormField } from '@/components/FormField';
import CustomButton from '@/components/CustomButton';
import CardReminder from '@/components/CardReminder/CardReminder';
import icons from '@/constants/icons';

function render() {
  let renderer!: TestRendererNS.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Home />);
  });
  return renderer;
}

describe('app/(tabs)/home', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
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

  it('renders three CardReminder components from the hardcoded data', () => {
    const r = render();
    const cards = r.root.findAllByType(CardReminder);
    expect(cards).toHaveLength(3);
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
    // The mic button is a TouchableOpacity wrapping an Image with source
    // icons.mic. Find the TouchableOpacity whose Image child has that source.
    // NOTE: In RN 0.86 TouchableOpacity is a plain function component (not
    // memo-wrapped like Pressable), so findAllByType(TouchableOpacity) works
    // directly — (TouchableOpacity as any).type is undefined here.
    const touchables = r.root.findAllByType(TouchableOpacity);
    const micBtn = touchables.find((t) => {
      const imgs = t.findAllByType(Image);
      return imgs.some((img) => img.props.source === icons.mic);
    });
    expect(micBtn).toBeTruthy();
  });
});