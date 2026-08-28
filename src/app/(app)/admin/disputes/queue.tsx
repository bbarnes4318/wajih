"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { DisputeReasonCode, Vertical } from "@prisma/client";
import { Ban, CircleCheck, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { money, phoneDisplay, relativeTime, utcTimestamp } from "@/lib/format";
import { DISPUTE_REASON, verticalLabel } from "@/lib/domain/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LeadDrawer } from "@/components/domain/lead-drawer";
import { resolveDisputeAction } from "./actions";

export interface DisputeRow {
  id: string;
  sourceId: string;
  vertical: Vertical;
  contactName: string;
  contactPhone: string | null;
  contactState: string | null;
  reasonCode: DisputeReasonCode;
  notes: string | null;
  disputedAt: string | null;
  deliveredAt: string | null;
  buyerCost: string | null;
  publisherPayout: string | null;
  publisherId: string;
  publisherName: string;
  buyerName: string;
  campaignName: string;
}

/**
 * Adjudication list.
 *
 * Both decisions are irreversible in their financial effect, so each row
 * states the money at stake on both sides before the reviewer clicks.
 */
export function DisputeQueue({ rows }: { rows: DisputeRow[] }) {
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function decide(leadId: string, decision: "APPROVE" | "DENY") {
    setError(null);
    setPendingId(leadId);
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("decision", decision);
    startTransition(async () => {
      const result = await resolveDisputeAction(fd);
      if (!result.ok) setError("That dispute could not be resolved.");
      setPendingId(null);
    });
  }

  return (
    <>
      {error && (
        <div className="border-b border-danger-border bg-danger-soft px-4 py-2 text-[13px] text-danger">
          {error}
        </div>
      )}

      <ul className="divide-y divide-[var(--border)]">
        {rows.map((row) => {
          const meta = DISPUTE_REASON[row.reasonCode];
          const busy = pendingId === row.id;

          return (
            <li
              key={row.id}
              className={cn(
                "flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-hover",
                busy && "opacity-60",
              )}
            >
              <div className="min-w-[14rem] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={meta.tone} title={meta.help}>
                    {meta.label}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setInspecting(row.id)}
                    className="text-[14px] font-medium text-ink hover:text-accent"
                  >
                    {row.contactName}
                  </button>
                  <span className="font-mono text-[12px] text-muted tabular">
                    {phoneDisplay(row.contactPhone)}
                  </span>
                  <Badge tone="neutral" className="font-mono">
                    {row.contactState}
                  </Badge>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                  <Link
                    href={`/admin/publishers/${row.publisherId}`}
                    className="hover:text-accent"
                  >
                    {row.publisherName}
                  </Link>
                  <span className="text-faint">→</span>
                  <span>{row.buyerName}</span>
                  <span className="text-faint">·</span>
                  <span>{row.campaignName}</span>
                  <span className="text-faint">·</span>
                  <span>{verticalLabel(row.vertical)}</span>
                </div>

                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-faint">
                  <span className="text-accent">{row.sourceId}</span>
                  <span>·</span>
                  <span>delivered {utcTimestamp(row.deliveredAt)}</span>
                  <span>·</span>
                  <span>filed {relativeTime(row.disputedAt)}</span>
                </div>

                {row.notes && (
                  <p className="mt-1.5 border-l-2 border-line pl-2 text-[12px] leading-relaxed text-muted italic">
                    {row.notes}
                  </p>
                )}
              </div>

              {/* Money at stake, stated on both sides */}
              <div className="min-w-[10rem]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] text-faint">Buyer credit</span>
                  <span className="font-mono text-[13px] text-danger tabular">
                    {money(row.buyerCost)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] text-faint">Payout clawback</span>
                  <span className="font-mono text-[13px] text-warning tabular">
                    {money(row.publisherPayout)}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setInspecting(row.id)}
                >
                  <ExternalLink className="size-3.5" />
                  Trail
                </Button>
                <Button
                  variant="success"
                  size="sm"
                  disabled={busy}
                  onClick={() => decide(row.id, "DENY")}
                  title="Lead stands as payable to the publisher."
                >
                  <CircleCheck className="size-3.5" />
                  Deny return
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => decide(row.id, "APPROVE")}
                  title="Credits the buyer and voids the publisher payout."
                >
                  <Ban className="size-3.5" />
                  Approve return
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <LeadDrawer leadId={inspecting} onClose={() => setInspecting(null)} />
    </>
  );
}
