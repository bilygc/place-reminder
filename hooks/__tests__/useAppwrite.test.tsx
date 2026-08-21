/**
 * Unit tests for hooks/useAppwrite.ts — the generic async hook.
 *
 * Covers: default lazy behavior (no auto-fetch on mount), optional immediate
 * execution, successful fetch with array normalization, error handling with
 * both state updates and re-throws, refetch argument forwarding, and
 * unmount-during-flight behavior.
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

  describe('default lazy behavior', () => {
    it('does not call fn on mount', async () => {
      const fn = jest.fn().mockResolvedValue({ a: 1 });
      const { result } = renderHook(() => useAppwrite(fn));

      expect(result.current.data).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(fn).not.toHaveBeenCalled();
    });

    it('returns refetch as a function that invokes fn', async () => {
      const fn = jest.fn().mockResolvedValue({ a: 1 });
      const { result } = renderHook(() => useAppwrite(fn));

      result.current.refetch();
      await flush();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual([{ a: 1 }]);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('immediate execution', () => {
    it('calls fn on mount when immediate is true', async () => {
      const obj = { id: 'x', name: 'alice' };
      const fn = jest.fn().mockResolvedValue(obj);
      const { result } = renderHook(() => useAppwrite(fn, { immediate: true }));

      expect(result.current.isLoading).toBe(true);
      await flush();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toEqual([obj]);
      expect(result.current.error).toBeNull();
    });

    it('keeps an array result as-is (does not double-wrap)', async () => {
      const arr = [{ id: '1' }, { id: '2' }];
      const fn = jest.fn().mockResolvedValue(arr);
      const { result } = renderHook(() => useAppwrite(fn, { immediate: true }));

      await flush();

      expect(result.current.data).toEqual(arr);
      expect(result.current.data).toBe(arr);
    });
  });

  describe('refetch argument forwarding', () => {
    it('passes arguments through to the wrapped function', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const { result } = renderHook(() => useAppwrite(fn));

      result.current.refetch('a@b.com', 'secret');
      await flush();

      expect(fn).toHaveBeenCalledWith('a@b.com', 'secret');
      expect(result.current.data).toEqual(['ok']);
    });

    it('returns the raw result from refetch so callers can use it directly', async () => {
      const fn = jest.fn().mockResolvedValue({ raw: true });
      const { result } = renderHook(() => useAppwrite(fn));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.refetch();
      });

      expect(returned).toEqual({ raw: true });
    });
  });

  describe('error handling', () => {
    it('sets error to the message of a thrown Error, logs it, and re-throws', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('db unavailable'));
      const { result } = renderHook(() => useAppwrite(fn as any));

      let thrown: Error | undefined;
      await act(async () => {
        try {
          await result.current.refetch();
        } catch (err) {
          thrown = err as Error;
        }
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('db unavailable');
      expect(thrown?.message).toBe('db unavailable');
      expect(result.current.data).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith('db unavailable');
    });

    it('wraps a non-Error thrown value via ensureError (Unknown error: ...)', async () => {
      const fn = jest.fn().mockRejectedValue('boom-string');
      const { result } = renderHook(() => useAppwrite(fn as any));

      await act(async () => {
        try {
          await result.current.refetch();
        } catch {
          // expected
        }
      });

      expect(result.current.error).toMatch(/^Unknown error: /);
      expect(result.current.isLoading).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('clears a previous error when a subsequent fetch succeeds', async () => {
      const fn = jest.fn();
      fn.mockRejectedValueOnce(new Error('boom'));
      fn.mockResolvedValueOnce('ok');
      const { result } = renderHook(() => useAppwrite(fn as any));

      await act(async () => {
        try {
          await result.current.refetch();
        } catch {
          // expected
        }
      });
      expect(result.current.error).toBe('boom');

      await act(async () => {
        await result.current.refetch();
      });
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toEqual(['ok']);
    });
  });

  describe('unmount during in-flight fetch', () => {
    it('does not throw when the fetch resolves after unmount (no isMounted guard)', async () => {
      let resolveFn: (v: unknown) => void = () => {};
      const fn = jest.fn(
        () =>
          new Promise((resolve) => {
            resolveFn = resolve;
          })
      );
      const { result, unmount } = renderHook(() => useAppwrite(fn as any));

      result.current.refetch();
      unmount();
      await act(async () => {
        resolveFn('late');
        await Promise.resolve();
      });
      expect(true).toBe(true);
    });
  });
});
