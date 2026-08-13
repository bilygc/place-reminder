/**
 * Unit tests for app/+not-found.tsx — the 404 screen.
 *
 * Covers: renders a Stack.Screen with options.title 'Oops!', and a Link whose
 * href is '/' (the home route). expo-router is mocked via the shared manual
 * mock so Stack.Screen / Link are inspectable React components.
 */
jest.mock('expo-router');

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import NotFoundScreen from '../+not-found';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Stack, Link } = require('expo-router');

describe('app/+not-found', () => {
  it('renders a Stack.Screen with title "Oops!"', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<NotFoundScreen />);
    });
    const screens = renderer.root.findAllByType(Stack.Screen);
    expect(screens).toHaveLength(1);
    expect(screens[0].props.options).toEqual({ title: 'Oops!' });
  });

  it('renders a Link pointing to "/"', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<NotFoundScreen />);
    });
    const links = renderer.root.findAllByType(Link);
    expect(links).toHaveLength(1);
    expect(links[0].props.href).toBe('/');
  });
});