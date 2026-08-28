"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { NAV, type NavItem } from "@/lib/nav";
import { NavIcon } from "./sidebar";
import { useHotkey } from "@/lib/hooks/use-hotkey";

/**
 * ⌘K / Ctrl+K, cross-portal navigation plus a lead lookup shortcut. `NAV` is
 * already role-keyed, so the nav list works for any role — only mounted for
 * BUYER today (see `(app)/layout.tsx`), matching this redesign's scope.
 */
export function CommandPalette({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useHotkey("k", () => setOpen((o) => !o), { meta: true });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  const navItems = useMemo<NavItem[]>(() => NAV[role].flatMap((s) => s.items), [role]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navItems;
    return navItems.filter((item) => item.label.toLowerCase().includes(q));
  }, [navItems, query]);

  const trimmed = query.trim();
  const showLookup = filtered.length === 0 && trimmed.length >= 3;

  function go(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed top-24 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-[var(--shadow-lg)]"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
            <Search className="size-4 shrink-0 text-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && showLookup) {
                  go(`/buyer/leads?q=${encodeURIComponent(trimmed)}`);
                }
              }}
              placeholder="Go to a page, or look up by phone / Source ID…"
              className="min-w-0 flex-1 bg-transparent text-ui text-ink outline-none placeholder:text-faint"
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5">
            {filtered.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => go(item.href)}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-md px-2.5 text-left text-body text-ink transition-colors hover:bg-hover"
              >
                <NavIcon name={item.icon} className="size-4 text-faint" />
                {item.label}
              </button>
            ))}

            {showLookup && (
              <button
                type="button"
                onClick={() => go(`/buyer/leads?q=${encodeURIComponent(trimmed)}`)}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-md px-2.5 text-left text-body text-ink transition-colors hover:bg-hover"
              >
                <Search className="size-4 text-faint" />
                Look up &ldquo;{trimmed}&rdquo; in the delivery queue
              </button>
            )}

            {filtered.length === 0 && !showLookup && (
              <p className="px-2.5 py-6 text-center text-body text-faint">No matches.</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
