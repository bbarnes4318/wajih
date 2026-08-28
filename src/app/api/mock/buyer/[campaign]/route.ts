import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * MOCK BUYER ENDPOINT
 *
 * Stands in for a real buyer's CRM so a fresh checkout completes an actual
 * HTTP delivery round trip instead of silently skipping step 8. Seeded
 * campaigns point their `delivery_webhook_url` here.
 *
 * It verifies the HMAC signature the dispatcher sends, which makes it a
 * working reference for what a buyer should implement — not just a 200.
 */

function verifySignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;

  const secret = process.env.WEBHOOK_SIGNING_SECRET ?? "dev-signing-secret";
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = header.slice(7);

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/mock/buyer/[campaign]">,
) {
  const { campaign } = await ctx.params;
  const rawBody = await req.text();

  const leadId = req.headers.get("x-leados-lead-id");
  const sourceId = req.headers.get("x-leados-source-id");
  const receivedAt = req.headers.get("x-leados-received-at");

  if (!verifySignature(rawBody, req.headers.get("x-leados-signature"))) {
    return Response.json(
      { accepted: false, error: "INVALID_SIGNATURE" },
      { status: 401 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json(
      { accepted: false, error: "MALFORMED_JSON" },
      { status: 400 },
    );
  }

  const body = parsed as { leadId?: string; sourceId?: string };

  // A real buyer would key on these to dedupe against their own CRM.
  return Response.json(
    {
      accepted: true,
      campaign,
      buyer_ref: `MOCK-${(body.leadId ?? leadId ?? "unknown").slice(0, 8).toUpperCase()}`,
      echoed: {
        lead_id: body.leadId ?? leadId,
        source_id: body.sourceId ?? sourceId,
        received_at_utc: receivedAt,
      },
      note: "Mock buyer endpoint. Signature verified.",
    },
    { status: 200 },
  );
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/mock/buyer/[campaign]">,
) {
  const { campaign } = await ctx.params;
  return Response.json({
    endpoint: `POST /api/mock/buyer/${campaign}`,
    note: "Mock buyer CRM. Verifies the x-leados-signature HMAC and echoes the immutable Source ID.",
  });
}
