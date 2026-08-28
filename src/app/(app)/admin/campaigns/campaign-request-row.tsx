"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { decideCampaignRequestAction } from "./actions";

export function CampaignRequestActions({ campaignId }: { campaignId: string }) {
  const [pending, startTransition] = useTransition();

  function decide(decision: "APPROVE" | "REJECT") {
    const fd = new FormData();
    fd.set("campaignId", campaignId);
    fd.set("decision", decision);
    startTransition(async () => {
      await decideCampaignRequestAction(fd);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="success"
        size="xs"
        disabled={pending}
        onClick={() => decide("APPROVE")}
      >
        <Check className="size-3" />
        Approve
      </Button>
      <Button variant="danger" size="xs" disabled={pending} onClick={() => decide("REJECT")}>
        <X className="size-3" />
        Reject
      </Button>
    </div>
  );
}
