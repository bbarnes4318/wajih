"use client";

import { useMemo, useState } from "react";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, ShieldCheck, ShieldAlert } from "lucide-react";
import type { LeadTableRow } from "@/lib/db/lead-view";
import { cn } from "@/lib/utils";
import { midTruncate, money, ms, phoneDisplay, utcTimestamp } from "@/lib/format";
import { verticalCode } from "@/lib/domain/labels";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import {
  BuyerStatusChip,
  ChannelChip,
  ReasonChip,
  StageChip,
} from "./status-chip";
import { CountdownBadge } from "./countdown-badge";
import { CopyButton } from "./copy-button";

/**
 * The master lead stream.
 *
 * Sorting and column visibility are client-side over the current page;
 * filtering and pagination are server-side (see `lib/db/leads.ts`), so this
 * never holds more than one page of the network in memory.
 */

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});

const helper = createColumnHelper<typeof features, LeadTableRow>();

const EMPTY: LeadTableRow[] = [];

function Head({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <span
      className={cn(
        "block text-[11px] font-semibold tracking-[0.07em] text-faint uppercase",
        align === "right" && "text-right",
      )}
    >
      {children}
    </span>
  );
}

const columns = helper.columns([
  helper.accessor("receivedAtUtc", {
    id: "received",
    header: () => <Head>Received (UTC)</Head>,
    cell: ({ row }) => (
      <span className="font-mono text-[12px] whitespace-nowrap text-muted tabular">
        {utcTimestamp(row.original.receivedAtUtc)}
      </span>
    ),
  }),
  helper.accessor("id", {
    id: "leadId",
    header: () => <Head>Lead ID</Head>,
    cell: ({ row }) => (
      <span className="group inline-flex items-center gap-1">
        <span className="font-mono text-[12px] text-ink" title={row.original.id}>
          {midTruncate(row.original.id, 8, 4)}
        </span>
        <CopyButton
          value={row.original.id}
          label="lead ID"
          className="opacity-0 group-hover:opacity-100"
        />
      </span>
    ),
  }),
  helper.accessor("sourceId", {
    id: "sourceId",
    header: () => <Head>Source ID</Head>,
    cell: ({ row }) => (
      <span className="font-mono text-[12px] whitespace-nowrap text-accent">
        {row.original.sourceId}
      </span>
    ),
  }),
  helper.accessor("publisherName", {
    id: "publisher",
    header: () => <Head>Publisher</Head>,
    cell: ({ row }) => (
      <span className="block max-w-[11rem] truncate text-[13px] text-ink">
        {row.original.publisherName}
      </span>
    ),
  }),
  helper.accessor("vertical", {
    id: "vertical",
    header: () => <Head>Vertical</Head>,
    cell: ({ row }) => (
      <Badge tone="neutral" className="font-mono">
        {verticalCode(row.original.vertical)}
      </Badge>
    ),
  }),
  helper.accessor("contactName", {
    id: "consumer",
    header: () => <Head>Consumer</Head>,
    cell: ({ row }) => (
      <div className="min-w-[9rem]">
        <div className="truncate text-[13px] text-ink">{row.original.contactName}</div>
        <div className="font-mono text-[12px] text-muted tabular">
          {phoneDisplay(row.original.contactPhone)}
        </div>
      </div>
    ),
  }),
  helper.accessor("contactState", {
    id: "geo",
    header: () => <Head>Geo</Head>,
    cell: ({ row }) => (
      <span className="font-mono text-[12px] whitespace-nowrap text-muted">
        {row.original.contactState ?? "—"}
        {row.original.contactZip ? ` ${row.original.contactZip}` : ""}
      </span>
    ),
  }),
  helper.display({
    id: "compliance",
    header: () => <Head>Compliance</Head>,
    cell: ({ row }) => {
      const l = row.original;
      const scrubbed = l.dncScrubPassed === true && l.litigatorScrubPassed === true;
      const consented = l.hasTrustedForm || l.hasJornaya;
      return (
        <div className="flex items-center gap-1">
          <Tooltip
            content={
              scrubbed
                ? "Clear on every DNC and litigator list."
                : l.dncScrubPassed === false
                  ? "Failed the DNC / litigator scrub."
                  : "Scrub not reached."
            }
          >
            <span
              className={cn(
                "grid size-5 place-items-center rounded border",
                scrubbed
                  ? "border-success-border bg-success-soft text-success"
                  : l.dncScrubPassed === false
                    ? "border-danger-border bg-danger-soft text-danger"
                    : "border-line bg-chip text-faint",
              )}
            >
              {scrubbed ? (
                <ShieldCheck className="size-3" />
              ) : (
                <ShieldAlert className="size-3" />
              )}
            </span>
          </Tooltip>
          <Tooltip
            content={
              consented
                ? `${l.hasTrustedForm ? "TrustedForm" : "Jornaya"} certificate on file.`
                : "No consent certificate captured."
            }
          >
            <span
              className={cn(
                "grid size-5 place-items-center rounded border font-mono text-[10px] font-bold",
                consented
                  ? "border-violet-border bg-violet-soft text-violet"
                  : "border-line bg-chip text-faint",
              )}
            >
              {l.hasTrustedForm ? "TF" : l.hasJornaya ? "JR" : "—"}
            </span>
          </Tooltip>
        </div>
      );
    },
  }),
  helper.accessor("pipelineStage", {
    id: "stage",
    header: () => <Head>Stage</Head>,
    cell: ({ row }) => <StageChip stage={row.original.pipelineStage} />,
  }),
  helper.display({
    id: "reason",
    header: () => <Head>Reason Code</Head>,
    cell: ({ row }) => {
      const code = row.original.rejectionReasonCode ?? row.original.holdReason;
      return code ? <ReasonChip code={code} /> : <span className="text-faint">—</span>;
    },
  }),
  helper.accessor("buyerName", {
    id: "buyer",
    header: () => <Head>Buyer / Campaign</Head>,
    cell: ({ row }) =>
      row.original.buyerName ? (
        <div className="min-w-[10rem]">
          <div className="truncate text-[13px] text-ink">{row.original.buyerName}</div>
          <div className="truncate text-[12px] text-muted">
            {row.original.campaignName}
          </div>
        </div>
      ) : (
        <span className="text-faint">—</span>
      ),
  }),
  helper.accessor("buyerStatus", {
    id: "buyerStatus",
    header: () => <Head>Buyer Status</Head>,
    cell: ({ row }) =>
      row.original.deliveredAt ? (
        <BuyerStatusChip status={row.original.buyerStatus} />
      ) : (
        <span className="text-faint">—</span>
      ),
  }),
  helper.display({
    id: "window",
    header: () => <Head>Return Window</Head>,
    cell: ({ row }) =>
      row.original.deliveredAt && row.original.buyerStatus === "PENDING" ? (
        <CountdownBadge expiresAt={row.original.disputeWindowExpiresAt} />
      ) : (
        <span className="text-faint">—</span>
      ),
  }),
  helper.accessor("buyerCostAmount", {
    id: "revenue",
    header: () => <Head align="right">Revenue</Head>,
    cell: ({ row }) => (
      <span className="block text-right font-mono text-[12px] text-ink tabular">
        {row.original.buyerCostAmount ? money(row.original.buyerCostAmount) : "—"}
      </span>
    ),
  }),
  helper.accessor("publisherPayoutAmount", {
    id: "payout",
    header: () => <Head align="right">Payout</Head>,
    cell: ({ row }) => (
      <span className="block text-right font-mono text-[12px] text-muted tabular">
        {row.original.publisherPayoutAmount
          ? money(row.original.publisherPayoutAmount)
          : "—"}
      </span>
    ),
  }),
  helper.accessor("ingressChannel", {
    id: "channel",
    header: () => <Head>Channel</Head>,
    cell: ({ row }) => <ChannelChip channel={row.original.ingressChannel} />,
  }),
  helper.accessor("pipelineDurationMs", {
    id: "duration",
    header: () => <Head align="right">Pipeline</Head>,
    cell: ({ row }) => (
      <span className="block text-right font-mono text-[12px] text-muted tabular">
        {ms(row.original.pipelineDurationMs)}
      </span>
    ),
  }),
]);

