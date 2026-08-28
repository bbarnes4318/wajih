"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light";

/**
 * Reads the theme the inline bootstrap script already resolved in <head>, so
 * this never fights it or causes a flash.
 *
 * The `data-theme` attribute on <html> is the source of truth — an external
 * store, not React state — so it is read through `useSyncExternalStore`
 * rather than mirrored into state from an effect.
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

/** SSR and first paint both assume dark, matching the root layout's default. */
function getServerSnapshot(): Theme {
  return "dark";
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("leados-theme", next);
    } catch {
      // Private browsing with storage disabled — the in-memory switch still works.
    }
    for (const listener of listeners) listener();
  }, [theme]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className={cn(
        "grid size-7 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-ink",
        className,
      )}
    >
      {theme === "light" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
