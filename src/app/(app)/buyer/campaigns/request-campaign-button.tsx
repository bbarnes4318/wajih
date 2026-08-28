"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignDraftForm } from "./campaign-draft-form";

export function RequestCampaignButton({
  variant = "secondary",
}: {
  variant?: "secondary" | "primary";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Request a campaign
      </Button>
      <CampaignDraftForm open={open} onOpenChange={setOpen} />
    </>
  );
}
