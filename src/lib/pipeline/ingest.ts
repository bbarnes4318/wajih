import {
  Prisma,
  type PipelineStage,
  type RejectionReasonCode,
  type RejectionStep,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { attemptDelivery } from "@/lib/webhooks/dispatcher";
import { recomputePublisherMetrics } from "@/lib/metrics/publisher-metrics";
import type { AuditRecord, IntakeIdentity, RawLeadSubmission } from "./types";
import { runIntake } from "./steps/step1-intake";
import { runFieldValidation } from "./steps/step2-validate";
import { runDedup } from "./steps/step3-dedup";
import { runScrub } from "./steps/step4-scrub";
import { runConsentVerification } from "./steps/step5-consent";
import { runVerticalQualifier } from "./steps/step6-qualify";
import { runRouting } from "./steps/step7-route";

/**
 * THE INGEST WATERFALL
 *
 * A deterministic, fail-fast sequence. Steps 1-6 are the compliance gate;
 * a lead reaches step 7 only by producing the branded context each prior step
 * mints on success (see `step7-route.ts` for why that is a type-level
 * guarantee rather than a convention).
 *
 *   1 Intake ─▶ 2 Validate ─▶ 3 Dedup ─▶ 4 DNC/Litigator ─▶ 5 Consent
 *     ─▶ 6 Qualify ─▶ 7 Route ─▶ 8 Deliver
 *
 * Any halt writes the full audit trail, stamps an enum reason code, and
 * notifies the publisher. Nothing is ever discarded.
 */

export interface StepSummary {
  step: number;
  name: string;
  status: AuditRecord["outputStatus"];
  executionMs: number;
  reasonCode: RejectionReasonCode | null;
}

export interface IngestResult {
  accepted: boolean;
  leadId: string | null;
  sourceId: string;
  pipelineStage: PipelineStage | null;
  rejectionStep: RejectionStep | null;
  reasonCode: RejectionReasonCode | null;
  routedTo: { campaignId: string; campaignName: string; buyerName: string } | null;
  durationMs: number;
  steps: StepSummary[];
}

export interface IngestOptions {
  /** Defer the webhook POST to the caller (used by CSV batch processing). */
  deferDelivery?: boolean;
  /** Backdate the intake clock. Seeding and replay only — live intake must
   *  always use server receipt time. */
  receivedAtUtc?: Date;
  /** Skip the metrics recompute; batch callers do it once at the end. */
  deferMetrics?: boolean;
}

export async function ingestLead(
  submission: RawLeadSubmission,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const startedAt = Date.now();
  const receivedAtUtc = options.receivedAtUtc ?? new Date();
  const audits: AuditRecord[] = [];

  const summarize = (): StepSummary[] =>
    audits.map((a) => ({
      step: a.stepNumber,
      name: a.stepName,
      status: a.outputStatus,
      executionMs: a.executionMs,
      reasonCode: a.reasonCode,
    }));

  // ---------------------------------------------------------------- STEP 1
  const intake = await runIntake(submission, receivedAtUtc);
  audits.push(intake.audit);

  if (intake.status === "UNATTRIBUTABLE") {
    // No resolvable publisher — there is no tenant to attribute a Lead row to,
    // so the submission is refused at the edge with an enum code.
    return {
      accepted: false,
      leadId: null,
      sourceId: submission.sourceId ?? "",
      pipelineStage: null,
      rejectionStep: "STEP_1_INTAKE",
      reasonCode: intake.reasonCode,
      routedTo: null,
      durationMs: Date.now() - startedAt,
      steps: summarize(),
    };
  }

  const identity =
    intake.status === "PASS" ? intake.context.identity : intake.identity;

  await createLeadRow(identity, submission);

  if (intake.status === "FAIL") {
    return finalizeHalt({
      identity,
      audits,
      stage: "REJECTED",
      step: "STEP_1_INTAKE",
      reasonCode: intake.reasonCode,
      startedAt,
      options,
    });
  }

  // ---------------------------------------------------------------- STEP 2
  const validated = runFieldValidation(intake.context);
  audits.push(validated.audit);
  if (validated.status !== "PASS") {
    return finalizeHalt({
      identity,
      audits,
      stage: "REJECTED",
      step: validated.step,
      reasonCode: validated.reasonCode,
      startedAt,
      options,
    });
  }

  // Persist the normalized projection now so a lead rejected further down the
  // waterfall is still searchable by phone / email in the admin stream.
  await prisma.lead.update({
    where: { id: identity.leadId },
    data: {
      pipelineStage: "VALIDATED",
      payload: validated.context.payload as Prisma.InputJsonValue,
      contactFirstName: validated.context.contact.firstName,
      contactLastName: validated.context.contact.lastName,
      contactPhone: validated.context.contact.phoneE164,
      contactEmail: validated.context.contact.email,
      contactState: validated.context.contact.state,
      contactZip: validated.context.contact.zip5,
    },
  });

  // ---------------------------------------------------------------- STEP 3
  const deduped = await runDedup(validated.context);
  audits.push(deduped.audit);
  if (deduped.status !== "PASS") {
    return finalizeHalt({
      identity,
      audits,
      stage: "REJECTED",
      step: deduped.step,
      reasonCode: deduped.reasonCode,
      startedAt,
      options,
      extra: { dedupHash: hashFromAudit(deduped.audit) },
    });
  }

  await prisma.lead.update({
    where: { id: identity.leadId },
    data: { dedupHash: deduped.context.dedupHash },
  });

  // ---------------------------------------------------------------- STEP 4
  const scrubbed = await runScrub(deduped.context);
  audits.push(scrubbed.audit);
  if (scrubbed.status !== "PASS") {
    return finalizeHalt({
      identity,
      audits,
      stage: "REJECTED",
      step: scrubbed.step,
      reasonCode: scrubbed.reasonCode,
      startedAt,
      options,
      extra: { dncScrubPassed: false, litigatorScrubPassed: false },
    });
  }

  await prisma.lead.update({
    where: { id: identity.leadId },
    data: {
      pipelineStage: "SCRUBBED",
      dncScrubPassed: true,
      litigatorScrubPassed: true,
    },
  });

  // ---------------------------------------------------------------- STEP 5
  const consented = await runConsentVerification(scrubbed.context);
  audits.push(consented.audit);
  if (consented.status !== "PASS") {
    // HOLD, not REJECTED: the lead is retained and blocked from delivery.
    return finalizeHalt({
      identity,
      audits,
      stage: "HOLD_QUEUE",
      step: consented.step,
      reasonCode: consented.reasonCode,
      startedAt,
      options,
      hold: true,
    });
  }

  await prisma.lead.update({
    where: { id: identity.leadId },
    data: {
      pipelineStage: "CONSENT_VERIFIED",
      trustedformCertUrl: submission.trustedformCertUrl ?? null,
      jornayaLeadId: submission.jornayaLeadId ?? null,
      consentTextCaptured: submission.consentText ?? null,
    },
  });

  // ---------------------------------------------------------------- STEP 6
  const qualified = await runVerticalQualifier(consented.context);
  audits.push(qualified.audit);
  if (qualified.status !== "PASS") {
    return finalizeHalt({
      identity,
      audits,
      stage: "REJECTED",
      step: qualified.step,
      reasonCode: qualified.reasonCode,
      startedAt,
      options,
    });
  }

  await prisma.lead.update({
    where: { id: identity.leadId },
    data: { pipelineStage: "QUALIFIED" },
  });

  // ---------------------------------------------------------------- STEP 7
  const routed = await runRouting(qualified.context);
  audits.push(routed.audit);
  if (routed.status !== "PASS") {
    return finalizeHalt({
      identity,
      audits,
      stage: "REJECTED",
      step: routed.step,
      reasonCode: routed.reasonCode,
      startedAt,
      options,
    });
  }

  const { campaign, buyerCostAmount, publisherPayoutAmount, disputeWindowExpiresAt } =
    routed.context;

  const durationMs = Date.now() - startedAt;

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: identity.leadId },
      data: {
        pipelineStage: "ROUTED",
        buyerOrgId: campaign.buyerOrgId,
        campaignId: campaign.campaignId,
        buyerCostAmount,
        publisherPayoutAmount,
        disputeWindowExpiresAt,
        buyerStatus: "PENDING",
        pipelineDurationMs: durationMs,
      },
    }),
    prisma.leadAuditTrail.createMany({
      data: audits.map((a) => toAuditRow(identity, a)),
    }),
  ]);

  // ---------------------------------------------------------------- STEP 8
  if (!options.deferDelivery) {
    await attemptDelivery(identity.leadId);
  }

  if (!options.deferMetrics) {
    await recomputePublisherMetrics(identity.publisherOrgId);
  }

  return {
    accepted: true,
    leadId: identity.leadId,
    sourceId: identity.sourceId,
    pipelineStage: "ROUTED",
    rejectionStep: null,
    reasonCode: null,
    routedTo: {
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      buyerName: campaign.buyerName,
    },
    durationMs,
    steps: audits.map((a) => ({
      step: a.stepNumber,
      name: a.stepName,
      status: a.outputStatus,
      executionMs: a.executionMs,
      reasonCode: a.reasonCode,
    })),
  };
}

