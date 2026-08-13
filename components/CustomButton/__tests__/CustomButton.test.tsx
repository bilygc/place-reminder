/**
 * Unit tests for components/CustomButton/CustomButton.tsx.
 *
 * Covers: title renders, handlePress fires on press, isLoading=true disables
 * the press and applies the dimming className ('opacity-50').
 *
 * Rendered with raw react-test-renderer + act(); element lookups use
 * root.findByType / findByProps.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import CustomButton from '../CustomButton';

function render(props: React.ComponentProps<typeof CustomButton>) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<CustomButton {...props} />);
  });
  return renderer;
}

describe('CustomButton', () => {
  it('renders the title text', () => {
    const r = render({ title: 'Press me', handlePress: jest.fn() });
    const text = r.root.findByType(Text);
    expect(text.props.children).toBe('Press me');
  });

  it('fires handlePress when the TouchableOpacity onPress is invoked', () => {
    const handlePress = jest.fn();
    const r = render({ title: 'Go', handlePress });
    const touch = r.root.findByType(TouchableOpacity);

    act(() => {
      touch.props.onPress();
    });

    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it('is not disabled and has no dimming class when isLoading is false/omitted', () => {
    const r = render({ title: 'Go', handlePress: jest.fn() });
    const touch = r.root.findByType(TouchableOpacity);

    // disabled={isLoading} -> undefined when omitted (falsy, not pressed).
    expect(touch.props.disabled).toBeFalsy();
    expect(touch.props.className).not.toContain('opacity-50');
  });

  it('disables the press and applies opacity-50 when isLoading is true', () => {
    const r = render({ title: 'Go', handlePress: jest.fn(), isLoading: true });
    const touch = r.root.findByType(TouchableOpacity);

    expect(touch.props.disabled).toBe(true);
    expect(touch.props.className).toContain('opacity-50');
    expect(touch.props.className).toContain('cursor-not-allowed');
  });

  it('does not invoke handlePress while isLoading is true (disabled short-circuits)', () => {
    const handlePress = jest.fn();
    const r = render({ title: 'Go', handlePress, isLoading: true });
    const touch = r.root.findByType(TouchableOpacity);

    // The component sets disabled=true; TouchableOpacity ignores presses when
    // disabled, so onPress is never invoked by the platform. We simulate the
    // platform behavior by NOT calling onPress (disabled components don't
    // fire). Assert handlePress stays uncalled and disabled is true.
    expect(touch.props.disabled).toBe(true);
    expect(handlePress).not.toHaveBeenCalled();
  });

  it('passes containerStyles and textStyles through into the className strings', () => {
    const r = render({
      title: 'Go',
      handlePress: jest.fn(),
      containerStyles: 'mt-4',
      textStyles: 'text-white',
    });
    const touch = r.root.findByType(TouchableOpacity);
    const text = r.root.findByType(Text);

    expect(touch.props.className).toContain('mt-4');
    expect(text.props.className).toBe('text-white');
  });
});