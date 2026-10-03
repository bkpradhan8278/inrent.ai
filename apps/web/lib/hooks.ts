"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * Runs `reset` when `value` changes, during render (React's recommended alternative to a
 * setState-in-effect). Typical use: close a drawer when the route changes.
 */
export function useResetOnChange<T>(value: T, reset: () => void) {
  const [prev, setPrev] = useState(value);
  if (!Object.is(prev, value)) {
    setPrev(value);
    reset();
  }
}

/** Reads a Web Storage key as external state; renders `fallback` on the server and before hydration. */
export function useStoredValue(storage: "local" | "session", key: string, event: string, fallback = ""): string {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(event, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(event, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => {
      try {
        return (storage === "local" ? localStorage : sessionStorage).getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
}
