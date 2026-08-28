import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  CircleCheck,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressRing } from "@/components/ui/progress-ring";
import { OrgStatusChip } from "@/components/domain/status-chip";
import { requireAdmin } from "@/lib/auth/rbac";
import { vettingQueue } from "@/lib/db/vetting";
import { AUTO_SUSPEND_RETURN_RATE } from "@/lib/metrics/publisher-metrics";
import { VETTING_CHECK, VETTING_CHECK_ORDER } from "@/lib/domain/labels";
import { count, percent, shortDate, utcTimestamp } from "@/lib/format";

export const metadata: Metadata = { title: "Vetting Queue" };

type QueueRow = Awaited<ReturnType<typeof vettingQueue>>["pending"][number];

export default async function VettingQueuePage() {
  const user = await requireAdmin();
  const queue = await vettingQueue();

  return (
    <>
      <Topbar
        user={user}
        title="Publisher Vetting Queue"
        subtitle="Nine points of fraud screening stand between a publisher and live traffic."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin/publishers">All publishers</Link>
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        {/* What the nine points are — stated once, at the top of the queue */}
        <Panel className="mb-4">
          <PanelHeader
            icon={<ShieldCheck className="size-3.5" />}
            title="The 9-point standard"
            subtitle="Applied identically to every applicant. Passing all nine is the only route to ACTIVE."
          />
          <PanelBody>
            <ol className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
              {VETTING_CHECK_ORDER.map((key, i) => (
                <li key={key} className="flex gap-2">
                  <span className="mt-px font-mono text-[12px] text-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink">
                      {VETTING_CHECK[key].label}
                    </div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                      {VETTING_CHECK[key].detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </PanelBody>
        </Panel>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel>
            <PanelHeader
              title="Awaiting vetting"
              subtitle="Sources are live only after approval; until then every lead rejects at step 1."
              action={<Badge tone="warning">{queue.pending.length}</Badge>}
            />
            <PanelBody dense>
              {queue.pending.length === 0 ? (
                <EmptyState
                  icon={<CircleCheck />}
                  title="Nothing awaiting vetting"
                  description="Every publisher on the network has been through the checklist."
                />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {queue.pending.map((p) => (
                    <QueueItem key={p.id} publisher={p} />
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Suspended"
              subtitle={`Auto-suspension fires at a rolling 14-day return rate of ${percent(AUTO_SUSPEND_RETURN_RATE, 0)}.`}
              action={<Badge tone="danger">{queue.suspended.length}</Badge>}
            />
            <PanelBody dense>
              {queue.suspended.length === 0 ? (
                <EmptyState
                  icon={<CircleCheck />}
                  title="No suspended publishers"
                  description="Every active account is inside the return-rate threshold."
                />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {queue.suspended.map((p) => (
                    <QueueItem key={p.id} publisher={p} showReturnRate />
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </div>

        <Panel className="mt-3">
          <PanelHeader
            title="Approved and live"
            subtitle="Checklist complete. Return rates are re-evaluated on every settlement."
            action={<Badge tone="success">{queue.active.length}</Badge>}
          />
          <PanelBody dense>
            {queue.active.length === 0 ? (
              <EmptyState title="No active publishers yet" />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {queue.active.map((p) => (
                  <QueueItem key={p.id} publisher={p} showReturnRate />
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}

function QueueItem({
  publisher: p,
  showReturnRate = false,
}: {
  publisher: QueueRow;
  showReturnRate?: boolean;
}) {
  const rate = p.metrics?.returnRate14d ?? 0;
  const breach = rate >= AUTO_SUSPEND_RETURN_RATE;

  return (
    <li>
      <Link
        href={`/admin/publishers/${p.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover"
      >
        <ProgressRing
          value={p.progress.passed}
          max={p.progress.total}
          size={38}
          strokeWidth={4}
          tone={
            p.progress.failed > 0
              ? "danger"
              : p.progress.complete
                ? "success"
                : "accent"
          }
          label={`${p.progress.passed}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[14px] font-medium text-ink">{p.name}</span>
            <OrgStatusChip status={p.status} />
            {p.progress.failed > 0 && (
              <Badge tone="danger">
                <Ban className="size-3" />
                {p.progress.failed} failed
              </Badge>
            )}
            {p.progress.complete && p.status === "PENDING_VETTING" && (
              <Badge tone="success">Ready to approve</Badge>
            )}
            {p.metrics?.autoSuspendedAt && (
              <Badge tone="danger">
                <TriangleAlert className="size-3" />
                Auto-suspended
              </Badge>
            )}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted">
            <span className="font-mono">EIN {p.einTaxId ?? "—"}</span>
            <span>{count(p._count.leadsAsPublisher)} lifetime leads</span>
            {showReturnRate && (
              <span
                className={`font-mono ${breach ? "font-semibold text-danger" : ""}`}
              >
                14d return {percent(rate, 1)}
              </span>
            )}
            {p.vettingProfile?.submittedAt && !p.vettingProfile.approvedAt && (
              <span>submitted {shortDate(p.vettingProfile.submittedAt)}</span>
            )}
            {p.metrics?.autoSuspendedAt && (
              <span className="font-mono text-danger">
                {utcTimestamp(p.metrics.autoSuspendedAt)}
              </span>
            )}
          </div>
        </div>

        <ArrowRight className="size-4 shrink-0 text-faint" />
      </Link>
    </li>
  );
}
