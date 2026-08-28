"use client";

import { useSyncExternalStore } from "react";

/**
 * One `setInterval` shared across every subscriber, instead of one per
 * mounted `CountdownBadge` — a queue of 50 rows previously meant 50
 * independent 30s timers doing the same thing. Same `useSyncExternalStore`
 * shape as `ThemeToggle`'s `data-theme` read, for the same reason: this is
 * external mutable state, not React state, so it shouldn't be mirrored into
 * a `useState` from an effect.
 */

const listeners = new Set<() => void>();
let now = new Date();
let intervalId: ReturnType<typeof setInterval> | null = null;

function tick() {
  now = new Date();
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (intervalId === null) {
    intervalId = setInterval(tick, 30_000);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot(): Date {
  return now;
}

export function useSharedClock(): Date {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
