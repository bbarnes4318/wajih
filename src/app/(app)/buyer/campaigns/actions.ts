"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type Vertical } from "@prisma/client";
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

interface ParsedCampaignForm {
  name: string;
  vertical: Vertical;
  maxCpl: Prisma.Decimal;
  dailyBudget: Prisma.Decimal;
  dailyCapLeads: number | null;
  returnWindowHours: number;
  deliveryWebhookUrl: string;
  acceptedStates: string[];
  acceptedZips: string[];
  criteriaJson: Prisma.InputJsonValue;
  active: boolean;
}

/** Shared by the edit form (B1) and the self-serve draft flow (B10) — same fields, same rules. */
function parseCampaignForm(
  formData: FormData,
): { ok: true; data: ParsedCampaignForm } | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const vertical = String(formData.get("vertical") ?? "") as Vertical;
  const maxCpl = Number(formData.get("maxCpl"));
  const dailyBudget = Number(formData.get("dailyBudget"));
  const dailyCapRaw = String(formData.get("dailyCapLeads") ?? "").trim();
  const returnWindowHours = Number(formData.get("returnWindowHours"));
  const deliveryWebhookUrl = String(formData.get("deliveryWebhookUrl") ?? "").trim();
  const active = formData.get("active") === "on";
  const statesRaw = String(formData.get("acceptedStates") ?? "").trim();
  const zipsRaw = String(formData.get("acceptedZips") ?? "").trim();
  const criteriaRaw = String(formData.get("criteriaJson") ?? "").trim();

  if (!Number.isFinite(maxCpl) || maxCpl <= 0) return { ok: false, error: "INVALID_MAX_CPL" };
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

  const acceptedZips = zipsRaw ? zipsRaw.split(/[\s,]+/).filter(Boolean) : [];
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

  return {
    ok: true,
    data: {
      name,
      vertical,
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
  };
}

export async function updateCampaignAction(
  formData: FormData,
): Promise<CampaignActionResult> {
  const user = await assertRole("BUYER");

  const id = String(formData.get("campaignId") ?? "");
  if (!id) return { ok: false, error: "MISSING_FIELDS" };

  const parsed = parseCampaignForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // Scoped to the caller's org — a campaign id from another buyer updates nothing.
  const result = await prisma.buyerCampaign.updateMany({
    where: { id, buyerOrgId: user.orgId },
    data: {
      maxCpl: parsed.data.maxCpl,
      dailyBudget: parsed.data.dailyBudget,
      dailyCapLeads: parsed.data.dailyCapLeads,
      returnWindowHours: parsed.data.returnWindowHours,
      deliveryWebhookUrl: parsed.data.deliveryWebhookUrl,
      acceptedStates: parsed.data.acceptedStates,
      acceptedZips: parsed.data.acceptedZips,
      criteriaJson: parsed.data.criteriaJson,
      active: parsed.data.active,
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

/**
 * Self-serve campaign request (B10). Saves as `active: false` /
 * `approvalStatus: PENDING_APPROVAL` and enters the admin queue — nothing
 * routes until an admin approves it (see admin/campaigns/actions.ts).
 */
export async function createCampaignDraftAction(
  formData: FormData,
): Promise<CampaignActionResult> {
  const user = await assertRole("BUYER");

  const parsed = parseCampaignForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (!parsed.data.name) return { ok: false, error: "MISSING_FIELDS" };

  await prisma.buyerCampaign.create({
    data: {
      name: parsed.data.name,
      buyerOrgId: user.orgId,
      vertical: parsed.data.vertical,
      maxCpl: parsed.data.maxCpl,
      dailyBudget: parsed.data.dailyBudget,
      dailyCapLeads: parsed.data.dailyCapLeads,
      returnWindowHours: parsed.data.returnWindowHours,
      deliveryWebhookUrl: parsed.data.deliveryWebhookUrl,
      acceptedStates: parsed.data.acceptedStates,
      acceptedZips: parsed.data.acceptedZips,
      criteriaJson: parsed.data.criteriaJson,
      active: false,
      approvalStatus: "PENDING_APPROVAL",
    },
  });

  revalidatePath("/buyer/campaigns");
  return { ok: true, message: "Campaign request submitted for review." };
}

export interface SupplyEstimateResult {
  count: number;
  days: number;
}

/**
 * Historical supply, not a forward guarantee — how many already-qualified
 * leads (cleared compliance, i.e. reached step 6 or later) matched this
 * vertical and geography in the trailing window. Geography-only: the
 * buyer's free-form criteria JSON (age bounds, custom field matches) isn't
 * replayed against historical payloads here, so this deliberately
 * undershoots precision in exchange for staying a cheap aggregate query.
 */
export async function estimateSupplyAction(input: {
  vertical: string;
  acceptedStates: string[];
  acceptedZips: string[];
}): Promise<SupplyEstimateResult> {
  await assertRole("BUYER");
  const days = 7;
  const since = new Date(Date.now() - days * 86_400_000);

  const where: Prisma.LeadWhereInput = {
    vertical: input.vertical as Vertical,
    createdAt: { gte: since },
    pipelineStage: {
      in: ["QUALIFIED", "ROUTED", "DELIVERED", "DISPUTED", "ACCEPTED", "SETTLED"],
    },
  };
  if (input.acceptedZips.length > 0) {
    where.contactZip = { in: input.acceptedZips };
  } else if (input.acceptedStates.length > 0) {
    where.contactState = { in: input.acceptedStates };
  }

  const count = await prisma.lead.count({ where });
  return { count, days };
}

export interface WebhookTestResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

/** Fires a synthetic test payload at the buyer's own webhook URL — never a real delivery, never real consumer data. */
export async function testWebhookAction(url: string): Promise<WebhookTestResult> {
  await assertRole("BUYER");

  let target: URL;
  try {
    target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol)) throw new Error();
  } catch {
    return { ok: false, error: "Enter a valid http(s) URL first." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(target.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-leados-test": "true" },
      body: JSON.stringify({
        test: true,
        source_id: "TEST-WEBHOOK-FIRE",
        received_at_utc: new Date().toISOString(),
        payload: {
          first_name: "Test",
          last_name: "Lead",
          phone: "+16025550100",
          email: "test-lead@example.com",
        },
      }),
      signal: controller.signal,
    });
    const body = (await res.text()).slice(0, 2000);
    return { ok: true, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "The request failed or timed out.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
