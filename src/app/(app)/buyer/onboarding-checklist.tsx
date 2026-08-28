"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { completeOnboardingStepAction, dismissOnboardingAction } from "./actions";

const STEPS = [
  {
    key: "campaign_criteria",
    label: "Confirm your campaign criteria",
    description:
      "Review the vertical, geography and qualifier criteria on your campaigns — this is exactly what the step 6 qualifier matches against.",
    href: "/buyer/campaigns",
  },
  {
    key: "webhook_verified",
    label: "Verify your delivery webhook",
    description: "Make sure your endpoint is reachable before the first live lead hits it.",
    href: "/buyer/campaigns",
  },
  {
    key: "notification_prefs",
    label: "Check your notification feed",
    description: "Disputes, delivery failures and account changes all post here.",
    href: "/buyer/notifications",
  },
  {
    key: "return_policy",
    label: "Review the return policy",
    description:
      "A structured dispute filed inside the return window credits you and voids the publisher's payout. Anything left untouched settles automatically as payable once the window closes.",
    href: null,
  },
] as const;

/**
 * Shown only while a buyer org has zero delivered leads (see the query in
 * buyer/page.tsx) — this is a first-run aid, not a permanent fixture.
 * Auto-hides for good once every step is done or the buyer dismisses it;
 * both paths persist to Organization so it doesn't reappear next visit.
 */
export function OnboardingChecklist({ completedSteps }: { completedSteps: string[] }) {
  const [completed, setCompleted] = useState<Set<string>>(new Set(completedSteps));
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  const allDone = STEPS.every((s) => completed.has(s.key));
  if (dismissed || allDone) return null;

  function markDone(key: string) {
    setCompleted((prev) => new Set(prev).add(key));
    startTransition(() => {
      completeOnboardingStepAction(key);
    });
  }

  function dismiss() {
    setDismissed(true);
    startTransition(() => {
      dismissOnboardingAction();
    });
  }

  const doneCount = STEPS.filter((s) => completed.has(s.key)).length;

  return (
    <Panel>
      <PanelHeader
        title="Get set up"
        subtitle={`${doneCount} of ${STEPS.length} complete`}
        action={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss checklist"
            onClick={dismiss}
            className="min-h-[44px] min-w-[44px]"
          >
            <X className="size-4" />
          </Button>
        }
      />
      <PanelBody>
        <ul className="space-y-3">
          {STEPS.map((step) => {
            const done = completed.has(step.key);
            return (
              <li key={step.key} className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => markDone(step.key)}
                  disabled={done}
                  aria-label={done ? `${step.label} — done` : `Mark "${step.label}" as done`}
                  className="mt-0.5 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center disabled:cursor-default"
                >
                  {done ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <Circle className="size-4 text-faint" />
                  )}
                </button>
                <div className="min-w-0 flex-1 py-2.5">
                  <div className={cn("text-body", done ? "text-faint line-through" : "text-ink")}>
                    {step.label}
                  </div>
                  {!done && (
                    <p className="mt-0.5 text-meta leading-relaxed text-muted">
                      {step.description}
                    </p>
                  )}
                </div>
                {!done && step.href && (
                  <Link
                    href={step.href}
                    className="shrink-0 self-center text-meta text-accent hover:underline"
                  >
                    Go
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </PanelBody>
    </Panel>
  );
}
