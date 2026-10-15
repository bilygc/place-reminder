/**
 * Unit tests for components/CardReminder/CardReminder.tsx.
 *
 * Covers: renders the "At"/"Do"/"Active" rows, the active state shown as
 * 'ON'/'OFF', the alert icon source chosen per the active prop (alertOn when
 * active, alertOff when inactive), and the right-side action icons
 * (activate/deactivate + delete) per active state.
 *
 * Also covers the interactive contract added for ATO-13: the body tap target
 * fires onPressBody($id), the top-right bell fires onPressBell($id), the
 * bottom-right trash fires onPressTrash($id), and the LEFT status bell is
 * never pressable. The status bell + Active text both derive from card.active.
 *
 * Icons come from constants/icons.ts (PNG requires) — jest-expo's asset
 * handling resolves these to a number (require result), so we assert the
 * source identity against the imported icons module rather than a literal.
 *
 * Rendered with raw react-test-renderer + act().
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, Image, Pressable, View } from 'react-native';
import CardReminder from '../CardReminder';
import type { Card, CardProps } from '../CardReminder.types';
import icons from '@/constants/icons';

function render(props: CardProps) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<CardReminder {...props} />);
  });
  return renderer;
}

const activeCard: Card = { $id: 'r1', at: 'Home', do: 'Buy milk', active: true };
const inactiveCard: Card = { $id: 'r2', at: 'Work', do: 'Send report', active: false };

/**
 * Pressable is exported as memo(Pressable); in React 19 findAllByType matches
 * the inner fiber type, so unwrap the memo first (same pattern as Table tests).
 */
function findAllPressables(r: TestRenderer.ReactTestRenderer) {
  const PressableImpl = (Pressable as any).type;
  return r.root.findAllByType(PressableImpl);
}

function findPressableByTestId(
  r: TestRenderer.ReactTestRenderer,
  testID: string
) {
  const match = findAllPressables(r).find((p) => p.props.testID === testID);
  if (!match) throw new Error(`No Pressable with testID "${testID}"`);
  return match;
}

/** Recursively extract string leaves from a children tree (strings, numbers,
 *  arrays, and React elements with their own children). */
function extractStrings(children: unknown): string[] {
  if (typeof children === 'string') return [children];
  if (typeof children === 'number') return [String(children)];
  if (Array.isArray(children)) return children.flatMap(extractStrings);
  if (children && typeof children === 'object' && 'props' in (children as any)) {
    return extractStrings((children as any).props.children);
  }
  return [];
}

/** Collect all string children from every Text node in the rendered tree. */
function allText(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .flatMap((t) => extractStrings(t.props.children));
}

