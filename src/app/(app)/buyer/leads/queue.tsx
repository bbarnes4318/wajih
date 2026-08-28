"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, CircleCheck, Eye, Gavel, Search } from "lucide-react";
import type { LeadTableRow } from "@/lib/db/lead-view";
import { cn } from "@/lib/utils";
import { countdownParts, money, phoneDisplay, utcTimestamp } from "@/lib/format";
import { verticalLabel } from "@/lib/domain/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { CountdownBadge } from "@/components/domain/countdown-badge";
import { DisputeModal } from "@/components/domain/dispute-modal";
import { LeadDrawer } from "@/components/domain/lead-drawer";
import { OutcomeControl } from "@/components/domain/outcome-control";
import { KeyboardShortcutSheet } from "@/components/domain/keyboard-shortcut-sheet";
import {
  BuyerStatusChip,
  DisputeReasonChip,
} from "@/components/domain/status-chip";
import { useHotkey } from "@/lib/hooks/use-hotkey";
import { useBuyerLeadStream } from "@/lib/hooks/use-buyer-lead-stream";
import { acceptLeadAction, acceptLeadsAction } from "../actions";
import { disputeErrorMessage } from "@/lib/domain/dispute-messages";

const UNDO_WINDOW_MS = 6000;

function isActionable(lead: LeadTableRow, optimisticallyAccepted: boolean) {
  return (
    lead.buyerStatus === "PENDING" &&
    !countdownParts(lead.disputeWindowExpiresAt).expired &&
    !optimisticallyAccepted
  );
}

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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [optimisticAccepted, setOptimisticAccepted] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  // Leads pushed by the live stream, held back from the list until the user
  // clicks the pill — merging under the cursor mid-triage would be worse
  // than a moment's staleness.
  const [pendingNew, setPendingNew] = useState<LeadTableRow[]>([]);
  const [mergedRows, setMergedRows] = useState<LeadTableRow[]>([]);

  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const pendingTimers = useRef<Map<string, number>>(new Map());
  const refreshTimer = useRef<number | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const anyModalOpen = Boolean(disputing) || Boolean(inspecting) || shortcutsOpen;

  // Reconcile local state when the row set changes underneath us (a new
  // page, a new filter, or a server revalidation after a commit) — the
  // documented "adjusting state when a prop changes" pattern, run during
  // render rather than in an effect so it resolves in the same commit.
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    const validIds = new Set(rows.map((r) => r.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setFocusedIndex((i) => Math.min(i, Math.max(0, rows.length - 1)));
    // A revalidation may have picked up leads the stream already pushed —
    // drop the now-redundant copies rather than showing a lead twice.
    setMergedRows((prev) => prev.filter((r) => !validIds.has(r.id)));
    setPendingNew((prev) => prev.filter((r) => !validIds.has(r.id)));
  }

  // The "closing soonest" banner links here with ?focus=1 after navigating
  // to the closing2h segment — focus the first (soonest-expiring) row.
  // focusedIndex is already 0 by default, so this only needs to move real
  // DOM focus and clean up the URL, not touch React state.
  useEffect(() => {
    if (searchParams.get("focus") === "1" && rows.length > 0) {
      rowRefs.current[0]?.focus();
      const params = new URLSearchParams(searchParams.toString());
      params.delete("focus");
      router.replace(`?${params.toString()}`, { scroll: false });
    }
    // Only ever consume this once per navigation, not on every row change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const knownIds = useMemo(
    () => new Set([...rows.map((r) => r.id), ...mergedRows.map((r) => r.id)]),
    [rows, mergedRows],
  );

  useBuyerLeadStream({
    onDelivered: (lead) => {
      setPendingNew((prev) =>
        knownIds.has(lead.id) || prev.some((r) => r.id === lead.id) ? prev : [...prev, lead],
      );
    },
    onNeedsRefresh: () => {
      if (refreshTimer.current !== null) return;
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null;
        router.refresh();
      }, 2_000);
    },
  });

  useEffect(() => {
    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, []);

  function mergeNewRows() {
    setMergedRows((prev) => [...pendingNew, ...prev]);
    setPendingNew([]);
  }

  const allRows = useMemo(() => [...mergedRows, ...rows], [mergedRows, rows]);

  const actionableRows = useMemo(
    () => allRows.filter((r) => isActionable(r, optimisticAccepted.has(r.id))),
    [allRows, optimisticAccepted],
  );
  const selectedRows = useMemo(
    () => actionableRows.filter((r) => selected.has(r.id)),
    [actionableRows, selected],
  );
  const selectedTotal = useMemo(
    () => selectedRows.reduce((sum, r) => sum + Number(r.buyerCostAmount ?? 0), 0),
    [selectedRows],
  );
  const allSelected =
    actionableRows.length > 0 && selectedRows.length === actionableRows.length;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedRows.length > 0 && !allSelected;
    }
  }, [selectedRows.length, allSelected]);

  function toggleSelect(lead: LeadTableRow, index: number, shiftKey: boolean) {
    setFocusedIndex(index);
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedId) {
        const ids = actionableRows.map((r) => r.id);
        const from = ids.indexOf(lastClickedId);
        const to = ids.indexOf(lead.id);
        if (from !== -1 && to !== -1) {
          const [start, end] = from < to ? [from, to] : [to, from];
          const shouldSelect = !next.has(lead.id);
          for (let i = start; i <= end; i++) {
            if (shouldSelect) next.add(ids[i]);
            else next.delete(ids[i]);
          }
          setLastClickedId(lead.id);
          return next;
        }
      }
      if (next.has(lead.id)) next.delete(lead.id);
      else next.add(lead.id);
      setLastClickedId(lead.id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === actionableRows.length && actionableRows.every((r) => prev.has(r.id))
        ? new Set()
        : new Set(actionableRows.map((r) => r.id)),
    );
  }

  function commitAccept(leadId: string) {
    pendingTimers.current.delete(leadId);
    const fd = new FormData();
    fd.set("leadId", leadId);
    acceptLeadAction(fd).then((result) => {
      if (!result.ok) {
        setOptimisticAccepted((prev) => {
          const next = new Set(prev);
          next.delete(leadId);
          return next;
        });
        toast({ title: "Couldn't accept lead", description: disputeErrorMessage(result.error) });
      }
    });
  }

  function acceptWithUndo(lead: LeadTableRow) {
    setOptimisticAccepted((prev) => new Set(prev).add(lead.id));
    setSelected((prev) => {
      if (!prev.has(lead.id)) return prev;
      const next = new Set(prev);
      next.delete(lead.id);
      return next;
    });

    const timeoutId = window.setTimeout(() => commitAccept(lead.id), UNDO_WINDOW_MS);
    pendingTimers.current.set(lead.id, timeoutId);

    toast({
      title: "Lead accepted",
      description: lead.contactName,
      actionLabel: "Undo",
      duration: UNDO_WINDOW_MS,
      onAction: () => {
        const id = pendingTimers.current.get(lead.id);
        if (id) {
          window.clearTimeout(id);
          pendingTimers.current.delete(lead.id);
        }
        setOptimisticAccepted((prev) => {
          const next = new Set(prev);
          next.delete(lead.id);
          return next;
        });
      },
    });
  }

  async function bulkAccept() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkPending(true);
    const { results } = await acceptLeadsAction(ids);
    const okIds = results.filter((r) => r.ok).map((r) => r.leadId);
    setOptimisticAccepted((prev) => new Set([...prev, ...okIds]));
    setSelected(new Set());
    setBulkPending(false);
    toast({
      title:
        okIds.length === results.length
          ? `Accepted ${okIds.length} lead${okIds.length === 1 ? "" : "s"}`
          : `Accepted ${okIds.length} of ${results.length} leads`,
      description:
        okIds.length < results.length
          ? "The rest had already changed state and were skipped."
          : undefined,
    });
  }

  function moveFocus(delta: number) {
    setFocusedIndex((i) => {
      const next = Math.min(Math.max(i + delta, 0), Math.max(0, allRows.length - 1));
      rowRefs.current[next]?.focus();
      return next;
    });
  }

  const focusedLead = allRows[focusedIndex] as LeadTableRow | undefined;
  const focusedActionable =
    focusedLead && isActionable(focusedLead, optimisticAccepted.has(focusedLead.id));

  useHotkey("j", () => moveFocus(1), { enabled: !anyModalOpen });
  useHotkey("k", () => moveFocus(-1), { enabled: !anyModalOpen });
  useHotkey(
    "x",
    () => {
      if (focusedLead && focusedActionable) toggleSelect(focusedLead, focusedIndex, false);
    },
    { enabled: !anyModalOpen },
  );
  useHotkey(
    "a",
    () => {
      if (focusedLead && focusedActionable) acceptWithUndo(focusedLead);
    },
    { enabled: !anyModalOpen },
  );
  useHotkey(
    "d",
    () => {
      if (focusedLead && focusedActionable) setDisputing(focusedLead);
    },
    { enabled: !anyModalOpen },
  );
  useHotkey(
    "enter",
    () => {
      if (focusedLead) setInspecting(focusedLead.id);
    },
    { enabled: !anyModalOpen },
  );
  useHotkey("?", () => setShortcutsOpen(true), { enabled: !anyModalOpen });

  return (
    <>
      {pendingNew.length > 0 && (
        <button
          type="button"
          onClick={mergeNewRows}
          className="flex min-h-[44px] w-full items-center justify-center gap-1.5 border-b border-accent-border bg-accent-soft text-meta font-medium text-accent transition-colors hover:opacity-90"
        >
          <ArrowUp className="size-3.5" />
          {pendingNew.length} new since you opened this
        </button>
      )}

      {allRows.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No leads match these filters"
          description="Widen the date range, or clear a filter to see your full delivery history."
        />
      ) : (
        <>
          {actionableRows.length > 0 && (
            <div className="flex items-center gap-2 border-b border-line px-4 py-2">
              <label className="flex min-h-[44px] items-center gap-2">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="size-4 accent-[var(--accent)]"
                  aria-label="Select all in view"
                />
                <span className="text-meta text-muted">
                  Select all {actionableRows.length} in view
                </span>
              </label>
            </div>
          )}

          <ul className="divide-y divide-[var(--border)]">
            {allRows.map((lead, index) => {
              const optimistic = optimisticAccepted.has(lead.id);
              const actionable = isActionable(lead, optimistic);
              const displayStatus = optimistic ? "ACCEPTED" : lead.buyerStatus;
              const isSelected = selected.has(lead.id);
              const isFocused = index === focusedIndex;
              const isNewlyMerged = index < mergedRows.length;

              return (
                <li
                  key={lead.id}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  tabIndex={isFocused ? 0 : -1}
                  onFocus={() => setFocusedIndex(index)}
                  className={cn(
                    "relative flex flex-col gap-2 px-4 py-[var(--density-row-py)] transition-colors hover:bg-hover focus:outline-none lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4 lg:gap-y-2",
                    isFocused && "bg-hover ring-1 ring-accent ring-inset",
                    isSelected && "bg-accent-soft/40",
                    isNewlyMerged && "row-enter",
                  )}
                >
              {/* Countdown, pinned top-right on the mobile card only */}
              {lead.buyerStatus === "PENDING" && !optimistic && (
                <div className="absolute top-3 right-3 lg:hidden">
                  <CountdownBadge expiresAt={lead.disputeWindowExpiresAt} />
                </div>
              )}

              <div className="flex min-w-0 flex-1 items-start gap-2">
                {actionable && (
                  <label className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center lg:min-h-0 lg:min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => toggleSelect(lead, index, e.shiftKey)}
                      onChange={() => {}}
                      aria-label={`Select ${lead.contactName}`}
                      className="size-4 accent-[var(--accent)]"
                    />
                  </label>
                )}

                {/* Consumer */}
                <div className="min-w-[13rem] flex-1 pr-16 lg:pr-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ui font-medium text-ink">{lead.contactName}</span>
                    <Badge tone="neutral" className="font-mono">
                      {lead.contactState} {lead.contactZip}
                    </Badge>
                    {lead.hasTrustedForm && (
                      <Badge tone="violet" title="TrustedForm certificate on file">
                        TF
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-meta text-muted">
                    <span className="font-mono tabular">{phoneDisplay(lead.contactPhone)}</span>
                    <span className="text-faint">·</span>
                    <span className="truncate">{lead.contactEmail}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-micro text-faint">
                    <span className="text-accent">{lead.sourceId}</span>
                    <span>·</span>
                    <span>{utcTimestamp(lead.deliveredAt)}</span>
                  </div>
                </div>
              </div>

              {/* Campaign + price */}
              <div className="min-w-[9rem]">
                <div className="truncate text-body text-ink">{lead.campaignName ?? "—"}</div>
                <div className="text-meta text-muted">{verticalLabel(lead.vertical)}</div>
                <div className="mt-0.5 font-mono text-body text-ink tabular">
                  {money(lead.buyerCostAmount)}
                </div>
              </div>

              {/* Status — countdown repeats here for lg+, where it isn't pinned.
                  Outcome tracking only applies once the lead is no longer
                  pending (the buyer has decided to keep it), and it takes
                  the countdown's place rather than adding a third hue
                  family alongside status + urgency. */}
              <div className="flex min-w-[9rem] flex-row flex-wrap items-center gap-1 lg:flex-col lg:items-start">
                <BuyerStatusChip status={displayStatus} />
                {lead.disputeReasonCode && <DisputeReasonChip code={lead.disputeReasonCode} />}
                {lead.buyerStatus === "PENDING" && !optimistic ? (
                  <span className="hidden lg:inline-flex">
                    <CountdownBadge expiresAt={lead.disputeWindowExpiresAt} />
                  </span>
                ) : (
                  <OutcomeControl leadId={lead.id} outcome={lead.outcome} />
                )}
              </div>

              {/* Decisions */}
              <div className="flex w-full shrink-0 items-center gap-1.5 lg:w-auto">
                <Tooltip content="Inspect">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Inspect"
                    className="min-h-[44px] min-w-[44px]"
                    onClick={() => {
                      setFocusedIndex(index);
                      setInspecting(lead.id);
                    }}
                  >
                    <Eye className="size-4" />
                  </Button>
                </Tooltip>
                {actionable && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-[44px] flex-1 lg:flex-none"
                      onClick={() => {
                        setFocusedIndex(index);
                        acceptWithUndo(lead);
                      }}
                    >
                      <CircleCheck className="size-3.5" />
                      Accept
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="min-h-[44px] flex-1 lg:flex-none"
                      onClick={() => {
                        setFocusedIndex(index);
                        setDisputing(lead);
                      }}
                    >
                      <Gavel className="size-3.5" />
                      Dispute
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
          </ul>
        </>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-line-strong bg-overlay px-4 py-3 shadow-[var(--shadow-lg)]">
          <span className="text-body font-medium text-ink">
            {selected.size} selected · {money(selectedTotal)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Tooltip content="A return is a per-lead assertion with a per-lead reason — batching it would defeat the point of the reason codes.">
              <span className="inline-block">
                <Button variant="danger" size="sm" disabled className="pointer-events-none">
                  <Gavel className="size-3.5" />
                  Dispute
                </Button>
              </span>
            </Tooltip>
            <Button
              variant="secondary"
              size="sm"
              disabled={bulkPending}
              onClick={bulkAccept}
              className="min-h-[44px]"
            >
              <CircleCheck className="size-3.5" />
              {bulkPending ? "Accepting…" : `Accept ${selected.size}`}
            </Button>
          </div>
        </div>
      )}

      {disputing && (
        <DisputeModal
          open={Boolean(disputing)}
          onOpenChange={(open) => !open && setDisputing(null)}
          lead={disputing}
        />
      )}

      <LeadDrawer
        leadId={inspecting}
        onClose={() => setInspecting(null)}
        actions={(lead) => (
          <div className="mr-auto flex items-center gap-2">
            <span className="text-meta text-muted">Outcome</span>
            <OutcomeControl leadId={lead.id} outcome={lead.outcome} />
          </div>
        )}
      />

      <KeyboardShortcutSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
