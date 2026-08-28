import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-5 backdrop-blur-md xl:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {subtitle && (
          <div className="mt-0.5 truncate text-[12px] leading-tight text-muted">{subtitle}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      <ThemeToggle />
      <UserMenu user={user} />
    </header>
  );
}
