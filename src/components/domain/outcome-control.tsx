"use client";

import { useState, useTransition } from "react";
import type { LeadOutcome } from "@prisma/client";
import { LEAD_OUTCOME, TONE_CLASS } from "@/lib/domain/labels";
import { setLeadOutcomeAction } from "@/app/(app)/buyer/actions";
import { cn } from "@/lib/utils";

const OUTCOME_ORDER: LeadOutcome[] = [
  "NOT_WORKED",
  "NO_CONTACT",
  "CONTACTED",
  "APPOINTMENT_SET",
  "QUOTED",
  "SOLD",
  "CLOSED_LOST",
];

/**
 * Buyer's own sales-pipeline tag. One click, no modal — a native select
 * whose own background/text colour reflects the current outcome's tone, so
 * it reads as a status chip that happens to be editable rather than a form
 * field bolted onto the row.
 */
export function OutcomeControl({
  leadId,
  outcome,
  className,
}: {
  leadId: string;
  outcome: LeadOutcome | null;
  className?: string;
}) {
  const [value, setValue] = useState<LeadOutcome>(outcome ?? "NOT_WORKED");
  const [pending, startTransition] = useTransition();
  const meta = LEAD_OUTCOME[value];

  function handleChange(next: LeadOutcome) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await setLeadOutcomeAction(leadId, next);
      if (!result.ok) setValue(previous);
    });
  }

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => handleChange(e.target.value as LeadOutcome)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Outcome"
      className={cn(
        "h-7 min-h-[28px] cursor-pointer appearance-none rounded border px-1.5 pr-5 text-micro font-medium",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-60",
        "bg-[length:10px] bg-[right_0.375rem_center] bg-no-repeat",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')]",
        TONE_CLASS[meta.tone],
        className,
      )}
    >
      {OUTCOME_ORDER.map((o) => (
        <option key={o} value={o}>
          {LEAD_OUTCOME[o].label}
        </option>
      ))}
    </select>
  );
}
