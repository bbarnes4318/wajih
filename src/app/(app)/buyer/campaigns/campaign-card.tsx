"use client";

import { useState, useTransition } from "react";
import type { Vertical } from "@prisma/client";
import { Pause, Play, Save, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { money, percent } from "@/lib/format";
import { verticalLabel } from "@/lib/domain/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { PacingBar } from "@/components/domain/charts";
import { updateCampaignAction, toggleCampaignAction } from "./actions";

export interface CampaignView {
  id: string;
  name: string;
  vertical: Vertical;
  maxCpl: string;
  dailyBudget: string;
  dailyCapLeads: number | null;
  returnWindowHours: number;
  deliveryWebhookUrl: string;
  acceptedStates: string[];
  acceptedZips: string[];
  criteriaJson: unknown;
  active: boolean;
  priority: number;
  deliveredToday: number;
  spendToday: number;
  returnedToday: number;
  deliveredTotal: number;
  returnedTotal: number;
}

const ERRORS: Record<string, string> = {
  INVALID_MAX_CPL: "Max CPL must be a positive number.",
  INVALID_DAILY_BUDGET: "Daily budget must be zero or more.",
  INVALID_RETURN_WINDOW: "Return window must be between 1 and 720 hours.",
  INVALID_WEBHOOK_URL: "Delivery webhook must be a valid http(s) URL.",
  INVALID_DAILY_CAP: "Daily cap must be a whole number, or blank for uncapped.",
  INVALID_CRITERIA_JSON:
    "Criteria must be valid JSON using only the supported keys.",
  NOT_FOUND: "That campaign is not on your account.",
};

function errorMessage(code: string | undefined): string {
  if (!code) return "That change could not be saved.";
  if (code.startsWith("INVALID_STATE:")) {
    return `"${code.split(":")[1]}" is not a valid USPS state code.`;
  }
  if (code.startsWith("INVALID_ZIP:")) {
    return `"${code.split(":")[1]}" is not a valid 5-digit ZIP.`;
  }
  return ERRORS[code] ?? "That change could not be saved.";
}

/**
 * Campaign configuration card.
 *
 * Filters are edited here and evaluated verbatim at step 6 — the same
 * `criteria_json` the qualifier reads is what the buyer types, so there is no
 * translation layer to drift out of sync.
 */
export function CampaignCard({ campaign }: { campaign: CampaignView }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const budget = Number(campaign.dailyBudget);
  const returnRate =
    campaign.deliveredTotal === 0
      ? 0
      : campaign.returnedTotal / campaign.deliveredTotal;

  function submit(formData: FormData) {
    setError(null);
    setMessage(null);
    formData.set("campaignId", campaign.id);
    startTransition(async () => {
      const result = await updateCampaignAction(formData);
      if (result.ok) {
        setMessage(result.message ?? "Saved.");
        setEditing(false);
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  function toggle() {
    setError(null);
    const fd = new FormData();
    fd.set("campaignId", campaign.id);
    fd.set("active", String(!campaign.active));
    startTransition(async () => {
      const result = await toggleCampaignAction(fd);
      if (!result.ok) setError(errorMessage(result.error));
    });
  }

  return (
    <Panel className={cn(pending && "opacity-70")}>
      <PanelHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {campaign.name}
            <Badge tone={campaign.active ? "success" : "neutral"} dot>
              {campaign.active ? "Active" : "Paused"}
            </Badge>
            <Badge tone="neutral">{verticalLabel(campaign.vertical)}</Badge>
            <Badge tone="neutral" title="Lower numbers are matched first.">
              priority {campaign.priority}
            </Badge>
          </span>
        }
        subtitle={`Max ${money(campaign.maxCpl)} CPL · ${campaign.returnWindowHours}h return window · lifetime return rate ${percent(returnRate, 1)}`}
        action={
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={toggle} disabled={pending}>
              {campaign.active ? (
                <>
                  <Pause className="size-3.5" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="size-3.5" />
                  Resume
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing((v) => !v)}
            >
              <SlidersHorizontal className="size-3.5" />
              {editing ? "Cancel" : "Configure"}
            </Button>
          </div>
        }
      />

      <PanelBody className="space-y-3">
        {/* Pacing */}
        <div className="grid gap-3 sm:grid-cols-2">
          <PacingBar
            fill={
              campaign.dailyCapLeads
                ? campaign.deliveredToday / campaign.dailyCapLeads
                : null
            }
            label="Lead cap today"
            sublabel={`${campaign.deliveredToday}${campaign.dailyCapLeads ? ` / ${campaign.dailyCapLeads}` : " delivered (uncapped)"}`}
          />
          <PacingBar
            fill={budget === 0 ? 0 : campaign.spendToday / budget}
            label="Budget today"
            sublabel={`${money(campaign.spendToday)} / ${money(budget)}`}
          />
        </div>

        {/* Current filters */}
        {!editing && (
          <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
            <div>
              <h4 className="mb-1 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
                Geography
              </h4>
              <p className="text-body leading-relaxed text-muted">
                {campaign.acceptedStates.length === 0
                  ? "All states"
                  : campaign.acceptedStates.join(", ")}
                {campaign.acceptedZips.length > 0 &&
                  ` · narrowed to ${campaign.acceptedZips.length} ZIP codes`}
              </p>
            </div>
            <div>
              <h4 className="mb-1 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
                Delivery endpoint
              </h4>
              <p className="font-mono text-meta break-all text-muted">
                {campaign.deliveryWebhookUrl}
              </p>
            </div>
            <div className="sm:col-span-2">
              <h4 className="mb-1 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
                Qualifier criteria
              </h4>
              <pre className="overflow-auto rounded-md border border-line bg-sunken px-3 py-2 font-mono text-meta leading-relaxed text-muted">
                {JSON.stringify(campaign.criteriaJson, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Editor */}
        {editing && (
          <form action={submit} className="space-y-3 border-t border-line pt-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Max CPL" required>
                <Input
                  name="maxCpl"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue={campaign.maxCpl}
                  className="font-mono"
                />
              </Field>
              <Field label="Daily budget" required>
                <Input
                  name="dailyBudget"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={campaign.dailyBudget}
                  className="font-mono"
                />
              </Field>
              <Field label="Daily lead cap" hint="Blank for uncapped.">
                <Input
                  name="dailyCapLeads"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={campaign.dailyCapLeads ?? ""}
                  className="font-mono"
                />
              </Field>
              <Field label="Return window (hours)" required>
                <Input
                  name="returnWindowHours"
                  type="number"
                  step="1"
                  min="1"
                  max="720"
                  defaultValue={campaign.returnWindowHours}
                  className="font-mono"
                />
              </Field>
            </div>

            <Field label="Delivery webhook URL" required>
              <Input
                name="deliveryWebhookUrl"
                defaultValue={campaign.deliveryWebhookUrl}
                className="font-mono text-meta"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Accepted states"
                hint="Comma separated USPS codes. Blank means all states."
              >
                <Input
                  name="acceptedStates"
                  defaultValue={campaign.acceptedStates.join(", ")}
                  className="font-mono text-meta"
                  placeholder="AZ, CA, FL"
                />
              </Field>
              <Field
                label="Accepted ZIPs"
                hint="Optional allowlist that narrows within the states above."
              >
                <Input
                  name="acceptedZips"
                  defaultValue={campaign.acceptedZips.join(", ")}
                  className="font-mono text-meta"
                  placeholder="85004, 92101"
                />
              </Field>
            </div>

            <Field
              label="Qualifier criteria (JSON)"
              hint="Keys: minAge, maxAge, requireAge, equals, notEquals, numericMin, numericMax, excludeTrafficSources."
            >
              <Textarea
                name="criteriaJson"
                rows={8}
                defaultValue={JSON.stringify(campaign.criteriaJson, null, 2)}
                className="font-mono text-meta"
              />
            </Field>

            <label className="flex items-center gap-2 text-body text-ink">
              <input
                type="checkbox"
                name="active"
                defaultChecked={campaign.active}
                className="size-3.5 accent-[var(--accent)]"
              />
              Campaign is active
            </label>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" disabled={pending}>
                <Save className="size-3.5" />
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        )}

        {error && <p className="text-body text-danger">{error}</p>}
        {message && <p className="text-body text-success">{message}</p>}
      </PanelBody>
    </Panel>
  );
}
