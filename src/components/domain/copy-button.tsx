"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard permission denied; the value is visible to select manually.
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={label ? `Copy ${label}` : "Copy"}
      className={cn(
        "inline-grid size-5 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-hover hover:text-ink",
        className,
      )}
    >
      {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
    </button>
  );
}

/** Monospace identifier with an inline copy affordance. */
export function MonoId({
  value,
  display,
  className,
}: {
  value: string;
  display?: string;
  className?: string;
}) {
  return (
    <span className={cn("group inline-flex items-center gap-1", className)}>
      <span className="font-mono text-[12px] text-muted" title={value}>
        {display ?? value}
      </span>
      <CopyButton value={value} label="identifier" className="opacity-0 group-hover:opacity-100" />
    </span>
  );
}
