"use client";

import { useEffect, useRef } from "react";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export interface HotkeyOptions {
  /** Require Cmd (Mac) / Ctrl (Windows/Linux) held down. */
  meta?: boolean;
  enabled?: boolean;
}

/**
 * Binds a single-key shortcut, skipping it while focus is inside a text
 * input/textarea/select/contentEditable so typing "a" in a filter box never
 * fires the "accept" shortcut. The handler is read from a ref on every
 * keydown rather than being a dependency, so callers can pass a fresh
 * closure each render without re-binding the listener.
 */
export function useHotkey(
  key: string,
  handler: (e: KeyboardEvent) => void,
  options: HotkeyOptions = {},
) {
  const { meta = false, enabled = true } = options;
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (meta && !(e.metaKey || e.ctrlKey)) return;
      if (!meta && (e.metaKey || e.ctrlKey || e.altKey)) return;
      if (isTypingTarget(e.target)) return;
      handlerRef.current(e);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, meta, enabled]);
}