describe('CardReminder', () => {
  describe('row content', () => {
    it('renders the "At" row with the card.at value', () => {
      const r = render({ card: activeCard });
      const texts = allText(r);
      expect(texts).toContain('At');
      expect(texts).toContain('Home');
    });

    it('renders the "Do" row with the card.do value', () => {
      const r = render({ card: activeCard });
      const texts = allText(r);
      expect(texts).toContain('Do');
      expect(texts).toContain('Buy milk');
    });

    it('renders the "Active" row', () => {
      const r = render({ card: activeCard });
      const texts = allText(r);
      expect(texts).toContain('Active');
    });
  });

  describe('active state', () => {
    it('shows "ON" when card.active is true', () => {
      const r = render({ card: activeCard });
      const texts = allText(r);
      expect(texts).toContain('ON');
    });

    it('shows "OFF" when card.active is false', () => {
      const r = render({ card: inactiveCard });
      const texts = allText(r);
      expect(texts).toContain('OFF');
    });

    it('status bell source always agrees with the Active text', () => {
      const on = render({ card: activeCard });
      expect(on.root.findAllByType(Image)[0].props.source).toBe(icons.alertOn);
      expect(allText(on)).toContain('ON');

      const off = render({ card: inactiveCard });
      expect(off.root.findAllByType(Image)[0].props.source).toBe(
        icons.alertOff
      );
      expect(allText(off)).toContain('OFF');
    });
  });

  describe('alert icon', () => {
    it('uses icons.alertOn when card.active is true', () => {
      const r = render({ card: activeCard });
      const images = r.root.findAllByType(Image);
      // The first Image is the alert icon (leftmost in the layout).
      expect(images[0].props.source).toBe(icons.alertOn);
    });

    it('uses icons.alertOff when card.active is false', () => {
      const r = render({ card: inactiveCard });
      const images = r.root.findAllByType(Image);
      expect(images[0].props.source).toBe(icons.alertOff);
    });
  });

  describe('action icons', () => {
    it('shows deactivateReminder + deleteReminder when active', () => {
      const r = render({ card: activeCard });
      const images = r.root.findAllByType(Image);
      // images[0] = alert icon, images[1] = activate/deactivate, images[2] = delete
      expect(images[1].props.source).toBe(icons.deactivateReminder);
      expect(images[2].props.source).toBe(icons.deleteReminder);
    });

    it('shows activateReminder + deleteReminder when inactive', () => {
      const r = render({ card: inactiveCard });
      const images = r.root.findAllByType(Image);
      expect(images[1].props.source).toBe(icons.activateReminder);
      expect(images[2].props.source).toBe(icons.deleteReminder);
    });
  });

  describe('tap targets', () => {
    it('renders exactly three press target regions (body, bell, trash)', () => {
      const r = render({ card: activeCard });
      expect(findAllPressables(r)).toHaveLength(3);
      expect(findPressableByTestId(r, 'card-body-r1')).toBeTruthy();
      expect(findPressableByTestId(r, 'card-bell-r1')).toBeTruthy();
      expect(findPressableByTestId(r, 'card-trash-r1')).toBeTruthy();
    });

    it('fires onPressBody with the reminder id when the body is pressed', () => {
      const onPressBody = jest.fn();
      const r = render({ card: activeCard, onPressBody });

      act(() => {
        findPressableByTestId(r, 'card-body-r1').props.onPress();
      });

      expect(onPressBody).toHaveBeenCalledTimes(1);
      expect(onPressBody).toHaveBeenCalledWith('r1');
    });

    it('fires onPressBell with the reminder id when the top-right bell is pressed', () => {
      const onPressBell = jest.fn();
      const r = render({ card: activeCard, onPressBell });

      act(() => {
        findPressableByTestId(r, 'card-bell-r1').props.onPress();
      });

      expect(onPressBell).toHaveBeenCalledTimes(1);
      expect(onPressBell).toHaveBeenCalledWith('r1');
    });

    it('fires onPressTrash with the reminder id when the trash icon is pressed', () => {
      const onPressTrash = jest.fn();
      const r = render({ card: activeCard, onPressTrash });

      act(() => {
        findPressableByTestId(r, 'card-trash-r1').props.onPress();
      });

      expect(onPressTrash).toHaveBeenCalledTimes(1);
      expect(onPressTrash).toHaveBeenCalledWith('r1');
    });

    it('does not make the left status bell pressable', () => {
      const r = render({ card: activeCard });
      const statusIconSources = [icons.alertOn, icons.alertOff];
      const statusIconInsidePressable = findAllPressables(r).some((p) =>
        p
          .findAllByType(Image)
          .some((img) => statusIconSources.includes(img.props.source as number))
      );
      expect(statusIconInsidePressable).toBe(false);
    });

    it('renders without callbacks and does not throw when targets are pressed', () => {
      const r = render({ card: activeCard });
      expect(() => {
        act(() => {
          findPressableByTestId(r, 'card-body-r1').props.onPress();
          findPressableByTestId(r, 'card-bell-r1').props.onPress();
          findPressableByTestId(r, 'card-trash-r1').props.onPress();
        });
      }).not.toThrow();
    });

    it('isolates tap targets per card id', () => {
      const r = render({ card: inactiveCard });
      expect(findPressableByTestId(r, 'card-body-r2')).toBeTruthy();
      expect(findPressableByTestId(r, 'card-bell-r2')).toBeTruthy();
      expect(findPressableByTestId(r, 'card-trash-r2')).toBeTruthy();
    });
  });

  describe('long-text truncation (layout regression)', () => {
    const longAt =
      'A very long point-of-interest name that would otherwise push the icons out of the card';
    const longDo =
      'Another very long description string that must ellipsize instead of clipping the icons';
    const longCard: Card = { $id: 'r9', at: longAt, do: longDo, active: true };

    /** The outer Text nodes that carry single-line truncation. */
    function truncatedTexts(r: TestRenderer.ReactTestRenderer) {
      return r.root
        .findAllByType(Text)
        .filter((t) => t.props.numberOfLines === 1);
    }

    /** Walk up from a nested instance to the nearest View ancestor. */
    function nearestViewAncestor(
      instance: TestRenderer.ReactTestInstance
    ): TestRenderer.ReactTestInstance {
      let node: TestRenderer.ReactTestInstance | null = instance.parent;
      while (node && node.type !== View) node = node.parent;
      if (!node) throw new Error('No View ancestor found');
      return node;
    }

    it('truncates the "At" row to one line with a tail ellipsis', () => {
      const r = render({ card: longCard });
      const atOuter = truncatedTexts(r).find((t) =>
        extractStrings(t.props.children).includes('At')
      );
      expect(atOuter).toBeTruthy();
      expect(atOuter!.props.ellipsizeMode).toBe('tail');
      // Truncation is display-level: the full string stays in the tree.
      expect(extractStrings(atOuter!.props.children)).toContain(longAt);
    });

    it('truncates the "Do" row to one line with a tail ellipsis', () => {
      const r = render({ card: longCard });
      const doOuter = truncatedTexts(r).find((t) =>
        extractStrings(t.props.children).includes('Do')
      );
      expect(doOuter).toBeTruthy();
      expect(doOuter!.props.ellipsizeMode).toBe('tail');
      expect(extractStrings(doOuter!.props.children)).toContain(longDo);
    });

    it('keeps the full strings in the body accessibilityLabel for screen readers', () => {
      const r = render({ card: longCard });
      const body = findPressableByTestId(r, 'card-body-r9');
      expect(body.props.accessibilityLabel).toContain(longAt);
      expect(body.props.accessibilityLabel).toContain(longDo);
    });

    it('bounds the body so it can shrink instead of growing (flex-1 min-w-0)', () => {
      const r = render({ card: longCard });
      const bodyClass: string = findPressableByTestId(
        r,
        'card-body-r9'
      ).props.className;
      expect(bodyClass).toMatch(/(^|\s)flex-1(\s|$)/);
      expect(bodyClass).toMatch(/(^|\s)min-w-0(\s|$)/);
    });

    it('keeps the right icon column rigid (shrink-0) so it never absorbs the squeeze', () => {
      const r = render({ card: longCard });
      const bell = findPressableByTestId(r, 'card-bell-r9');
      const columnClass: string =
        nearestViewAncestor(bell).props.className;
      expect(columnClass).toMatch(/shrink-0/);
    });

    it('keeps all three tap targets mounted with long text', () => {
      const r = render({ card: longCard });
      expect(findAllPressables(r)).toHaveLength(3);
      expect(findPressableByTestId(r, 'card-body-r9')).toBeTruthy();
      expect(findPressableByTestId(r, 'card-bell-r9')).toBeTruthy();
      expect(findPressableByTestId(r, 'card-trash-r9')).toBeTruthy();
    });

    it('keeps the fixed 333px card width and the untouched left bell container', () => {
      const r = render({ card: longCard });
      const views = r.root.findAllByType(View);
      expect(views[0].props.className).toMatch(/w-\[333px\]/);
      const leftBell = views.find(
        (v) =>
          typeof v.props.className === 'string' &&
          v.props.className.includes('w-[41px]')
      );
      expect(leftBell).toBeTruthy();
    });
  });
});
