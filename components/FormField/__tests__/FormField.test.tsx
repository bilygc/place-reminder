/**
 * Unit tests for components/FormField/FormField.tsx.
 *
 * Covers: label renders (when title provided), value/onChangeText pass
 * through to TextInput, and the password-toggle behavior:
 *   - secureTextEntry is true ONLY when title === 'Password' (exact) and the
 *     eye toggle has not been pressed.
 *   - The eye-toggle button is shown for any title matching /password/i
 *     (case-insensitive) — so e.g. title='password' shows the toggle but
 *     secureTextEntry stays false (title !== 'Password'). This mismatch is
 *     documented honestly below.
 *   - Pressing the toggle flips showPassword, which flips secureTextEntry
 *     for title === 'Password'.
 *
 * Rendered with raw react-test-renderer + act().
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity, Image } from 'react-native';
import FormField from '../FormField';

function render(props: React.ComponentProps<typeof FormField>) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<FormField {...props} />);
  });
  return renderer;
}

describe('FormField', () => {
  describe('label', () => {
    it('renders the title text when title is provided', () => {
      const r = render({ title: 'Email', value: '' });
      // The label is the first Text (the title). There may be multiple Text
      // nodes; find the one whose children === 'Email'.
      const texts = r.root.findAllByType(Text);
      const label = texts.find((t) => t.props.children === 'Email');
      expect(label).toBeDefined();
    });

    it('does not render a title Text when title is omitted', () => {
      const r = render({ value: '' });
      const texts = r.root.findAllByType(Text);
      // No title label rendered (only the TextInput, which has no Text children).
      expect(texts.length).toBe(0);
    });
  });

  describe('value / onChangeText pass-through', () => {
    it('passes value to the TextInput', () => {
      const r = render({ title: 'Email', value: 'a@b.com' });
      const input = r.root.findByType(TextInput);
      expect(input.props.value).toBe('a@b.com');
    });

    it('passes handleChangeText to the TextInput and fires it', () => {
      const handleChangeText = jest.fn();
      const r = render({ title: 'Email', value: '', handleChangeText });
      const input = r.root.findByType(TextInput);

      act(() => {
        input.props.onChangeText('new text');
      });

      expect(handleChangeText).toHaveBeenCalledWith('new text');
    });

    it('passes placeholder through', () => {
      const r = render({ title: 'Email', value: '', placeholder: 'Enter email' });
      const input = r.root.findByType(TextInput);
      expect(input.props.placeholder).toBe('Enter email');
    });
  });

  describe('password toggle', () => {
    it('sets secureTextEntry=true initially when title is exactly "Password"', () => {
      const r = render({ title: 'Password', value: '' });
      const input = r.root.findByType(TextInput);
      expect(input.props.secureTextEntry).toBe(true);
    });

    it('shows the eye-toggle button when title matches /password/i', () => {
      const r = render({ title: 'Password', value: '' });
      // The toggle is a TouchableOpacity wrapping an Image.
      const toggle = r.root.findByType(TouchableOpacity);
      expect(toggle).toBeDefined();
      const img = r.root.findByType(Image);
      expect(img).toBeDefined();
    });

    it('flips secureTextEntry to false when the eye toggle is pressed (title "Password")', () => {
      const r = render({ title: 'Password', value: '' });
      const input = r.root.findByType(TextInput);
      const toggle = r.root.findByType(TouchableOpacity);

      expect(input.props.secureTextEntry).toBe(true);

      act(() => {
        toggle.props.onPress();
      });

      expect(input.props.secureTextEntry).toBe(false);

      // Press again -> back to hidden.
      act(() => {
        toggle.props.onPress();
      });
      expect(input.props.secureTextEntry).toBe(true);
    });

    it('swaps the eye icon source between eyeHide and eye on toggle', () => {
      const r = render({ title: 'Password', value: '' });
      const img = r.root.findByType(Image);
      const toggle = r.root.findByType(TouchableOpacity);

      // Initially hidden -> shows the "eye" icon (showPassword ? eye : eyeHide).
      const firstSource = img.props.source;

      act(() => {
        toggle.props.onPress();
      });

      const secondSource = img.props.source;
      expect(secondSource).not.toBe(firstSource);
    });

    it('does NOT set secureTextEntry when title is a non-Password field (e.g. "Email")', () => {
      const r = render({ title: 'Email', value: '' });
      const input = r.root.findByType(TextInput);
      // secureTextEntry is computed as `title === 'Password' && !showPassword`.
      expect(input.props.secureTextEntry).toBe(false);
      // No toggle button for non-password titles.
      expect(() => r.root.findByType(TouchableOpacity)).toThrow();
    });

    it('shows the toggle for a case-insensitive password match but keeps secureTextEntry false (title !== "Password")', () => {
      // Documents the source mismatch: the toggle appears for /password/i,
      // but secureTextEntry only applies to the exact string 'Password'.
      const r = render({ title: 'password', value: '' });
      const input = r.root.findByType(TextInput);
      const toggle = r.root.findByType(TouchableOpacity);

      // Toggle IS rendered (matches /password/i).
      expect(toggle).toBeDefined();
      // But secureTextEntry is false because title !== 'Password'.
      expect(input.props.secureTextEntry).toBe(false);

      // Pressing the toggle flips showPassword but secureTextEntry stays false.
      act(() => {
        toggle.props.onPress();
      });
      expect(input.props.secureTextEntry).toBe(false);
    });
  });
});