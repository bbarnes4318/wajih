import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  CircleCheck,
  CircleDollarSign,
  Gavel,
  Inbox,
  Target,
  Timer,
} from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/domain/stat-tile";
import { PacingBar } from "@/components/domain/charts";
import { CountdownBadge } from "@/components/domain/countdown-badge";
import { OnboardingChecklist } from "./onboarding-checklist";
import { DISPUTE_REASON, verticalLabel } from "@/lib/domain/labels";
import { requireBuyer } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { count, money, percent, phoneDisplay } from "@/lib/format";
import { utcDayStart } from "@/lib/pipeline/normalize";

export const metadata: Metadata = { title: "Buyer Overview" };

/**
 * Each panel below queries and streams independently — the KPI row doesn't
 * wait on the campaign pacing table's aggregation to paint. Every function
 * re-derives its own rolling window rather than sharing one `loadOverview`
 * bundle, trading a little duplicated `Date` arithmetic for panels that can
 * resolve in any order.
 */

const THIRTY_DAYS_MS = 30 * 86_400_000;

async function KpiRow({ orgId }: { orgId: string }) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setTime(thirtyDaysAgo.getTime() - THIRTY_DAYS_MS);
  const days = 7;
  const rawSpendStart = new Date();
  rawSpendStart.setTime(rawSpendStart.getTime() - (days - 1) * 86_400_000);
  const spendStart = utcDayStart(rawSpendStart);

  const [delivered, spendAgg, accepted, returned, dailySpendRows] = await Promise.all([
    prisma.lead.count({
      where: { buyerOrgId: orgId, deliveredAt: { gte: thirtyDaysAgo } },
    }),
    prisma.lead.aggregate({
      where: {
        buyerOrgId: orgId,
        deliveredAt: { gte: thirtyDaysAgo },
        buyerStatus: { not: "RETURN_APPROVED" },
      },
      _sum: { buyerCostAmount: true },
    }),
    prisma.lead.count({
      where: {
        buyerOrgId: orgId,
        deliveredAt: { gte: thirtyDaysAgo },
        buyerStatus: { in: ["ACCEPTED", "RETURN_DENIED"] },
      },
    }),
    prisma.lead.count({
      where: {
        buyerOrgId: orgId,
        deliveredAt: { gte: thirtyDaysAgo },
        buyerStatus: "RETURN_APPROVED",
      },
    }),
    prisma.campaignDailyStat.groupBy({
      by: ["statDate"],
      where: { campaign: { buyerOrgId: orgId }, statDate: { gte: spendStart } },
      _sum: { spendAmount: true },
    }),
  ]);

  const byDate = new Map(
    dailySpendRows.map((r) => [r.statDate.toISOString(), Number(r._sum.spendAmount ?? 0)]),
  );
  const dailySpend = Array.from({ length: days }, (_, i) => {
    const d = utcDayStart(new Date(spendStart.getTime() + i * 86_400_000));
    return byDate.get(d.toISOString()) ?? 0;
  });

  const spend = Number(spendAgg._sum.buyerCostAmount ?? 0);
  const returnRate = delivered === 0 ? 0 : returned / delivered;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Delivered"
        value={count(delivered)}
        icon={<Inbox />}
        sub="last 30 days"
      />
      <StatTile
        label="Spend"
        value={money(spend)}
        icon={<CircleDollarSign />}
        size="hero"
        sparkline={dailySpend}
        sub={
          delivered > 0
            ? `${money(spend / Math.max(1, delivered))} effective CPL`
            : undefined
        }
        help="Excludes leads where a return was approved. Trend is the last 7 days."
      />
      <StatTile
        label="Accepted"
        value={count(accepted)}
        icon={<CircleCheck />}
        sub={delivered > 0 ? `${percent(accepted / delivered, 1)} of delivered` : undefined}
      />
      <StatTile
        label="Returns approved"
        value={count(returned)}
        icon={<Gavel />}
        goodDirection="down"
        sub={`${percent(returnRate, 1)} return rate`}
      />
    </div>
  );
}

function KpiRowSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Skeleton className="h-[104px]" />
      <Skeleton className="h-[104px]" />
      <Skeleton className="h-[104px]" />
      <Skeleton className="h-[104px]" />
    </div>
  );
}

