"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSavedViewAction, deleteSavedViewAction } from "./saved-view-actions";

export interface SavedViewData {
  id: string;
  name: string;
  queryString: string;
  pinned: boolean;
  count: number;
}

/**
 * Filters are already 100% URL-driven (`LeadFilterBar`), so a saved view is
 * just a named snapshot of the query string — no separate filter model.
 */
export function SavedViewChips({ views }: { views: SavedViewData[] }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pinned = views.filter((v) => v.pinned);

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const qs = searchParams.toString();
    startTransition(async () => {
      const result = await createSavedViewAction(trimmed, qs);
      if (result.ok) {
        setName("");
        setNaming(false);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteSavedViewAction(id);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
      {pinned.map((v) => (
        <span
          key={v.id}
          className="group inline-flex items-center gap-1 rounded-full border border-line bg-inset py-1 pr-1 pl-2.5 text-meta"
        >
          <button
            type="button"
            onClick={() => router.push(`${pathname}?${v.queryString}`)}
            className="min-h-[28px] text-ink transition-colors hover:text-accent"
          >
            {v.name}
            <span className="ml-1.5 font-mono text-faint tabular">{v.count}</span>
          </button>
          <button
            type="button"
            aria-label={`Remove saved view ${v.name}`}
            disabled={pending}
            onClick={() => remove(v.id)}
            className="grid size-5 shrink-0 place-items-center rounded-full text-faint opacity-0 transition-opacity hover:bg-hover hover:text-danger group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      {naming ? (
        <span className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setNaming(false);
            }}
            placeholder="View name"
            className="h-7 w-32 text-meta"
          />
          <Button size="xs" variant="secondary" disabled={pending || !name.trim()} onClick={save}>
            Save
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setNaming(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button size="xs" variant="ghost" onClick={() => setNaming(true)}>
          <Plus className="size-3" />
          Save this view
        </Button>
      )}
    </div>
  );
}
