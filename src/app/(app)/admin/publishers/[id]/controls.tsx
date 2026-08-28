"use client";

import { useState, useTransition } from "react";
import type { OrgStatus } from "@prisma/client";
import { Ban, CircleCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import {
  approvePublisherAction,
  recomputeMetricsAction,
  setPublisherStatusAction,
} from "../actions";

/**
 * Admin overrides. Approval is gated on the checklist server-side; the button
 * is also disabled here so the reviewer sees why before clicking.
 */
export function PublisherAdminControls({
  orgId,
  status,
  checklistComplete,
  checklistFailed,
}: {
  orgId: string;
  status: OrgStatus;
  checklistComplete: boolean;
  checklistFailed: number;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<OrgStatus | null>(null);
  const [reason, setReason] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) setMessage(result.message ?? "Saved.");
      else setError(result.error ?? "FAILED");
    });
  }

  function changeStatus(next: OrgStatus) {
    const fd = new FormData();
    fd.set("orgId", orgId);
    fd.set("status", next);
    fd.set("reason", reason);
    run(() => setPublisherStatusAction(fd));
    setConfirm(null);
    setReason("");
  }

  return (
    <div className="space-y-2 border-t border-line pt-3">
      {status === "PENDING_VETTING" && (
        <>
          <Button
            variant="primary"
            size="md"
            className="w-full"
            disabled={!checklistComplete || pending}
            onClick={() => {
              const fd = new FormData();
              fd.set("orgId", orgId);
              run(() => approvePublisherAction(fd));
            }}
          >
            <ShieldCheck className="size-3.5" />
            Approve and activate
          </Button>
          {!checklistComplete && (
            <p className="text-[12px] leading-relaxed text-muted">
              {checklistFailed > 0
                ? `${checklistFailed} checklist point${checklistFailed === 1 ? "" : "s"} failed. Resolve or waive before approving.`
                : "All nine points must pass or be waived before this account can go live."}
            </p>
          )}
        </>
      )}

      {status === "ACTIVE" && (
        <Button
          variant="danger"
          size="md"
          className="w-full"
          disabled={pending}
          onClick={() => setConfirm("SUSPENDED")}
        >
          <Ban className="size-3.5" />
          Suspend account
        </Button>
      )}

      {(status === "SUSPENDED" || status === "TERMINATED") && (
        <Button
          variant="success"
          size="md"
          className="w-full"
          disabled={pending}
          onClick={() => setConfirm("ACTIVE")}
        >
          <CircleCheck className="size-3.5" />
          Reinstate account
        </Button>
      )}

      {status === "SUSPENDED" && (
        <Button
          variant="outline"
          size="md"
          className="w-full"
          disabled={pending}
          onClick={() => setConfirm("TERMINATED")}
        >
          Terminate permanently
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("orgId", orgId);
          run(() => recomputeMetricsAction(fd));
        }}
      >
        <RefreshCw className="size-3.5" />
        Recompute return metrics
      </Button>

      {message && <p className="text-[12px] text-success">{message}</p>}
      {error && (
        <p className="text-[12px] text-danger">
          {error === "CHECKLIST_INCOMPLETE"
            ? "Checklist is not complete — approval refused."
            : error === "FORBIDDEN"
              ? "You do not have permission to do that."
              : "That action failed."}
        </p>
      )}

      <Modal
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        size="sm"
        title={
          confirm === "ACTIVE"
            ? "Reinstate this publisher?"
            : confirm === "SUSPENDED"
              ? "Suspend this publisher?"
              : "Terminate this publisher?"
        }
        subtitle={
          confirm === "ACTIVE"
            ? "Sources start accepting leads again and the auto-suspension latch is cleared."
            : "Every source on this account will reject at step 1 immediately."
        }
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={confirm === "ACTIVE" ? "success" : "danger"}
              size="md"
              onClick={() => confirm && changeStatus(confirm)}
            >
              Confirm
            </Button>
          </>
        }
      >
        <Field
          label="Reason"
          hint="Recorded on the admin audit log and sent to the publisher."
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this decision was made."
          />
        </Field>
      </Modal>
    </div>
  );
}
