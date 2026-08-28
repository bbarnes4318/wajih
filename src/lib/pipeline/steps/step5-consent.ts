import type { RejectionReasonCode } from "@prisma/client";
import { getConsentAdapter } from "@/lib/adapters";
import type { ConsentFailure } from "@/lib/adapters/types";
import type { StepOutcome } from "../types";
import { timer } from "../types";
import type { ScrubClearedContext } from "./step4-scrub";

/**
 * STEP 5 — CONSENT VERIFICATION
 *
 * Inspects the TrustedForm / Jornaya artifact attached to the lead.
 *
 * A consent failure is a HOLD, not a rejection. The lead is real and may be
 * salvageable — the publisher can supply the certificate — so it parks in
 * HOLD_QUEUE where it is retrievable but structurally undeliverable. It is
 * never discarded and never routed.
 */

declare const consentBrand: unique symbol;

export interface ConsentVerifiedContext {
  readonly [consentBrand]: true;
  identity: ScrubClearedContext["identity"];
  submission: ScrubClearedContext["submission"];
  contact: ScrubClearedContext["contact"];
  payload: ScrubClearedContext["payload"];
  dedupHash: string;
  dncScrubPassed: true;
  litigatorScrubPassed: true;
  certificateType: "TRUSTEDFORM" | "JORNAYA";
}

const FAILURE_TO_CODE: Record<ConsentFailure, RejectionReasonCode> = {
  CERT_MISSING: "CONSENT_CERT_MISSING",
  CERT_MALFORMED: "CONSENT_CERT_MALFORMED",
  CERT_EXPIRED: "CONSENT_CERT_EXPIRED",
  TEXT_MISSING: "CONSENT_TEXT_MISSING",
};

export async function runConsentVerification(
  ctx: ScrubClearedContext,
): Promise<StepOutcome<ConsentVerifiedContext>> {
  const elapsed = timer();
  const { identity, submission } = ctx;
  const adapter = getConsentAdapter();

  const inputData: Record<string, unknown> = {
    source_id: identity.sourceId,
    provider: adapter.name,
    trustedform_cert_url: submission.trustedformCertUrl ?? null,
    jornaya_lead_id: submission.jornayaLeadId ?? null,
    consent_text_present: Boolean(submission.consentText?.trim()),
  };

  let response;
  try {
    response = await adapter.verify({
      certUrl: submission.trustedformCertUrl ?? null,
      jornayaLeadId: submission.jornayaLeadId ?? null,
      consentText: submission.consentText ?? null,
      leadId: identity.leadId,
      sourceId: identity.sourceId,
      receivedAtUtc: identity.receivedAtUtc,
    });
  } catch (err) {
    // A provider outage cannot be allowed to manufacture consent, so it also
    // parks the lead rather than passing it through.
    return {
      status: "HOLD",
      step: "STEP_5_CONSENT",
      reasonCode: "CONSENT_CERT_MISSING",
      audit: {
        stepNumber: 5,
        stepName: "Consent Verification",
        inputData,
        outputStatus: "HOLD",
        outputData: { provider: adapter.name, provider_error: true },
        reasonCode: "CONSENT_CERT_MISSING",
        executionMs: elapsed(),
        errorLog: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (!response.verified) {
    const reasonCode = FAILURE_TO_CODE[response.failure ?? "CERT_MISSING"];
    return {
      status: "HOLD",
      step: "STEP_5_CONSENT",
      reasonCode,
      audit: {
        stepNumber: 5,
        stepName: "Consent Verification",
        inputData,
        outputStatus: "HOLD",
        outputData: {
          verified: false,
          failure: response.failure,
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
      certificateType: response.certificateType ?? "TRUSTEDFORM",
    } as unknown as ConsentVerifiedContext,
    audit: {
      stepNumber: 5,
      stepName: "Consent Verification",
      inputData,
      outputStatus: "PASS",
      outputData: {
        verified: true,
        certificate_type: response.certificateType,
        captured_at: response.capturedAt?.toISOString() ?? null,
        provider_latency_ms: response.latencyMs,
        provider_response: response.raw,
      },
      reasonCode: null,
      executionMs: elapsed(),
      errorLog: null,
    },
  };
}
