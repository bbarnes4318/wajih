import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_CLASS, TONE_DOT, type Tone } from "@/lib/domain/labels";

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  /** Leading status dot. */
  dot?: boolean;
  title?: string;
  /** Compact variant for inline use inside dense table cells. */
  size?: "sm" | "md";
}

/**
 * The canonical status chip. Every enum in the system renders through this,
 * so the colour language stays consistent across all three portals.
 */
export function Badge({
  tone = "neutral",
  children,
  className,
  dot = false,
  title,
  size = "sm",
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-meta" : "px-2 py-1 text-xs",
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
