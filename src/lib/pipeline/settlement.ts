import { Prisma, type DisputeReasonCode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recomputePublisherMetrics } from "@/lib/metrics/publisher-metrics";
import { utcDayStart } from "./normalize";

/**
 * STEPS 9 & 10 — DISPUTE COUNTDOWN AND SETTLEMENT
 *
 * On delivery a return timer starts, sized by the campaign's
 * `return_window_hours`. A buyer may file exactly one structured dispute
 * inside that window. When the window lapses with no dispute the lead
 * auto-settles as payable to the publisher.
 *
 * Every transition is enum-driven; there is no free-text dispute reason.
 */

export type DisputeOutcome =
  | { ok: true }
  | {
      ok: false;
      code:
        | "LEAD_NOT_FOUND"
        | "NOT_DELIVERED"
        | "WINDOW_EXPIRED"
        | "ALREADY_DISPUTED"
        | "ALREADY_SETTLED"
        | "FORBIDDEN";
    };

/** Buyer files a return request inside the dispute window. */
export async function fileDispute(args: {
  leadId: string;
  buyerOrgId: string;
  reasonCode: DisputeReasonCode;
  notes?: string | null;
}): Promise<DisputeOutcome> {
  const lead = await prisma.lead.findUnique({
    where: { id: args.leadId },
    select: {
      id: true,
      buyerOrgId: true,
      publisherOrgId: true,
      deliveredAt: true,
      buyerStatus: true,
      settlementStatus: true,
      disputeWindowExpiresAt: true,
      sourceId: true,
    },
  });

  if (!lead) return { ok: false, code: "LEAD_NOT_FOUND" };
  if (lead.buyerOrgId !== args.buyerOrgId) return { ok: false, code: "FORBIDDEN" };
  if (!lead.deliveredAt) return { ok: false, code: "NOT_DELIVERED" };
  if (lead.settlementStatus !== "UNSETTLED") return { ok: false, code: "ALREADY_SETTLED" };
  if (lead.buyerStatus !== "PENDING") {
    return {
      ok: false,
      code: lead.buyerStatus === "DISPUTED" ? "ALREADY_DISPUTED" : "ALREADY_SETTLED",
    };
  }
  if (!lead.disputeWindowExpiresAt || lead.disputeWindowExpiresAt <= new Date()) {
    return { ok: false, code: "WINDOW_EXPIRED" };
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        buyerStatus: "DISPUTED",
        pipelineStage: "DISPUTED",
        disputeReasonCode: args.reasonCode,
        disputeNotes: args.notes ?? null,
        disputedAt: now,
      },
    }),
    prisma.leadAuditTrail.create({
      data: {
        leadId: lead.id,
        sourceId: lead.sourceId,
        stepNumber: 9,
        stepName: "Dispute Filed",
        inputData: { buyer_org_id: args.buyerOrgId, reason_code: args.reasonCode },
        outputStatus: "PASS",
        outputData: {
          filed_at: now.toISOString(),
          window_expires_at: lead.disputeWindowExpiresAt.toISOString(),
          hours_remaining: Number(
            ((lead.disputeWindowExpiresAt.getTime() - now.getTime()) / 36e5).toFixed(2),
          ),
        },
        executionMs: 0,
      },
    }),
    prisma.notification.create({
      data: {
        orgId: lead.publisherOrgId,
        severity: "WARNING",
        code: "RETURN_DISPUTE_FILED",
        title: "Return dispute filed against a delivered lead",
        body: args.reasonCode,
        leadId: lead.id,
      },
    }),
  ]);

  return { ok: true };
}

/**
 * Admin adjudicates a dispute.
 *
 * Approving a return voids the publisher payout and credits the buyer; the
 * campaign's daily spend is decremented so a returned lead does not consume
 * budget it never earned.
 */
