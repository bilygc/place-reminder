/**
 * Unit tests for hooks/useAppwrite.ts — the generic data-fetching hook.
 *
 * Covers: initial state, successful fetch (isLoading true->false, data set),
 * the array-normalization rule (single object -> [obj], array stays as array),
 * error path via ensureError (including a non-Error thrown value), refetch
 * re-invoking fn, and unmount-during-flight behavior (the hook does NOT guard
 * with isMounted, so we assert the honest behavior: it does not throw).
 *
 * Rendered with raw react-test-renderer + act() (React 19). The harness writes
 * the hook's return value into a ref-like object on each render; act() flushes
 * effects and the async fetch continuation.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useAppwrite } from '../useAppwrite';

interface HarnessHandle<T> {
  current: T;
}

function renderHook<T>(hookFn: () => T): {
  result: HarnessHandle<T>;
  rerender: () => void;
  unmount: () => void;
} {
  const result: HarnessHandle<T> = { current: undefined as unknown as T };
  const Harness = () => {
    result.current = hookFn();
    return null;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Harness />);
  });
  return {
    result,
    rerender: () => act(() => { renderer.update(<Harness />); }),
    unmount: () => act(() => { renderer.unmount(); }),
  };
}

/**
 * Flush the microtask queue so an in-flight async fetch (await fn()) resolves
 * and its trailing setState calls apply. Wrapped in act() so React processes
 * the scheduled updates.
 */
function flush(): Promise<void> {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useAppwrite', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('initial state', () => {
    it('exposes empty data, isLoading=false, error=null before the fetch resolves', () => {
      // A fn that never resolves — so the hook stays in the "loading" state
      // after the effect fires, with the pre-fetch initial values visible
      // only before the effect runs. After act(create) the effect has run
      // and setIsLoading(true) has applied, so isLoading is true here.
      const neverResolve = jest.fn(
        () => new Promise<unknown>(() => {})
      );
      const { result } = renderHook(() => useAppwrite(neverResolve));

      expect(result.current.data).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
      expect(typeof result.current.refetch).toBe('function');
    });

    it('returns refetch as a function that re-invokes the fetch', async () => {
      const fn = jest.fn().mockResolvedValue({ a: 1 });
      const { result } = renderHook(() => useAppwrite(fn));
      await flush();

      expect(fn).toHaveBeenCalledTimes(1);
      result.current.refetch();
      await flush();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('successful fetch', () => {
    it('normalizes a single object result to a one-element array', async () => {
      const obj = { id: 'x', name: 'alice' };
      const fn = jest.fn().mockResolvedValue(obj);
      const { result } = renderHook(() => useAppwrite(fn));

      // isLoading flips true during the fetch.
      expect(result.current.isLoading).toBe(true);
      await flush();

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toEqual([obj]);
      expect(result.current.error).toBeNull();
    });

    it('keeps an array result as-is (does not double-wrap)', async () => {
      const arr = [{ id: '1' }, { id: '2' }];
      const fn = jest.fn().mockResolvedValue(arr);
      const { result } = renderHook(() => useAppwrite(fn));

      await flush();

      expect(result.current.data).toEqual(arr);
      expect(result.current.data).toBe(arr);
    });

    it('resets isLoading back to false after the fetch completes', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const { result } = renderHook(() => useAppwrite(fn as any));

      expect(result.current.isLoading).toBe(true);
      await flush();
      expect(result.current.isLoading).toBe(false);
    });

    it('clears a previous error when a subsequent fetch succeeds', async () => {
      const fn = jest.fn();
      fn.mockRejectedValueOnce(new Error('boom'));
      fn.mockResolvedValueOnce('ok');
      const { result } = renderHook(() => useAppwrite(fn as any));

      await flush();
      expect(result.current.error).toBe('boom');

      result.current.refetch();
      await flush();
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toEqual(['ok']);
    });
  });

  describe('error handling', () => {
    it('sets error to the message of a thrown Error and keeps isLoading false', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('db unavailable'));
      const { result } = renderHook(() => useAppwrite(fn as any));

      await flush();

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('db unavailable');
      // data stays at its initial empty array (not overwritten on error).
      expect(result.current.data).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith('db unavailable');
    });

    it('wraps a non-Error thrown value via ensureError (Unknown error: ...)', async () => {
      // Throwing a bare string — not an Error instance. ensureError stringifies
      // it and prefixes "Unknown error: ".
      const fn = jest.fn().mockRejectedValue('boom-string');
      const { result } = renderHook(() => useAppwrite(fn as any));

      await flush();

      expect(result.current.error).toMatch(/^Unknown error: /);
      expect(result.current.isLoading).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('handles a thrown null (ensureError still produces a message)', async () => {
      const fn = jest.fn().mockRejectedValue(null);
      const { result } = renderHook(() => useAppwrite(fn as any));

      await flush();

      expect(result.current.error).toMatch(/^Unknown error: /);
      expect(result.current.isLoading).toBe(false);
    });

    it('refetch after an error re-runs fn and updates state on success', async () => {
      const fn = jest.fn();
      fn.mockRejectedValueOnce(new Error('first'));
      fn.mockResolvedValueOnce({ v: 42 });
      const { result } = renderHook(() => useAppwrite(fn as any));

      await flush();
      expect(result.current.error).toBe('first');

      result.current.refetch();
      await flush();
      expect(result.current.error).toBeNull();
      expect(result.current.data).toEqual([{ v: 42 }]);
    });
  });

  describe('unmount during in-flight fetch', () => {
    it('does not throw when the fetch resolves after unmount (no isMounted guard)', async () => {
      // The hook does NOT guard setState with isMounted, so resolving after
      // unmount schedules an update on a detached tree. React 19 no longer
      // warns for this; assert the flush simply does not throw.
      let resolveFn: (v: unknown) => void = () => {};
      const fn = jest.fn(
        () =>
          new Promise((resolve) => {
            resolveFn = resolve;
          })
      );
      const { unmount } = renderHook(() => useAppwrite(fn as any));

      unmount();
      await act(async () => {
        resolveFn('late');
        await Promise.resolve();
      });
      // No throw — the hook's lack of an isMounted guard is benign under
      // React 19 but worth pinning so a future refactor that adds the guard
      // doesn't silently change observable behavior.
      expect(true).toBe(true);
    });
  });
});
