/**
 * Unit tests for app/(tabs)/_layout.tsx — the tabs layout.
 *
 * Covers: declares a single Tabs.Screen for 'home' with title 'Home' and
 * headerShown:false, the Tabs screenOptions (tabBarShowLabel:false,
 * tabBarActiveTintColor '#FFA001', tabBarInactiveTintColor '#CDCDE0',
 * backgroundColor '#161622'), and that tabBarIcon is a function (the
 * internal TabIcon). expo-router is mocked via the shared manual mock.
 */
jest.mock('expo-router');

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import TabsLayout from '../(tabs)/_layout';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Tabs } = require('expo-router');

describe('app/(tabs)/_layout', () => {
  it('declares exactly one Tabs.Screen named "home"', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TabsLayout />);
    });
    const screens = renderer.root.findAllByType(Tabs.Screen);
    expect(screens).toHaveLength(1);
    expect(screens[0].props.name).toBe('home');
  });

  it('configures the home tab with title "Home" and headerShown:false', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TabsLayout />);
    });
    const screen = renderer.root.findAllByType(Tabs.Screen)[0];
    expect(screen.props.options.title).toBe('Home');
    expect(screen.props.options.headerShown).toBe(false);
  });

  it('provides a tabBarIcon function for the home tab', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TabsLayout />);
    });
    const screen = renderer.root.findAllByType(Tabs.Screen)[0];
    expect(typeof screen.props.options.tabBarIcon).toBe('function');
  });

  it('renders the TabIcon with the home icon and "Home" label when tabBarIcon is invoked', () => {
    // Invoke the tabBarIcon render prop with synthetic args and assert it
    // produces a tree containing the "Home" label text.
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TabsLayout />);
    });
    const screen = renderer.root.findAllByType(Tabs.Screen)[0];
    const TabIconNode = screen.props.options.tabBarIcon({
      color: '#FFA001',
      focused: true,
    });
    let iconRenderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      iconRenderer = TestRenderer.create(TabIconNode);
    });
    const texts = iconRenderer.root
      .findAllByType(require('react-native').Text)
      .map((t) => t.props.children);
    expect(texts).toContain('Home');
  });

  it('sets tabBarShowLabel:false on the Tabs screenOptions', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TabsLayout />);
    });
    // The Tabs component receives screenOptions as a prop. Find the Tabs
    // instance and read its props.
    const tabsInstances = renderer.root.findAllByType(Tabs);
    expect(tabsInstances).toHaveLength(1);
    expect(tabsInstances[0].props.screenOptions.tabBarShowLabel).toBe(false);
  });

  it('sets the active/inactive tint colors on the Tabs screenOptions', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TabsLayout />);
    });
    const tabs = renderer.root.findAllByType(Tabs)[0];
    expect(tabs.props.screenOptions.tabBarActiveTintColor).toBe('#FFA001');
    expect(tabs.props.screenOptions.tabBarInactiveTintColor).toBe('#CDCDE0');
  });

  it('sets the tab bar background color on the Tabs screenOptions', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TabsLayout />);
    });
    const tabs = renderer.root.findAllByType(Tabs)[0];
    expect(tabs.props.screenOptions.tabBarStyle.backgroundColor).toBe('#161622');
  });
});