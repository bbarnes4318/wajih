"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Gavel, Search } from "lucide-react";
import type { LeadTableRow } from "@/lib/db/lead-view";
import { cn } from "@/lib/utils";
import { countdownParts, money, phoneDisplay, utcTimestamp } from "@/lib/format";
import { verticalLabel } from "@/lib/domain/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CountdownBadge } from "@/components/domain/countdown-badge";
import { DisputeModal } from "@/components/domain/dispute-modal";
import { LeadDrawer } from "@/components/domain/lead-drawer";
import {
  BuyerStatusChip,
  DisputeReasonChip,
} from "@/components/domain/status-chip";
import { acceptLeadAction } from "../actions";
import { disputeErrorMessage } from "@/lib/domain/dispute-messages";

/**
 * Buyer delivery queue.
 *
 * Rendered as rows rather than the admin's wide grid: a buyer works this list
 * by "what expires next", so the countdown and the two decisions are the
 * primary affordances and everything else is secondary.
 */
export function BuyerLeadQueue({ rows }: { rows: LeadTableRow[] }) {
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<LeadTableRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function accept(lead: LeadTableRow) {
    setError(null);
    setPendingId(lead.id);
    const fd = new FormData();
    fd.set("leadId", lead.id);
    startTransition(async () => {
      const result = await acceptLeadAction(fd);
      if (!result.ok) setError(disputeErrorMessage(result.error));
      setPendingId(null);
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Search />}
        title="No leads match these filters"
        description="Widen the date range, or clear a filter to see your full delivery history."
      />
    );
  }

  return (
    <>
      {error && (
        <div className="border-b border-danger-border bg-danger-soft px-4 py-2 text-[13px] text-danger">
          {error}
        </div>
      )}

      <ul className="divide-y divide-[var(--border)]">
        {rows.map((lead) => {
          const window = countdownParts(lead.disputeWindowExpiresAt);
          const actionable = lead.buyerStatus === "PENDING" && !window.expired;
          const busy = pendingId === lead.id;

          return (
            <li
              key={lead.id}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-hover",
                busy && "opacity-60",
              )}
            >
              {/* Consumer */}
              <button
                type="button"
                onClick={() => setInspecting(lead.id)}
                className="min-w-[13rem] flex-1 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-ink">
                    {lead.contactName}
                  </span>
                  <Badge tone="neutral" className="font-mono">
                    {lead.contactState} {lead.contactZip}
                  </Badge>
                  {lead.hasTrustedForm && (
                    <Badge tone="violet" title="TrustedForm certificate on file">
                      TF
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                  <span className="font-mono tabular">
                    {phoneDisplay(lead.contactPhone)}
                  </span>
                  <span className="text-faint">·</span>
                  <span className="truncate">{lead.contactEmail}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-faint">
                  <span className="text-accent">{lead.sourceId}</span>
                  <span>·</span>
                  <span>{utcTimestamp(lead.deliveredAt)}</span>
                </div>
              </button>

              {/* Campaign + price */}
              <div className="min-w-[9rem]">
                <div className="truncate text-[13px] text-ink">
                  {lead.campaignName ?? "—"}
                </div>
                <div className="text-[12px] text-muted">
                  {verticalLabel(lead.vertical)}
                </div>
                <div className="mt-0.5 font-mono text-[13px] text-ink tabular">
                  {money(lead.buyerCostAmount)}
                </div>
              </div>

              {/* Status */}
              <div className="flex min-w-[9rem] flex-col items-start gap-1">
                <BuyerStatusChip status={lead.buyerStatus} />
                {lead.disputeReasonCode && (
                  <DisputeReasonChip code={lead.disputeReasonCode} />
                )}
                {lead.buyerStatus === "PENDING" && (
                  <CountdownBadge expiresAt={lead.disputeWindowExpiresAt} />
                )}
              </div>

              {/* Decisions */}
              <div className="flex shrink-0 items-center gap-1.5">
                {actionable ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => accept(lead)}
                    >
                      <CircleCheck className="size-3.5" />
                      Accept
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      onClick={() => setDisputing(lead)}
                    >
                      <Gavel className="size-3.5" />
                      Dispute
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setInspecting(lead.id)}
                  >
                    Inspect
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {disputing && (
        <DisputeModal
          open={Boolean(disputing)}
          onOpenChange={(open) => !open && setDisputing(null)}
          lead={disputing}
        />
      )}

      <LeadDrawer leadId={inspecting} onClose={() => setInspecting(null)} />
    </>
  );
}
