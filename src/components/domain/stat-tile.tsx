import type { ReactNode } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * KPI tile.
 *
 * The number is the point, so it gets real size — a wall of 20px figures in
 * identical boxes reads as a spreadsheet, not a dashboard. `delta` is a
 * fraction (0.12 = +12%); `goodDirection` says which way is healthy, because a
 * rising return rate is bad while rising revenue is good.
 */
export function StatTile({
  label,
  value,
  sub,
  delta,
  goodDirection = "up",
  icon,
  help,
  accent,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: number | null;
  goodDirection?: "up" | "down";
  icon?: ReactNode;
  help?: string;
  accent?: "success" | "warning" | "danger" | "accent";
  className?: string;
}) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const rising = hasDelta && delta > 0.0001;
  const falling = hasDelta && delta < -0.0001;
  const good = rising ? goodDirection === "up" : falling ? goodDirection === "down" : null;

  const body = (
    <div
      className={cn(
        "panel-glow relative flex flex-col justify-between gap-4 overflow-hidden p-4",
        accent === "danger" && "border-danger-border",
        accent === "warning" && "border-warning-border",
        accent === "success" && "border-success-border",
        accent === "accent" && "border-accent-border",
        className,
      )}
    >
      {/* A hairline of the accent colour along the top edge, so an alarming
          tile is legible at a glance without shouting. */}
      {accent && (
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 top-0 h-0.5",
            accent === "danger" && "bg-danger",
            accent === "warning" && "bg-warning",
            accent === "success" && "bg-success",
            accent === "accent" && "bg-accent",
          )}
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          {label}
        </span>
        {icon && (
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md [&_svg]:size-3.5",
              accent === "danger"
                ? "bg-danger-soft text-danger"
                : accent === "warning"
                  ? "bg-warning-soft text-warning"
                  : accent === "success"
                    ? "bg-success-soft text-success"
                    : "bg-chip text-faint",
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <div>
        <div
          className={cn(
            "font-mono text-[28px] leading-none font-semibold tracking-[-0.02em] tabular",
            accent === "danger" ? "text-danger" : "text-ink",
          )}
        >
          {value}
        </div>

        {(hasDelta || sub) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {hasDelta && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-mono text-[12px] tabular",
                  good === null && "bg-chip text-faint",
                  good === true && "bg-success-soft text-success",
                  good === false && "bg-danger-soft text-danger",
                )}
              >
                {rising ? (
                  <TrendingUp className="size-3" />
                ) : falling ? (
                  <TrendingDown className="size-3" />
                ) : (
                  <Minus className="size-3" />
                )}
                {`${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`}
              </span>
            )}
            {sub && <span className="truncate text-[12px] text-muted">{sub}</span>}
          </div>
        )}
      </div>
    </div>
  );

  return help ? <Tooltip content={help}>{body}</Tooltip> : body;
}

/**
 * Secondary metric, for figures that support the hero KPIs rather than
 * competing with them. Deliberately much lighter than `StatTile`: a second row
 * of identical tiles flattens the page into an undifferentiated wall of
 * numbers, and the reader loses the thread of what matters most.
 */
export function MiniStat({
  label,
  value,
  sub,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-3", className)}>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            tone === "success" && "bg-success",
            tone === "warning" && "bg-warning",
            tone === "danger" && "bg-danger",
            tone === "neutral" && "bg-faint",
          )}
        />
        <span className="truncate text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          {label}
        </span>
      </div>
      <div
        className={cn(
          "mt-1.5 font-mono text-[19px] leading-none font-semibold tabular",
          tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 truncate text-[12px] leading-snug text-faint">{sub}</div>
      )}
    </div>
  );
}
