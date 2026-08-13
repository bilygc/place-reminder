/**
 * Unit tests for components/LocationReminderExample/LocationReminderExample.tsx
 * — the demo screen that consumes the LocationReminderManager context.
 *
 * The manager module is mocked so useLocationReminders() returns a controlled
 * context (controlled add/remove/get/isInitialized/currentLocation). The real
 * validateRadius util is used (per the batch brief: prefer real util + invalid
 * input to exercise the real branch). CardReminder renders real PNG icons via
 * jest-expo's asset handling.
 *
 * Covers:
 *  - add flow: isInitialized false -> Alert('Location Not Ready');
 *    currentLocation null -> Alert('No Location'); empty reminder text ->
 *    Alert('Empty Reminder').
 *  - validateRadius failure reasons: empty / not-a-number / too-small /
 *    too-large -> the matching Alert.
 *  - successful add -> addLocationReminder called with a LocationCard +
 *    Alert('Reminder Added'); add returns false -> Alert('Error').
 *  - remove flow -> removeLocationReminder called with the id +
 *    Alert('Reminder Removed'); remove returns false -> Alert('Error').
 *
 * Rendered with raw react-test-renderer + act().
 */
jest.mock('../../LocationReminderManager/LocationReminderManager', () => ({
  __esModule: true,
  useLocationReminders: jest.fn(),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import LocationReminderExample from '../LocationReminderExample';
import {
  RADIUS_MIN_METERS,
  RADIUS_MAX_METERS,
} from '@/utils/validateRadius';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useLocationReminders } = require('../../LocationReminderManager/LocationReminderManager');

const sampleLocation = {
  coords: { latitude: 40.7, longitude: -74.0, accuracy: 10 },
  timestamp: 1700000000000,
};

const sampleReminder = {
  $id: 'rem-1',
  at: 'Current Location',
  do: 'Buy milk',
  active: true,
  latitude: 40.7,
  longitude: -74.0,
  radius: 100,
  notifyOnEnter: true,
  notifyOnExit: false,
};

function setContext(overrides: Record<string, unknown> = {}) {
  useLocationReminders.mockReturnValue({
    addLocationReminder: jest.fn().mockResolvedValue(true),
    removeLocationReminder: jest.fn().mockResolvedValue(true),
    getLocationReminders: () => [],
    currentLocation: sampleLocation,
    isInitialized: () => true,
    ...overrides,
  });
}

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<LocationReminderExample />);
  });
  return renderer;
}

/** Find a TouchableOpacity whose descendant Text children include `text`. */
function findButtonByText(
  r: TestRenderer.ReactTestRenderer,
  text: string
): TestRenderer.ReactTestInstance {
  const buttons = r.root.findAllByType(TouchableOpacity);
  const match = buttons.find((b) => {
    const texts = b.findAllByType(Text).map((t) => t.props.children);
    return texts.includes(text);
  });
  if (!match) throw new Error(`No button with text "${text}"`);
  return match;
}

function findInputByPlaceholder(
  r: TestRenderer.ReactTestRenderer,
  placeholder: string
): TestRenderer.ReactTestInstance {
  const inputs = r.root.findAllByType(TextInput);
  const match = inputs.find((i) => i.props.placeholder === placeholder);
  if (!match) throw new Error(`No input with placeholder "${placeholder}"`);
  return match;
}

function setText(r: TestRenderer.ReactTestRenderer, placeholder: string, text: string) {
  const input = findInputByPlaceholder(r, placeholder);
  act(() => {
    input.props.onChangeText(text);
  });
}

function pressButton(r: TestRenderer.ReactTestRenderer, text: string) {
  const btn = findButtonByText(r, text);
  act(() => {
    btn.props.onPress();
  });
}

/** Recursively extract string leaves from a children tree. */
function extractStrings(children: unknown): string[] {
  if (typeof children === 'string') return [children];
  if (typeof children === 'number') return [String(children)];
  if (Array.isArray(children)) return children.flatMap(extractStrings);
  if (children && typeof children === 'object' && 'props' in (children as any)) {
    return extractStrings((children as any).props.children);
  }
  return [];
}

