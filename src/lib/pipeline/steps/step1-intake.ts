import { randomUUID } from "node:crypto";
import type { RejectionReasonCode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuditRecord, IntakeIdentity, RawLeadSubmission } from "../types";
import { timer } from "../types";

/**
 * STEP 1 — INTAKE TAGGING
 *
 * Mints the persistent UUIDv4 that identifies this lead for the rest of its
 * life, resolves the immutable Source ID to a vetted publisher, and stamps
 * ingress IP / user agent / UTC receipt time.
 *
 * Nothing downstream re-derives these values; they are copied verbatim into
 * every audit row, webhook header, and CSV export.
 */

declare const intakeBrand: unique symbol;

/** Only `runIntake` can mint this. */
export interface IntakeContext {
  readonly [intakeBrand]: true;
  submission: RawLeadSubmission;
  identity: IntakeIdentity;
}

/**
 * Step 1 has a third outcome the other steps do not: a submission whose
 * Source ID resolves to no publisher at all. Such a lead cannot be persisted
 * — there is no tenant to attribute it to, and inventing one would corrupt
 * publisher metrics — so the caller returns an enum code and writes nothing.
 *
 * Once a source *does* resolve, every rejection still produces a Lead row, so
 * the FAIL branch carries the identity needed to write it.
 */
export type IntakeResult =
  | { status: "PASS"; context: IntakeContext; audit: AuditRecord }
  | {
      status: "FAIL";
      identity: IntakeIdentity;
      reasonCode: RejectionReasonCode;
      audit: AuditRecord;
    }
  | {
      status: "UNATTRIBUTABLE";
      reasonCode: Extract<
        RejectionReasonCode,
        "MISSING_SOURCE_ID" | "UNKNOWN_SOURCE_ID"
      >;
      audit: AuditRecord;
    };

export async function runIntake(
  submission: RawLeadSubmission,
  receivedAtUtc: Date,
): Promise<IntakeResult> {
  const elapsed = timer();
  const leadId = randomUUID();

  const inputData: Record<string, unknown> = {
    source_id: submission.sourceId ?? null,
    ingress_ip: submission.ingressIp ?? null,
    ingress_user_agent: submission.ingressUserAgent ?? null,
    ingress_channel: submission.ingressChannel ?? "API",
    received_at_utc: receivedAtUtc.toISOString(),
    publisher_asserted_submitted_at: submission.submittedAt ?? null,
    payload_field_count: Object.keys(submission.payload ?? {}).length,
  };

  const audit = (
    outputStatus: AuditRecord["outputStatus"],
    outputData: Record<string, unknown> | null,
    reasonCode: RejectionReasonCode | null = null,
  ): AuditRecord => ({
    stepNumber: 1,
    stepName: "Intake Tagging",
    inputData,
    outputStatus,
    outputData,
    reasonCode,
    executionMs: elapsed(),
    errorLog: null,
  });

  const rawSourceId = (submission.sourceId ?? "").trim();
  if (!rawSourceId) {
    return {
      status: "UNATTRIBUTABLE",
      reasonCode: "MISSING_SOURCE_ID",
      audit: audit("FAIL", { resolved: false }, "MISSING_SOURCE_ID"),
    };
  }

  const source = await prisma.leadSource.findUnique({
    where: { sourceId: rawSourceId },
    include: { publisher: { select: { id: true, name: true, status: true } } },
  });

  if (!source) {
    return {
      status: "UNATTRIBUTABLE",
      reasonCode: "UNKNOWN_SOURCE_ID",
      audit: audit(
        "FAIL",
        { resolved: false, source_id: rawSourceId },
        "UNKNOWN_SOURCE_ID",
      ),
    };
  }

  const identity: IntakeIdentity = {
    leadId,
    sourceId: source.sourceId,
    leadSourceRefId: source.id,
    publisherOrgId: source.publisherOrgId,
    publisherName: source.publisher.name,
    vertical: source.vertical,
    receivedAtUtc,
    ingressIp: submission.ingressIp ?? null,
    ingressUserAgent: submission.ingressUserAgent ?? null,
    ingressChannel: submission.ingressChannel ?? "API",
    batchId: submission.batchId ?? null,
  };

  const resolved: Record<string, unknown> = {
    lead_id: leadId,
    source_id: source.sourceId,
    source_label: source.label,
    traffic_source: source.trafficSource,
    publisher_org_id: source.publisherOrgId,
    publisher_name: source.publisher.name,
    publisher_status: source.publisher.status,
    vertical: source.vertical,
    source_active: source.active,
  };

  const reject = (reasonCode: RejectionReasonCode): IntakeResult => ({
    status: "FAIL",
    identity,
    reasonCode,
    audit: audit("FAIL", resolved, reasonCode),
  });

  if (!source.active) return reject("SOURCE_INACTIVE");

  switch (source.publisher.status) {
    case "PENDING_VETTING":
      return reject("PUBLISHER_NOT_VETTED");
    case "SUSPENDED":
      return reject("PUBLISHER_SUSPENDED");
    case "TERMINATED":
      return reject("PUBLISHER_TERMINATED");
    case "ACTIVE":
      break;
  }

  return {
    status: "PASS",
    context: { identity, submission } as IntakeContext,
    audit: audit("PASS", resolved),
  };
}
