import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { JsonBlock } from "@/components/domain/json-block";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { humanize } from "@/lib/domain/labels";
import { relativeTime, utcTimestamp } from "@/lib/format";

export const metadata: Metadata = { title: "Admin Audit Log" };

/**
 * Append-only record of every privileged action. System-initiated entries
 * (auto-suspension) record the organization as the actor rather than a user.
 */
export default async function AdminAuditPage() {
  const user = await requireAdmin();

  const entries = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  const actorIds = [...new Set(entries.map((e) => e.actorUserId))];
  const [users, orgs] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.organization.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true },
    }),
  ]);

  const actorName = new Map<string, string>([
    ...users.map((u) => [u.id, u.name] as const),
    ...orgs.map((o) => [o.id, `${o.name} (system)`] as const),
  ]);

  return (
    <>
      <Topbar
        user={user}
        title="Admin Audit Log"
        subtitle="Every privileged action, with the before and after state."
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <Panel>
          <PanelHeader
            icon={<ScrollText className="size-3.5" />}
            title="Recent actions"
            subtitle="Newest first, last 150 entries."
          />
          <PanelBody dense>
            {entries.length === 0 ? (
              <EmptyState title="No admin actions recorded yet" />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {entries.map((e) => (
                  <li key={e.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="accent" className="font-mono">
                        {e.action}
                      </Badge>
                      <span className="text-[14px] text-ink">
                        {humanize(e.entityType)}
                      </span>
                      <code className="font-mono text-[12px] text-faint">
                        {e.entityId}
                      </code>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                      <span>{actorName.get(e.actorUserId) ?? "unknown actor"}</span>
                      <span className="text-faint">·</span>
                      <span title={utcTimestamp(e.createdAt)} className="font-mono">
                        {relativeTime(e.createdAt)}
                      </span>
                    </div>

                    {(e.before || e.after) && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[12px] text-muted select-none">
                          State change
                        </summary>
                        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                          <div>
                            <div className="mb-1 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                              Before
                            </div>
                            <JsonBlock value={e.before} maxHeight="10rem" />
                          </div>
                          <div>
                            <div className="mb-1 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                              After
                            </div>
                            <JsonBlock value={e.after} maxHeight="10rem" />
                          </div>
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
