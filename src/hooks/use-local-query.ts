import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe } from '@/lib/events';

/** Reads from the phone's database and reads again whenever one of the channels changes. */
export function useLocalQuery<T>(load: () => Promise<T>, channels: string[], deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(async () => {
    try {
      setData(await loadRef.current());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run();
    const subs = channels.map((c) => subscribe(c, () => void run()));
    return () => subs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...channels, ...deps]);

  return { data, loading, reload: run };
}
