"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Funnel, Search, X } from "lucide-react";
import type { PipelineStage, Vertical } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PIPELINE_STAGE, PIPELINE_STAGE_ORDER } from "@/lib/domain/labels";
import { VERTICAL_SPECS } from "@/lib/domain/verticals";

export interface FilterOptions {
  publishers: Array<{ id: string; name: string }>;
  buyers: Array<{ id: string; name: string }>;
  sources: Array<{ sourceId: string; label: string }>;
}

/**
 * URL-driven filters. Every change rewrites the query string, so a filtered
 * view is a shareable link and the back button behaves the way an operator
 * expects when drilling in and out of a slice.
 */
export function LeadFilterBar({
  options,
  stageCounts,
  showPublisher = true,
  showBuyer = true,
  total,
}: {
  options: FilterOptions;
  stageCounts: Record<string, number>;
  showPublisher?: boolean;
  showBuyer?: boolean;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Any filter change invalidates the current page offset.
    next.delete("page");
    startTransition(() => router.push(`?${next.toString()}`, { scroll: false }));
  }

  const activeStage = params.get("stage");
  const activeCount = [
    "source", "publisher", "buyer", "vertical", "stage", "q", "from", "to", "disputable",
  ].filter((k) => params.get(k)).length;

  return (
    <div className="border-b border-line bg-surface">
      {/* Stage rail — the primary triage axis, so it gets its own row */}
      <div className="grid-scroll flex items-center gap-1 px-4 py-2">
        <button
          type="button"
          onClick={() => setParam("stage", null)}
          className={cn(
            "shrink-0 rounded-md border px-2 py-1 text-[12px] font-medium whitespace-nowrap transition-colors",
            !activeStage
              ? "border-accent-border bg-accent-soft text-accent"
              : "border-line text-muted hover:bg-hover hover:text-ink",
          )}
        >
          All <span className="ml-1 font-mono tabular">{total}</span>
        </button>

        {PIPELINE_STAGE_ORDER.map((stage: PipelineStage) => {
          const count = stageCounts[stage] ?? 0;
          if (count === 0 && activeStage !== stage) return null;
          const meta = PIPELINE_STAGE[stage];
          const active = activeStage === stage;
          return (
            <button
              key={stage}
              type="button"
              onClick={() => setParam("stage", active ? null : stage)}
              title={meta.help}
              className={cn(
                "shrink-0 rounded-md border px-2 py-1 text-[12px] font-medium whitespace-nowrap transition-colors",
                active
                  ? "border-accent-border bg-accent-soft text-accent"
                  : "border-line text-muted hover:bg-hover hover:text-ink",
              )}
            >
              {meta.label}
              <span className="ml-1 font-mono tabular">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Field filters */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            defaultValue={params.get("q") ?? ""}
            placeholder="Search lead ID, phone, email, name or Source ID…"
            className="pl-7 font-mono text-[12px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setParam("q", (e.target as HTMLInputElement).value.trim() || null);
              }
            }}
          />
        </div>

        <NativeSelect
          value={params.get("vertical") ?? ""}
          onChange={(e) => setParam("vertical", e.target.value || null)}
          className="w-auto min-w-[9rem]"
          aria-label="Vertical"
        >
          <option value="">All verticals</option>
          {(Object.keys(VERTICAL_SPECS) as Vertical[]).map((v) => (
            <option key={v} value={v}>
              {VERTICAL_SPECS[v].label}
            </option>
          ))}
        </NativeSelect>

        {showPublisher && options.publishers.length > 0 && (
          <NativeSelect
            value={params.get("publisher") ?? ""}
            onChange={(e) => setParam("publisher", e.target.value || null)}
            className="w-auto min-w-[10rem]"
            aria-label="Publisher"
          >
            <option value="">All publishers</option>
            {options.publishers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        )}

        {showBuyer && options.buyers.length > 0 && (
          <NativeSelect
            value={params.get("buyer") ?? ""}
            onChange={(e) => setParam("buyer", e.target.value || null)}
            className="w-auto min-w-[10rem]"
            aria-label="Buyer"
          >
            <option value="">All buyers</option>
            {options.buyers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        )}

        <NativeSelect
          value={params.get("source") ?? ""}
          onChange={(e) => setParam("source", e.target.value || null)}
          className="w-auto min-w-[11rem] font-mono text-[12px]"
          aria-label="Source ID"
        >
          <option value="">All sources</option>
          {options.sources.map((s) => (
            <option key={s.sourceId} value={s.sourceId}>
              {s.sourceId}
            </option>
          ))}
        </NativeSelect>

        <Input
          type="date"
          value={params.get("from") ?? ""}
          onChange={(e) => setParam("from", e.target.value || null)}
          className="w-auto font-mono text-[12px]"
          aria-label="From date"
        />
        <Input
          type="date"
          value={params.get("to") ?? ""}
          onChange={(e) => setParam("to", e.target.value || null)}
          className="w-auto font-mono text-[12px]"
          aria-label="To date"
        />

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              startTransition(() => router.push(window.location.pathname, { scroll: false }))
            }
          >
            <X className="size-3.5" />
            Clear
            <Badge tone="accent">{activeCount}</Badge>
          </Button>
        )}

        <span
          className={cn(
            "ml-auto flex items-center gap-1.5 text-[12px] whitespace-nowrap text-faint transition-opacity",
            pending && "opacity-100",
          )}
        >
          <Funnel className="size-3" />
          <span className="font-mono tabular">{total}</span> matching
          {pending && <span className="live-dot text-accent">·</span>}
        </span>
      </div>
    </div>
  );
}
