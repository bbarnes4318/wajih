import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  Ban,
  CircleCheck,
  CloudUpload,
  ShieldAlert,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StatTile } from "@/components/domain/stat-tile";
import { RejectionBars } from "@/components/domain/charts";
import { requirePublisher } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { AUTO_SUSPEND_RETURN_RATE } from "@/lib/metrics/publisher-metrics";
import { count, money, percent } from "@/lib/format";
import { verticalLabel } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "Publisher Overview" };

/**
 * Query bundle. Kept out of the component so the rolling window is computed
 * where reading the clock is expected, not during render.
 */
async function loadOverview(orgId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const [
    metrics,
    submitted,
    delivered,
    rejected,
    held,
    payoutAgg,
    rejectionMix,
    sources,
  ] = await Promise.all([
    prisma.publisherMetrics.findUnique({ where: { publisherOrgId: orgId } }),
    prisma.lead.count({
      where: { publisherOrgId: orgId, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.lead.count({
      where: { publisherOrgId: orgId, deliveredAt: { gte: thirtyDaysAgo } },
    }),
    prisma.lead.count({
      where: {
        publisherOrgId: orgId,
        createdAt: { gte: thirtyDaysAgo },
        pipelineStage: "REJECTED",
      },
    }),
    prisma.lead.count({
      where: { publisherOrgId: orgId, pipelineStage: "HOLD_QUEUE" },
    }),
    prisma.lead.aggregate({
      where: {
        publisherOrgId: orgId,
        deliveredAt: { gte: thirtyDaysAgo },
        settlementStatus: { in: ["SETTLED_PAYABLE", "UNSETTLED"] },
      },
      _sum: { publisherPayoutAmount: true },
    }),
    prisma.lead.groupBy({
      by: ["rejectionReasonCode", "rejectionStep"],
      where: {
        publisherOrgId: orgId,
        createdAt: { gte: thirtyDaysAgo },
        rejectionReasonCode: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { rejectionReasonCode: "desc" } },
      take: 8,
    }),
    prisma.leadSource.findMany({
      where: { publisherOrgId: orgId },
      select: { sourceId: true, label: true, vertical: true, active: true },
      orderBy: { sourceId: "asc" },
    }),
  ]);

  return {
    metrics,
    submitted,
    delivered,
    rejected,
    held,
    payoutAgg,
    rejectionMix,
    sources,
  };
}

export default async function PublisherOverviewPage() {
  const user = await requirePublisher();
  const {
    metrics,
    submitted,
    delivered,
    rejected,
    held,
    payoutAgg,
    rejectionMix,
    sources,
  } = await loadOverview(user.orgId);

  const rate14 = metrics?.returnRate14d ?? 0;
  const breach = rate14 >= AUTO_SUSPEND_RETURN_RATE;
  const acceptRate = submitted === 0 ? 0 : delivered / submitted;

  const windows = [
    ["7-day", metrics?.returnRate7d ?? 0],
    ["14-day", rate14],
    ["30-day", metrics?.returnRate30d ?? 0],
  ] as const;

  return (
    <>
      <Topbar
        user={user}
        title="Overview"
        subtitle="Trailing 30 days across your sources."
        actions={
          <Button asChild variant="primary" size="sm">
            <Link href="/publisher/upload">
              <CloudUpload className="size-3.5" />
              Upload CSV
            </Link>
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        {user.orgStatus === "SUSPENDED" && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger-border bg-danger-soft px-4 py-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
            <div>
              <p className="text-[14px] font-medium text-danger">Account suspended</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-danger/85">
                Your rolling 14-day return rate reached {percent(rate14, 1)}, at or
                above the {percent(AUTO_SUSPEND_RETURN_RATE, 0)} network threshold.
                Every source now rejects at step 1 with{" "}
                <span className="font-mono">PUBLISHER_SUSPENDED</span>. Contact network
                operations to discuss reinstatement.
              </p>
            </div>
          </div>
        )}

        {user.orgStatus === "PENDING_VETTING" && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-soft px-4 py-3">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-warning">
                Vetting in progress
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-warning/85">
                Your sources will not accept live traffic until all nine verification
                points clear.
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-2">
                <Link href="/publisher/vetting">View checklist status</Link>
              </Button>
            </div>
          </div>
        )}

        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Submitted"
            value={count(submitted)}
            icon={<Activity />}
            sub="last 30 days"
          />
          <StatTile
            label="Delivered"
            value={count(delivered)}
            icon={<CircleCheck />}
            sub={`${percent(acceptRate, 1)} accept rate`}
          />
          <StatTile
            label="Rejected"
            value={count(rejected)}
            icon={<Ban />}
            goodDirection="down"
            sub={
              submitted > 0
                ? `${percent(rejected / submitted, 1)} of submitted`
                : undefined
            }
          />
          <StatTile
            label="Earned"
            value={money(Number(payoutAgg._sum.publisherPayoutAmount ?? 0))}
            icon={<Wallet />}
            sub="payable, last 30 days"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Panel>
            <PanelHeader
              title="Return rate"
              subtitle={`The network auto-suspends at ${percent(AUTO_SUSPEND_RETURN_RATE, 0)} over 14 days.`}
            />
            <PanelBody className="space-y-3">
              {windows.map(([label, value]) => (
                <div key={label} className="flex items-center gap-3">
                  <ProgressRing
                    value={value}
                    max={Math.max(AUTO_SUSPEND_RETURN_RATE * 2, value)}
                    size={38}
                    strokeWidth={4}
                    tone={
                      value >= AUTO_SUSPEND_RETURN_RATE
                        ? "danger"
                        : value >= AUTO_SUSPEND_RETURN_RATE * 0.7
                          ? "warning"
                          : "success"
                    }
                  />
                  <div>
                    <div className="text-[13px] text-muted">{label}</div>
                    <div
                      className={`font-mono text-[14px] font-semibold tabular ${
                        value >= AUTO_SUSPEND_RETURN_RATE ? "text-danger" : "text-ink"
                      }`}
                    >
                      {percent(value, 1)}
                    </div>
                  </div>
                </div>
              ))}
              {breach && (
                <p className="border-t border-line pt-2 text-[12px] leading-relaxed text-danger">
                  Above threshold. Review your top rejection and return reasons before
                  sending more volume.
                </p>
              )}
            </PanelBody>
          </Panel>

          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Why your leads were rejected"
              subtitle="Enum reason codes, last 30 days. Fixing the top two usually moves accept rate more than sending more volume."
              action={
                <Button asChild variant="ghost" size="xs">
                  <Link href="/publisher/leads?stage=REJECTED">View rejected</Link>
                </Button>
              }
            />
            <PanelBody>
              <RejectionBars
                rows={rejectionMix
                  .filter((r) => r.rejectionReasonCode !== null)
                  .map((r) => ({
                    code: r.rejectionReasonCode!,
                    step: r.rejectionStep,
                    count: r._count._all,
                  }))}
              />
            </PanelBody>
          </Panel>
        </div>

        {held > 0 && (
          <Panel className="mt-3">
            <PanelHeader
              title="Hold queue"
              subtitle="Leads retained but undeliverable until a valid consent certificate is supplied."
              action={
                <Button asChild variant="secondary" size="xs">
                  <Link href="/publisher/leads?stage=HOLD_QUEUE">
                    Review {count(held)} held
                  </Link>
                </Button>
              }
            />
            <PanelBody>
              <p className="text-[13px] leading-relaxed text-muted">
                These leads passed dedup and the DNC scrub but arrived without a valid
                TrustedForm or Jornaya certificate. They are not discarded — they are
                blocked from delivery until consent can be evidenced.
              </p>
            </PanelBody>
          </Panel>
        )}

        <Panel className="mt-3">
          <PanelHeader
            title="Your sources"
            subtitle="Source IDs are immutable and must appear on every submission."
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/publisher/sources">Manage</Link>
              </Button>
            }
          />
          <PanelBody dense>
            <ul className="divide-y divide-[var(--border)]">
              {sources.map((s) => (
                <li
                  key={s.sourceId}
                  className="flex items-center justify-between px-4 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[13px] text-accent">
                      {s.sourceId}
                    </div>
                    <div className="text-[12px] text-muted">
                      {s.label} · {verticalLabel(s.vertical)}
                    </div>
                  </div>
                  <span
                    className={`text-[12px] ${s.active ? "text-success" : "text-faint"}`}
                  >
                    {s.active ? "active" : "inactive"}
                  </span>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
