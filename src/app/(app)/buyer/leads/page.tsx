import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Timer, TriangleAlert } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeadFilterBar } from "@/components/domain/lead-filter-bar";
import { Pagination } from "@/components/domain/pagination";
import { ExportButton } from "@/components/domain/export-button";
import { BuyerLeadQueue } from "./queue";
import { SegmentTabs } from "./segment-tabs";
import { requireBuyer } from "@/lib/auth/rbac";
import {
  buyerClosingSoonCount,
  buyerSegmentCounts,
  leadFilterOptions,
  parseLeadFilters,
  queryLeads,
  stageCounts,
  type LeadSegment,
} from "@/lib/db/leads";
import { toLeadTableRow } from "@/lib/db/lead-view";
import { prisma } from "@/lib/db/prisma";
import { count } from "@/lib/format";

export const metadata: Metadata = { title: "Delivery Queue" };

const SEGMENT_ORDER: LeadSegment[] = ["closing2h", "closingToday", "allPending", "history"];

export default async function BuyerLeadsPage(props: PageProps<"/buyer/leads">) {
  const user = await requireBuyer();
  const searchParams = await props.searchParams;
  const rawFilters = parseLeadFilters(searchParams);

  // Segment counts drive both the tab badges and the default-segment choice,
  // so they're computed against every *other* filter before we know which
  // segment we're actually querying rows for.
  const segmentCounts = await buyerSegmentCounts(user, rawFilters);
  const segment: LeadSegment =
    rawFilters.segment ?? SEGMENT_ORDER.find((s) => segmentCounts[s] > 0) ?? "allPending";
  // Buyers triage by "what expires next", not delivery time — except in
  // History, where the leads no longer have a meaningful window to sort by.
  const sort: "expiryAsc" | "deliveredDesc" = segment === "history" ? "deliveredDesc" : "expiryAsc";
  const filters = { ...rawFilters, segment, sort };

  const [result, counts, options, openWindows, closingSoonCount] = await Promise.all([
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
    buyerClosingSoonCount(user, 60),
  ]);

  return (
    <>
      <Topbar
        user={user}
        title="Delivery Queue"
        subtitle="Leads delivered to your campaigns, with their return windows."
        actions={
          <>
            {openWindows > 0 && (
              <Badge tone="warning" dot>
                <Timer className="size-3" />
                {count(openWindows)} inside return window
              </Badge>
            )}
            <ExportButton />
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {closingSoonCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-warning-border bg-warning-soft px-4 py-2 text-body text-warning">
            <TriangleAlert className="size-4 shrink-0" />
            <span>
              {count(closingSoonCount)} return window
              {closingSoonCount === 1 ? "" : "s"} closing within the hour.
            </span>
            <Link
              href="?segment=closing2h&focus=1"
              className="ml-auto min-h-[36px] shrink-0 content-center font-medium underline underline-offset-2 hover:no-underline"
            >
              Review the {count(closingSoonCount)} closing soonest
            </Link>
          </div>
        )}

        <div className="border-b border-line px-4 py-3">
          <SegmentTabs value={segment} counts={segmentCounts} />
        </div>

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
