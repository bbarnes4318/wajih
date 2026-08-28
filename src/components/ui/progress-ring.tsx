import { cn } from "@/lib/utils";

/**
 * Return-rate ring. The track is always drawn so an at-a-glance scan reads
 * "how full" rather than just "how long the arc is".
 */
export function ProgressRing({
  value,
  max = 1,
  size = 40,
  strokeWidth = 4,
  tone = "success",
  label,
  className,
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  tone?: "success" | "warning" | "danger" | "accent" | "neutral";
  label?: string;
  className?: string;
}) {
  const pct = max === 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct;

  const stroke = {
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
    accent: "var(--accent)",
    neutral: "var(--text-faint)",
  }[tone];

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(pct * 100)}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      {label && (
        <span className="absolute font-mono text-micro font-medium text-ink tabular">
          {label}
        </span>
      )}
    </div>
  );
}
