/**
 * Unit tests for components/Loading/Loading.tsx (GreenLoading).
 *
 * Covers: renders 3 dots (Animated.View) + "Loading..." text, the
 * Animated.loop is started, the staggered setTimeout schedule (166ms / 333ms),
 * and cleanup on unmount (clearTimeout of both pending timers + stopAnimation
 * on all three Animated.Value instances).
 *
 * Strategy: fake timers + a spy on Animated.loop (mocked to a no-op so the
 * real loop doesn't schedule its own timers, keeping jest.getTimerCount()
 * honest about the two setTimeouts) + a spy on
 * Animated.Value.prototype.stopAnimation (the three values inherit it). We
 * assert lifecycle calls, never animation values.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Animated, Text, View } from 'react-native';
import { GreenLoading } from '../Loading';

describe('GreenLoading', () => {
  let loopSpy: jest.SpyInstance;
  let stopSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    // Mock Animated.loop to a no-op spy so the real loop's start() doesn't
    // schedule timers that would pollute jest.getTimerCount(). The spy still
    // records call counts.
    loopSpy = jest
      .spyOn(Animated, 'loop')
      .mockImplementation(() => ({ start: jest.fn() }) as any);
    // Spy on the prototype method shared by all three Animated.Value instances.
    stopSpy = jest
      .spyOn(Animated.Value.prototype, 'stopAnimation')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    stopSpy.mockRestore();
    loopSpy.mockRestore();
    jest.useRealTimers();
  });

  it('renders three dots (Animated.View) and a "Loading..." text', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<GreenLoading />);
    });

    // 3 Animated.View dots + 1 outer View + 1 dotsContainer View. Filter to
    // Animated.View specifically.
    const dots = renderer.root.findAllByType(Animated.View);
    expect(dots.length).toBe(3);

    const texts = renderer.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === 'Loading...')).toBe(true);
  });

  it('starts Animated.loop immediately for the first dot (one call before any timer fires)', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<GreenLoading />);
    });

    // animate(animation1) runs synchronously in the effect; the other two are
    // scheduled via setTimeout.
    expect(loopSpy).toHaveBeenCalledTimes(1);
    // Two pending timers: timeout2 (166ms) and timeout3 (333ms).
    expect(jest.getTimerCount()).toBe(2);
  });

  it('stagger: advancing to 166ms starts the second dot, to 333ms starts the third', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<GreenLoading />);
    });

    expect(loopSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(2);

    act(() => {
      jest.advanceTimersByTime(166);
    });
    // Second dot's loop started; one timer (333ms) still pending.
    expect(loopSpy).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(1);

    act(() => {
      jest.advanceTimersByTime(167); // total 333ms
    });
    // Third dot's loop started; no timers pending.
    expect(loopSpy).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not start the second/third dots before their stagger delays elapse', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<GreenLoading />);
    });

    act(() => {
      jest.advanceTimersByTime(165); // just before 166ms
    });
    expect(loopSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(2);
  });

  it('cleanup on unmount: clears both pending timers and stops all three animations', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<GreenLoading />);
    });

    // One loop started immediately; two staggered starts still pending.
    expect(loopSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).not.toHaveBeenCalled();

    act(() => {
      renderer.unmount();
    });

    // stopAnimation called once per Animated.Value (all three, unconditionally).
    expect(stopSpy).toHaveBeenCalledTimes(3);

    // The cleanup cleared timeout2/timeout3, so advancing past their delays
    // must NOT start the second/third dots. (We assert via loopSpy rather than
    // jest.getTimerCount() because React's scheduler may leave its own timers
    // pending, making the raw count noisy after unmount.)
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(loopSpy).toHaveBeenCalledTimes(1);
  });

  it('cleanup runs even after the stagger timers have already fired', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<GreenLoading />);
    });

    act(() => {
      jest.advanceTimersByTime(400); // both stagger timers fired
    });
    expect(jest.getTimerCount()).toBe(0);
    expect(loopSpy).toHaveBeenCalledTimes(3);

    act(() => {
      renderer.unmount();
    });

    // No throw; stopAnimation still called for all three values.
    expect(stopSpy).toHaveBeenCalledTimes(3);
  });

  it('accepts a custom size prop and applies it to each dot', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<GreenLoading size={20} />);
    });

    const dots = renderer.root.findAllByType(Animated.View);
    // Each dot's style array includes { width: 20, height: 20 }.
    for (const dot of dots) {
      const styleArr = dot.props.style as Array<Record<string, unknown>>;
      const sizeStyle = styleArr.find(
        (s) => s && typeof s === 'object' && 'width' in s
      );
      expect(sizeStyle?.width).toBe(20);
      expect(sizeStyle?.height).toBe(20);
    }
  });
});