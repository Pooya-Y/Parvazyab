import { useCallback, useEffect, useEffectEvent, useState } from "react";

// ---------------------------------------------------------------------------
// Tag-based invalidation: a mutation calls `invalidate("saved")` and every
// mounted query subscribed to that tag refetches in the background.
// ---------------------------------------------------------------------------

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

export function invalidate(...tags: string[]) {
  for (const tag of tags) listeners.get(tag)?.forEach((fn) => fn());
}

function subscribe(tags: readonly string[], fn: Listener) {
  for (const tag of tags) {
    if (!listeners.has(tag)) listeners.set(tag, new Set());
    listeners.get(tag)!.add(fn);
  }
  return () => {
    for (const tag of tags) listeners.get(tag)?.delete(fn);
  };
}

export interface QueryState<T> {
  data: T | undefined;
  error: unknown;
  /** No data to show yet. */
  isLoading: boolean;
  /** A request is in flight (first load or background refetch). */
  isFetching: boolean;
  refetch: () => void;
  /** Replace the cached data locally (e.g. with a mutation's result). */
  setData: (update: (prev: T | undefined) => T | undefined) => void;
}

/**
 * Minimal data-fetching hook.
 * - `key` identifies the request; `null` skips it. A new key aborts the previous
 *   request, so a slow stale response can never overwrite a newer one.
 * - Previous data stays visible while a new key loads (no flash on filter changes).
 */
export function useApiQuery<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  tags: readonly string[] = [],
): QueryState<T> {
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  const requestId = key === null ? null : `${key}#${nonce}`;
  const [state, setState] = useState<{ id: string | null; data?: T; error: unknown }>({ id: null, error: null });
  const load = useEffectEvent((signal: AbortSignal) => fetcher(signal));

  useEffect(() => {
    if (requestId === null) return;
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ id: requestId, data, error: null });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState((s) => ({ id: requestId, data: s.data, error }));
      },
    );
    return () => controller.abort();
  }, [requestId]);

  const tagsKey = tags.join("|");
  useEffect(() => {
    if (!tagsKey) return;
    return subscribe(tagsKey.split("|"), refetch);
  }, [tagsKey, refetch]);

  const setData = useCallback(
    (update: (prev: T | undefined) => T | undefined) => setState((s) => ({ ...s, data: update(s.data) })),
    [],
  );

  const isFetching = requestId !== null && state.id !== requestId;
  const data = key === null ? undefined : state.data;
  const error = state.id === requestId ? state.error : null;
  return {
    data,
    error,
    isLoading: key !== null && data === undefined && error === null,
    isFetching,
    refetch,
    setData,
  };
}
