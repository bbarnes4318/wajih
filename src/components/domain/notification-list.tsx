import Link from "next/link";
import type { NotificationSeverity } from "@prisma/client";
import { Bell, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime, utcTimestamp } from "@/lib/format";
import { REJECTION_REASON, humanize } from "@/lib/domain/labels";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export interface NotificationRow {
  id: string;
  severity: NotificationSeverity;
  code: string;
  title: string;
  body: string;
  leadId: string | null;
  readAt: string | null;
  createdAt: string;
}

const ICON = {
  INFO: Info,
  WARNING: TriangleAlert,
  CRITICAL: CircleAlert,
} as const;

/**
 * Notification feed.
 *
 * `body` holds an enum code rather than prose (Rule 1), so it is resolved to a
 * human label here at render time instead of being written as free text when
 * the notification was created.
 */
export function NotificationList({
  rows,
  leadHref,
}: {
  rows: NotificationRow[];
  /** Builds the drill-down link for the current portal. */
  leadHref: (leadId: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Bell />}
        title="Nothing to report"
        description="Rejections, holds, disputes and status changes all appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((n) => {
        const Icon = ICON[n.severity];
        const known = REJECTION_REASON[n.body as keyof typeof REJECTION_REASON];

        return (
          <li
            key={n.id}
            className={cn(
              "flex items-start gap-3 px-4 py-3",
              !n.readAt && "bg-accent-soft/30",
            )}
          >
            <span
              className={cn(
                "mt-px grid size-6 shrink-0 place-items-center rounded-full border",
                n.severity === "CRITICAL" && "border-danger-border bg-danger-soft text-danger",
                n.severity === "WARNING" && "border-warning-border bg-warning-soft text-warning",
                n.severity === "INFO" && "border-info-border bg-info-soft text-info",
              )}
            >
              <Icon className="size-3" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ui font-medium text-ink">{n.title}</span>
                <Badge tone="neutral" className="font-mono">
                  {n.code}
                </Badge>
                {!n.readAt && <Badge tone="accent">New</Badge>}
              </div>

              <div className="mt-0.5 text-body leading-relaxed text-muted">
                {known ? (
                  <span title={known.help}>{known.label}</span>
                ) : (
                  <span className="font-mono text-meta">{n.body}</span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-micro text-faint">
                <span title={utcTimestamp(n.createdAt)}>{relativeTime(n.createdAt)}</span>
                {n.leadId && (
                  <>
                    <span>·</span>
                    <Link href={leadHref(n.leadId)} className="text-accent hover:underline">
                      inspect lead
                    </Link>
                  </>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Resolves a notification code to a readable heading when it is not a reason code. */
export function notificationHeading(code: string): string {
  return humanize(code);
}