// ---------------------------------------------------------------------------
//  Persistence helpers
// ---------------------------------------------------------------------------

async function createLeadRow(
  identity: IntakeIdentity,
  submission: RawLeadSubmission,
) {
  await prisma.lead.create({
    data: {
      id: identity.leadId,
      sourceId: identity.sourceId,
      leadSourceRefId: identity.leadSourceRefId,
      publisherOrgId: identity.publisherOrgId,
      vertical: identity.vertical,
      receivedAtUtc: identity.receivedAtUtc,
      ingressIp: identity.ingressIp,
      ingressUserAgent: identity.ingressUserAgent,
      ingressChannel: identity.ingressChannel,
      batchId: identity.batchId,
      payload: (submission.payload ?? {}) as Prisma.InputJsonValue,
      // Placeholder until step 3 computes the real digest. A rejection before
      // step 3 leaves this marker, which never collides with a SHA-256 hex.
      dedupHash: "PENDING",
      pipelineStage: "INTAKE",
    },
  });
}

function toAuditRow(
  identity: IntakeIdentity,
  a: AuditRecord,
): Prisma.LeadAuditTrailCreateManyInput {
  return {
    leadId: identity.leadId,
    sourceId: identity.sourceId,
    stepNumber: a.stepNumber,
    stepName: a.stepName,
    inputData: a.inputData as Prisma.InputJsonValue,
    outputStatus: a.outputStatus,
    outputData: (a.outputData ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    reasonCode: a.reasonCode,
    executionMs: a.executionMs,
    errorLog: a.errorLog,
  };
}

function hashFromAudit(a: AuditRecord): string | undefined {
  const v = a.inputData["dedup_hash"];
  return typeof v === "string" ? v : undefined;
}

interface FinalizeArgs {
  identity: IntakeIdentity;
  audits: AuditRecord[];
  stage: PipelineStage;
  step: RejectionStep;
  reasonCode: RejectionReasonCode;
  startedAt: number;
  options: IngestOptions;
  hold?: boolean;
  extra?: {
    dedupHash?: string;
    dncScrubPassed?: boolean;
    litigatorScrubPassed?: boolean;
  };
}

/**
 * Single exit path for every halt. Writes the terminal lead state, the full
 * audit trail, and the publisher notification in one transaction so a lead is
 * never observable in a half-rejected state.
 */
async function finalizeHalt(args: FinalizeArgs): Promise<IngestResult> {
  const { identity, audits, stage, step, reasonCode, startedAt, options } = args;
  const durationMs = Date.now() - startedAt;

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: identity.leadId },
      data: {
        pipelineStage: stage,
        rejectionStep: args.hold ? null : step,
        rejectionReasonCode: args.hold ? null : reasonCode,
        holdReason: args.hold ? reasonCode : null,
        pipelineDurationMs: durationMs,
        ...(args.extra?.dedupHash ? { dedupHash: args.extra.dedupHash } : {}),
        ...(args.extra?.dncScrubPassed !== undefined
          ? { dncScrubPassed: args.extra.dncScrubPassed }
          : {}),
        ...(args.extra?.litigatorScrubPassed !== undefined
          ? { litigatorScrubPassed: args.extra.litigatorScrubPassed }
          : {}),
      },
    }),
    prisma.leadAuditTrail.createMany({
      data: audits.map((a) => toAuditRow(identity, a)),
    }),
    prisma.notification.create({
      data: {
        orgId: identity.publisherOrgId,
        severity: args.hold ? "WARNING" : "INFO",
        code: args.hold ? "LEAD_HELD" : "LEAD_REJECTED",
        title: args.hold
          ? `Lead held at ${stepLabel(step)}`
          : `Lead rejected at ${stepLabel(step)}`,
        // The body carries the code, never a free-text explanation (Rule 1).
        body: reasonCode,
        leadId: identity.leadId,
      },
    }),
  ]);

  if (!options.deferMetrics) {
    await recomputePublisherMetrics(identity.publisherOrgId);
  }

  return {
    accepted: false,
    leadId: identity.leadId,
    sourceId: identity.sourceId,
    pipelineStage: stage,
    rejectionStep: args.hold ? null : step,
    reasonCode,
    routedTo: null,
    durationMs,
    steps: audits.map((a) => ({
      step: a.stepNumber,
      name: a.stepName,
      status: a.outputStatus,
      executionMs: a.executionMs,
      reasonCode: a.reasonCode,
    })),
  };
}

function stepLabel(step: RejectionStep): string {
  return step.replace(/^STEP_(\d)_/, "step $1 · ").replace(/_/g, " ").toLowerCase();
}
