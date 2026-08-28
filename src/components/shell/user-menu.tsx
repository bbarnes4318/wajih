"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import type { SessionUser } from "@/lib/auth/session";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ user }: { user: SessionUser }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-1.5 rounded-md px-1 py-1 transition-colors hover:bg-hover">
        <span className="grid size-6 place-items-center rounded-full bg-raised text-[11px] font-semibold text-muted ring-1 ring-line-strong">
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
            <div className="truncate text-[14px] font-medium text-ink">{user.name}</div>
            <div className="truncate font-mono text-[12px] text-muted">{user.email}</div>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-line" />

          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] text-muted transition-colors hover:bg-hover hover:text-ink"
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
