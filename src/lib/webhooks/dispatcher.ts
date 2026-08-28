import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { DeliveryPayload } from "@/lib/adapters/types";

/**
 * STEP 8 — DELIVERY & WEBHOOK
 *
 * Posts the routed lead to the buyer's endpoint and records every attempt.
 * Failures are retried with exponential backoff + jitter; the schedule lives
 * in the database (`delivery_attempts.next_retry_at`) rather than in memory,
 * so a process restart never strands a lead mid-retry.
 */

export const MAX_DELIVERY_ATTEMPTS = 5;

/** 30s, 2m, 8m, 32m — doubling with a 4x factor, capped at 1 hour. */
const BASE_BACKOFF_MS = 30_000;
const BACKOFF_FACTOR = 4;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export function backoffDelayMs(attemptNumber: number): number {
  const raw = BASE_BACKOFF_MS * Math.pow(BACKOFF_FACTOR, attemptNumber - 1);
  const capped = Math.min(raw, MAX_BACKOFF_MS);
  // ±20% jitter so a buyer outage doesn't produce a synchronized retry storm
  // across every lead queued against them.
  const jitter = capped * 0.2 * (Math.random() * 2 - 1);
  return Math.round(capped + jitter);
}

/** Deterministic signature so buyers can verify the payload came from us. */
function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export interface DeliveryOutcome {
  delivered: boolean;
  attemptNumber: number;
  responseStatus: number | null;
  exhausted: boolean;
  errorLog: string | null;
}

/**
 * Attempt one delivery for a lead that is already ROUTED or DELIVERED-pending.
 * Safe to call repeatedly: it is a no-op once the lead has been delivered.
 */
export async function attemptDelivery(leadId: string): Promise<DeliveryOutcome> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      campaign: {
        select: {
          id: true,
          deliveryWebhookUrl: true,
          webhookAuthHeader: true,
          returnWindowHours: true,
        },
      },
    },
  });

  if (!lead || !lead.campaign || !lead.campaignId) {
    return {
      delivered: false,
      attemptNumber: 0,
      responseStatus: null,
      exhausted: true,
      errorLog: "Lead is not routed to a campaign.",
    };
  }

  if (lead.deliveredAt) {
    return {
      delivered: true,
      attemptNumber: 0,
      responseStatus: null,
      exhausted: false,
      errorLog: null,
    };
  }

  const priorAttempts = await prisma.deliveryAttempt.count({ where: { leadId } });
  const attemptNumber = priorAttempts + 1;

  const payloadJson = lead.payload as Record<string, unknown>;
  const body: DeliveryPayload = {
    leadId: lead.id,
    sourceId: lead.sourceId,
    vertical: lead.vertical,
    receivedAtUtc: lead.receivedAtUtc.toISOString(),
    payload: payloadJson,
    compliance: {
      trustedformCertUrl: lead.trustedformCertUrl,
      jornayaLeadId: lead.jornayaLeadId,
      consentTextCaptured: lead.consentTextCaptured,
      dncScrubPassed: lead.dncScrubPassed ?? false,
      litigatorScrubPassed: lead.litigatorScrubPassed ?? false,
    },
    commercial: {
      campaignId: lead.campaignId,
      buyerCostAmount: (lead.buyerCostAmount ?? new Prisma.Decimal(0)).toString(),
      returnWindowHours: lead.campaign.returnWindowHours,
      disputeWindowExpiresAt: (
        lead.disputeWindowExpiresAt ?? new Date()
      ).toISOString(),
    },
  };

  const serialized = JSON.stringify(body);
  const secret = process.env.WEBHOOK_SIGNING_SECRET ?? "dev-signing-secret";

  // Rule 2: Source ID and raw receipt timestamp ride on every webhook.
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "LeadOS-Delivery/1.0",
    "x-leados-lead-id": lead.id,
    "x-leados-source-id": lead.sourceId,
    "x-leados-received-at": lead.receivedAtUtc.toISOString(),
    "x-leados-attempt": String(attemptNumber),
    "x-leados-signature": `sha256=${signBody(serialized, secret)}`,
  };
  if (lead.campaign.webhookAuthHeader) {
    headers["authorization"] = lead.campaign.webhookAuthHeader;
  }

  const attempt = await prisma.deliveryAttempt.create({
    data: {
      leadId: lead.id,
      campaignId: lead.campaign.id,
      attemptNumber,
      url: lead.campaign.deliveryWebhookUrl,
      // Never persist the buyer's bearer token in the audit record.
      requestHeaders: { ...headers, authorization: headers.authorization ? "[redacted]" : undefined } as Prisma.InputJsonValue,
      requestBody: body as unknown as Prisma.InputJsonValue,
      status: "IN_FLIGHT",
    },
  });

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let errorLog: string | null = null;

  try {
    const res = await fetch(lead.campaign.deliveryWebhookUrl, {
      method: "POST",
      headers,
      body: serialized,
      signal: controller.signal,
    });
    responseStatus = res.status;
    responseBody = (await res.text()).slice(0, 4000);
  } catch (err) {
    errorLog = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;
  const ok = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;

  if (ok) {
    await prisma.$transaction([
      prisma.deliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "SUCCESS",
          responseStatus,
          responseBody,
          latencyMs,
          nextRetryAt: null,
        },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: { pipelineStage: "DELIVERED", deliveredAt: new Date() },
      }),
      prisma.leadAuditTrail.create({
        data: {
          leadId: lead.id,
          sourceId: lead.sourceId,
          stepNumber: 8,
          stepName: "Delivery & Webhook",
          inputData: {
            url: lead.campaign.deliveryWebhookUrl,
            attempt_number: attemptNumber,
          },
          outputStatus: "PASS",
          outputData: {
            http_status: responseStatus,
            latency_ms: latencyMs,
            response_excerpt: responseBody?.slice(0, 500) ?? null,
          },
          executionMs: latencyMs,
        },
      }),
    ]);

    return {
      delivered: true,
      attemptNumber,
      responseStatus,
      exhausted: false,
      errorLog: null,
    };
  }

  const exhausted = attemptNumber >= MAX_DELIVERY_ATTEMPTS;
  const nextRetryAt = exhausted
    ? null
    : new Date(Date.now() + backoffDelayMs(attemptNumber));

  await prisma.deliveryAttempt.update({
    where: { id: attempt.id },
    data: {
      status: exhausted ? "EXHAUSTED" : "FAILED",
      responseStatus,
      responseBody,
      latencyMs,
      errorLog,
      nextRetryAt,
    },
  });

  if (exhausted) {
    // Give the slot back — the buyer never received this lead, so it must not
    // consume their daily budget.
    await releaseCapacity(lead.campaignId, lead.receivedAtUtc, lead.buyerCostAmount);

    await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          pipelineStage: "REJECTED",
          rejectionStep: "STEP_7_ROUTING",
          rejectionReasonCode: "ALL_CAMPAIGNS_CAPPED",
          buyerOrgId: null,
          campaignId: null,
        },
      }),
      prisma.leadAuditTrail.create({
        data: {
          leadId: lead.id,
          sourceId: lead.sourceId,
          stepNumber: 8,
          stepName: "Delivery & Webhook",
          inputData: {
            url: lead.campaign.deliveryWebhookUrl,
            attempt_number: attemptNumber,
          },
          outputStatus: "FAIL",
          outputData: {
            http_status: responseStatus,
            latency_ms: latencyMs,
            attempts_exhausted: MAX_DELIVERY_ATTEMPTS,
            capacity_released: true,
          },
          reasonCode: "ALL_CAMPAIGNS_CAPPED",
          executionMs: latencyMs,
          errorLog,
        },
      }),
    ]);
  }

  return { delivered: false, attemptNumber, responseStatus, exhausted, errorLog };
}

