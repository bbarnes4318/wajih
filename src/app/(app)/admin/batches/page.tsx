import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, TriangleAlert } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/domain/stat-tile";
import { JsonBlock } from "@/components/domain/json-block";
import { BatchStatusChip } from "@/components/domain/status-chip";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { count, percent, shortDateTime } from "@/lib/format";
import { BATCH_INTEGRITY_FLAG } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "CSV Batches" };

export default async function AdminBatchesPage() {
  const user = await requireAdmin();

  const [batches, totals, flagged] = await Promise.all([
    prisma.csvBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { publisher: { select: { id: true, name: true } } },
    }),
    prisma.csvBatch.aggregate({
      _count: { _all: true },
      _sum: { rowCount: true, acceptedCount: true, rejectedCount: true },
    }),
    prisma.csvBatch.count({ where: { status: "VALIDATION_FAILED" } }),
  ]);

  const rows = totals._sum.rowCount ?? 0;
  const accepted = totals._sum.acceptedCount ?? 0;

  return (
    <>
      <Topbar
        user={user}
        title="CSV Batches"
        subtitle="File-level fraud screening. A blocking flag rejects the whole batch, never half of it."
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Batches"
            value={count(totals._count._all)}
            icon={<FileSpreadsheet />}
          />
          <StatTile label="Rows submitted" value={count(rows)} />
          <StatTile
            label="Accepted"
            value={count(accepted)}
            sub={rows > 0 ? `${percent(accepted / rows, 1)} of rows` : undefined}
          />
          <StatTile
            label="Rejected outright"
            value={count(flagged)}
            icon={<TriangleAlert />}
            goodDirection="down"
            accent={flagged > 0 ? "danger" : undefined}
            sub="blocked by integrity checks"
          />
        </div>

        <Panel>
          <PanelHeader
            icon={<FileSpreadsheet className="size-3.5" />}
            title="All batches"
            subtitle="Expand a flagged batch to see the evidence that triggered it."
          />
          <PanelBody dense>
            {batches.length === 0 ? (
              <EmptyState title="No CSV batches uploaded" />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {batches.map((b) => {
                  const hasFlags = b.integrityFlags.length > 0;
                  return (
                    <li key={b.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-[13px] text-ink">
                          {b.filename}
                        </span>
                        <BatchStatusChip status={b.status} />
                        <Link
                          href={`/admin/publishers/${b.publisher.id}`}
                          className="text-[13px] text-muted hover:text-accent"
                        >
                          {b.publisher.name}
                        </Link>
                        <span className="font-mono text-[12px] text-faint">
                          {shortDateTime(b.createdAt)}
                        </span>

                        <span className="ml-auto flex items-center gap-3 font-mono text-[12px] tabular">
                          <span className="text-muted">{count(b.rowCount)} rows</span>
                          <span className="text-success">
                            {count(b.acceptedCount)} accepted
                          </span>
                          <span className="text-danger">
                            {count(b.rejectedCount)} rejected
                          </span>
                        </span>
                      </div>

                      {hasFlags && (
                        <div className="mt-2">
                          <div className="flex flex-wrap gap-1">
                            {b.integrityFlags.map((f) => (
                              <Badge
                                key={f}
                                tone={BATCH_INTEGRITY_FLAG[f].tone}
                                title={BATCH_INTEGRITY_FLAG[f].detail}
                              >
                                {BATCH_INTEGRITY_FLAG[f].label}
                              </Badge>
                            ))}
                          </div>
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-[12px] text-muted select-none">
                              Evidence
                            </summary>
                            <div className="mt-1.5">
                              <JsonBlock value={b.integrityDetail} maxHeight="16rem" />
                            </div>
                          </details>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