export function LeadTable({
  rows,
  onInspect,
  selectedId,
  /** Columns to hide for this portal (e.g. a publisher never sees revenue). */
  hiddenColumns = [],
}: {
  rows: LeadTableRow[];
  onInspect: (leadId: string) => void;
  selectedId?: string | null;
  hiddenColumns?: string[];
}) {
  const [sorting, setSorting] = useState<
    Array<{ id: string; desc: boolean }>
  >([]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenColumns.includes(String(c.id))),
    [hiddenColumns],
  );

  const table = useTable({
    features,
    columns: visibleColumns,
    data: rows.length > 0 ? rows : EMPTY,
    getRowId: (row) => row.id,
    state: { sorting },
    onSortingChange: setSorting,
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No leads match these filters"
        description="Widen the date range, or clear a filter to see the full stream."
      />
    );
  }

  return (
    <div className="grid-scroll">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-sunken">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="border-b border-line">
              {group.headers.map((header) => {
                const sortable = header.column.getCanSort?.() ?? false;
                const dir = header.column.getIsSorted?.();
                return (
                  <th
                    key={header.id}
                    scope="col"
                    className="px-3.5 py-2.5 whitespace-nowrap select-none"
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={() => header.column.toggleSorting?.()}
                        className="group inline-flex items-center gap-1"
                      >
                        <table.FlexRender header={header} />
                        {dir === "asc" ? (
                          <ArrowUp className="size-3 text-accent" />
                        ) : dir === "desc" ? (
                          <ArrowDown className="size-3 text-accent" />
                        ) : (
                          <ChevronsUpDown className="size-3 text-faint opacity-0 group-hover:opacity-100" />
                        )}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>

        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onInspect(row.original.id)}
              className={cn(
                "cursor-pointer border-b border-line transition-colors",
                selectedId === row.original.id ? "bg-accent-soft" : "hover:bg-hover",
              )}
            >
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className="px-3 py-1.5 align-middle">
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
