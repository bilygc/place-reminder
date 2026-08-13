/**
 * Unit tests for components/CardReminder/CardReminder.tsx.
 *
 * Covers: renders the "At"/"Do"/"Active" rows, the active state shown as
 * 'ON'/'OFF', and the alert icon source chosen per the active prop
 * (alertOn when active, alertOff when inactive). The right-side action icons
 * (activate/deactivate + delete) are also asserted per active state.
 *
 * Icons come from constants/icons.ts (PNG requires) — jest-expo's asset
 * handling resolves these to a number (require result), so we assert the
 * source identity against the imported icons module rather than a literal.
 *
 * Rendered with raw react-test-renderer + act().
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, Image } from 'react-native';
import CardReminder from '../CardReminder';
import type { Card } from '../CardReminder.types';
import icons from '@/constants/icons';

function render(card: Card) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<CardReminder card={card} />);
  });
  return renderer;
}

const activeCard: Card = { $id: 'r1', at: 'Home', do: 'Buy milk', active: true };
const inactiveCard: Card = { $id: 'r2', at: 'Work', do: 'Send report', active: false };

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
      const r = render(activeCard);
      const texts = allText(r);
      expect(texts).toContain('At');
      expect(texts).toContain('Home');
    });

    it('renders the "Do" row with the card.do value', () => {
      const r = render(activeCard);
      const texts = allText(r);
      expect(texts).toContain('Do');
      expect(texts).toContain('Buy milk');
    });

    it('renders the "Active" row', () => {
      const r = render(activeCard);
      const texts = allText(r);
      expect(texts).toContain('Active');
    });
  });

  describe('active state', () => {
    it('shows "ON" when card.active is true', () => {
      const r = render(activeCard);
      const texts = allText(r);
      expect(texts).toContain('ON');
    });

    it('shows "OFF" when card.active is false', () => {
      const r = render(inactiveCard);
      const texts = allText(r);
      expect(texts).toContain('OFF');
    });
  });

  describe('alert icon', () => {
    it('uses icons.alertOn when card.active is true', () => {
      const r = render(activeCard);
      const images = r.root.findAllByType(Image);
      // The first Image is the alert icon (leftmost in the layout).
      expect(images[0].props.source).toBe(icons.alertOn);
    });

    it('uses icons.alertOff when card.active is false', () => {
      const r = render(inactiveCard);
      const images = r.root.findAllByType(Image);
      expect(images[0].props.source).toBe(icons.alertOff);
    });
  });

  describe('action icons', () => {
    it('shows deactivateReminder + deleteReminder when active', () => {
      const r = render(activeCard);
      const images = r.root.findAllByType(Image);
      // images[0] = alert icon, images[1] = activate/deactivate, images[2] = delete
      expect(images[1].props.source).toBe(icons.deactivateReminder);
      expect(images[2].props.source).toBe(icons.deleteReminder);
    });

    it('shows activateReminder + deleteReminder when inactive', () => {
      const r = render(inactiveCard);
      const images = r.root.findAllByType(Image);
      expect(images[1].props.source).toBe(icons.activateReminder);
      expect(images[2].props.source).toBe(icons.deleteReminder);
    });
  });
});