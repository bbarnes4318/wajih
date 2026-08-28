import type {
  BuyerLeadStatus,
  DisputeReasonCode,
  IngressChannel,
  LeadOutcome,
  PipelineStage,
  RejectionReasonCode,
  RejectionStep,
  SettlementStatus,
  Vertical,
} from "@prisma/client";
import type { LeadRow } from "./leads";

/**
 * Serialized shapes crossing the server/client boundary.
 *
 * Prisma `Decimal` is a class instance and does not survive serialization into
 * a Client Component, so every monetary value is converted to a string here
 * once, rather than defensively at each call site.
 */

export interface LeadTableRow {
  id: string;
  sourceId: string;
  vertical: Vertical;
  pipelineStage: PipelineStage;
  rejectionStep: RejectionStep | null;
  rejectionReasonCode: RejectionReasonCode | null;
  holdReason: RejectionReasonCode | null;
  buyerStatus: BuyerLeadStatus;
  disputeReasonCode: DisputeReasonCode | null;
  disputeWindowExpiresAt: string | null;
  settlementStatus: SettlementStatus;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  contactState: string | null;
  contactZip: string | null;
  hasTrustedForm: boolean;
  hasJornaya: boolean;
  trustedformCertUrl: string | null;
  jornayaLeadId: string | null;
  dncScrubPassed: boolean | null;
  litigatorScrubPassed: boolean | null;
  ingressChannel: IngressChannel;
  ingressIp: string | null;
  publisherName: string;
  publisherOrgId: string;
  buyerName: string | null;
  campaignName: string | null;
  publisherPayoutAmount: string | null;
  buyerCostAmount: string | null;
  pipelineDurationMs: number | null;
  createdAt: string;
  receivedAtUtc: string;
  deliveredAt: string | null;
  // Buyer-private. `getLeadDetail` strips this for PUBLISHER before it ever reaches here.
  outcome: LeadOutcome | null;
  outcomeUpdatedAt: string | null;
  outcomeValueAmount: string | null;
}

export function toLeadTableRow(l: LeadRow): LeadTableRow {
  const name = [l.contactFirstName, l.contactLastName].filter(Boolean).join(" ");

  return {
    id: l.id,
    sourceId: l.sourceId,
    vertical: l.vertical,
    pipelineStage: l.pipelineStage,
    rejectionStep: l.rejectionStep,
    rejectionReasonCode: l.rejectionReasonCode,
    holdReason: l.holdReason,
    buyerStatus: l.buyerStatus,
    disputeReasonCode: l.disputeReasonCode,
    disputeWindowExpiresAt: l.disputeWindowExpiresAt?.toISOString() ?? null,
    settlementStatus: l.settlementStatus,
    contactName: name || "—",
    contactPhone: l.contactPhone,
    contactEmail: l.contactEmail,
    contactState: l.contactState,
    contactZip: l.contactZip,
    hasTrustedForm: Boolean(l.trustedformCertUrl),
    hasJornaya: Boolean(l.jornayaLeadId),
    trustedformCertUrl: l.trustedformCertUrl,
    jornayaLeadId: l.jornayaLeadId,
    dncScrubPassed: l.dncScrubPassed,
    litigatorScrubPassed: l.litigatorScrubPassed,
    ingressChannel: l.ingressChannel,
    ingressIp: l.ingressIp,
    publisherName: l.publisher.name,
    publisherOrgId: l.publisher.id,
    buyerName: l.buyer?.name ?? null,
    campaignName: l.campaign?.name ?? null,
    publisherPayoutAmount: l.publisherPayoutAmount?.toString() ?? null,
    buyerCostAmount: l.buyerCostAmount?.toString() ?? null,
    pipelineDurationMs: l.pipelineDurationMs,
    createdAt: l.createdAt.toISOString(),
    receivedAtUtc: l.receivedAtUtc.toISOString(),
    deliveredAt: l.deliveredAt?.toISOString() ?? null,
    outcome: l.outcome,
    outcomeUpdatedAt: l.outcomeUpdatedAt?.toISOString() ?? null,
    outcomeValueAmount: l.outcomeValueAmount?.toString() ?? null,
  };
}

// ---------------------------------------------------------------------------
//  Drill-down detail
// ---------------------------------------------------------------------------

export interface LeadAuditView {
  id: string;
  stepNumber: number;
  stepName: string;
  outputStatus: "PASS" | "FAIL" | "HOLD" | "SKIP";
  reasonCode: RejectionReasonCode | null;
  executionMs: number;
  errorLog: string | null;
  createdAt: string;
  inputData: unknown;
  outputData: unknown;
}

