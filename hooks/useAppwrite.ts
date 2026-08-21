import { useCallback, useEffect, useRef, useState } from 'react';
import ensureError from '@/utils/ensureError';

interface UseAppwriteOptions {
  /**
   * When true, the wrapped function is invoked automatically on mount.
   * Defaults to false so mutation-style callers (sign-in, form submission)
   * only run when explicitly requested via refetch.
   */
  immediate?: boolean;
}

/**
 * Generic async hook for Appwrite-style calls.
 *
 * By default the function is NOT run on mount. Callers trigger it with
 * `refetch(...args)`. Results are normalized to an array (`data`), and
 * errors are surfaced as strings (`error`) while still being re-thrown so
 * the call site can show user-visible feedback.
 */
export const useAppwrite = <T, Args extends unknown[] = []>(
  fn: (...args: Args) => Promise<T>,
  options: UseAppwriteOptions = {}
) => {
  const { immediate = false } = options;
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);

  // Keep the latest fn so refetch always uses the current closure/values.
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const fetchData = useCallback(async (...args: Args): Promise<T> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fnRef.current(...args);
      setData(Array.isArray(result) ? result : [result]);
      return result;
    } catch (error: unknown) {
      const err = ensureError(error);
      console.error(err.message);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (immediate) {
      // immediate mode is only intended for no-argument fetchers; cast so the
      // generic Args type does not require arguments on the automatic call.
      void (fetchData as () => Promise<T>)();
    }
  }, [immediate, fetchData]);

  const refetch = useCallback(
    (...args: Args) => fetchData(...args),
    [fetchData]
  );

  return { data, refetch, isLoading, error };
};
