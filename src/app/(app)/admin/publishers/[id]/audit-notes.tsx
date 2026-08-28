"use client";

import { useState, useTransition } from "react";
import { ScrollText } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { saveAuditNotesAction } from "../actions";

export function AuditNotes({
  orgId,
  initial,
}: {
  orgId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty = value !== initial;

  return (
    <Panel>
      <PanelHeader
        title="Audit notes"
        subtitle="Free-form reviewer context. Not shown to the publisher."
        icon={<ScrollText className="size-3.5" />}
      />
      <PanelBody className="space-y-2">
        <Textarea
          rows={6}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder="What was verified, what was doubtful, and what would change the decision."
        />
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-faint">
            {saved ? "Saved." : dirty ? "Unsaved changes" : ""}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!dirty || pending}
            onClick={() => {
              const fd = new FormData();
              fd.set("orgId", orgId);
              fd.set("auditNotes", value);
              startTransition(async () => {
                await saveAuditNotesAction(fd);
                setSaved(true);
              });
            }}
          >
            {pending ? "Saving…" : "Save notes"}
          </Button>
        </div>
      </PanelBody>
    </Panel>
  );
}
