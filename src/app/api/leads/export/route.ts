import type { NextRequest } from "next/server";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { parseLeadFilters, queryLeads, type LeadFilters } from "@/lib/db/leads";
import { PIPELINE_STAGE, REJECTION_REASON } from "@/lib/domain/labels";

/**
 * CSV export of the caller's current filter set.
 *
 * Streams in pages rather than materializing the whole result, so exporting a
 * month of network volume does not pin it all in memory.
 *
 * Rule 2: `source_id` and the raw UTC receipt timestamp are the first two
 * columns of every export, unmodified.
 */

const CHUNK = 500;
const MAX_ROWS = 50_000;

const HEADERS = [
  "source_id",
  "received_at_utc",
  "lead_id",
  "vertical",
  "publisher",
  "pipeline_stage",
  "pipeline_stage_label",
  "rejection_step",
  "rejection_reason_code",
  "rejection_reason_label",
  "hold_reason",
  "first_name",
  "last_name",
  "phone_e164",
  "email",
  "state",
  "zip",
  "dnc_scrub_passed",
  "litigator_scrub_passed",
  "trustedform_cert_url",
  "jornaya_lead_id",
  "ingress_channel",
  "ingress_ip",
  "buyer",
  "campaign",
  "buyer_status",
  "dispute_reason_code",
  "dispute_window_expires_at",
  "settlement_status",
  "buyer_cost_amount",
  "publisher_payout_amount",
  "pipeline_duration_ms",
  "delivered_at",
];

/** RFC 4180 escaping. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: unknown[]): string {
  return `${cells.map(csvCell).join(",")}\r\n`;
}

/** Encodes the caller's role and active filters into the download name. */
function buildFilename(user: SessionUser, base: LeadFilters): string {
  const parts = ["leados-leads", user.role.toLowerCase()];
  if (base.segment) parts.push(base.segment);
  if (base.vertical) parts.push(base.vertical.toLowerCase());
  if (base.stage) parts.push(base.stage.toLowerCase());
  parts.push(
    base.from || base.to
      ? `${base.from ?? "any"}_to_${base.to ?? "any"}`
      : new Date().toISOString().slice(0, 10),
  );
  return `${parts.join("-").replace(/[^a-z0-9._-]/gi, "_")}.csv`;
}

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const base = parseLeadFilters(params);

  const encoder = new TextEncoder();
  let page = 1;
  let emitted = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(csvRow(HEADERS)));
    },

    async pull(controller) {
      const result = await queryLeads(user, {
        ...base,
        page,
        pageSize: CHUNK,
      });

      for (const l of result.rows) {
        // A publisher must not see buyer economics or identity, and a buyer
        // must not see publisher economics or identity — the same rule
        // getLeadDetail already applies to the drill-down drawer.
        const buyerCost = user.role === "PUBLISHER" ? null : l.buyerCostAmount;
        const payout = user.role === "BUYER" ? null : l.publisherPayoutAmount;
        const publisherName = user.role === "BUYER" ? null : l.publisher.name;
        const buyerName = user.role === "PUBLISHER" ? null : (l.buyer?.name ?? null);

        controller.enqueue(
          encoder.encode(
            csvRow([
              l.sourceId,
              l.receivedAtUtc.toISOString(),
              l.id,
              l.vertical,
              publisherName,
              l.pipelineStage,
              PIPELINE_STAGE[l.pipelineStage].label,
              l.rejectionStep,
              l.rejectionReasonCode,
              l.rejectionReasonCode
                ? REJECTION_REASON[l.rejectionReasonCode].label
                : null,
              l.holdReason,
              l.contactFirstName,
              l.contactLastName,
              l.contactPhone,
              l.contactEmail,
              l.contactState,
              l.contactZip,
              l.dncScrubPassed,
              l.litigatorScrubPassed,
              l.trustedformCertUrl,
              l.jornayaLeadId,
              l.ingressChannel,
              l.ingressIp,
              buyerName,
              l.campaign?.name ?? null,
              l.buyerStatus,
              l.disputeReasonCode,
              l.disputeWindowExpiresAt?.toISOString() ?? null,
              l.settlementStatus,
              buyerCost?.toString() ?? null,
              payout?.toString() ?? null,
              l.pipelineDurationMs,
              l.deliveredAt?.toISOString() ?? null,
            ]),
          ),
        );
      }

      emitted += result.rows.length;
      page += 1;

      const done =
        result.rows.length < CHUNK || page > result.pageCount || emitted >= MAX_ROWS;

      if (done) {
        // Never let a truncated export look complete.
        if (emitted >= MAX_ROWS && result.total > emitted) {
          controller.enqueue(
            encoder.encode(
              csvRow([
                `# TRUNCATED: export capped at ${MAX_ROWS} rows; ${result.total} matched. Narrow the date range.`,
              ]),
            ),
          );
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${buildFilename(user, base)}"`,
      "cache-control": "no-store",
    },
  });
}
