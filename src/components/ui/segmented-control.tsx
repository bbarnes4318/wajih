"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 overflow-x-auto rounded-lg border border-line bg-inset p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-md px-3 text-meta font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-surface text-ink shadow-[var(--shadow-sm)]"
                : "text-muted hover:text-ink",
            )}
          >
            {opt.label}
            {typeof opt.count === "number" && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-micro tabular",
                  active ? "bg-accent-soft text-accent" : "bg-chip text-faint",
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
