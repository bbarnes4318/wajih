"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertRole } from "@/lib/auth/rbac";
import { US_STATE_CODES } from "@/lib/pipeline/normalize";

/**
 * Campaign configuration.
 *
 * Buyers edit their own filters, so every mutation re-verifies ownership by
 * scoping the update to `buyerOrgId` rather than trusting the campaign id in
 * the form.
 */

export interface CampaignActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const CriteriaSchema = z
  .object({
    minAge: z.number().int().min(0).max(120).optional(),
    maxAge: z.number().int().min(0).max(120).optional(),
    requireAge: z.boolean().optional(),
    equals: z.record(z.string(), z.array(z.string())).optional(),
    notEquals: z.record(z.string(), z.array(z.string())).optional(),
    numericMin: z.record(z.string(), z.number()).optional(),
    numericMax: z.record(z.string(), z.number()).optional(),
    excludeTrafficSources: z.array(z.string()).optional(),
  })
  .strict();

export async function updateCampaignAction(
  formData: FormData,
): Promise<CampaignActionResult> {
  const user = await assertRole("BUYER");

  const id = String(formData.get("campaignId") ?? "");
  if (!id) return { ok: false, error: "MISSING_FIELDS" };

  const maxCpl = Number(formData.get("maxCpl"));
  const dailyBudget = Number(formData.get("dailyBudget"));
  const dailyCapRaw = String(formData.get("dailyCapLeads") ?? "").trim();
  const returnWindowHours = Number(formData.get("returnWindowHours"));
  const deliveryWebhookUrl = String(formData.get("deliveryWebhookUrl") ?? "").trim();
  const active = formData.get("active") === "on";
  const statesRaw = String(formData.get("acceptedStates") ?? "").trim();
  const zipsRaw = String(formData.get("acceptedZips") ?? "").trim();
  const criteriaRaw = String(formData.get("criteriaJson") ?? "").trim();

  if (!Number.isFinite(maxCpl) || maxCpl <= 0) {
    return { ok: false, error: "INVALID_MAX_CPL" };
  }
  if (!Number.isFinite(dailyBudget) || dailyBudget < 0) {
    return { ok: false, error: "INVALID_DAILY_BUDGET" };
  }
  if (!Number.isFinite(returnWindowHours) || returnWindowHours < 1 || returnWindowHours > 720) {
    return { ok: false, error: "INVALID_RETURN_WINDOW" };
  }

  let webhookUrl: URL;
  try {
    webhookUrl = new URL(deliveryWebhookUrl);
    if (!["http:", "https:"].includes(webhookUrl.protocol)) throw new Error();
  } catch {
    return { ok: false, error: "INVALID_WEBHOOK_URL" };
  }

  const dailyCapLeads = dailyCapRaw === "" ? null : Number(dailyCapRaw);
  if (dailyCapLeads !== null && (!Number.isInteger(dailyCapLeads) || dailyCapLeads < 0)) {
    return { ok: false, error: "INVALID_DAILY_CAP" };
  }

  // Geography is stored as arrays of canonical codes; reject anything that is
  // not a real USPS state so a typo cannot silently zero out a campaign.
  const acceptedStates = statesRaw
    ? statesRaw.split(/[\s,]+/).filter(Boolean).map((s) => s.toUpperCase())
    : [];
  const badState = acceptedStates.find((s) => !US_STATE_CODES.has(s));
  if (badState) return { ok: false, error: `INVALID_STATE:${badState}` };

  const acceptedZips = zipsRaw
    ? zipsRaw.split(/[\s,]+/).filter(Boolean)
    : [];
  const badZip = acceptedZips.find((z) => !/^\d{5}$/.test(z));
  if (badZip) return { ok: false, error: `INVALID_ZIP:${badZip}` };

  let criteriaJson: Prisma.InputJsonValue = {};
  if (criteriaRaw) {
    try {
      criteriaJson = CriteriaSchema.parse(JSON.parse(criteriaRaw)) as Prisma.InputJsonValue;
    } catch {
      return { ok: false, error: "INVALID_CRITERIA_JSON" };
    }
  }

  // Scoped to the caller's org — a campaign id from another buyer updates nothing.
  const result = await prisma.buyerCampaign.updateMany({
    where: { id, buyerOrgId: user.orgId },
    data: {
      maxCpl: new Prisma.Decimal(maxCpl),
      dailyBudget: new Prisma.Decimal(dailyBudget),
      dailyCapLeads,
      returnWindowHours,
      deliveryWebhookUrl: webhookUrl.toString(),
      acceptedStates,
      acceptedZips,
      criteriaJson,
      active,
    },
  });

  if (result.count === 0) return { ok: false, error: "NOT_FOUND" };

  revalidatePath("/buyer/campaigns");
  revalidatePath("/buyer");
  return { ok: true, message: "Campaign updated." };
}

export async function toggleCampaignAction(
  formData: FormData,
): Promise<CampaignActionResult> {
  const user = await assertRole("BUYER");
  const id = String(formData.get("campaignId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return { ok: false, error: "MISSING_FIELDS" };

  const result = await prisma.buyerCampaign.updateMany({
    where: { id, buyerOrgId: user.orgId },
    data: { active },
  });
  if (result.count === 0) return { ok: false, error: "NOT_FOUND" };

  revalidatePath("/buyer/campaigns");
  revalidatePath("/buyer");
  return { ok: true, message: active ? "Campaign resumed." : "Campaign paused." };
}
