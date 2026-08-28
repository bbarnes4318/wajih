"use server";

import { revalidatePath } from "next/cache";
import type { DisputeReasonCode, LeadOutcome } from "@prisma/client";
import { assertRole } from "@/lib/auth/rbac";
import { acceptLead, fileDispute } from "@/lib/pipeline/settlement";
import { prisma } from "@/lib/db/prisma";

/**
 * Buyer-side commercial actions.
 *
 * Both re-check the role and pass the caller's own org id into the settlement
 * layer, which verifies the lead actually belongs to them — a buyer cannot
 * dispute a lead delivered to someone else by guessing its id.
 */

export interface DisputeActionResult {
  ok: boolean;
  error?: string;
}

export async function fileDisputeAction(
  formData: FormData,
): Promise<DisputeActionResult> {
  const user = await assertRole("BUYER");

  const leadId = String(formData.get("leadId") ?? "");
  const reasonCode = String(formData.get("reasonCode") ?? "") as DisputeReasonCode;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!leadId || !reasonCode) return { ok: false, error: "MISSING_FIELDS" };

  const result = await fileDispute({
    leadId,
    buyerOrgId: user.orgId,
    reasonCode,
    notes,
  });

  if (!result.ok) return { ok: false, error: result.code };

  revalidatePath("/buyer/leads");
  revalidatePath("/buyer");
  return { ok: true };
}

export async function acceptLeadAction(
  formData: FormData,
): Promise<DisputeActionResult> {
  const user = await assertRole("BUYER");
  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) return { ok: false, error: "MISSING_FIELDS" };

  const result = await acceptLead({ leadId, buyerOrgId: user.orgId });
  if (!result.ok) return { ok: false, error: result.code };

  revalidatePath("/buyer/leads");
  revalidatePath("/buyer");
  return { ok: true };
}

export interface BulkAcceptResult {
  results: Array<{ leadId: string; ok: boolean; error?: string }>;
}

/**
 * Bulk accept. Next dispatches Server Actions one at a time per client, so a
 * client-side loop over `acceptLeadAction` would serialize into N round
 * trips — this does the loop server-side instead, in a single request.
 * `acceptLead` already returns a discriminated result rather than throwing,
 * so a lead whose state changed out from under the batch (already settled,
 * concurrently disputed) is skipped and reported, not treated as a batch
 * failure.
 */
export async function acceptLeadsAction(leadIds: string[]): Promise<BulkAcceptResult> {
  const user = await assertRole("BUYER");

  const results: BulkAcceptResult["results"] = [];
  for (const leadId of leadIds) {
    const result = await acceptLead({ leadId, buyerOrgId: user.orgId });
    results.push(
      result.ok ? { leadId, ok: true } : { leadId, ok: false, error: result.code },
    );
  }

  revalidatePath("/buyer/leads");
  revalidatePath("/buyer");
  return { results };
}

/**
 * Buyer's own sales-pipeline annotation on a lead — entirely separate from
 * `buyerStatus`/`settlementStatus`, so it never touches `pipeline/settlement.ts`.
 * Never fed into publisher-facing views or auto-suspension: a buyer's sales
 * performance is not a supply-quality signal.
 */
export async function setLeadOutcomeAction(
  leadId: string,
  outcome: LeadOutcome,
  valueAmount?: number | null,
): Promise<DisputeActionResult> {
  const user = await assertRole("BUYER");
  if (!leadId) return { ok: false, error: "MISSING_FIELDS" };

  const result = await prisma.lead.updateMany({
    where: { id: leadId, buyerOrgId: user.orgId },
    data: {
      outcome,
      outcomeUpdatedAt: new Date(),
      outcomeValueAmount: outcome === "SOLD" ? (valueAmount ?? null) : null,
    },
  });

  if (result.count === 0) return { ok: false, error: "NOT_FOUND" };

  revalidatePath("/buyer/leads");
  revalidatePath("/buyer/performance");
  return { ok: true };
}

/**
 * First-run onboarding checklist (B11), tracked on Organization since it's
 * account-level progress, not per-user. Idempotent — completing an
 * already-completed step is a no-op, not an error.
 */
export async function completeOnboardingStepAction(step: string): Promise<DisputeActionResult> {
  const user = await assertRole("BUYER");
  if (!step) return { ok: false, error: "MISSING_FIELDS" };

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: user.orgId },
    select: { onboardingSteps: true },
  });
  if (!org.onboardingSteps.includes(step)) {
    await prisma.organization.update({
      where: { id: user.orgId },
      data: { onboardingSteps: { push: step } },
    });
  }

  revalidatePath("/buyer");
  return { ok: true };
}

export async function dismissOnboardingAction(): Promise<DisputeActionResult> {
  const user = await assertRole("BUYER");
  await prisma.organization.update({
    where: { id: user.orgId },
    data: { onboardingDismissedAt: new Date() },
  });

  revalidatePath("/buyer");
  return { ok: true };
}