function allText(r: TestRenderer.ReactTestRenderer): string[] {
  return r.root
    .findAllByType(Text)
    .flatMap((t) => extractStrings(t.props.children));
}

describe('LocationReminderExample', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    useLocationReminders.mockReset();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    alertSpy.mockRestore();
  });

  describe('add flow guards', () => {
    it('alerts "Location Not Ready" when isInitialized() is false', () => {
      setContext({ isInitialized: () => false });
      const r = render();
      setText(r, 'What do you want to be reminded of?', 'Buy milk');
      pressButton(r, 'Add Location Reminder');

      expect(alertSpy).toHaveBeenCalledWith(
        'Location Not Ready',
        'Please wait for location services to initialize.'
      );
    });

    it('alerts "No Location" when currentLocation is null', () => {
      setContext({ currentLocation: null });
      const r = render();
      setText(r, 'What do you want to be reminded of?', 'Buy milk');
      pressButton(r, 'Add Location Reminder');

      expect(alertSpy).toHaveBeenCalledWith(
        'No Location',
        'Unable to get your current location. Please try again later.'
      );
    });

    it('alerts "Empty Reminder" when the reminder text is blank', () => {
      setContext();
      const r = render();
      // Leave reminder text empty; radius defaults to '100' (valid).
      pressButton(r, 'Add Location Reminder');

      expect(alertSpy).toHaveBeenCalledWith(
        'Empty Reminder',
        'Please enter a reminder text.'
      );
    });

    it('alerts "Empty Reminder" when the reminder text is whitespace-only', () => {
      setContext();
      const r = render();
      setText(r, 'What do you want to be reminded of?', '   ');
      pressButton(r, 'Add Location Reminder');

      expect(alertSpy).toHaveBeenCalledWith(
        'Empty Reminder',
        'Please enter a reminder text.'
      );
    });
  });

  describe('validateRadius failure reasons', () => {
    // Each test sets a valid reminder text and an invalid radius, then presses
    // Add. The real validateRadius util produces the matching reason.
    function setupWithRadius(radius: string) {
      setContext(); // valid context so we reach the validateRadius check
      const r = render();
      setText(r, 'What do you want to be reminded of?', 'Buy milk');
      setText(r, 'Radius (meters)', radius);
      return r;
    }

    it('alerts "Empty Radius" when the radius is blank', () => {
      const r = setupWithRadius('');
      pressButton(r, 'Add Location Reminder');
      expect(alertSpy).toHaveBeenCalledWith(
        'Empty Radius',
        'Please enter a radius in meters.'
      );
    });

    it('alerts "Invalid Radius" when the radius is not a whole number', () => {
      const r = setupWithRadius('100abc');
      pressButton(r, 'Add Location Reminder');
      expect(alertSpy).toHaveBeenCalledWith(
        'Invalid Radius',
        'Please enter a whole number of meters (e.g. 100).'
      );
    });

    it('alerts "Invalid Radius" for a decimal radius', () => {
      const r = setupWithRadius('12.5');
      pressButton(r, 'Add Location Reminder');
      expect(alertSpy).toHaveBeenCalledWith(
        'Invalid Radius',
        'Please enter a whole number of meters (e.g. 100).'
      );
    });

    it('alerts "Radius Too Small" when below the minimum', () => {
      const r = setupWithRadius(`${RADIUS_MIN_METERS - 1}`);
      pressButton(r, 'Add Location Reminder');
      expect(alertSpy).toHaveBeenCalledWith(
        'Radius Too Small',
        `Radius must be at least ${RADIUS_MIN_METERS} meters.`
      );
    });

    it('alerts "Radius Too Large" when above the maximum', () => {
      const r = setupWithRadius(`${RADIUS_MAX_METERS + 1}`);
      pressButton(r, 'Add Location Reminder');
      expect(alertSpy).toHaveBeenCalledWith(
        'Radius Too Large',
        `Radius must be at most ${RADIUS_MAX_METERS} meters.`
      );
    });
  });

  describe('successful add', () => {
    it('calls addLocationReminder with a LocationCard built from currentLocation and alerts "Reminder Added"', async () => {
      const addLocationReminder = jest.fn().mockResolvedValue(true);
      setContext({ addLocationReminder });
      const r = render();
      setText(r, 'What do you want to be reminded of?', 'Buy milk');
      setText(r, 'Radius (meters)', '150');

      await act(async () => {
        findButtonByText(r, 'Add Location Reminder').props.onPress();
      });

      expect(addLocationReminder).toHaveBeenCalledTimes(1);
      const arg = addLocationReminder.mock.calls[0][0];
      expect(arg.do).toBe('Buy milk');
      expect(arg.at).toBe('Current Location');
      expect(arg.active).toBe(true);
      expect(arg.latitude).toBe(40.7);
      expect(arg.longitude).toBe(-74.0);
      expect(arg.radius).toBe(150);
      expect(arg.notifyOnEnter).toBe(true);
      expect(arg.notifyOnExit).toBe(false);
      expect(arg.$id).toMatch(/^reminder-\d+$/);
      expect(alertSpy).toHaveBeenCalledWith(
        'Reminder Added',
        'Your location-based reminder has been added.'
      );
    });

    it('clears the reminder text after a successful add', async () => {
      const addLocationReminder = jest.fn().mockResolvedValue(true);
      setContext({ addLocationReminder });
      const r = render();
      const input = findInputByPlaceholder(r, 'What do you want to be reminded of?');
      setText(r, 'What do you want to be reminded of?', 'Buy milk');
      expect(input.props.value).toBe('Buy milk');

      await act(async () => {
        findButtonByText(r, 'Add Location Reminder').props.onPress();
      });

      expect(input.props.value).toBe('');
    });

    it('alerts "Error" when addLocationReminder returns false', async () => {
      const addLocationReminder = jest.fn().mockResolvedValue(false);
      setContext({ addLocationReminder });
      const r = render();
      setText(r, 'What do you want to be reminded of?', 'Buy milk');

      await act(async () => {
        findButtonByText(r, 'Add Location Reminder').props.onPress();
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'Error',
        'Failed to add the reminder. Please try again.'
      );
    });
  });

  describe('remove flow', () => {
    it('renders existing reminders with a Remove button and calls removeLocationReminder on press', async () => {
      const removeLocationReminder = jest.fn().mockResolvedValue(true);
      setContext({
        getLocationReminders: () => [sampleReminder],
        removeLocationReminder,
      });
      const r = render();

      await act(async () => {
        findButtonByText(r, 'Remove').props.onPress();
      });

      expect(removeLocationReminder).toHaveBeenCalledWith('rem-1');
      expect(alertSpy).toHaveBeenCalledWith(
        'Reminder Removed',
        'Your location-based reminder has been removed.'
      );
    });

    it('alerts "Error" when removeLocationReminder returns false', async () => {
      const removeLocationReminder = jest.fn().mockResolvedValue(false);
      setContext({
        getLocationReminders: () => [sampleReminder],
        removeLocationReminder,
      });
      const r = render();

      await act(async () => {
        findButtonByText(r, 'Remove').props.onPress();
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'Error',
        'Failed to remove the reminder. Please try again.'
      );
    });
  });

  describe('current location display', () => {
    it('shows the coordinates when currentLocation is present', () => {
      setContext();
      const r = render();
      const texts = allText(r);
      expect(texts.some((s) => s.includes('40.700000'))).toBe(true);
      expect(texts.some((s) => s.includes('-74.000000'))).toBe(true);
    });

    it('shows "Waiting for location..." when currentLocation is null', () => {
      setContext({ currentLocation: null });
      const r = render();
      const texts = allText(r);
      expect(texts).toContain('Waiting for location...');
    });
  });

  describe('empty reminders list', () => {
    it('shows "No location reminders yet." when there are no reminders', () => {
      setContext({ getLocationReminders: () => [] });
      const r = render();
      const texts = allText(r);
      expect(texts).toContain('No location reminders yet.');
    });
  });
});