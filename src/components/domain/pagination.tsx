"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function goto(next: number) {
    const q = new URLSearchParams(params.toString());
    if (next <= 1) q.delete("page");
    else q.set("page", String(next));
    router.push(`?${q.toString()}`, { scroll: false });
  }

  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2">
      <span className="font-mono text-[12px] text-muted tabular">
        {first}–{last} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => goto(page - 1)}
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </Button>
        <span className="px-2 font-mono text-[12px] text-muted tabular">
          {page} / {pageCount}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => goto(page + 1)}
        >
          Next
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
