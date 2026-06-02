import { useCallback } from "react";
import { API_BASE, getUserId } from "@/constants/api";

export function useApi() {
  const headers = useCallback(async () => {
    const userId = await getUserId();
    return {
      "Content-Type": "application/json",
      "x-user-id": userId,
    };
  }, []);

  const get = useCallback(
    async <T>(path: string): Promise<T> => {
      const h = await headers();
      const res = await fetch(`${API_BASE}${path}`, { headers: h });
      if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
      return res.json();
    },
    [headers]
  );

  const post = useCallback(
    async <T>(path: string, body: unknown): Promise<T> => {
      const h = await headers();
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: h,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
      return res.json();
    },
    [headers]
  );

  const patch = useCallback(
    async <T>(path: string, body?: unknown): Promise<T> => {
      const h = await headers();
      const res = await fetch(`${API_BASE}${path}`, {
        method: "PATCH",
        headers: h,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
      return res.json();
    },
    [headers]
  );

  return { get, post, patch };
}
