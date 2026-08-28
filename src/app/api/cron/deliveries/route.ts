import type { NextRequest } from "next/server";
import { processRetryQueue } from "@/lib/webhooks/dispatcher";
import { authorizeCron, unauthorized } from "@/lib/api/cron-auth";

/**
 * Drains the delivery retry queue.
 *
 * The backoff schedule lives in `delivery_attempts.next_retry_at`, so this can
 * run on any cadence without losing or duplicating work — it only picks up
 * attempts whose retry time has actually arrived.
 */
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) return unauthorized();

  const result = await processRetryQueue(50);
  return Response.json({ ok: true, ...result });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
