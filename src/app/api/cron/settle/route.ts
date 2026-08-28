import type { NextRequest } from "next/server";
import { settleExpiredDisputeWindows } from "@/lib/pipeline/settlement";
import { authorizeCron, unauthorized } from "@/lib/api/cron-auth";

/**
 * Auto-settles delivered leads whose return window lapsed without a dispute.
 * Idempotent, so a missed run simply catches up on the next one.
 */
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) return unauthorized();

  const result = await settleExpiredDisputeWindows(500);
  return Response.json({ ok: true, ...result });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
