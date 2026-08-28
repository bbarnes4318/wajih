"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";

/**
 * Admin review of a buyer's self-serve campaign request (B10). Nothing the
 * buyer submitted routes until this runs — approving is the only thing that
 * flips `active: true` on a freshly-created draft.
 */
export async function decideCampaignRequestAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await assertRole("SUPER_ADMIN");

  const campaignId = String(formData.get("campaignId") ?? "");
  const approve = String(formData.get("decision") ?? "") === "APPROVE";
  if (!campaignId) return { ok: false, error: "MISSING_FIELDS" };

  const campaign = await prisma.buyerCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, buyerOrgId: true, approvalStatus: true },
  });
  if (!campaign || campaign.approvalStatus !== "PENDING_APPROVAL") {
    return { ok: false, error: "NOT_FOUND" };
  }

  await prisma.$transaction([
    prisma.buyerCampaign.update({
      where: { id: campaignId },
      data: {
        approvalStatus: approve ? "APPROVED" : "REJECTED",
        active: approve,
      },
    }),
    prisma.notification.create({
      data: {
        orgId: campaign.buyerOrgId,
        severity: approve ? "INFO" : "WARNING",
        code: approve ? "CAMPAIGN_APPROVED" : "CAMPAIGN_REJECTED",
        title: approve
          ? `"${campaign.name}" approved — now live`
          : `"${campaign.name}" was not approved`,
        body: approve ? "CAMPAIGN_REQUEST_APPROVED" : "CAMPAIGN_REQUEST_REJECTED",
      },
    }),
    prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: approve ? "APPROVE_CAMPAIGN_REQUEST" : "REJECT_CAMPAIGN_REQUEST",
        entityType: "BuyerCampaign",
        entityId: campaignId,
        before: { approvalStatus: "PENDING_APPROVAL" },
        after: { approvalStatus: approve ? "APPROVED" : "REJECTED", active: approve },
      },
    }),
  ]);

  revalidatePath("/admin/campaigns");
  revalidatePath("/buyer/campaigns");
  return { ok: true };
}
