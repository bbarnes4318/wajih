"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { LeadSegment } from "@/lib/db/leads";

const OPTIONS: Array<{ value: LeadSegment; label: string }> = [
  { value: "closing2h", label: "Closing < 2h" },
  { value: "closingToday", label: "Closing today" },
  { value: "allPending", label: "All pending" },
  { value: "history", label: "History" },
];

/** URL-driven, same pattern as `LeadFilterBar` — a segment is just a query param. */
export function SegmentTabs({
  value,
  counts,
}: {
  value: LeadSegment;
  counts: Record<LeadSegment, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(next: LeadSegment) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("segment", next);
    params.delete("page");
    params.delete("focus");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <SegmentedControl
      options={OPTIONS.map((o) => ({ ...o, count: counts[o.value] }))}
      value={value}
      onChange={onChange}
    />
  );
}
