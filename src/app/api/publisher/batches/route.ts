import type { NextRequest } from "next/server";
import { z } from "zod";
import type { BatchIntegrityFlag, Prisma, Vertical } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { ingestLead } from "@/lib/pipeline/ingest";
import { attemptDelivery } from "@/lib/webhooks/dispatcher";
import { recomputePublisherMetrics } from "@/lib/metrics/publisher-metrics";
import {
  normalizeRow,
  preflightBatch,
  rowToSubmission,
  type CsvRow,
} from "@/lib/pipeline/csv-batch";

/**
 * CSV batch intake.
 *
 * `dryRun: true` runs the pre-flight heuristics and returns findings without
 * writing anything, which is what the uploader calls the moment a file is
 * dropped. A real submission re-runs the same checks server-side — the client
 * result is a convenience, never the authority.
 *
 * Rows are processed sequentially through the same waterfall as API traffic.
 * At production volume this belongs behind a queue; the synchronous path here
 * is capped so a single request cannot run unbounded.
 */

const MAX_ROWS = 5_000;

const BodySchema = z.object({
  filename: z.string().min(1).max(255),
  vertical: z.string().min(1),
  rows: z.array(z.record(z.string(), z.unknown())).max(MAX_ROWS),
  headers: z.array(z.string()).min(1),
  dryRun: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (user.role !== "PUBLISHER") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      {
        error: "INVALID_BODY",
        detail: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const vertical = parsed.vertical as Vertical;
  const rows: CsvRow[] = parsed.rows.map((r) => normalizeRow(r));

  // ---------------------------------------------------------------- Preflight
  const preflight = preflightBatch(parsed.headers, rows, vertical);

  if (parsed.dryRun) {
    return Response.json({
      dryRun: true,
      ok: preflight.ok,
      rowCount: preflight.rowCount,
      findings: preflight.findings,
      missingRequiredColumns: preflight.missingRequiredColumns,
    });
  }

  // A suspended or unvetted publisher would have every row rejected at step 1
  // anyway; refusing here saves writing several thousand doomed audit rows.
  if (user.orgStatus !== "ACTIVE") {
    return Response.json(
      { error: "PUBLISHER_NOT_ACTIVE", status: user.orgStatus },
      { status: 403 },
    );
  }

  const flags = preflight.findings.map((f) => f.flag) as BatchIntegrityFlag[];
  const integrityDetail = Object.fromEntries(
    preflight.findings.map((f) => [f.flag, f.detail]),
  ) as Prisma.InputJsonValue;

  // ------------------------------------------------------- Blocking rejection
  if (!preflight.ok) {
    const batch = await prisma.csvBatch.create({
      data: {
        publisherOrgId: user.orgId,
        uploadedByUserId: user.id,
        filename: parsed.filename,
        status: "VALIDATION_FAILED",
        rowCount: rows.length,
        acceptedCount: 0,
        rejectedCount: rows.length,
        integrityFlags: flags,
        integrityDetail,
        completedAt: new Date(),
      },
    });

    await prisma.notification.create({
      data: {
        orgId: user.orgId,
        severity: "CRITICAL",
        code: "BATCH_VALIDATION_FAILED",
        title: `Batch rejected: ${parsed.filename}`,
        body: flags.join(","),
      },
    });

    return Response.json(
      {
        batchId: batch.id,
        ok: false,
        status: "VALIDATION_FAILED",
        rowCount: rows.length,
        findings: preflight.findings,
      },
      { status: 422 },
    );
  }

  // ----------------------------------------------------------------- Process
  const batch = await prisma.csvBatch.create({
    data: {
      publisherOrgId: user.orgId,
      uploadedByUserId: user.id,
      filename: parsed.filename,
      status: "PROCESSING",
      rowCount: rows.length,
      integrityFlags: flags,
      integrityDetail,
    },
  });

  const summary = {
    accepted: 0,
    rejected: 0,
    held: 0,
    unattributable: 0,
  };
  const reasonTally = new Map<string, number>();
  const deliverable: string[] = [];

  for (const row of rows) {
    const submission = rowToSubmission(row, vertical, batch.id);

    // A row whose source_id belongs to another publisher must not be ingested
    // under this account.
    const result = await ingestLead(submission, {
      deferDelivery: true,
      deferMetrics: true,
    });

    if (result.accepted && result.leadId) {
      summary.accepted += 1;
      deliverable.push(result.leadId);
    } else if (result.pipelineStage === "HOLD_QUEUE") {
      summary.held += 1;
    } else if (result.leadId === null) {
      summary.unattributable += 1;
    } else {
      summary.rejected += 1;
    }

    if (result.reasonCode) {
      reasonTally.set(
        result.reasonCode,
        (reasonTally.get(result.reasonCode) ?? 0) + 1,
      );
    }
  }

  await prisma.csvBatch.update({
    where: { id: batch.id },
    data: {
      status: "COMPLETED",
      acceptedCount: summary.accepted,
      rejectedCount: summary.rejected + summary.held + summary.unattributable,
      completedAt: new Date(),
      integrityDetail: {
        ...(integrityDetail as object),
        outcome: {
          accepted: summary.accepted,
          rejected: summary.rejected,
          held: summary.held,
          unattributable: summary.unattributable,
          reason_codes: Object.fromEntries(reasonTally),
        },
      } as Prisma.InputJsonValue,
    },
  });

  // Metrics once for the whole batch rather than once per row.
  await recomputePublisherMetrics(user.orgId);

  // Deliver in the background; the uploader should not wait on buyer endpoints.
  void Promise.allSettled(deliverable.map((id) => attemptDelivery(id)));

  return Response.json({
    batchId: batch.id,
    ok: true,
    status: "COMPLETED",
    rowCount: rows.length,
    ...summary,
    reasonCodes: Object.fromEntries(reasonTally),
    findings: preflight.findings,
  });
}
