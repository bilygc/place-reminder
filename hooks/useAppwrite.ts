import { useEffect, useState } from "react";
import ensureError from "@/utils/ensureError";

export const useAppwrite = <T>(fn: () => Promise<T>) => {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fn();
      setData(Array.isArray(data) ? data : [data]);
    } catch (error: unknown) {
      const err = ensureError(error);
      console.error(err.message);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const refetch = () => fetchData();

  return { data, refetch, isLoading, error };
};