export interface DeliveryAttemptView {
  id: string;
  attemptNumber: number;
  url: string;
  status: string;
  responseStatus: number | null;
  responseBody: string | null;
  latencyMs: number | null;
  errorLog: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  requestHeaders: unknown;
  requestBody: unknown;
}

export interface LeadDetailView extends LeadTableRow {
  payload: unknown;
  consentTextCaptured: string | null;
  dedupHash: string;
  ingressUserAgent: string | null;
  sourceLabel: string | null;
  trafficSource: string | null;
  campaignReturnWindowHours: number | null;
  disputedAt: string | null;
  disputeResolvedAt: string | null;
  disputeNotes: string | null;
  settledAt: string | null;
  auditTrail: LeadAuditView[];
  deliveries: DeliveryAttemptView[];
}

/** Non-null return shape of `getLeadDetail`. */
type LeadDetail = NonNullable<
  Awaited<ReturnType<typeof import("./leads").getLeadDetail>>
>;

export function toLeadDetailView(l: LeadDetail): LeadDetailView {
  const name = [l.contactFirstName, l.contactLastName].filter(Boolean).join(" ");

  return {
    id: l.id,
    sourceId: l.sourceId,
    vertical: l.vertical,
    pipelineStage: l.pipelineStage,
    rejectionStep: l.rejectionStep,
    rejectionReasonCode: l.rejectionReasonCode,
    holdReason: l.holdReason,
    buyerStatus: l.buyerStatus,
    disputeReasonCode: l.disputeReasonCode,
    disputeWindowExpiresAt: l.disputeWindowExpiresAt?.toISOString() ?? null,
    settlementStatus: l.settlementStatus,
    contactName: name || "—",
    contactPhone: l.contactPhone,
    contactEmail: l.contactEmail,
    contactState: l.contactState,
    contactZip: l.contactZip,
    hasTrustedForm: Boolean(l.trustedformCertUrl),
    hasJornaya: Boolean(l.jornayaLeadId),
    trustedformCertUrl: l.trustedformCertUrl,
    jornayaLeadId: l.jornayaLeadId,
    dncScrubPassed: l.dncScrubPassed,
    litigatorScrubPassed: l.litigatorScrubPassed,
    ingressChannel: l.ingressChannel,
    ingressIp: l.ingressIp,
    publisherName: l.publisher.name,
    publisherOrgId: l.publisher.id,
    buyerName: l.buyer?.name ?? null,
    campaignName: l.campaign?.name ?? null,
    publisherPayoutAmount: l.publisherPayoutAmount?.toString() ?? null,
    buyerCostAmount: l.buyerCostAmount?.toString() ?? null,
    pipelineDurationMs: l.pipelineDurationMs,
    createdAt: l.createdAt.toISOString(),
    receivedAtUtc: l.receivedAtUtc.toISOString(),
    deliveredAt: l.deliveredAt?.toISOString() ?? null,
    outcome: l.outcome,
    outcomeUpdatedAt: l.outcomeUpdatedAt?.toISOString() ?? null,
    outcomeValueAmount: l.outcomeValueAmount?.toString() ?? null,

    payload: l.payload,
    consentTextCaptured: l.consentTextCaptured,
    dedupHash: l.dedupHash,
    ingressUserAgent: l.ingressUserAgent,
    sourceLabel: l.source?.label ?? null,
    trafficSource: l.source?.trafficSource ?? null,
    campaignReturnWindowHours: l.campaign?.returnWindowHours ?? null,
    disputedAt: l.disputedAt?.toISOString() ?? null,
    disputeResolvedAt: l.disputeResolvedAt?.toISOString() ?? null,
    disputeNotes: l.disputeNotes,
    settledAt: l.settledAt?.toISOString() ?? null,

    auditTrail: l.auditTrail.map((a) => ({
      id: a.id,
      stepNumber: a.stepNumber,
      stepName: a.stepName,
      outputStatus: a.outputStatus,
      reasonCode: a.reasonCode,
      executionMs: a.executionMs,
      errorLog: a.errorLog,
      createdAt: a.createdAt.toISOString(),
      inputData: a.inputData,
      outputData: a.outputData,
    })),

    deliveries: l.deliveries.map((d) => ({
      id: d.id,
      attemptNumber: d.attemptNumber,
      url: d.url,
      status: d.status,
      responseStatus: d.responseStatus,
      responseBody: d.responseBody,
      latencyMs: d.latencyMs,
      errorLog: d.errorLog,
      nextRetryAt: d.nextRetryAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      requestHeaders: d.requestHeaders,
      requestBody: d.requestBody,
    })),
  };
}
