"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Rows3, Rows4 } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth/session";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

type Density = "comfortable" | "compact";

/** Same external-store pattern as ThemeToggle — data-density on <html> is the source of truth. */
const densityListeners = new Set<() => void>();

function subscribeDensity(onChange: () => void) {
  densityListeners.add(onChange);
  return () => {
    densityListeners.delete(onChange);
  };
}

function getDensitySnapshot(): Density {
  return document.documentElement.getAttribute("data-density") === "compact"
    ? "compact"
    : "comfortable";
}

function getDensityServerSnapshot(): Density {
  return "comfortable";
}

export function UserMenu({ user }: { user: SessionUser }) {
  const density = useSyncExternalStore(
    subscribeDensity,
    getDensitySnapshot,
    getDensityServerSnapshot,
  );

  const setDensity = useCallback((next: Density) => {
    document.documentElement.setAttribute("data-density", next);
    try {
      localStorage.setItem("leados-density", next);
    } catch {
      // Private browsing with storage disabled — the in-memory switch still works.
    }
    for (const listener of densityListeners) listener();
  }, []);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-1.5 rounded-md px-1 py-1 transition-colors hover:bg-hover">
        <span className="grid size-6 place-items-center rounded-full bg-raised text-micro font-semibold text-muted ring-1 ring-line-strong">
          {initials(user.name)}
        </span>
        <ChevronDown className="size-3 text-faint" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-56 rounded-lg border border-line-strong bg-overlay p-1 shadow-[var(--shadow-md)]"
        >
          <div className="px-2 py-2">
            <div className="truncate text-ui font-medium text-ink">{user.name}</div>
            <div className="truncate font-mono text-meta text-muted">{user.email}</div>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-line" />

          <div className="px-2 py-1.5">
            <div className="mb-1.5 text-micro font-semibold tracking-[0.08em] text-faint uppercase">
              Density
            </div>
            <div className="flex items-center gap-1 rounded-md border border-line bg-inset p-0.5">
              {(
                [
                  { value: "comfortable", label: "Comfortable", icon: Rows3 },
                  { value: "compact", label: "Compact", icon: Rows4 },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <DropdownMenu.Item
                  key={value}
                  onSelect={(e) => {
                    e.preventDefault();
                    setDensity(value);
                  }}
                  className={cn(
                    "flex min-h-[32px] flex-1 items-center justify-center gap-1.5 rounded px-2 text-meta font-medium transition-colors outline-none",
                    density === value
                      ? "bg-surface text-ink shadow-[var(--shadow-sm)]"
                      : "text-muted hover:text-ink",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </DropdownMenu.Item>
              ))}
            </div>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-line" />

          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui text-muted transition-colors hover:bg-hover hover:text-ink"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
