import type { Metadata } from "next";
import { Topbar } from "@/components/shell/topbar";
import { LeadFilterBar } from "@/components/domain/lead-filter-bar";
import { LeadStream } from "@/components/domain/lead-stream";
import { Pagination } from "@/components/domain/pagination";
import { requireAdmin } from "@/lib/auth/rbac";
import {
  leadFilterOptions,
  parseLeadFilters,
  queryLeads,
  stageCounts,
} from "@/lib/db/leads";
import { toLeadTableRow } from "@/lib/db/lead-view";
import { ExportButton } from "./export-button";

export const metadata: Metadata = { title: "Lead Stream" };

export default async function AdminLeadsPage(props: PageProps<"/admin/leads">) {
  const user = await requireAdmin();
  const searchParams = await props.searchParams;
  const filters = parseLeadFilters(searchParams);

  const [result, counts, options] = await Promise.all([
    queryLeads(user, filters),
    stageCounts(user, filters),
    leadFilterOptions(user),
  ]);

  return (
    <>
      <Topbar
        user={user}
        title="Master Lead Stream"
        subtitle="Every lead in the network, with its full execution trail."
        actions={<ExportButton />}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <LeadFilterBar
          options={options}
          stageCounts={Object.fromEntries(counts)}
          total={result.total}
        />

        <div className="min-h-0 flex-1 overflow-auto">
          <LeadStream rows={result.rows.map(toLeadTableRow)} />
        </div>

        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          pageSize={result.pageSize}
        />
      </div>
    </>
  );
}
