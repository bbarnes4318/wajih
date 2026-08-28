"use client";

import { useState, useTransition } from "react";
import type { VettingCheckKey, VettingCheckStatus } from "@prisma/client";
import { Ban, Check, ChevronRight, CircleAlert, CircleDot, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { utcTimestamp } from "@/lib/format";
import { VETTING_CHECK, VETTING_CHECK_STATUS } from "@/lib/domain/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { setVettingCheckAction } from "@/app/(app)/admin/publishers/actions";

export interface CheckRow {
  key: VettingCheckKey;
  status: VettingCheckStatus;
  notes: string | null;
  evidenceUrl: string | null;
  checkedAt: string | null;
}

const DECISIONS: Array<{
  status: VettingCheckStatus;
  label: string;
  variant: "success" | "danger" | "secondary" | "outline";
}> = [
  { status: "PASSED", label: "Pass", variant: "success" },
  { status: "FAILED", label: "Fail", variant: "danger" },
  { status: "IN_REVIEW", label: "In review", variant: "secondary" },
  { status: "WAIVED", label: "Waive", variant: "outline" },
];

const STATUS_ICON: Record<VettingCheckStatus, typeof Check> = {
  PASSED: Check,
  FAILED: Ban,
  IN_REVIEW: CircleAlert,
  WAIVED: ChevronRight,
  NOT_STARTED: CircleDot,
};

/**
 * The 9-point fraud-screening checklist.
 *
 * Each point is decided independently and records who decided it and when.
 * "Waive" exists as a distinct state from "pass" so an exception is visible in
 * the record rather than laundered into a green tick.
 */
export function VettingChecklist({
  orgId,
  checks,
  readOnly = false,
}: {
  orgId: string;
  checks: CheckRow[];
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState<VettingCheckKey | null>(null);

  return (
    <ol className="divide-y divide-[var(--border)]">
      {checks.map((check, index) => (
        <CheckItem
          key={check.key}
          orgId={orgId}
          index={index + 1}
          check={check}
          readOnly={readOnly}
          expanded={expanded === check.key}
          onToggle={() =>
            setExpanded((cur) => (cur === check.key ? null : check.key))
          }
        />
      ))}
    </ol>
  );
}

function CheckItem({
  orgId,
  index,
  check,
  readOnly,
  expanded,
  onToggle,
}: {
  orgId: string;
  index: number;
  check: CheckRow;
  readOnly: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(check.notes ?? "");
  const [evidenceUrl, setEvidenceUrl] = useState(check.evidenceUrl ?? "");

  const meta = VETTING_CHECK[check.key];
  const statusMeta = VETTING_CHECK_STATUS[check.status];
  const Icon = STATUS_ICON[check.status];

  function decide(status: VettingCheckStatus) {
    setError(null);
    const fd = new FormData();
    fd.set("orgId", orgId);
    fd.set("key", check.key);
    fd.set("status", status);
    fd.set("notes", notes);
    fd.set("evidenceUrl", evidenceUrl);

    startTransition(async () => {
      const result = await setVettingCheckAction(fd);
      if (!result.ok) setError(result.error ?? "SAVE_FAILED");
    });
  }

  return (
    <li className={cn(pending && "opacity-60")}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hover"
      >
        <span
          className={cn(
            "mt-px grid size-6 shrink-0 place-items-center rounded-full border",
            check.status === "PASSED" && "border-success-border bg-success-soft text-success",
            check.status === "FAILED" && "border-danger-border bg-danger-soft text-danger",
            check.status === "IN_REVIEW" && "border-warning-border bg-warning-soft text-warning",
            check.status === "WAIVED" && "border-info-border bg-info-soft text-info",
            check.status === "NOT_STARTED" && "border-line bg-chip text-faint",
          )}
        >
          <Icon className="size-3" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] text-faint">
              {String(index).padStart(2, "0")}
            </span>
            <span className="text-[14px] font-medium text-ink">{meta.label}</span>
            <Badge tone={statusMeta.tone} dot>
              {statusMeta.label}
            </Badge>
            {check.evidenceUrl && (
              <Badge tone="accent">
                <Link2 className="size-3" />
                Evidence
              </Badge>
            )}
          </span>

          <span className="mt-1 block text-[13px] leading-relaxed text-muted">
            {meta.detail}
          </span>

          {check.notes && !expanded && (
            <span className="mt-1.5 block border-l-2 border-line pl-2 text-[12px] leading-relaxed text-faint italic">
              {check.notes}
            </span>
          )}

          {check.checkedAt && (
            <span className="mt-1 block font-mono text-[11px] text-faint">
              reviewed {utcTimestamp(check.checkedAt)}
            </span>
          )}
        </span>

        <ChevronRight
          className={cn(
            "mt-1 size-4 shrink-0 text-faint transition-transform",
            expanded && "rotate-90",
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-line bg-sunken px-4 py-3">
          {readOnly ? (
            <p className="text-[13px] text-muted">
              {check.notes || "No reviewer notes recorded for this point."}
            </p>
          ) : (
            <>
              <Field label="Reviewer notes" hint="Stored on the audit record for this point.">
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What was checked, against what evidence, and what was found."
                />
              </Field>

              <Field
                label="Evidence URL"
                hint="Landing page snapshot, certificate sample, signed agreement, registry record."
              >
                <Input
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  placeholder="s3://leados-evidence/… or https://…"
                  className="font-mono text-[12px]"
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2">
                {DECISIONS.map((d) => (
                  <Button
                    key={d.status}
                    variant={d.variant}
                    size="sm"
                    disabled={pending}
                    onClick={() => decide(d.status)}
                  >
                    {d.label}
                  </Button>
                ))}
                {pending && (
                  <span className="text-[12px] text-muted">Saving…</span>
                )}
              </div>

              {error && (
                <p className="text-[12px] text-danger">
                  {error === "NO_VETTING_PROFILE"
                    ? "This publisher has no vetting profile yet."
                    : "Could not save that decision."}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
