"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Vertical } from "@prisma/client";
import { Radio, Send } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { VERTICAL_SPECS } from "@/lib/domain/verticals";
import { verticalLabel } from "@/lib/domain/labels";
import { count } from "@/lib/format";
import {
  createCampaignDraftAction,
  estimateSupplyAction,
  testWebhookAction,
} from "./actions";
import { errorMessage } from "./campaign-card";

const VERTICALS = Object.keys(VERTICAL_SPECS) as Vertical[];
const SUPPLY_DEBOUNCE_MS = 500;

export function CampaignDraftForm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [vertical, setVertical] = useState<Vertical>(VERTICALS[0]);
  const [statesInput, setStatesInput] = useState("");
  const [zipsInput, setZipsInput] = useState("");
  const [supply, setSupply] = useState<{ count: number; days: number } | null>(null);
  const [supplyLoading, setSupplyLoading] = useState(false);
  const supplyTimer = useRef<number | null>(null);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookResult, setWebhookResult] = useState<
    { ok: boolean; status?: number; body?: string; error?: string } | null
  >(null);
  const [webhookTesting, setWebhookTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (supplyTimer.current !== null) window.clearTimeout(supplyTimer.current);
    // setSupplyLoading fires once the debounce window elapses, not
    // synchronously here — so a fast typist doesn't see the "estimating"
    // state flicker on every keystroke, only once a request is actually
    // about to go out.
    supplyTimer.current = window.setTimeout(() => {
      setSupplyLoading(true);
      const acceptedStates = statesInput
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((s) => s.toUpperCase());
      const acceptedZips = zipsInput.split(/[\s,]+/).filter(Boolean);
      estimateSupplyAction({ vertical, acceptedStates, acceptedZips })
        .then(setSupply)
        .finally(() => setSupplyLoading(false));
    }, SUPPLY_DEBOUNCE_MS);
    return () => {
      if (supplyTimer.current !== null) window.clearTimeout(supplyTimer.current);
    };
  }, [open, vertical, statesInput, zipsInput]);

  function testWebhook() {
    setWebhookTesting(true);
    setWebhookResult(null);
    testWebhookAction(webhookUrl)
      .then(setWebhookResult)
      .finally(() => setWebhookTesting(false));
  }

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCampaignDraftAction(formData);
      if (result.ok) {
        onOpenChange(false);
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Request a campaign"
      subtitle="Reviewed by network operations before it can route — nothing delivers until it's approved."
      footer={
        <>
          <Button type="button" variant="ghost" size="md" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="campaign-draft-form" variant="primary" size="md" disabled={pending}>
            <Send className="size-3.5" />
            {pending ? "Submitting…" : "Submit for review"}
          </Button>
        </>
      }
    >
      <form id="campaign-draft-form" action={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign name" required>
            <Input name="name" placeholder="e.g. Auto — Sunbelt Tier 1" />
          </Field>
          <Field label="Vertical" required>
            <NativeSelect
              name="vertical"
              value={vertical}
              onChange={(e) => setVertical(e.target.value as Vertical)}
            >
              {VERTICALS.map((v) => (
                <option key={v} value={v}>
                  {verticalLabel(v)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Max CPL" required>
            <Input name="maxCpl" type="number" step="0.01" min="0.01" className="font-mono" />
          </Field>
          <Field label="Daily budget" required>
            <Input name="dailyBudget" type="number" step="1" min="0" className="font-mono" />
          </Field>
          <Field label="Daily lead cap" hint="Blank for uncapped.">
            <Input name="dailyCapLeads" type="number" step="1" min="0" className="font-mono" />
          </Field>
          <Field label="Return window (hours)" required>
            <Input
              name="returnWindowHours"
              type="number"
              step="1"
              min="1"
              max="720"
              defaultValue={72}
              className="font-mono"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Accepted states" hint="Comma separated USPS codes. Blank means all states.">
            <Input
              name="acceptedStates"
              value={statesInput}
              onChange={(e) => setStatesInput(e.target.value)}
              className="font-mono text-meta"
              placeholder="AZ, CA, FL"
            />
          </Field>
          <Field label="Accepted ZIPs" hint="Optional allowlist that narrows within the states above.">
            <Input
              name="acceptedZips"
              value={zipsInput}
              onChange={(e) => setZipsInput(e.target.value)}
              className="font-mono text-meta"
              placeholder="85004, 92101"
            />
          </Field>
        </div>

        <p className="flex items-center gap-1.5 rounded-md border border-line bg-inset px-2.5 py-2 text-meta text-muted">
          <Radio className="size-3.5 shrink-0 text-faint" />
          {supplyLoading ? (
            "Estimating historical supply…"
          ) : supply ? (
            <>
              At these filters, the network delivered roughly{" "}
              <span className="font-mono font-medium text-ink tabular">{count(supply.count)}</span>{" "}
              matching leads in the last {supply.days} days. Historical supply, not a forward
              guarantee.
            </>
          ) : (
            "Set a vertical to see historical supply."
          )}
        </p>

        <Field label="Delivery webhook URL" required>
          <div className="flex items-center gap-2">
            <Input
              name="deliveryWebhookUrl"
              value={webhookUrl}
              onChange={(e) => {
                setWebhookUrl(e.target.value);
                setWebhookResult(null);
              }}
              className="font-mono text-meta"
              placeholder="https://example.com/leads/webhook"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={webhookTesting || !webhookUrl.trim()}
              onClick={testWebhook}
              className="shrink-0"
            >
              {webhookTesting ? "Testing…" : "Test"}
            </Button>
          </div>
        </Field>

        {webhookResult && (
          <div
            className={
              webhookResult.ok
                ? "rounded-md border border-success-border bg-success-soft px-2.5 py-2 text-meta text-success"
                : "rounded-md border border-danger-border bg-danger-soft px-2.5 py-2 text-meta text-danger"
            }
          >
            {webhookResult.ok ? (
              <>
                <div className="font-medium">Responded with HTTP {webhookResult.status}</div>
                {webhookResult.body && (
                  <pre className="mt-1 max-h-32 overflow-auto font-mono text-micro break-all whitespace-pre-wrap">
                    {webhookResult.body}
                  </pre>
                )}
              </>
            ) : (
              <div>{webhookResult.error}</div>
            )}
          </div>
        )}

        <Field
          label="Qualifier criteria (JSON)"
          hint="Keys: minAge, maxAge, requireAge, equals, notEquals, numericMin, numericMax, excludeTrafficSources."
        >
          <Textarea
            name="criteriaJson"
            rows={5}
            defaultValue="{}"
            className="font-mono text-meta"
          />
        </Field>

        {error && <p className="text-body text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
