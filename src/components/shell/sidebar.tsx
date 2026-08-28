"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import type { UserRole } from "@prisma/client";
import { NAV, PORTAL_LABEL, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ORG_STATUS, USER_ROLE } from "@/lib/domain/labels";
import type { OrgStatus } from "@prisma/client";

type IconName = keyof typeof Icons;

function NavIcon({ name, className }: { name: string; className?: string }) {
  const Cmp = Icons[name as IconName] as React.ComponentType<{
    className?: string;
  }>;
  if (!Cmp) return null;
  return <Cmp className={className} />;
}

function isActive(pathname: string, item: NavItem) {
  if (item.prefix) return pathname === item.href || pathname.startsWith(`${item.href}/`);
  return pathname === item.href;
}

export function Sidebar({
  role,
  orgName,
  orgStatus,
  unreadCount,
}: {
  role: UserRole;
  orgName: string;
  orgStatus: OrgStatus;
  unreadCount: number;
}) {
  const pathname = usePathname();
  const sections = NAV[role];

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-surface"
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <div className="grid size-7 place-items-center rounded-md bg-accent text-[13px] font-bold text-white shadow-[var(--shadow-sm)]">
          L
        </div>
        <div className="min-w-0 leading-none">
          <div className="truncate text-[14px] font-semibold tracking-tight text-ink">
            LeadOS
          </div>
          <div className="mt-0.5 truncate text-[11px] tracking-wide text-faint uppercase">
            {PORTAL_LABEL[role]}
          </div>
        </div>
      </div>

      {/* Org identity */}
      <div className="border-b border-line px-4 py-3">
        <div className="truncate text-xs font-medium text-ink" title={orgName}>
          {orgName}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Badge tone={USER_ROLE[role].tone}>{USER_ROLE[role].label}</Badge>
          <Badge tone={ORG_STATUS[orgStatus].tone} dot>
            {ORG_STATUS[orgStatus].label}
          </Badge>
        </div>
      </div>

      {/* Sections */}
      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {sections.map((section) => (
          <div key={section.label} className="mb-4 px-2 last:mb-0">
            <div className="mb-1 px-2 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
              {section.label}
            </div>
            <ul className="space-y-px">
              {section.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors",
                        active
                          ? "bg-accent-soft font-medium text-accent before:absolute before:top-1.5 before:bottom-1.5 before:-left-2.5 before:w-0.5 before:rounded-r before:bg-accent"
                          : "text-muted hover:bg-hover hover:text-ink",
                      )}
                    >
                      <NavIcon
                        name={item.icon}
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-accent" : "text-faint group-hover:text-muted",
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line px-4 py-2.5">
        <Link
          href={`${role === "SUPER_ADMIN" ? "/admin" : role === "PUBLISHER" ? "/publisher" : "/buyer"}/notifications`}
          className="flex items-center justify-between text-xs text-muted transition-colors hover:text-ink"
        >
          <span className="flex items-center gap-2">
            <Icons.Bell className="size-3.5 text-faint" />
            Notifications
          </span>
          {unreadCount > 0 && (
            <Badge tone="danger">{unreadCount > 99 ? "99+" : unreadCount}</Badge>
          )}
        </Link>
      </div>
    </nav>
  );
}
