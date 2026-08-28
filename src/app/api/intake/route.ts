import type { NextRequest } from "next/server";
import { z } from "zod";
import { ingestLead } from "@/lib/pipeline/ingest";

/**
 * PUBLIC LEAD INTAKE
 *
 * The single entry point for live traffic. Authentication is the Source ID
 * itself: step 1 resolves it to a vetted publisher, and an unknown or inactive
 * source is refused before any work is done.
 *
 * The response is deliberately uniform — accepted or not, the caller gets the
 * same shape with an enum reason code. There are no free-text error strings
 * for a publisher to regex against (Rule 1).
 */

const IntakeSchema = z.object({
  source_id: z.string().min(1).max(120),
  vertical: z.string().optional().nullable(),
  payload: z.record(z.string(), z.unknown()),
  trustedform_cert_url: z.string().max(500).optional().nullable(),
  jornaya_lead_id: z.string().max(120).optional().nullable(),
  consent_text: z.string().max(4000).optional().nullable(),
  submitted_at: z.string().max(64).optional().nullable(),
});

/**
 * Prefers the left-most `x-forwarded-for` entry — the client address as seen
 * by the first proxy. Falls back through the headers a typical edge stack sets.
 */
function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    null
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { accepted: false, reason_code: "MALFORMED_JSON" },
      { status: 400 },
    );
  }

  const parsed = IntakeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        accepted: false,
        reason_code: "MISSING_REQUIRED_FIELD",
        detail: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          code: i.code,
        })),
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const result = await ingestLead({
    sourceId: data.source_id,
    vertical: data.vertical ?? null,
    payload: data.payload as Record<string, unknown>,
    trustedformCertUrl: data.trustedform_cert_url ?? null,
    jornayaLeadId: data.jornaya_lead_id ?? null,
    consentText: data.consent_text ?? null,
    ingressIp: clientIp(req),
    ingressUserAgent: req.headers.get("user-agent"),
    ingressChannel: "API",
    submittedAt: data.submitted_at ?? null,
  });

  const responseBody = {
    accepted: result.accepted,
    lead_id: result.leadId,
    source_id: result.sourceId,
    pipeline_stage: result.pipelineStage,
    rejection_step: result.rejectionStep,
    reason_code: result.reasonCode,
    routed_to: result.routedTo
      ? { campaign_id: result.routedTo.campaignId, buyer: result.routedTo.buyerName }
      : null,
    duration_ms: result.durationMs,
    steps: result.steps.map((s) => ({
      step: s.step,
      name: s.name,
      status: s.status,
      ms: s.executionMs,
      reason_code: s.reasonCode,
    })),
  };

  // 401 for an unresolvable source (the Source ID *is* the credential),
  // 202 for a lead we accepted but parked, 422 for a compliance rejection.
  const status = result.accepted
    ? 200
    : result.leadId === null
      ? 401
      : result.pipelineStage === "HOLD_QUEUE"
        ? 202
        : 422;

  return Response.json(responseBody, {
    status,
    headers: {
      // Rule 2: the Source ID and raw receipt time ride on the response too.
      "x-leados-source-id": result.sourceId,
      "cache-control": "no-store",
    },
  });
}

export async function GET() {
  return Response.json(
    {
      endpoint: "POST /api/intake",
      required: ["source_id", "payload"],
      optional: [
        "vertical",
        "trustedform_cert_url",
        "jornaya_lead_id",
        "consent_text",
        "submitted_at",
      ],
      note: "Every rejection returns an enum reason_code. See /publisher/sources for the full schema of your vertical.",
    },
    { status: 200 },
  );
}
