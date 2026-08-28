"use client";

import { useState } from "react";
import type { LeadDetailView, LeadTableRow } from "@/lib/db/lead-view";
import { LeadTable } from "./lead-table";
import { LeadDrawer } from "./lead-drawer";

/**
 * Binds the table to the inspection drawer. Split out of the page so the page
 * itself can stay a Server Component and do its querying on the server.
 */
export function LeadStream({
  rows,
  hiddenColumns,
  drawerActions,
}: {
  rows: LeadTableRow[];
  hiddenColumns?: string[];
  drawerActions?: (lead: LeadDetailView) => React.ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <LeadTable
        rows={rows}
        hiddenColumns={hiddenColumns}
        selectedId={selectedId}
        onInspect={setSelectedId}
      />
      <LeadDrawer
        leadId={selectedId}
        onClose={() => setSelectedId(null)}
        actions={drawerActions}
      />
    </>
  );
}
