import type { PipelineStage, RejectionReasonCode, RejectionStep } from "@prisma/client";
import { cn } from "@/lib/utils";
import { count, money, shortDate } from "@/lib/format";
import {
  PIPELINE_STAGE,
  REJECTION_REASON,
  REJECTION_STEP,
  TONE_DOT,
} from "@/lib/domain/labels";

/**
 * Charts are hand-rolled SVG rather than a charting library.
 *
 * These are small, fixed-purpose figures on a dense dashboard; a general
 * charting runtime would add more bundle weight than the four shapes below
 * are worth, and none of them need interaction beyond a native tooltip.
 */

// ---------------------------------------------------------------------------
//  Daily volume — delivered / rejected / other, stacked
// ---------------------------------------------------------------------------

export interface VolumePoint {
  day: string;
  submitted: number;
  delivered: number;
  rejected: number;
  revenue: number;
}

export function VolumeChart({
  data,
  height = 132,
  className,
}: {
  data: VolumePoint[];
  height?: number;
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <p className={cn("py-10 text-center text-xs text-faint", className)}>
        No volume in this window.
      </p>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.submitted));

  return (
    <div className={className}>
      <div
        className="flex items-end gap-[2px]"
        style={{ height }}
        role="img"
        aria-label={`Daily lead volume over ${data.length} days`}
      >
        {data.map((d) => {
          const other = Math.max(0, d.submitted - d.delivered - d.rejected);
          const scale = (n: number) => (n / max) * height;
          return (
            <div
              key={d.day}
              className="group relative flex flex-1 flex-col justify-end"
              style={{ minWidth: 4 }}
              title={`${shortDate(d.day)}\n${d.submitted} submitted · ${d.delivered} delivered · ${d.rejected} rejected\n${money(d.revenue)} revenue`}
            >
              <div
                className="w-full rounded-t-[2px] bg-danger/70 transition-opacity group-hover:opacity-100"
                style={{ height: Math.max(d.rejected > 0 ? 1 : 0, scale(d.rejected)) }}
              />
              <div
                className="w-full bg-warning/55"
                style={{ height: Math.max(other > 0 ? 1 : 0, scale(other)) }}
              />
              <div
                className="w-full rounded-b-[2px] bg-success"
                style={{ height: Math.max(d.delivered > 0 ? 1 : 0, scale(d.delivered)) }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {[
            ["Delivered", "bg-success"],
            ["Filtered", "bg-warning/55"],
            ["Rejected", "bg-danger/70"],
          ].map(([label, cls]) => (
            <span key={label} className="flex items-center gap-1 text-[11px] text-faint">
              <span className={cn("size-2 rounded-[2px]", cls)} />
              {label}
            </span>
          ))}
        </div>
        <span className="font-mono text-[11px] text-faint tabular">
          {shortDate(data[0].day)} → {shortDate(data[data.length - 1].day)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Pipeline funnel
// ---------------------------------------------------------------------------

/**
 * Shows how volume attritions across the waterfall. Ordered by the sequence a
 * lead actually walks, not by count, so the drop-off is legible.
 */
export function PipelineFunnel({
  counts,
  className,
}: {
  counts: Map<PipelineStage, number>;
  className?: string;
}) {
  const ordered: PipelineStage[] = [
    "REJECTED",
    "HOLD_QUEUE",
    "ROUTED",
    "DELIVERED",
    "ACCEPTED",
    "DISPUTED",
    "SETTLED",
  ];

  const rows = ordered
    .map((stage) => ({ stage, value: counts.get(stage) ?? 0 }))
    .filter((r) => r.value > 0);

  const max = Math.max(1, ...rows.map((r) => r.value));

  if (rows.length === 0) {
    return <p className="py-8 text-center text-xs text-faint">No leads in this window.</p>;
  }

  return (
    <ul className={cn("space-y-2", className)}>
      {rows.map(({ stage, value }) => {
        const meta = PIPELINE_STAGE[stage];
        return (
          <li key={stage}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                <span className={cn("size-1.5 rounded-full", TONE_DOT[meta.tone])} />
                {meta.label}
              </span>
              <span className="font-mono text-[12px] text-ink tabular">
                {count(value)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className={cn("h-full rounded-full", TONE_DOT[meta.tone])}
                style={{ width: `${Math.max(1.5, (value / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
//  Rejection reasons
// ---------------------------------------------------------------------------

export function RejectionBars({
  rows,
  className,
}: {
  rows: Array<{ code: RejectionReasonCode; step: RejectionStep | null; count: number }>;
  className?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-faint">
        No rejections in this window.
      </p>
    );
  }

  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <ul className={cn("space-y-2", className)}>
      {rows.map((r) => {
        const meta = REJECTION_REASON[r.code];
        return (
          <li key={`${r.code}-${r.step}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span
                className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted"
                title={meta.help}
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[meta.tone])} />
                <span className="truncate">{meta.label}</span>
                {r.step && (
                  <span className="shrink-0 font-mono text-[11px] text-faint">
                    {REJECTION_STEP[r.step].label.split(" ")[0]}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[12px] text-ink tabular">
                {count(r.count)}
                <span className="ml-1 text-faint">
                  {((r.count / total) * 100).toFixed(0)}%
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className={cn("h-full rounded-full", TONE_DOT[meta.tone])}
                style={{ width: `${Math.max(1.5, (r.count / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
//  Pacing bar — cap / budget fill for a campaign
// ---------------------------------------------------------------------------

export function PacingBar({
  fill,
  label,
  sublabel,
  className,
}: {
  /** 0..1+ — values above 1 render as full and switch to the danger tone. */
  fill: number | null;
  label: string;
  sublabel?: string;
  className?: string;
}) {
  if (fill === null) {
    return (
      <div className={cn("text-[12px] text-faint", className)}>
        {label}
        <span className="ml-1">uncapped</span>
      </div>
    );
  }

  const pct = Math.min(1, Math.max(0, fill));
  const tone =
    fill >= 0.98 ? "bg-danger" : fill >= 0.8 ? "bg-warning" : "bg-accent";

  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-muted">{label}</span>
        <span className="font-mono text-[12px] text-ink tabular">
          {(fill * 100).toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className={cn("h-full rounded-full transition-[width]", tone)}
          style={{ width: `${Math.max(1.5, pct * 100)}%` }}
        />
      </div>
      {sublabel && (
        <div className="mt-1 font-mono text-[11px] text-faint tabular">{sublabel}</div>
      )}
    </div>
  );
}
