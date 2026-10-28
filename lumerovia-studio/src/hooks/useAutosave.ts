"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectDTO } from "@/lib/types";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Debounced autosave. Call schedule(patch) on every edit; patches are merged and PATCHed
 * to /api/projects/:id after `delay` ms of quiet. flush() saves immediately.
 */
export function useAutosave(projectId: string, delay = 1200) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Partial<ProjectDTO>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const doSave = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        keepalive: true,
      });
      if (!res.ok) throw new Error(`저장 실패 (${res.status})`);
      const data = (await res.json()) as { savedAt?: string };
      setSavedAt(data.savedAt ?? new Date().toISOString());
      setStatus(Object.keys(pending.current).length ? "pending" : "saved");
      setError(null);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "저장 실패");
      // keep patch so a later edit retries it
      pending.current = { ...patch, ...pending.current };
    }
  }, [projectId]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) await inflight.current;
    inflight.current = doSave();
    await inflight.current;
    inflight.current = null;
  }, [doSave]);

  const schedule = useCallback(
    (patch: Partial<ProjectDTO>) => {
      pending.current = { ...pending.current, ...patch };
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush();
      }, delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const onHide = () => {
      if (Object.keys(pending.current).length) void flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  return { status, savedAt, error, schedule, flush };
}
