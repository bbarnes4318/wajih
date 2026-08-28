import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressRing } from "@/components/ui/progress-ring";
import { OrgStatusChip } from "@/components/domain/status-chip";
import { requireAdmin } from "@/lib/auth/rbac";
import { listPublishers } from "@/lib/db/vetting";
import { AUTO_SUSPEND_RETURN_RATE } from "@/lib/metrics/publisher-metrics";
import { count, percent, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Publishers" };

export default async function PublishersPage() {
  const user = await requireAdmin();
  const publishers = await listPublishers();

  return (
    <>
      <Topbar
        user={user}
        title="Publishers"
        subtitle={`${publishers.length} accounts across every status.`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <Panel>
          <PanelHeader
            icon={<Users className="size-3.5" />}
            title="All publishers"
            subtitle="Vetting progress, lifetime volume and rolling return rate."
          />
          <PanelBody dense>
            <div className="grid-scroll">
              <table className="w-full text-left">
                <thead className="border-b border-line bg-sunken">
                  <tr>
                    {[
                      "Publisher", "Status", "Vetting", "EIN", "Sources",
                      "Lifetime leads", "14d return", "Onboarded", "",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3.5 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {publishers.map((p) => {
                    const rate = p.metrics?.returnRate14d ?? 0;
                    const breach = rate >= AUTO_SUSPEND_RETURN_RATE;
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-line transition-colors last:border-0 hover:bg-hover"
                      >
                        <td className="px-3 py-2">
                          <Link
                            href={`/admin/publishers/${p.id}`}
                            className="text-[13px] font-medium text-ink hover:text-accent"
                          >
                            {p.name}
                          </Link>
                          <div className="font-mono text-[12px] text-faint">
                            {p.contactEmail}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <OrgStatusChip status={p.status} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <ProgressRing
                              value={p.progress.passed}
                              max={p.progress.total}
                              size={22}
                              strokeWidth={3}
                              tone={
                                p.progress.failed > 0
                                  ? "danger"
                                  : p.progress.complete
                                    ? "success"
                                    : "accent"
                              }
                            />
                            <span className="font-mono text-[12px] text-muted tabular">
                              {p.progress.passed}/{p.progress.total}
                            </span>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-[12px] text-muted">
                          {p.einTaxId ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone="neutral">
                            {p.sources.filter((s) => s.active).length} active
                          </Badge>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-ink tabular">
                          {count(p._count.leadsAsPublisher)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono text-[12px] tabular ${
                            breach ? "font-semibold text-danger" : "text-muted"
                          }`}
                        >
                          {percent(rate, 1)}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-[12px] text-muted">
                          {shortDate(p.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/admin/publishers/${p.id}`}
                            className="text-faint hover:text-ink"
                            aria-label={`Open ${p.name}`}
                          >
                            <ChevronRight className="size-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
