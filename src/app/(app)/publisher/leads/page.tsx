import type { Metadata } from "next";
import { Topbar } from "@/components/shell/topbar";
import { LeadFilterBar } from "@/components/domain/lead-filter-bar";
import { LeadStream } from "@/components/domain/lead-stream";
import { Pagination } from "@/components/domain/pagination";
import { requirePublisher } from "@/lib/auth/rbac";
import {
  leadFilterOptions,
  parseLeadFilters,
  queryLeads,
  stageCounts,
} from "@/lib/db/leads";
import { toLeadTableRow } from "@/lib/db/lead-view";

export const metadata: Metadata = { title: "My Leads" };

/**
 * The publisher's own stream. Buyer identity and network revenue columns are
 * hidden — a publisher sees what it was paid, never what the lead sold for.
 */
export default async function PublisherLeadsPage(
  props: PageProps<"/publisher/leads">,
) {
  const user = await requirePublisher();
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
        title="My Leads"
        subtitle="Every submission, with the exact step and reason code that decided it."
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <LeadFilterBar
          options={options}
          stageCounts={Object.fromEntries(counts)}
          total={result.total}
          showPublisher={false}
          showBuyer={false}
        />

        <div className="min-h-0 flex-1 overflow-auto">
          <LeadStream
            rows={result.rows.map(toLeadTableRow)}
            hiddenColumns={["publisher", "buyer", "revenue"]}
          />
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
