"use client";

import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Exports the *current filter set*, not the current page — an operator asking
 * for "these leads" means the whole slice they filtered to.
 */
export function ExportButton() {
  const params = useSearchParams();

  return (
    <Button asChild variant="secondary" size="sm">
      <a href={`/api/leads/export?${params.toString()}`}>
        <Download className="size-3.5" />
        Export CSV
      </a>
    </Button>
  );
}
