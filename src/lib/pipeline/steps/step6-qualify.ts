import type { Prisma, RejectionReasonCode, TrafficSource } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  dominantMissKind,
  evaluateCriteria,
  parseCriteria,
  type CriteriaMiss,
} from "../criteria";
import type { StepOutcome } from "../types";
import { timer } from "../types";
import type { ConsentVerifiedContext } from "./step5-consent";

/**
 * STEP 6 — VERTICAL QUALIFIER
 *
 * Evaluates the lead against every active campaign in its vertical and
 * returns the eligible set. Selection between eligible campaigns is step 7's
 * job; this step only answers "who *could* legally buy this?".
 *
 * The per-campaign miss list is persisted, so an admin looking at a rejected
 * lead can see precisely which rule each buyer failed on.
 */

declare const qualifiedBrand: unique symbol;

export interface EligibleCampaign {
  campaignId: string;
  buyerOrgId: string;
  buyerName: string;
  campaignName: string;
  maxCpl: Prisma.Decimal;
  dailyBudget: Prisma.Decimal;
  dailyCapLeads: number | null;
  priority: number;
  returnWindowHours: number;
  deliveryWebhookUrl: string;
  webhookAuthHeader: string | null;
  rulesEvaluated: number;
}

export interface QualifiedContext {
  readonly [qualifiedBrand]: true;
  identity: ConsentVerifiedContext["identity"];
  submission: ConsentVerifiedContext["submission"];
  contact: ConsentVerifiedContext["contact"];
  payload: ConsentVerifiedContext["payload"];
  dedupHash: string;
  dncScrubPassed: true;
  litigatorScrubPassed: true;
  certificateType: "TRUSTEDFORM" | "JORNAYA";
  /** Non-empty by construction — step 6 fails rather than pass an empty set. */
  eligibleCampaigns: EligibleCampaign[];
}

const MISS_TO_CODE: Record<
  ReturnType<typeof dominantMissKind>,
  RejectionReasonCode
> = {
  OUT_OF_GEOGRAPHY: "OUT_OF_GEOGRAPHY",
  AGE_OUT_OF_RANGE: "AGE_OUT_OF_RANGE",
  CRITERIA_MISMATCH: "CRITERIA_MISMATCH",
};

export async function runVerticalQualifier(
  ctx: ConsentVerifiedContext,
): Promise<StepOutcome<QualifiedContext>> {
  const elapsed = timer();
  const { identity, contact, payload } = ctx;

  const source = await prisma.leadSource.findUnique({
    where: { id: identity.leadSourceRefId },
    select: { trafficSource: true },
  });
  const trafficSource: TrafficSource = source?.trafficSource ?? "SEO";

  const campaigns = await prisma.buyerCampaign.findMany({
    where: {
      vertical: identity.vertical,
      active: true,
      buyer: { status: "ACTIVE" },
    },
    include: { buyer: { select: { id: true, name: true } } },
    orderBy: [{ priority: "asc" }, { maxCpl: "desc" }],
  });

  const inputData: Record<string, unknown> = {
    source_id: identity.sourceId,
    vertical: identity.vertical,
    traffic_source: trafficSource,
    state: contact.state,
    zip5: contact.zip5,
    age: contact.age,
    candidate_campaign_count: campaigns.length,
  };

  if (campaigns.length === 0) {
    return {
      status: "FAIL",
      step: "STEP_6_VERTICAL_QUALIFIER",
      reasonCode: "NO_ACTIVE_CAMPAIGN_FOR_VERTICAL",
      audit: {
        stepNumber: 6,
        stepName: "Vertical Qualifier",
        inputData,
        outputStatus: "FAIL",
        outputData: { eligible: 0, evaluated: 0 },
        reasonCode: "NO_ACTIVE_CAMPAIGN_FOR_VERTICAL",
        executionMs: elapsed(),
        errorLog: null,
      },
    };
  }

  const eligible: EligibleCampaign[] = [];
  const rejectedDetail: Array<{
    campaign_id: string;
    campaign_name: string;
    buyer: string;
    misses: CriteriaMiss[];
  }> = [];

  for (const c of campaigns) {
    const result = evaluateCriteria(
      parseCriteria(c.criteriaJson),
      { acceptedStates: c.acceptedStates, acceptedZips: c.acceptedZips },
      { contact, payload, trafficSource },
    );

    if (result.match) {
      eligible.push({
        campaignId: c.id,
        buyerOrgId: c.buyerOrgId,
        buyerName: c.buyer.name,
        campaignName: c.name,
        maxCpl: c.maxCpl,
        dailyBudget: c.dailyBudget,
        dailyCapLeads: c.dailyCapLeads,
        priority: c.priority,
        returnWindowHours: c.returnWindowHours,
        deliveryWebhookUrl: c.deliveryWebhookUrl,
        webhookAuthHeader: c.webhookAuthHeader,
        rulesEvaluated: result.rulesEvaluated,
      });
    } else {
      rejectedDetail.push({
        campaign_id: c.id,
        campaign_name: c.name,
        buyer: c.buyer.name,
        misses: result.misses,
      });
    }
  }

  if (eligible.length === 0) {
    // Every campaign missed. Report the reason that dominates across the
    // network rather than an arbitrary campaign's first failure.
    const allMisses = rejectedDetail.flatMap((r) => r.misses);
    const reasonCode = MISS_TO_CODE[dominantMissKind(allMisses)];

    return {
      status: "FAIL",
      step: "STEP_6_VERTICAL_QUALIFIER",
      reasonCode,
      audit: {
        stepNumber: 6,
        stepName: "Vertical Qualifier",
        inputData,
        outputStatus: "FAIL",
        outputData: {
          eligible: 0,
          evaluated: campaigns.length,
          per_campaign: rejectedDetail,
        },
        reasonCode,
        executionMs: elapsed(),
        errorLog: null,
      },
    };
  }

  return {
    status: "PASS",
    context: { ...ctx, eligibleCampaigns: eligible } as unknown as QualifiedContext,
    audit: {
      stepNumber: 6,
      stepName: "Vertical Qualifier",
      inputData,
      outputStatus: "PASS",
      outputData: {
        eligible: eligible.length,
        evaluated: campaigns.length,
        eligible_campaigns: eligible.map((e) => ({
          campaign_id: e.campaignId,
          campaign_name: e.campaignName,
          buyer: e.buyerName,
          max_cpl: e.maxCpl.toString(),
          priority: e.priority,
        })),
        per_campaign_misses: rejectedDetail,
      },
      reasonCode: null,
      executionMs: elapsed(),
      errorLog: null,
    },
  };
}
