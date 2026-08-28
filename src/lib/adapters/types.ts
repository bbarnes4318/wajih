import type { Vertical } from "@prisma/client";

/**
 * Third-party compliance provider contracts.
 *
 * Every external check is expressed as one of these interfaces so the ingest
 * waterfall never imports a vendor SDK directly. Swapping a vendor is a
 * change to `src/lib/adapters/index.ts` and nothing else.
 */

export interface ScrubRequest {
  phoneE164: string;
  stateCode: string | null;
  leadId: string;
  sourceId: string;
}

export type DncListHit =
  | "FEDERAL_DNC"
  | "STATE_DNC"
  | "INTERNAL_DNC"
  | "TCPA_LITIGATOR";

export interface ScrubResponse {
  /** True only when the number is clear on every list the provider checks. */
  clean: boolean;
  hits: DncListHit[];
  /** Verbatim provider response, persisted to the audit trail. */
  raw: Record<string, unknown>;
  provider: string;
  latencyMs: number;
}

export interface DncScrubAdapter {
  readonly name: string;
  scrub(req: ScrubRequest): Promise<ScrubResponse>;
}

export interface ConsentRequest {
  certUrl: string | null;
  jornayaLeadId: string | null;
  consentText: string | null;
  leadId: string;
  sourceId: string;
  /** Lead intake time — a certificate must not predate it by more than the
   *  provider's retention window, nor postdate it at all. */
  receivedAtUtc: Date;
}

export type ConsentFailure =
  | "CERT_MISSING"
  | "CERT_MALFORMED"
  | "CERT_EXPIRED"
  | "TEXT_MISSING";

export interface ConsentResponse {
  verified: boolean;
  failure: ConsentFailure | null;
  /** Which artifact satisfied the check, when verified. */
  certificateType: "TRUSTEDFORM" | "JORNAYA" | null;
  capturedAt: Date | null;
  raw: Record<string, unknown>;
  provider: string;
  latencyMs: number;
}

export interface ConsentAdapter {
  readonly name: string;
  verify(req: ConsentRequest): Promise<ConsentResponse>;
}

export interface DeliveryPayload {
  leadId: string;
  sourceId: string;
  vertical: Vertical;
  receivedAtUtc: string;
  payload: Record<string, unknown>;
  compliance: {
    trustedformCertUrl: string | null;
    jornayaLeadId: string | null;
    consentTextCaptured: string | null;
    dncScrubPassed: boolean;
    litigatorScrubPassed: boolean;
  };
  commercial: {
    campaignId: string;
    buyerCostAmount: string;
    returnWindowHours: number;
    disputeWindowExpiresAt: string;
  };
}
