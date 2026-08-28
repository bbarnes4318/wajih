import type { Metadata } from "next";
import { PhoneOff, ShieldAlert } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/domain/stat-tile";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { count, phoneDisplay, shortDate } from "@/lib/format";
import { SUPPRESSION_LIST_TYPE } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "Suppression Lists" };

export default async function SuppressionPage(
  props: PageProps<"/admin/suppression">,
) {
  const user = await requireAdmin();
  const searchParams = await props.searchParams;
  const rawQuery = searchParams.q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim() ?? "";
  const digits = query.replace(/\D/g, "");

  const [byType, entries, hitsByCode, total] = await Promise.all([
    prisma.suppressionEntry.groupBy({
      by: ["listType"],
      _count: { _all: true },
    }),
    prisma.suppressionEntry.findMany({
      where: digits.length >= 3 ? { phoneE164: { contains: digits } } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.lead.groupBy({
      by: ["rejectionReasonCode"],
      where: {
        rejectionStep: "STEP_4_DNC_LITIGATOR",
        rejectionReasonCode: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { rejectionReasonCode: "desc" } },
    }),
    prisma.suppressionEntry.count(),
  ]);

  const countByType = new Map(byType.map((t) => [t.listType, t._count._all]));

  return (
    <>
      <Topbar
        user={user}
        title="Suppression Lists"
        subtitle="What step 4 scrubs against. A provider error is never treated as a clear number."
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              "FEDERAL_DNC",
              "STATE_DNC",
              "INTERNAL_DNC",
              "TCPA_LITIGATOR",
            ] as const
          ).map((type) => (
            <StatTile
              key={type}
              label={SUPPRESSION_LIST_TYPE[type].label}
              value={count(countByType.get(type) ?? 0)}
              icon={type === "TCPA_LITIGATOR" ? <ShieldAlert /> : <PhoneOff />}
              accent={type === "TCPA_LITIGATOR" ? "danger" : undefined}
            />
          ))}
        </div>

        <Panel className="mb-4">
          <PanelHeader
            title="Scrub outcomes"
            subtitle="Leads halted at step 4, by which list matched."
          />
          <PanelBody>
            {hitsByCode.length === 0 ? (
              <p className="py-6 text-center text-xs text-faint">
                No leads have been stopped at the scrub yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {hitsByCode.map((h) => (
                  <span
                    key={h.rejectionReasonCode}
                    className="flex items-center gap-2 rounded-md border border-line bg-sunken px-2.5 py-1.5"
                  >
                    <Badge tone="danger">{h.rejectionReasonCode}</Badge>
                    <span className="font-mono text-[13px] text-ink tabular">
                      {count(h._count._all)}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            icon={<PhoneOff className="size-3.5" />}
            title="Entries"
            subtitle={
              digits.length >= 3
                ? `Filtered to numbers containing "${digits}".`
                : `${count(total)} entries. Append ?q=<digits> to search.`
            }
          />
          <PanelBody dense>
            {entries.length === 0 ? (
              <EmptyState
                title="No matching entries"
                description="Nothing on the suppression lists matches that number."
              />
            ) : (
              <div className="grid-scroll">
                <table className="w-full text-left">
                  <thead className="border-b border-line bg-sunken">
                    <tr>
                      {["Phone", "List", "State", "Note", "Added"].map((h) => (
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
                    {entries.map((e) => {
                      const meta = SUPPRESSION_LIST_TYPE[e.listType];
                      return (
                        <tr key={e.id} className="border-b border-line last:border-0">
                          <td className="px-3.5 py-2.5 font-mono text-[13px] text-ink tabular">
                            {phoneDisplay(e.phoneE164)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={meta.tone} dot>
                              {meta.label}
                            </Badge>
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-[12px] text-muted">
                            {e.stateCode ?? "—"}
                          </td>
                          <td className="max-w-[28rem] truncate px-3.5 py-2.5 text-[13px] text-muted">
                            {e.note ?? "—"}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-[12px] text-muted">
                            {shortDate(e.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
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
