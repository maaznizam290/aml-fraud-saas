"use client";

/**
 * The one data-fetching hook every page uses (task section 12: avoid
 * duplicated fetch logic and unnecessary re-renders). Deliberately small —
 * no external cache library — because this app's read APIs are cheap,
 * org-scoped GETs with no cross-page cache-sharing requirement; adding a
 * bigger dependency for that would be solving a problem this app doesn't
 * have yet.
 *
 * Cancels the in-flight request on unmount or when `url` changes, so a
 * fast filter change never lets a stale response overwrite a newer one.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface ApiQueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

export function useApiQuery<T>(url: string | null): ApiQueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(url));
  const [refetchToken, setRefetchToken] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!url) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as unknown;
        if (!res.ok) {
          const message =
            body && typeof body === "object" && "error" in body
              ? String((body as { error: unknown; detail?: unknown }).detail ?? (body as { error: unknown }).error)
              : `Request failed with status ${res.status}`;
          throw new Error(message);
        }
        return body as T;
      })
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Request failed.");
        setLoading(false);
      });

    return () => controller.abort();
  }, [url, refetchToken]);

  const refetch = useCallback(() => setRefetchToken((t) => t + 1), []);

  return { data, error, loading, refetch };
}
