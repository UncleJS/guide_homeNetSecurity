import { useCallback, useEffect, useState } from "react";

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

  const refetch = useCallback(async () => {
    if (path === null) return;
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<T>(path));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}
