import type { Metadata } from "next";
import { Inbox, Timer } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeadFilterBar } from "@/components/domain/lead-filter-bar";
import { Pagination } from "@/components/domain/pagination";
import { BuyerLeadQueue } from "./queue";
import { requireBuyer } from "@/lib/auth/rbac";
import {
  leadFilterOptions,
  parseLeadFilters,
  queryLeads,
  stageCounts,
} from "@/lib/db/leads";
import { toLeadTableRow } from "@/lib/db/lead-view";
import { prisma } from "@/lib/db/prisma";
import { count } from "@/lib/format";

export const metadata: Metadata = { title: "Delivery Queue" };

export default async function BuyerLeadsPage(props: PageProps<"/buyer/leads">) {
  const user = await requireBuyer();
  const searchParams = await props.searchParams;
  const filters = parseLeadFilters(searchParams);

  const [result, counts, options, openWindows] = await Promise.all([
    queryLeads(user, filters),
    stageCounts(user, filters),
    leadFilterOptions(user),
    prisma.lead.count({
      where: {
        buyerOrgId: user.orgId,
        buyerStatus: "PENDING",
        deliveredAt: { not: null },
        disputeWindowExpiresAt: { gt: new Date() },
      },
    }),
  ]);

  return (
    <>
      <Topbar
        user={user}
        title="Delivery Queue"
        subtitle="Leads delivered to your campaigns, with their return windows."
        actions={
          openWindows > 0 ? (
            <Badge tone="warning" dot>
              <Timer className="size-3" />
              {count(openWindows)} inside return window
            </Badge>
          ) : undefined
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <LeadFilterBar
          options={options}
          stageCounts={Object.fromEntries(counts)}
          total={result.total}
          showBuyer={false}
          showPublisher={false}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Panel className="m-4">
            <PanelHeader
              icon={<Inbox className="size-3.5" />}
              title="Delivered leads"
              subtitle="Accept early, or file a structured return before the window closes. Anything untouched auto-settles as payable."
            />
            <PanelBody dense>
              <BuyerLeadQueue rows={result.rows.map(toLeadTableRow)} />
            </PanelBody>
          </Panel>
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
