"use client";

import { useState, useTransition } from "react";
import type { DisputeReasonCode } from "@prisma/client";
import { CircleAlert, Gavel, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { countdownParts, money, utcTimestamp } from "@/lib/format";
import { DISPUTE_REASON } from "@/lib/domain/labels";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import { fileDisputeAction } from "@/app/(app)/buyer/actions";
import { disputeErrorMessage } from "@/lib/domain/dispute-messages";

/**
 * Return dispute filing.
 *
 * The reason is a required enum selection — there is no free-text-only path.
 * The notes field is supplementary context for the adjudicator, never the
 * machine-readable reason (Rule 1).
 */

const REASON_ORDER: DisputeReasonCode[] = [
  "INVALID_DISCONNECT",
  "TCPA_MISMATCH",
  "OUT_OF_GEOGRAPHY",
  "DUPLICATE_WITHIN_WINDOW",
  "WRONG_PERSON",
  "BOGUS_CONTACT_INFO",
];

export function DisputeModal({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    id: string;
    contactName: string;
    contactPhone: string | null;
    campaignName: string | null;
    buyerCostAmount: string | null;
    deliveredAt: string | null;
    disputeWindowExpiresAt: string | null;
  };
}) {
  const [reasonCode, setReasonCode] = useState<DisputeReasonCode | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const window = countdownParts(lead.disputeWindowExpiresAt);

  function submit() {
    if (!reasonCode) return;
    setError(null);

    const fd = new FormData();
    fd.set("leadId", lead.id);
    fd.set("reasonCode", reasonCode);
    fd.set("notes", notes);

    startTransition(async () => {
      const result = await fileDisputeAction(fd);
      if (result.ok) {
        onOpenChange(false);
        setReasonCode(null);
        setNotes("");
      } else {
        setError(disputeErrorMessage(result.error));
      }
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="File a return dispute"
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span>{lead.contactName}</span>
          <span className="text-faint">·</span>
          <span className="font-mono">{lead.contactPhone}</span>
          {lead.buyerCostAmount && (
            <>
              <span className="text-faint">·</span>
              <span className="font-mono">{money(lead.buyerCostAmount)}</span>
            </>
          )}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" size="md" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            disabled={!reasonCode || pending || window.expired}
            onClick={submit}
          >
            <Gavel className="size-3.5" />
            {pending ? "Filing…" : "File dispute"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Window state */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2",
            window.expired
              ? "border-danger-border bg-danger-soft"
              : window.hours < 6
                ? "border-warning-border bg-warning-soft"
                : "border-line bg-sunken",
          )}
        >
          <Timer
            className={cn(
              "size-4 shrink-0",
              window.expired
                ? "text-danger"
                : window.hours < 6
                  ? "text-warning"
                  : "text-muted",
            )}
          />
          <div className="min-w-0 text-body">
            {window.expired ? (
              <span className="text-danger">
                The return window closed. This lead has settled and can no longer be
                disputed.
              </span>
            ) : (
              <>
                <span className="font-mono font-medium text-ink tabular">
                  {String(window.hours).padStart(2, "0")}h{" "}
                  {String(window.minutes).padStart(2, "0")}m
                </span>
                <span className="text-muted"> remaining · closes </span>
                <span className="font-mono text-muted">
                  {utcTimestamp(lead.disputeWindowExpiresAt)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Enum reasons */}
        <div>
          <span className="mb-1.5 block text-meta font-medium tracking-wide text-muted uppercase">
            Reason code <span className="text-danger">*</span>
          </span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {REASON_ORDER.map((code) => {
              const meta = DISPUTE_REASON[code];
              const selected = reasonCode === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setReasonCode(code)}
                  disabled={window.expired}
                  className={cn(
                    "rounded-md border px-2.5 py-2 text-left transition-colors disabled:opacity-50",
                    selected
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-sunken hover:border-line-strong",
                  )}
                >
                  <span
                    className={cn(
                      "block text-body font-medium",
                      selected ? "text-accent" : "text-ink",
                    )}
                  >
                    {meta.label}
                  </span>
                  <span className="mt-0.5 block text-meta leading-snug text-muted">
                    {meta.help}
                  </span>
                  <code className="mt-1 block font-mono text-micro text-faint">
                    {code}
                  </code>
                </button>
              );
            })}
          </div>
        </div>

        <Field
          label="Supporting notes"
          hint="Optional context for the adjudicator. The reason code above is what the system records and reports on."
        >
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={window.expired}
            placeholder="Call disposition, timestamps attempted, what the consumer said."
          />
        </Field>

        {error && (
          <p className="flex items-start gap-1.5 rounded-md border border-danger-border bg-danger-soft px-2.5 py-2 text-body text-danger">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
