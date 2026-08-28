"use server";

import { revalidatePath } from "next/cache";
import type { DisputeReasonCode } from "@prisma/client";
import { assertRole } from "@/lib/auth/rbac";
import { acceptLead, fileDispute } from "@/lib/pipeline/settlement";

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
