import type { RejectionReasonCode } from "@prisma/client";
import { getDncAdapter } from "@/lib/adapters";
import type { DncListHit } from "@/lib/adapters/types";
import type { StepOutcome } from "../types";
import { timer } from "../types";
import type { DedupClearedContext } from "./step3-dedup";

/**
 * STEP 4 — DNC / TCPA LITIGATOR SCRUB
 *
 * Delegates to the configured scrub adapter and maps list hits onto enum
 * reason codes. A provider outage is a FAIL (SCRUB_PROVIDER_ERROR), never a
 * pass — failing open on a DNC check is the most expensive possible bug in
 * this system, so the code has no path that treats an error as clean.
 */

declare const scrubBrand: unique symbol;

export interface ScrubClearedContext {
  readonly [scrubBrand]: true;
  identity: DedupClearedContext["identity"];
  submission: DedupClearedContext["submission"];
  contact: DedupClearedContext["contact"];
  payload: DedupClearedContext["payload"];
  dedupHash: string;
  dncScrubPassed: true;
  litigatorScrubPassed: true;
}

const HIT_TO_CODE: Record<DncListHit, RejectionReasonCode> = {
  FEDERAL_DNC: "DNC_FEDERAL_MATCH",
  STATE_DNC: "DNC_STATE_MATCH",
  INTERNAL_DNC: "DNC_INTERNAL_MATCH",
  TCPA_LITIGATOR: "TCPA_LITIGATOR_MATCH",
};

/** Litigator match outranks a plain DNC listing when both fire. */
const HIT_PRIORITY: DncListHit[] = [
  "TCPA_LITIGATOR",
  "FEDERAL_DNC",
  "STATE_DNC",
  "INTERNAL_DNC",
];

export async function runScrub(
  ctx: DedupClearedContext,
): Promise<StepOutcome<ScrubClearedContext>> {
  const elapsed = timer();
  const { identity, contact } = ctx;
  const adapter = getDncAdapter();

  const inputData: Record<string, unknown> = {
    source_id: identity.sourceId,
    provider: adapter.name,
    phone_e164: contact.phoneE164,
    state: contact.state,
  };

  let response;
  try {
    response = await adapter.scrub({
      phoneE164: contact.phoneE164,
      stateCode: contact.state,
      leadId: identity.leadId,
      sourceId: identity.sourceId,
    });
  } catch (err) {
    return {
      status: "FAIL",
      step: "STEP_4_DNC_LITIGATOR",
      reasonCode: "SCRUB_PROVIDER_ERROR",
      audit: {
        stepNumber: 4,
        stepName: "DNC / TCPA Litigator Scrub",
        inputData,
        outputStatus: "FAIL",
        outputData: { provider: adapter.name, failed_open: false },
        reasonCode: "SCRUB_PROVIDER_ERROR",
        executionMs: elapsed(),
        errorLog: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (!response.clean) {
    const top =
      HIT_PRIORITY.find((h) => response.hits.includes(h)) ?? response.hits[0];
    const reasonCode = HIT_TO_CODE[top];

    return {
      status: "FAIL",
      step: "STEP_4_DNC_LITIGATOR",
      reasonCode,
      audit: {
        stepNumber: 4,
        stepName: "DNC / TCPA Litigator Scrub",
        inputData,
        outputStatus: "FAIL",
        // The verbatim provider payload is the evidence a TCPA audit asks for.
        outputData: {
          clean: false,
          hits: response.hits,
          provider_latency_ms: response.latencyMs,
          provider_response: response.raw,
        },
        reasonCode,
        executionMs: elapsed(),
        errorLog: null,
      },
    };
  }

  return {
    status: "PASS",
    context: {
      ...ctx,
      dncScrubPassed: true,
      litigatorScrubPassed: true,
    } as unknown as ScrubClearedContext,
    audit: {
      stepNumber: 4,
      stepName: "DNC / TCPA Litigator Scrub",
      inputData,
      outputStatus: "PASS",
      outputData: {
        clean: true,
        hits: [],
        provider_latency_ms: response.latencyMs,
        provider_response: response.raw,
      },
      reasonCode: null,
      executionMs: elapsed(),
      errorLog: null,
    },
  };
}
