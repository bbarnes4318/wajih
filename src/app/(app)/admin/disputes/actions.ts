"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/rbac";
import { resolveDispute } from "@/lib/pipeline/settlement";

/** Admin adjudication of an open return dispute. */
export async function resolveDisputeAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await assertRole("SUPER_ADMIN");

  const leadId = String(formData.get("leadId") ?? "");
  const approve = String(formData.get("decision") ?? "") === "APPROVE";
  if (!leadId) return { ok: false, error: "MISSING_FIELDS" };

  const result = await resolveDispute({
    leadId,
    adminUserId: admin.id,
    approve,
  });

  if (!result.ok) return { ok: false, error: result.code };

  revalidatePath("/admin/disputes");
  revalidatePath("/admin");
  return { ok: true };
}
