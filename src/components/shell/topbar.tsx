"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreVertical } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { SidebarTrigger } from "./sidebar-trigger";
import type { SessionUser } from "@/lib/auth/session";

export function Topbar({
  title,
  subtitle,
  actions,
  user,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  user: SessionUser;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-3 backdrop-blur-md sm:px-5 xl:px-6">
      <SidebarTrigger />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lede font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {subtitle && (
          <div className="mt-0.5 truncate text-meta leading-tight text-muted">{subtitle}</div>
        )}
      </div>
      {actions && (
        <>
          {/* Desktop/tablet: actions render inline. */}
          <div className="hidden shrink-0 items-center gap-2 sm:flex">{actions}</div>

          {/* Mobile: the same actions collapse into an overflow menu so the
              topbar doesn't wrap or crowd the hamburger/theme/user controls. */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              aria-label="More actions"
              className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink sm:hidden"
            >
              <MoreVertical className="size-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 flex min-w-48 flex-col gap-1 rounded-lg border border-line-strong bg-overlay p-2 shadow-[var(--shadow-md)]"
              >
                {actions}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </>
      )}
      <ThemeToggle />
      <UserMenu user={user} />
    </header>
  );
}
