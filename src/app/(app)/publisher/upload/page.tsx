import type { Metadata } from "next";
import { CloudUpload, FileSpreadsheet, ShieldAlert } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { BatchStatusChip } from "@/components/domain/status-chip";
import { CsvUploader } from "./uploader";
import { requirePublisher } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { count, shortDateTime } from "@/lib/format";
import { BATCH_INTEGRITY_FLAG } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "CSV Intake" };

export default async function PublisherUploadPage() {
  const user = await requirePublisher();

  const [sources, batches] = await Promise.all([
    prisma.leadSource.findMany({
      where: { publisherOrgId: user.orgId, active: true },
      select: { sourceId: true, vertical: true },
      orderBy: { sourceId: "asc" },
    }),
    prisma.csvBatch.findMany({
      where: { publisherOrgId: user.orgId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  // Group the publisher's own sources by vertical — they can only upload
  // against verticals they actually have a source for.
  const byVertical = new Map<string, string[]>();
  for (const s of sources) {
    const list = byVertical.get(s.vertical) ?? [];
    list.push(s.sourceId);
    byVertical.set(s.vertical, list);
  }
  const verticals = [...byVertical.entries()].map(([vertical, sourceIds]) => ({
    vertical: vertical as (typeof sources)[number]["vertical"],
    sourceIds,
  }));

  return (
    <>
      <Topbar
        user={user}
        title="CSV Intake"
        subtitle="Batch submission with pre-flight fraud screening."
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        {user.orgStatus !== "ACTIVE" && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-soft px-4 py-3">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <p className="text-[14px] font-medium text-warning">
                Account is {user.orgStatus.replace(/_/g, " ").toLowerCase()}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-warning/85">
                Batches cannot be processed until the account is ACTIVE. You can
                still run pre-flight checks on a file to see how it would score.
              </p>
            </div>
          </div>
        )}

        {verticals.length === 0 ? (
          <Panel>
            <PanelBody>
              <EmptyState
                icon={<FileSpreadsheet />}
                title="No active sources"
                description="A Source ID is required on every row. Ask network operations to provision a source before uploading."
              />
            </PanelBody>
          </Panel>
        ) : (
          <Panel className="mb-4">
            <PanelHeader
              icon={<CloudUpload className="size-3.5" />}
              title="Upload a batch"
              subtitle="Files are screened as a whole before any row enters the pipeline."
            />
            <PanelBody>
              <CsvUploader verticals={verticals} />
            </PanelBody>
          </Panel>
        )}

        <Panel>
          <PanelHeader
            icon={<FileSpreadsheet className="size-3.5" />}
            title="Batch history"
            subtitle="Every file submitted on this account, with its integrity verdict."
          />
          <PanelBody dense>
            {batches.length === 0 ? (
              <EmptyState title="No batches uploaded yet" />
            ) : (
              <div className="grid-scroll">
                <table className="w-full text-left">
                  <thead className="border-b border-line bg-sunken">
                    <tr>
                      {["File", "Status", "Rows", "Accepted", "Rejected", "Flags", "Uploaded"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-3.5 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id} className="border-b border-line last:border-0">
                        <td className="max-w-[18rem] truncate px-3.5 py-2.5 font-mono text-[12px] text-ink">
                          {b.filename}
                        </td>
                        <td className="px-3 py-2">
                          <BatchStatusChip status={b.status} />
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-muted tabular">
                          {count(b.rowCount)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-success tabular">
                          {count(b.acceptedCount)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-danger tabular">
                          {count(b.rejectedCount)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {b.integrityFlags.length === 0 ? (
                              <span className="text-[12px] text-faint">clean</span>
                            ) : (
                              b.integrityFlags.map((f) => (
                                <Badge
                                  key={f}
                                  tone={BATCH_INTEGRITY_FLAG[f].tone}
                                  title={BATCH_INTEGRITY_FLAG[f].detail}
                                >
                                  {BATCH_INTEGRITY_FLAG[f].label}
                                </Badge>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-[12px] whitespace-nowrap text-muted">
                          {shortDateTime(b.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