export async function resolveDispute(args: {
  leadId: string;
  adminUserId: string;
  approve: boolean;
}): Promise<DisputeOutcome> {
  const lead = await prisma.lead.findUnique({
    where: { id: args.leadId },
    select: {
      id: true,
      sourceId: true,
      buyerStatus: true,
      publisherOrgId: true,
      campaignId: true,
      buyerCostAmount: true,
      receivedAtUtc: true,
      disputeReasonCode: true,
    },
  });

  if (!lead) return { ok: false, code: "LEAD_NOT_FOUND" };
  if (lead.buyerStatus !== "DISPUTED") return { ok: false, code: "ALREADY_SETTLED" };

  const now = new Date();
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        buyerStatus: args.approve ? "RETURN_APPROVED" : "RETURN_DENIED",
        pipelineStage: args.approve ? "SETTLED" : "ACCEPTED",
        settlementStatus: args.approve ? "CLAWED_BACK" : "SETTLED_PAYABLE",
        settledAt: now,
        disputeResolvedAt: now,
        disputeResolvedBy: args.adminUserId,
        ...(args.approve
          ? { publisherPayoutAmount: new Prisma.Decimal(0) }
          : {}),
      },
    }),
    prisma.leadAuditTrail.create({
      data: {
        leadId: lead.id,
        sourceId: lead.sourceId,
        stepNumber: 10,
        stepName: "Dispute Adjudicated",
        inputData: {
          admin_user_id: args.adminUserId,
          dispute_reason_code: lead.disputeReasonCode,
        },
        outputStatus: "PASS",
        outputData: {
          decision: args.approve ? "RETURN_APPROVED" : "RETURN_DENIED",
          settlement_status: args.approve ? "CLAWED_BACK" : "SETTLED_PAYABLE",
          publisher_payout_voided: args.approve,
        },
        executionMs: 0,
      },
    }),
    prisma.notification.create({
      data: {
        orgId: lead.publisherOrgId,
        severity: args.approve ? "WARNING" : "INFO",
        code: args.approve ? "RETURN_APPROVED" : "RETURN_DENIED",
        title: args.approve
          ? "Return approved — payout clawed back"
          : "Return denied — lead stands as payable",
        body: lead.disputeReasonCode ?? "UNSPECIFIED",
        leadId: lead.id,
      },
    }),
    prisma.adminAuditLog.create({
      data: {
        actorUserId: args.adminUserId,
        action: args.approve ? "APPROVE_RETURN" : "DENY_RETURN",
        entityType: "Lead",
        entityId: lead.id,
        before: { buyer_status: "DISPUTED" },
        after: {
          buyer_status: args.approve ? "RETURN_APPROVED" : "RETURN_DENIED",
        },
      },
    }),
  ];

  if (args.approve && lead.campaignId) {
    ops.push(
      prisma.campaignDailyStat.updateMany({
        where: {
          campaignId: lead.campaignId,
          statDate: utcDayStart(lead.receivedAtUtc),
        },
        data: {
          leadsReturned: { increment: 1 },
          spendAmount: { decrement: lead.buyerCostAmount ?? new Prisma.Decimal(0) },
        },
      }),
    );
  }

  await prisma.$transaction(ops);
  await recomputePublisherMetrics(lead.publisherOrgId);

  return { ok: true };
}

/** Buyer accepts a lead before the window lapses. */
export async function acceptLead(args: {
  leadId: string;
  buyerOrgId: string;
}): Promise<DisputeOutcome> {
  const lead = await prisma.lead.findUnique({
    where: { id: args.leadId },
    select: { id: true, sourceId: true, buyerOrgId: true, buyerStatus: true },
  });

  if (!lead) return { ok: false, code: "LEAD_NOT_FOUND" };
  if (lead.buyerOrgId !== args.buyerOrgId) return { ok: false, code: "FORBIDDEN" };
  if (lead.buyerStatus !== "PENDING") return { ok: false, code: "ALREADY_SETTLED" };

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        buyerStatus: "ACCEPTED",
        pipelineStage: "ACCEPTED",
        settlementStatus: "SETTLED_PAYABLE",
        settledAt: new Date(),
      },
    }),
    prisma.leadAuditTrail.create({
      data: {
        leadId: lead.id,
        sourceId: lead.sourceId,
        stepNumber: 10,
        stepName: "Settlement",
        inputData: { trigger: "BUYER_EXPLICIT_ACCEPT" },
        outputStatus: "PASS",
        outputData: { settlement_status: "SETTLED_PAYABLE" },
        executionMs: 0,
      },
    }),
  ]);

  return { ok: true };
}

/**
 * Auto-settles every delivered lead whose dispute window has lapsed without a
 * dispute. Idempotent — safe to run on a short interval.
 */
export async function settleExpiredDisputeWindows(limit = 500): Promise<{
  settled: number;
  publishersTouched: number;
}> {
  const now = new Date();

  const due = await prisma.lead.findMany({
    where: {
      buyerStatus: "PENDING",
      settlementStatus: "UNSETTLED",
      deliveredAt: { not: null },
      disputeWindowExpiresAt: { lte: now },
    },
    select: { id: true, sourceId: true, publisherOrgId: true },
    take: limit,
  });

  if (due.length === 0) return { settled: 0, publishersTouched: 0 };

  const ids = due.map((l) => l.id);

  await prisma.$transaction([
    prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        buyerStatus: "ACCEPTED",
        pipelineStage: "SETTLED",
        settlementStatus: "SETTLED_PAYABLE",
        settledAt: now,
      },
    }),
    prisma.leadAuditTrail.createMany({
      data: due.map((l) => ({
        leadId: l.id,
        sourceId: l.sourceId,
        stepNumber: 10,
        stepName: "Settlement",
        inputData: { trigger: "DISPUTE_WINDOW_LAPSED" },
        outputStatus: "PASS" as const,
        outputData: {
          settled_at: now.toISOString(),
          settlement_status: "SETTLED_PAYABLE",
        },
        executionMs: 0,
      })),
    }),
  ]);

  const publishers = [...new Set(due.map((l) => l.publisherOrgId))];
  for (const p of publishers) {
    await recomputePublisherMetrics(p);
  }

  return { settled: due.length, publishersTouched: publishers.length };
}

/** Remaining dispute time, for the countdown badge. */
export function disputeCountdown(expiresAt: Date | null, now = new Date()) {
  if (!expiresAt) return { expired: true, totalMs: 0, hours: 0, minutes: 0 };
  const totalMs = expiresAt.getTime() - now.getTime();
  if (totalMs <= 0) return { expired: true, totalMs: 0, hours: 0, minutes: 0 };
  return {
    expired: false,
    totalMs,
    hours: Math.floor(totalMs / 36e5),
    minutes: Math.floor((totalMs % 36e5) / 6e4),
  };
}