async function ClosingSoonestPanel({ orgId }: { orgId: string }) {
  const [openWindows, expiringSoon] = await Promise.all([
    prisma.lead.count({
      where: {
        buyerOrgId: orgId,
        buyerStatus: "PENDING",
        deliveredAt: { not: null },
        disputeWindowExpiresAt: { gt: new Date() },
      },
    }),
    prisma.lead.findMany({
      where: {
        buyerOrgId: orgId,
        buyerStatus: "PENDING",
        deliveredAt: { not: null },
        disputeWindowExpiresAt: { gt: new Date() },
      },
      orderBy: { disputeWindowExpiresAt: "asc" },
      take: 8,
      select: {
        id: true,
        contactFirstName: true,
        contactLastName: true,
        contactPhone: true,
        contactState: true,
        vertical: true,
        buyerCostAmount: true,
        disputeWindowExpiresAt: true,
        campaign: { select: { name: true } },
      },
    }),
  ]);

  return (
    <Panel className="xl:col-span-2">
      <PanelHeader
        icon={<Timer className="size-3.5" />}
        title="Return windows closing soonest"
        subtitle="Anything left untouched auto-settles as payable when its window lapses."
        action={
          <Badge tone={openWindows > 0 ? "warning" : "neutral"}>
            {count(openWindows)} open
          </Badge>
        }
      />
      <PanelBody dense>
        {expiringSoon.length === 0 ? (
          <EmptyState
            icon={<CircleCheck />}
            title="No open return windows"
            description="Every delivered lead has settled."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {expiringSoon.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
              >
                <div className="min-w-[11rem] flex-1">
                  <div className="text-body text-ink">
                    {[l.contactFirstName, l.contactLastName].filter(Boolean).join(" ") ||
                      "—"}
                  </div>
                  <div className="font-mono text-meta text-muted tabular">
                    {phoneDisplay(l.contactPhone)} · {l.contactState}
                  </div>
                </div>
                <div className="min-w-[9rem] text-meta text-muted">
                  <div className="truncate text-ink">{l.campaign?.name ?? "—"}</div>
                  <div>{verticalLabel(l.vertical)}</div>
                </div>
                <span className="font-mono text-body text-ink tabular">
                  {money(l.buyerCostAmount)}
                </span>
                <CountdownBadge
                  expiresAt={l.disputeWindowExpiresAt?.toISOString() ?? null}
                />
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}

function ClosingSoonestSkeleton() {
  return (
    <Panel className="xl:col-span-2">
      <PanelHeader title={<Skeleton className="h-4 w-56" />} />
      <PanelBody dense>
        <div className="space-y-px p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}

async function ReturnReasonsPanel({ orgId }: { orgId: string }) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setTime(thirtyDaysAgo.getTime() - THIRTY_DAYS_MS);

  const [reasonMix, disputesOpen] = await Promise.all([
    prisma.lead.groupBy({
      by: ["disputeReasonCode"],
      where: {
        buyerOrgId: orgId,
        disputedAt: { gte: thirtyDaysAgo },
        disputeReasonCode: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { disputeReasonCode: "desc" } },
    }),
    prisma.lead.count({ where: { buyerOrgId: orgId, buyerStatus: "DISPUTED" } }),
  ]);

  return (
    <Panel>
      <PanelHeader title="Your return reasons" subtitle="Last 30 days, by enum code." />
      <PanelBody>
        {reasonMix.length === 0 ? (
          <p className="py-6 text-center text-xs text-faint">
            No returns filed in this window.
          </p>
        ) : (
          <ul className="space-y-2">
            {reasonMix.map((r) => {
              const meta = DISPUTE_REASON[r.disputeReasonCode!];
              return (
                <li key={r.disputeReasonCode} className="flex items-center justify-between gap-2">
                  <Badge tone={meta.tone} title={meta.help}>
                    {meta.label}
                  </Badge>
                  <span className="font-mono text-body text-ink tabular">
                    {r._count._all}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {disputesOpen > 0 && (
          <p className="mt-3 border-t border-line pt-2 text-meta leading-relaxed text-warning">
            {count(disputesOpen)} of your disputes are awaiting adjudication by network
            operations.
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}

function ReturnReasonsSkeleton() {
  return (
    <Panel>
      <PanelHeader title={<Skeleton className="h-4 w-32" />} />
      <PanelBody>
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}

async function CampaignPacingTable({ orgId }: { orgId: string }) {
  const statDate = utcDayStart(new Date());

  const campaigns = await prisma.buyerCampaign.findMany({
    where: { buyerOrgId: orgId },
    include: { dailyStats: { where: { statDate }, take: 1 } },
    orderBy: [{ active: "desc" }, { priority: "asc" }],
  });

  return (
    <Panel>
      <PanelHeader
        icon={<Target className="size-3.5" />}
        title="Campaign pacing — today"
        action={
          <Button asChild variant="ghost" size="xs">
            <Link href="/buyer/campaigns">Manage campaigns</Link>
          </Button>
        }
      />
      <PanelBody dense>
        <div className="grid-scroll">
          <table className="w-full text-left">
            <thead className="border-b border-line bg-inset">
              <tr>
                {["Campaign", "Vertical", "Max CPL", "Cap fill", "Budget fill", "State"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3.5 py-2.5 text-micro font-semibold tracking-[0.08em] text-faint uppercase"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const stat = c.dailyStats[0];
                const deliveredToday = stat?.leadsDelivered ?? 0;
                const spendToday = Number(stat?.spendAmount ?? 0);
                const budget = Number(c.dailyBudget);
                return (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-3.5 py-2.5 text-body text-ink">{c.name}</td>
                    <td className="px-3.5 py-2.5 text-body text-muted">
                      {verticalLabel(c.vertical)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-meta text-ink tabular">
                      {money(c.maxCpl)}
                    </td>
                    <td className="min-w-[9rem] px-3.5 py-2.5">
                      <PacingBar
                        fill={c.dailyCapLeads ? deliveredToday / c.dailyCapLeads : null}
                        label={`${deliveredToday}${c.dailyCapLeads ? ` / ${c.dailyCapLeads}` : ""}`}
                      />
                    </td>
                    <td className="min-w-[9rem] px-3.5 py-2.5">
                      <PacingBar
                        fill={budget === 0 ? 0 : spendToday / budget}
                        label={`${money(spendToday)} / ${money(budget)}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={c.active ? "success" : "neutral"} dot>
                        {c.active ? "Active" : "Paused"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PanelBody>
    </Panel>
  );
}

function CampaignPacingSkeleton() {
  return (
    <Panel>
      <PanelHeader title={<Skeleton className="h-4 w-44" />} />
      <PanelBody dense>
        <div className="space-y-px p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}

/**
 * Only worth checking — and rendering — while the org has never had a
 * delivered lead. Once real volume exists, hasNoDeliveredLeads is false
 * forever and this stops running the onboarding-state query entirely.
 */
async function OnboardingSection({ orgId }: { orgId: string }) {
  const [hasDeliveredLeads, org] = await Promise.all([
    prisma.lead.findFirst({
      where: { buyerOrgId: orgId, deliveredAt: { not: null } },
      select: { id: true },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { onboardingSteps: true, onboardingDismissedAt: true },
    }),
  ]);

  if (hasDeliveredLeads || org.onboardingDismissedAt) return null;

  return <OnboardingChecklist completedSteps={org.onboardingSteps} />;
}

export default async function BuyerOverviewPage() {
  const user = await requireBuyer();

  return (
    <>
      <Topbar
        user={user}
        title="Overview"
        subtitle="Trailing 30 days across your campaigns."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/buyer/leads">
              <Inbox className="size-3.5" />
              Delivery queue
            </Link>
          </Button>
        }
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 xl:p-6">
        <Suspense fallback={null}>
          <OnboardingSection orgId={user.orgId} />
        </Suspense>

        <Suspense fallback={<KpiRowSkeleton />}>
          <KpiRow orgId={user.orgId} />
        </Suspense>

        <div className="grid gap-4 xl:grid-cols-3">
          <Suspense fallback={<ClosingSoonestSkeleton />}>
            <ClosingSoonestPanel orgId={user.orgId} />
          </Suspense>
          <Suspense fallback={<ReturnReasonsSkeleton />}>
            <ReturnReasonsPanel orgId={user.orgId} />
          </Suspense>
        </div>

        <Suspense fallback={<CampaignPacingSkeleton />}>
          <CampaignPacingTable orgId={user.orgId} />
        </Suspense>
      </div>
    </>
  );
}
