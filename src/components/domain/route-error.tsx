"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonoId } from "@/components/domain/copy-button";

/**
 * Shared body for every buyer-route `error.tsx`. Next 16.3's `retry()`
 * re-fetches and re-renders the segment (prefer it over `reset()`, which only
 * clears local error state without re-fetching).
 */
export function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <TriangleAlert className="size-6 text-danger" />
      <p className="text-ui font-medium text-ink">Something went wrong loading this page.</p>
      <p className="max-w-sm text-body text-muted">
        {error.message || "An unexpected error occurred."}
      </p>
      {error.digest && (
        <div className="flex items-center gap-1.5 rounded-md border border-line bg-inset px-2.5 py-1.5">
          <span className="text-meta text-faint">Error ID</span>
          <MonoId value={error.digest} />
        </div>
      )}
      <Button variant="secondary" size="sm" onClick={() => retry()} className="mt-2 min-h-[44px]">
        Try again
      </Button>
    </div>
  );
}
