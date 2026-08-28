import type { AuditStepStatus, RejectionReasonCode } from "@prisma/client";
import { Ban, Check, CircleAlert, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { ms, utcTimestamp } from "@/lib/format";
import { JsonBlock } from "./json-block";
import { ReasonChip } from "./status-chip";

export interface AuditRow {
  id: string;
  stepNumber: number;
  stepName: string;
  outputStatus: AuditStepStatus;
  reasonCode: RejectionReasonCode | null;
  executionMs: number;
  errorLog: string | null;
  createdAt: string;
  inputData: unknown;
  outputData: unknown;
}

const STATUS_STYLE: Record<
  AuditStepStatus,
  { ring: string; fill: string; icon: typeof Check; label: string }
> = {
  PASS: {
    ring: "border-success-border",
    fill: "bg-success-soft text-success",
    icon: Check,
    label: "Pass",
  },
  FAIL: {
    ring: "border-danger-border",
    fill: "bg-danger-soft text-danger",
    icon: Ban,
    label: "Fail",
  },
  HOLD: {
    ring: "border-warning-border",
    fill: "bg-warning-soft text-warning",
    icon: CircleAlert,
    label: "Hold",
  },
  SKIP: {
    ring: "border-line",
    fill: "bg-chip text-faint",
    icon: CircleDot,
    label: "Skip",
  },
};

/**
 * Chronological execution log for one lead.
 *
 * Shows every step the waterfall ran, in order, with its millisecond timing
 * and the verbatim payloads that justified the decision — the DNC provider's
 * response, the campaign-by-campaign qualifier misses, the routing candidate
 * table. This is the view a TCPA audit actually asks for.
 */
export function AuditTrail({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-xs text-faint">
        No audit rows recorded for this lead.
      </p>
    );
  }

  const totalMs = rows.reduce((sum, r) => sum + r.executionMs, 0);
  const slowest = Math.max(1, ...rows.map((r) => r.executionMs));

  return (
    <div>
      <div className="flex items-center justify-between border-b border-line bg-sunken px-5 py-2">
        <span className="text-micro font-semibold tracking-[0.08em] text-faint uppercase">
          Execution trail · {rows.length} steps
        </span>
        <span className="font-mono text-meta text-muted tabular">
          {ms(totalMs)} total
        </span>
      </div>

      <ol className="relative px-5 py-4">
        {/* Spine */}
        <div
          className="absolute top-4 bottom-4 left-[2.0rem] w-px bg-line"
          aria-hidden
        />

        {rows.map((row, i) => {
          const style = STATUS_STYLE[row.outputStatus];
          const Icon = style.icon;
          const share = row.executionMs / slowest;

          return (
            <li key={row.id} className={cn("relative pl-10", i > 0 && "mt-4")}>
              {/* Marker */}
              <span
                className={cn(
                  "absolute left-0 grid size-6 place-items-center rounded-full border",
                  style.ring,
                  style.fill,
                )}
                title={style.label}
              >
                <Icon className="size-3" />
              </span>

              <div className="panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-meta text-faint">
                      {String(row.stepNumber).padStart(2, "0")}
                    </span>
                    <span className="truncate text-ui font-medium text-ink">
                      {row.stepName}
                    </span>
                    {row.reasonCode && <ReasonChip code={row.reasonCode} />}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {/* Relative-duration bar: which step actually cost time. */}
                    <span className="hidden h-1 w-16 overflow-hidden rounded-full bg-line sm:block">
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          share > 0.6 ? "bg-warning" : "bg-accent",
                        )}
                        style={{ width: `${Math.max(4, share * 100)}%` }}
                      />
                    </span>
                    <span className="font-mono text-meta text-muted tabular">
                      {ms(row.executionMs)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 px-3 py-2.5 lg:grid-cols-2">
                  <div>
                    <div className="mb-1 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
                      Input
                    </div>
                    <JsonBlock value={row.inputData} maxHeight="14rem" />
                  </div>
                  <div>
                    <div className="mb-1 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
                      Output
                    </div>
                    <JsonBlock value={row.outputData} maxHeight="14rem" />
                  </div>
                </div>

                {row.errorLog && (
                  <div className="border-t border-danger-border bg-danger-soft px-3 py-2">
                    <div className="mb-0.5 text-micro font-semibold tracking-[0.07em] text-danger uppercase">
                      Error log
                    </div>
                    <p className="font-mono text-meta leading-relaxed break-words text-danger">
                      {row.errorLog}
                    </p>
                  </div>
                )}

                <div className="border-t border-line bg-sunken px-3 py-1.5">
                  <span className="font-mono text-micro text-faint">
                    {utcTimestamp(row.createdAt)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
