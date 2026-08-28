import type { NextRequest } from "next/server";
import { recomputeAllPublisherMetrics } from "@/lib/metrics/publisher-metrics";
import { authorizeCron, unauthorized } from "@/lib/api/cron-auth";

/**
 * Recomputes rolling return rates for every publisher, which is also what
 * arms the 14-day auto-suspension trigger.
 */
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) return unauthorized();

  const publishers = await recomputeAllPublisherMetrics();
  return Response.json({ ok: true, publishers });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
