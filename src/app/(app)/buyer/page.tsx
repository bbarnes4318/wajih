import type { Metadata } from "next";
import Link from "next/link";
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
import { StatTile } from "@/components/domain/stat-tile";
import { PacingBar } from "@/components/domain/charts";
import { CountdownBadge } from "@/components/domain/countdown-badge";
import { DISPUTE_REASON, verticalLabel } from "@/lib/domain/labels";
import { requireBuyer } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { count, money, percent, phoneDisplay } from "@/lib/format";
import { utcDayStart } from "@/lib/pipeline/normalize";

export const metadata: Metadata = { title: "Buyer Overview" };

/**
 * Query bundle. Kept out of the component so the rolling window and today's
 * pacing date are computed where reading the clock is expected.
 */
async function loadOverview(orgId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const statDate = utcDayStart(new Date());

  const [
    delivered,
    spendAgg,
    accepted,
    returned,
    openWindows,
    disputesOpen,
    campaigns,
    expiringSoon,
    reasonMix,
  ] = await Promise.all([
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
    prisma.lead.count({
      where: {
        buyerOrgId: orgId,
        buyerStatus: "PENDING",
        deliveredAt: { not: null },
        disputeWindowExpiresAt: { gt: new Date() },
      },
    }),
    prisma.lead.count({ where: { buyerOrgId: orgId, buyerStatus: "DISPUTED" } }),
    prisma.buyerCampaign.findMany({
      where: { buyerOrgId: orgId },
      include: { dailyStats: { where: { statDate }, take: 1 } },
      orderBy: [{ active: "desc" }, { priority: "asc" }],
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
  ]);

  return {
    delivered,
    spendAgg,
    accepted,
    returned,
    openWindows,
    disputesOpen,
    campaigns,
    expiringSoon,
    reasonMix,
  };
}

export default async function BuyerOverviewPage() {
  const user = await requireBuyer();
  const {
    delivered,
    spendAgg,
    accepted,
    returned,
    openWindows,
    disputesOpen,
    campaigns,
    expiringSoon,
    reasonMix,
  } = await loadOverview(user.orgId);

  const spend = Number(spendAgg._sum.buyerCostAmount ?? 0);
  const returnRate = delivered === 0 ? 0 : returned / delivered;

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

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            sub={
              delivered > 0
                ? `${money(spend / Math.max(1, delivered))} effective CPL`
                : undefined
            }
            help="Excludes leads where a return was approved."
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

        <div className="grid gap-4 xl:grid-cols-3">
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
                        <div className="text-[13px] text-ink">
                          {[l.contactFirstName, l.contactLastName]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </div>
                        <div className="font-mono text-[12px] text-muted tabular">
                          {phoneDisplay(l.contactPhone)} · {l.contactState}
                        </div>
                      </div>
                      <div className="min-w-[9rem] text-[12px] text-muted">
                        <div className="truncate text-ink">{l.campaign?.name ?? "—"}</div>
                        <div>{verticalLabel(l.vertical)}</div>
                      </div>
                      <span className="font-mono text-[13px] text-ink tabular">
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

          <Panel>
            <PanelHeader
              title="Your return reasons"
              subtitle="Last 30 days, by enum code."
            />
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
                      <li
                        key={r.disputeReasonCode}
                        className="flex items-center justify-between gap-2"
                      >
                        <Badge tone={meta.tone} title={meta.help}>
                          {meta.label}
                        </Badge>
                        <span className="font-mono text-[13px] text-ink tabular">
                          {r._count._all}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {disputesOpen > 0 && (
                <p className="mt-3 border-t border-line pt-2 text-[12px] leading-relaxed text-warning">
                  {count(disputesOpen)} of your disputes are awaiting adjudication by
                  network operations.
                </p>
              )}
            </PanelBody>
          </Panel>
        </div>

        <Panel className="mt-3">
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
                <thead className="border-b border-line bg-sunken">
                  <tr>
                    {["Campaign", "Vertical", "Max CPL", "Cap fill", "Budget fill", "State"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3.5 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase"
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
                        <td className="px-3.5 py-2.5 text-[13px] text-ink">{c.name}</td>
                        <td className="px-3.5 py-2.5 text-[13px] text-muted">
                          {verticalLabel(c.vertical)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-ink tabular">
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
      </div>
    </>
  );
}
