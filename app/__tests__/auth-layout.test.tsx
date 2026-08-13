/**
 * Unit tests for app/(auth)/_layout.tsx — the auth group Stack layout.
 *
 * Covers: declares three Stack.Screen routes (sign-in, sign-up, reset-pwd)
 * each with headerShown:false, and renders a StatusBar with style "light".
 * expo-router is mocked via the shared manual mock; expo-status-bar is mocked
 * inline to an inspectable component so its props can be asserted.
 */
jest.mock('expo-router');
jest.mock('expo-status-bar');

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AuthLayout from '../(auth)/_layout';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Stack } = require('expo-router');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StatusBar } = require('expo-status-bar');

describe('app/(auth)/_layout', () => {
  it('declares a Stack.Screen for sign-in with headerShown:false', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AuthLayout />);
    });
    const screens = renderer.root.findAllByType(Stack.Screen);
    const signIn = screens.find((s) => s.props.name === 'sign-in');
    expect(signIn).toBeTruthy();
    expect(signIn?.props.options).toEqual({ headerShown: false });
  });

  it('declares a Stack.Screen for sign-up with headerShown:false', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AuthLayout />);
    });
    const screens = renderer.root.findAllByType(Stack.Screen);
    const signUp = screens.find((s) => s.props.name === 'sign-up');
    expect(signUp).toBeTruthy();
    expect(signUp?.props.options).toEqual({ headerShown: false });
  });

  it('declares a Stack.Screen for reset-pwd with headerShown:false', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AuthLayout />);
    });
    const screens = renderer.root.findAllByType(Stack.Screen);
    const resetPwd = screens.find((s) => s.props.name === 'reset-pwd');
    expect(resetPwd).toBeTruthy();
    expect(resetPwd?.props.options).toEqual({ headerShown: false });
  });

  it('declares exactly three Stack.Screen routes', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AuthLayout />);
    });
    const screens = renderer.root.findAllByType(Stack.Screen);
    expect(screens).toHaveLength(3);
    expect(screens.map((s) => s.props.name).sort()).toEqual([
      'reset-pwd',
      'sign-in',
      'sign-up',
    ]);
  });

  it('renders a StatusBar with style "light"', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AuthLayout />);
    });
    const statusBars = renderer.root.findAllByType(StatusBar);
    expect(statusBars).toHaveLength(1);
    expect(statusBars[0].props.style).toBe('light');
  });
});