import type { RejectionReasonCode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuditRecord, StepOutcome } from "../types";
import { timer } from "../types";
import { DEDUP_WINDOW_DAYS, buildDedupHash, dedupWindowStart } from "../normalize";
import type { ValidatedContext } from "./step2-validate";

/**
 * STEP 3 — CROSS / INTRA-DATABASE DEDUP
 *
 * SHA-256 over normalized phone + vertical, looked up against every lead
 * accepted in the trailing 30 days. A hit inside the same publisher is
 * INTRA; a hit against a different publisher is CROSS — the distinction
 * matters because cross-publisher duplicates are a network-level arbitrage
 * signal, not a publisher hygiene problem.
 *
 * Only leads that actually reached a buyer count as prior occupants of the
 * window. A lead rejected at step 4 was never sold, so it must not block a
 * later legitimate submission of the same consumer.
 */

declare const dedupBrand: unique symbol;

export interface DedupClearedContext {
  readonly [dedupBrand]: true;
  identity: ValidatedContext["identity"];
  submission: ValidatedContext["submission"];
  contact: ValidatedContext["contact"];
  payload: ValidatedContext["payload"];
  dedupHash: string;
}

/** Stages that mean "this lead occupied the window". */
const OCCUPYING_STAGES = [
  "QUALIFIED",
  "ROUTED",
  "DELIVERED",
  "DISPUTED",
  "ACCEPTED",
  "SETTLED",
] as const;

export async function runDedup(
  ctx: ValidatedContext,
): Promise<StepOutcome<DedupClearedContext>> {
  const elapsed = timer();
  const { identity, contact } = ctx;

  const dedupHash = buildDedupHash(
    contact.phoneE164,
    identity.vertical,
    DEDUP_WINDOW_DAYS,
  );
  const windowStart = dedupWindowStart(identity.receivedAtUtc, DEDUP_WINDOW_DAYS);

  const inputData: Record<string, unknown> = {
    source_id: identity.sourceId,
    dedup_hash: dedupHash,
    hash_preimage: `${contact.phoneE164}|${identity.vertical}|w${DEDUP_WINDOW_DAYS}`,
    window_days: DEDUP_WINDOW_DAYS,
    window_start_utc: windowStart.toISOString(),
  };

  const prior = await prisma.lead.findFirst({
    where: {
      dedupHash,
      createdAt: { gte: windowStart },
      pipelineStage: { in: [...OCCUPYING_STAGES] },
      id: { not: identity.leadId },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      sourceId: true,
      publisherOrgId: true,
      createdAt: true,
      pipelineStage: true,
      buyerOrgId: true,
    },
  });

  if (prior) {
    const intra = prior.publisherOrgId === identity.publisherOrgId;
    const reasonCode: RejectionReasonCode = intra
      ? "DUPLICATE_INTRA_PUBLISHER"
      : "DUPLICATE_CROSS_PUBLISHER";

    const audit: AuditRecord = {
      stepNumber: 3,
      stepName: "Cross/Intra-DB Dedup",
      inputData,
      outputStatus: "FAIL",
      outputData: {
        duplicate: true,
        scope: intra ? "INTRA_PUBLISHER" : "CROSS_PUBLISHER",
        original_lead_id: prior.id,
        original_source_id: prior.sourceId,
        original_received_at: prior.createdAt.toISOString(),
        original_pipeline_stage: prior.pipelineStage,
        age_hours: Math.round(
          (identity.receivedAtUtc.getTime() - prior.createdAt.getTime()) / 36e5,
        ),
      },
      reasonCode,
      executionMs: elapsed(),
      errorLog: null,
    };

    return { status: "FAIL", step: "STEP_3_DEDUP", reasonCode, audit };
  }

  return {
    status: "PASS",
    context: { ...ctx, dedupHash } as unknown as DedupClearedContext,
    audit: {
      stepNumber: 3,
      stepName: "Cross/Intra-DB Dedup",
      inputData,
      outputStatus: "PASS",
      outputData: { duplicate: false, window_days: DEDUP_WINDOW_DAYS },
      reasonCode: null,
      executionMs: elapsed(),
      errorLog: null,
    },
  };
}
