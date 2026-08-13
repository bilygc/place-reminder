/**
 * Unit tests for app/(auth)/reset-pwd.tsx — a stub screen that renders the
 * text 'ResetPwd'. Pure React Native, no external deps to mock.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import ResetPwd from '../(auth)/reset-pwd';

describe('app/(auth)/reset-pwd', () => {
  it('renders the "ResetPwd" text', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<ResetPwd />);
    });
    const texts = renderer.root.findAllByType(Text);
    const strings = texts.map((t) => t.props.children);
    expect(strings).toContain('ResetPwd');
  });
});