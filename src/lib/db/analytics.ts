import { Prisma, type PipelineStage, type RejectionReasonCode } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Aggregates for the overview dashboards.
 *
 * Deliberately built from `groupBy` and `count` rather than raw SQL views, so
 * the tenancy filters that scope each portal compose the same way they do in
 * the lead queries.
 */

const DAY_MS = 86_400_000;

export interface WindowedTotals {
  submitted: number;
  delivered: number;
  rejected: number;
  held: number;
  disputed: number;
  returned: number;
  revenue: number;
  payout: number;
}

function since(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

export async function networkTotals(days = 30): Promise<WindowedTotals> {
  const from = since(days);
  const createdAt = { gte: from };

  const [
    submitted,
    delivered,
    rejected,
    held,
    disputed,
    returned,
    money,
  ] = await Promise.all([
    prisma.lead.count({ where: { createdAt } }),
    prisma.lead.count({ where: { createdAt, deliveredAt: { not: null } } }),
    prisma.lead.count({ where: { createdAt, pipelineStage: "REJECTED" } }),
    prisma.lead.count({ where: { createdAt, pipelineStage: "HOLD_QUEUE" } }),
    prisma.lead.count({
      where: { createdAt, buyerStatus: { in: ["DISPUTED", "RETURN_APPROVED", "RETURN_DENIED"] } },
    }),
    prisma.lead.count({ where: { createdAt, buyerStatus: "RETURN_APPROVED" } }),
    prisma.lead.aggregate({
      where: { createdAt, deliveredAt: { not: null } },
      _sum: { buyerCostAmount: true, publisherPayoutAmount: true },
    }),
  ]);

  return {
    submitted,
    delivered,
    rejected,
    held,
    disputed,
    returned,
    revenue: Number(money._sum.buyerCostAmount ?? 0),
    payout: Number(money._sum.publisherPayoutAmount ?? 0),
  };
}

/** Same shape for the preceding window, so the tiles can show a delta. */
export async function previousWindowTotals(days = 30): Promise<WindowedTotals> {
  const to = since(days);
  const from = since(days * 2);
  const createdAt = { gte: from, lt: to };

  const [submitted, delivered, rejected, held, disputed, returned, money] =
    await Promise.all([
      prisma.lead.count({ where: { createdAt } }),
      prisma.lead.count({ where: { createdAt, deliveredAt: { not: null } } }),
      prisma.lead.count({ where: { createdAt, pipelineStage: "REJECTED" } }),
      prisma.lead.count({ where: { createdAt, pipelineStage: "HOLD_QUEUE" } }),
      prisma.lead.count({
        where: { createdAt, buyerStatus: { in: ["DISPUTED", "RETURN_APPROVED", "RETURN_DENIED"] } },
      }),
      prisma.lead.count({ where: { createdAt, buyerStatus: "RETURN_APPROVED" } }),
      prisma.lead.aggregate({
        where: { createdAt, deliveredAt: { not: null } },
        _sum: { buyerCostAmount: true, publisherPayoutAmount: true },
      }),
    ]);

  return {
    submitted,
    delivered,
    rejected,
    held,
    disputed,
    returned,
    revenue: Number(money._sum.buyerCostAmount ?? 0),
    payout: Number(money._sum.publisherPayoutAmount ?? 0),
  };
}

/** Safe percentage change; returns null when there is no baseline to compare to. */
export function delta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

export async function stageBreakdown(days = 30) {
  const grouped = await prisma.lead.groupBy({
    by: ["pipelineStage"],
    where: { createdAt: { gte: since(days) } },
    _count: { _all: true },
  });
  return new Map<PipelineStage, number>(
    grouped.map((g) => [g.pipelineStage, g._count._all]),
  );
}

/** Rejection reasons, ranked. The top of this list is where margin leaks. */
export async function rejectionBreakdown(days = 30, limit = 10) {
  const grouped = await prisma.lead.groupBy({
    by: ["rejectionReasonCode", "rejectionStep"],
    where: {
      createdAt: { gte: since(days) },
      rejectionReasonCode: { not: null },
    },
    _count: { _all: true },
    orderBy: { _count: { rejectionReasonCode: "desc" } },
    take: limit,
  });

  return grouped
    .filter((g) => g.rejectionReasonCode !== null)
    .map((g) => ({
      code: g.rejectionReasonCode as RejectionReasonCode,
      step: g.rejectionStep,
      count: g._count._all,
    }));
}

/** Per-day submitted/delivered/rejected series for the volume chart. */
export async function dailyVolume(days = 30) {
  const rows = await prisma.$queryRaw<
    Array<{
      day: Date;
      submitted: bigint;
      delivered: bigint;
      rejected: bigint;
      revenue: Prisma.Decimal | null;
    }>
  >`
    SELECT
      date_trunc('day', "created_at") AS day,
      COUNT(*)                                                    AS submitted,
      COUNT(*) FILTER (WHERE "delivered_at" IS NOT NULL)          AS delivered,
      COUNT(*) FILTER (WHERE "pipeline_stage" = 'REJECTED')       AS rejected,
      SUM("buyer_cost_amount") FILTER (WHERE "delivered_at" IS NOT NULL) AS revenue
    FROM "leads"
    WHERE "created_at" >= ${since(days)}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  return rows.map((r) => ({
    day: r.day.toISOString().slice(0, 10),
    submitted: Number(r.submitted),
    delivered: Number(r.delivered),
    rejected: Number(r.rejected),
    revenue: Number(r.revenue ?? 0),
  }));
}

/** Publisher leaderboard, ordered by delivered volume. */
export async function publisherLeaderboard(days = 30) {
  const publishers = await prisma.organization.findMany({
    where: { type: "PUBLISHER" },
    select: {
      id: true,
      name: true,
      status: true,
      metrics: true,
      vettingProfile: { select: { approvedAt: true } },
    },
    orderBy: { name: "asc" },
  });

  const from = since(days);

  const [submitted, deliveredAgg] = await Promise.all([
    prisma.lead.groupBy({
      by: ["publisherOrgId"],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["publisherOrgId"],
      where: { deliveredAt: { gte: from } },
      _count: { _all: true },
      _sum: { publisherPayoutAmount: true, buyerCostAmount: true },
    }),
  ]);

  const submittedBy = new Map(submitted.map((s) => [s.publisherOrgId, s._count._all]));
  const deliveredBy = new Map(deliveredAgg.map((d) => [d.publisherOrgId, d]));

  return publishers
    .map((p) => {
      const d = deliveredBy.get(p.id);
      const sub = submittedBy.get(p.id) ?? 0;
      const del = d?._count._all ?? 0;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        vetted: Boolean(p.vettingProfile?.approvedAt),
        submitted: sub,
        delivered: del,
        acceptRate: sub === 0 ? 0 : del / sub,
        payout: Number(d?._sum.publisherPayoutAmount ?? 0),
        revenue: Number(d?._sum.buyerCostAmount ?? 0),
        returnRate7d: p.metrics?.returnRate7d ?? 0,
        returnRate14d: p.metrics?.returnRate14d ?? 0,
        returnRate30d: p.metrics?.returnRate30d ?? 0,
        autoSuspendedAt: p.metrics?.autoSuspendedAt ?? null,
      };
    })
    .sort((a, b) => b.delivered - a.delivered);
}

/** Campaign pacing for today — fill against cap and budget. */
export async function campaignPacing() {
  const today = new Date();
  const statDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  const campaigns = await prisma.buyerCampaign.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      vertical: true,
      maxCpl: true,
      dailyBudget: true,
      dailyCapLeads: true,
      priority: true,
      buyer: { select: { name: true } },
      dailyStats: { where: { statDate }, take: 1 },
    },
    orderBy: [{ priority: "asc" }, { name: "asc" }],
  });

  return campaigns.map((c) => {
    const stat = c.dailyStats[0];
    const delivered = stat?.leadsDelivered ?? 0;
    const spend = Number(stat?.spendAmount ?? 0);
    const budget = Number(c.dailyBudget);

    return {
      id: c.id,
      name: c.name,
      buyerName: c.buyer.name,
      vertical: c.vertical,
      priority: c.priority,
      maxCpl: Number(c.maxCpl),
      delivered,
      dailyCapLeads: c.dailyCapLeads,
      capFill: c.dailyCapLeads ? delivered / c.dailyCapLeads : null,
      spend,
      budget,
      budgetFill: budget === 0 ? 0 : spend / budget,
      returned: stat?.leadsReturned ?? 0,
    };
  });
}

/** Open disputes awaiting adjudication. */
export async function openDisputeCount(): Promise<number> {
  return prisma.lead.count({ where: { buyerStatus: "DISPUTED" } });
}

/** Publishers whose vetting is incomplete. */
export async function pendingVettingCount(): Promise<number> {
  return prisma.organization.count({
    where: { type: "PUBLISHER", status: "PENDING_VETTING" },
  });
}

export async function holdQueueCount(): Promise<number> {
  return prisma.lead.count({ where: { pipelineStage: "HOLD_QUEUE" } });
}
