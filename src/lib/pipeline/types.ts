import type {
  AuditStepStatus,
  IngressChannel,
  RejectionReasonCode,
  RejectionStep,
  Vertical,
} from "@prisma/client";

/** What a publisher hands us, before anything has been trusted. */
export interface RawLeadSubmission {
  sourceId: string;
  /** Optional. When present it must agree with the source's bound vertical. */
  vertical?: string | null;
  payload: Record<string, unknown>;
  trustedformCertUrl?: string | null;
  jornayaLeadId?: string | null;
  consentText?: string | null;
  ingressIp?: string | null;
  ingressUserAgent?: string | null;
  ingressChannel?: IngressChannel;
  batchId?: string | null;
  /** Publisher-asserted capture time. Advisory only — never trusted for
   *  dedup windows or dispute clocks, which use server receipt time. */
  submittedAt?: string | null;
}

/** One row destined for `lead_audit_trail`. */
export interface AuditRecord {
  stepNumber: number;
  stepName: string;
  inputData: Record<string, unknown>;
  outputStatus: AuditStepStatus;
  outputData: Record<string, unknown> | null;
  reasonCode: RejectionReasonCode | null;
  executionMs: number;
  errorLog: string | null;
}

/**
 * Every step returns exactly one of these.
 *
 * `PASS` carries the branded context the *next* step requires as its input.
 * Because each brand is minted by a module-private symbol inside the step
 * that produces it, there is no way to call a later step without having run
 * the earlier ones — Rule 3 is enforced by the type checker, not by review.
 */
export type StepOutcome<TContext> =
  | { status: "PASS"; context: TContext; audit: AuditRecord }
  | {
      status: "FAIL";
      step: RejectionStep;
      reasonCode: RejectionReasonCode;
      audit: AuditRecord;
    }
  | {
      status: "HOLD";
      step: RejectionStep;
      reasonCode: RejectionReasonCode;
      audit: AuditRecord;
    };

/** Normalized contact block projected out of the raw payload at step 2. */
export interface NormalizedContact {
  firstName: string;
  lastName: string;
  phoneE164: string;
  areaCode: string;
  email: string;
  state: string;
  zip5: string;
  dobIso: string | null;
  age: number | null;
}

/** Assembled by step 1 and threaded through every subsequent step. */
export interface IntakeIdentity {
  leadId: string;
  /** Immutable public source identifier (Rule 2). */
  sourceId: string;
  leadSourceRefId: string;
  publisherOrgId: string;
  publisherName: string;
  vertical: Vertical;
  receivedAtUtc: Date;
  ingressIp: string | null;
  ingressUserAgent: string | null;
  ingressChannel: IngressChannel;
  batchId: string | null;
}

/** Helper for consistent millisecond timing across steps. */
export function timer() {
  const started = Date.now();
  return () => Date.now() - started;
}
