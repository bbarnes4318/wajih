import { Prisma, type RejectionReasonCode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { StepOutcome } from "../types";
import { timer, type IntakeIdentity } from "../types";
import { utcDayStart } from "../normalize";
import type { EligibleCampaign, QualifiedContext } from "./step6-qualify";

/**
 * STEP 7 — RULES-BASED ROUTING
 *
 * Selects one buyer from the eligible set and *reserves* capacity against
 * that campaign's daily pacing row before the lead is handed to delivery.
 *
 * Rule 3 is enforced here by the signature: the only value that satisfies
 * `QualifiedContext` is minted inside step 6, which in turn only accepts a
 * `ConsentVerifiedContext` from step 5, which only accepts a
 * `ScrubClearedContext` from step 4, which only accepts a
 * `DedupClearedContext` from step 3. Calling this function with a lead that
 * skipped dedup or DNC is not an error the reviewer has to catch — it does
 * not type-check.
 */

export interface RoutedContext {
  identity: IntakeIdentity;
  contact: QualifiedContext["contact"];
  payload: QualifiedContext["payload"];
  dedupHash: string;
  certificateType: "TRUSTEDFORM" | "JORNAYA";
  campaign: EligibleCampaign;
  buyerCostAmount: Prisma.Decimal;
  publisherPayoutAmount: Prisma.Decimal;
  disputeWindowExpiresAt: Date;
}

/** Default network payout when a publisher has no rate row for the vertical. */
const FALLBACK_PAYOUT_RATIO = 0.6;

interface Candidate {
  campaign: EligibleCampaign;
  delivered: number;
  spend: Prisma.Decimal;
  fillRatio: number;
  budgetRemaining: Prisma.Decimal;
  blocked: RejectionReasonCode | null;
}

export async function runRouting(
  ctx: QualifiedContext,
): Promise<StepOutcome<RoutedContext>> {
  const elapsed = timer();
  const { identity, contact, payload, eligibleCampaigns } = ctx;
  const statDate = utcDayStart(identity.receivedAtUtc);

  const rate = await prisma.publisherRate.findUnique({
    where: {
      publisherOrgId_vertical: {
        publisherOrgId: identity.publisherOrgId,
        vertical: identity.vertical,
      },
    },
    select: { payoutCpl: true },
  });

  const stats = await prisma.campaignDailyStat.findMany({
    where: {
      campaignId: { in: eligibleCampaigns.map((c) => c.campaignId) },
      statDate,
    },
    select: { campaignId: true, leadsDelivered: true, spendAmount: true },
  });
  const statByCampaign = new Map(stats.map((s) => [s.campaignId, s]));

  const inputData: Record<string, unknown> = {
    source_id: identity.sourceId,
    stat_date: statDate.toISOString().slice(0, 10),
    eligible_campaign_count: eligibleCampaigns.length,
    publisher_rate_configured: Boolean(rate),
  };

  // --- Score every eligible campaign against today's pacing ---
  const candidates: Candidate[] = eligibleCampaigns.map((campaign) => {
    const stat = statByCampaign.get(campaign.campaignId);
    const delivered = stat?.leadsDelivered ?? 0;
    const spend = stat?.spendAmount ?? new Prisma.Decimal(0);
    const cost = campaign.maxCpl;

    const payout =
      rate?.payoutCpl ?? cost.mul(new Prisma.Decimal(FALLBACK_PAYOUT_RATIO));

    let blocked: RejectionReasonCode | null = null;
    if (campaign.dailyCapLeads !== null && delivered >= campaign.dailyCapLeads) {
      blocked = "ALL_CAMPAIGNS_CAPPED";
    } else if (spend.add(cost).greaterThan(campaign.dailyBudget)) {
      blocked = "DAILY_BUDGET_EXHAUSTED";
    } else if (payout.greaterThan(cost)) {
      // The network would pay the publisher more than the buyer pays us.
      blocked = "CPL_FLOOR_NOT_MET";
    }

    return {
      campaign,
      delivered,
      spend,
      budgetRemaining: campaign.dailyBudget.sub(spend),
      fillRatio:
        campaign.dailyCapLeads && campaign.dailyCapLeads > 0
          ? delivered / campaign.dailyCapLeads
          : 0,
      blocked,
    };
  });

  const open = candidates.filter((c) => c.blocked === null);

  if (open.length === 0) {
    // Report the blocker shared by the most campaigns — that is the one the
    // ops team can actually act on.
    const tally = new Map<RejectionReasonCode, number>();
    for (const c of candidates) {
      if (c.blocked) tally.set(c.blocked, (tally.get(c.blocked) ?? 0) + 1);
    }
    const reasonCode =
      [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "ALL_CAMPAIGNS_CAPPED";

    return {
      status: "FAIL",
      step: "STEP_7_ROUTING",
      reasonCode,
      audit: {
        stepNumber: 7,
        stepName: "Rules-Based Routing",
        inputData,
        outputStatus: "FAIL",
        outputData: {
          routed: false,
          candidates: candidates.map(serializeCandidate),
        },
        reasonCode,
        executionMs: elapsed(),
        errorLog: null,
      },
    };
  }

  // Priority tier first, then spread volume across under-filled campaigns,
  // then maximize revenue.
  open.sort(
    (a, b) =>
      a.campaign.priority - b.campaign.priority ||
      a.fillRatio - b.fillRatio ||
      b.campaign.maxCpl.comparedTo(a.campaign.maxCpl),
  );

  // --- Reserve capacity, walking the ranked list until one reservation wins ---
  for (const candidate of open) {
    const { campaign } = candidate;
    const cost = campaign.maxCpl;
    const payout =
      rate?.payoutCpl ?? cost.mul(new Prisma.Decimal(FALLBACK_PAYOUT_RATIO));

    const reserved = await reserveCapacity(campaign, statDate, cost);
    if (!reserved) continue; // lost a race to a concurrent lead; try the next

    const disputeWindowExpiresAt = new Date(
      identity.receivedAtUtc.getTime() + campaign.returnWindowHours * 36e5,
    );

    return {
      status: "PASS",
      context: {
        identity,
        contact,
        payload,
        dedupHash: ctx.dedupHash,
        certificateType: ctx.certificateType,
        campaign,
        buyerCostAmount: cost,
        publisherPayoutAmount: payout,
        disputeWindowExpiresAt,
      },
      audit: {
        stepNumber: 7,
        stepName: "Rules-Based Routing",
        inputData,
        outputStatus: "PASS",
        outputData: {
          routed: true,
          selected_campaign_id: campaign.campaignId,
          selected_campaign: campaign.campaignName,
          buyer: campaign.buyerName,
          selection_basis: {
            priority: campaign.priority,
            fill_ratio: Number(candidate.fillRatio.toFixed(4)),
            max_cpl: cost.toString(),
          },
          buyer_cost_amount: cost.toString(),
          publisher_payout_amount: payout.toString(),
          margin: cost.sub(payout).toString(),
          return_window_hours: campaign.returnWindowHours,
          dispute_window_expires_at: disputeWindowExpiresAt.toISOString(),
          candidates: candidates.map(serializeCandidate),
        },
        reasonCode: null,
        executionMs: elapsed(),
        errorLog: null,
      },
    };
  }

  return {
    status: "FAIL",
    step: "STEP_7_ROUTING",
    reasonCode: "ALL_CAMPAIGNS_CAPPED",
    audit: {
      stepNumber: 7,
      stepName: "Rules-Based Routing",
      inputData,
      outputStatus: "FAIL",
      outputData: {
        routed: false,
        note: "All eligible campaigns lost their capacity reservation to concurrent leads.",
        candidates: candidates.map(serializeCandidate),
      },
      reasonCode: "ALL_CAMPAIGNS_CAPPED",
      executionMs: elapsed(),
      errorLog: null,
    },
  };
}

/**
 * Atomically claim one slot on a campaign's daily pacing row.
 *
 * The conditional `updateMany` is what makes concurrent intake safe: two
 * leads racing for the last slot both attempt the increment, and Postgres
 * lets exactly one of them match the `lt: cap` predicate.
 */
async function reserveCapacity(
  campaign: EligibleCampaign,
  statDate: Date,
  cost: Prisma.Decimal,
): Promise<boolean> {
  await prisma.campaignDailyStat.upsert({
    where: { campaignId_statDate: { campaignId: campaign.campaignId, statDate } },
    create: { campaignId: campaign.campaignId, statDate },
    update: {},
  });

  const budgetCeiling = campaign.dailyBudget.sub(cost);

  const result = await prisma.campaignDailyStat.updateMany({
    where: {
      campaignId: campaign.campaignId,
      statDate,
      spendAmount: { lte: budgetCeiling },
      ...(campaign.dailyCapLeads !== null
        ? { leadsDelivered: { lt: campaign.dailyCapLeads } }
        : {}),
    },
    data: {
      leadsDelivered: { increment: 1 },
      spendAmount: { increment: cost },
    },
  });

  return result.count === 1;
}

function serializeCandidate(c: Candidate) {
  return {
    campaign_id: c.campaign.campaignId,
    campaign_name: c.campaign.campaignName,
    buyer: c.campaign.buyerName,
    priority: c.campaign.priority,
    max_cpl: c.campaign.maxCpl.toString(),
    delivered_today: c.delivered,
    daily_cap: c.campaign.dailyCapLeads,
    fill_ratio: Number(c.fillRatio.toFixed(4)),
    budget_remaining: c.budgetRemaining.toString(),
    blocked_by: c.blocked,
  };
}
