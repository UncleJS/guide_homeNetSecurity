import { useCallback, useEffect, useRef, useState } from "react";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:11291") + "/api";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiGet = <T>(p: string) => api<T>(p);
export const apiPost = <T>(p: string, body: unknown) =>
  api<T>(p, { method: "POST", body: JSON.stringify(body) });
export const apiPatch = <T>(p: string, body: unknown) =>
  api<T>(p, { method: "PATCH", body: JSON.stringify(body) });

// Small data-fetching hook with loading / error / refetch.
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Monotonic sequence so a slow stale response never overwrites a newer one.
  const seq = useRef(0);

  const refetch = useCallback(async () => {
    if (path === null) {
      setLoading(false);
      return;
    }
    const mySeq = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<T>(path);
      if (seq.current === mySeq) setData(result);
    } catch (e) {
      if (seq.current === mySeq) setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (seq.current === mySeq) setLoading(false);
    }
  }, [path]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}

// Shared state wrapper for mutations (archive/restore/toggle/save):
// surfaces the error inline and exposes a pending flag — never silent.
export function useMutation() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error };
}