/** Returns a reserved slot and its spend to the campaign's daily pacing row. */
async function releaseCapacity(
  campaignId: string,
  receivedAtUtc: Date,
  cost: Prisma.Decimal | null,
) {
  const statDate = new Date(
    Date.UTC(
      receivedAtUtc.getUTCFullYear(),
      receivedAtUtc.getUTCMonth(),
      receivedAtUtc.getUTCDate(),
    ),
  );

  await prisma.campaignDailyStat.updateMany({
    where: { campaignId, statDate, leadsDelivered: { gt: 0 } },
    data: {
      leadsDelivered: { decrement: 1 },
      spendAmount: { decrement: cost ?? new Prisma.Decimal(0) },
    },
  });
}

/**
 * Drains the retry queue. Invoked by `/api/cron/deliveries` — in production
 * this is a scheduled job; in development the admin console exposes a button.
 */
export async function processRetryQueue(limit = 50): Promise<{
  processed: number;
  delivered: number;
  exhausted: number;
}> {
  const due = await prisma.deliveryAttempt.findMany({
    where: {
      status: "FAILED",
      nextRetryAt: { lte: new Date() },
      lead: { deliveredAt: null, pipelineStage: "ROUTED" },
    },
    select: { leadId: true },
    distinct: ["leadId"],
    take: limit,
    orderBy: { nextRetryAt: "asc" },
  });

  let delivered = 0;
  let exhausted = 0;

  for (const { leadId } of due) {
    const outcome = await attemptDelivery(leadId);
    if (outcome.delivered) delivered += 1;
    if (outcome.exhausted) exhausted += 1;
  }

  return { processed: due.length, delivered, exhausted };
}
