import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret guard for the scheduled job endpoints.
 *
 * Accepts either `Authorization: Bearer <secret>` or Vercel Cron's own
 * `x-vercel-cron` header, so the same route works when triggered by the
 * platform scheduler and by a manual call during an incident.
 */
export function authorizeCron(req: NextRequest): boolean {
  // Vercel signs its own cron invocations; that header cannot be set by an
  // external caller reaching the deployment.
  if (req.headers.get("x-vercel-cron")) return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length !== secret.length) return false;

  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

export function unauthorized() {
  return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
}
