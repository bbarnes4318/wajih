"use client";

import { Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { countdownParts } from "@/lib/format";
import { useSharedClock } from "@/lib/hooks/use-shared-clock";

/**
 * Live dispute-window countdown.
 *
 * The server renders the initial value so there is no blank frame, then a
 * single shared clock (see `useSharedClock`) ticks it once a minute — one
 * timer for the whole page, not one per row. Colour escalates as the window
 * closes because a buyer's ops team triages by "what expires next", not by
 * exact remaining time.
 *
 * The visible badge itself isn't `aria-live` — re-announcing "06h 59m" every
 * tick would spam a screen reader. A separate, visually-hidden region only
 * changes text when the lead crosses into a coarser urgency bucket, so it
 * only announces something actually worth hearing.
 */

function urgencyAnnouncement(expired: boolean, hours: number): string {
  if (expired) return "Window closed";
  if (hours < 1) return "Closes in under one hour";
  if (hours < 6) return "Closes in under six hours";
  if (hours < 24) return "Closes in under one day";
  return "Closes in more than one day";
}

export function CountdownBadge({
  expiresAt,
  className,
}: {
  expiresAt: string | null;
  className?: string;
}) {
  const now = useSharedClock();

  if (!expiresAt) {
    return (
      <Badge tone="neutral" className={className}>
        No window
      </Badge>
    );
  }

  const { expired, hours, minutes } = countdownParts(expiresAt, now);
  const announcement = urgencyAnnouncement(expired, hours);

  if (expired) {
    return (
      <span className="inline-flex items-center">
        <Badge tone="neutral" className={className} title="Return window has closed.">
          Window closed
        </Badge>
        <span aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </span>
    );
  }

  const tone = hours < 6 ? "danger" : hours < 24 ? "warning" : "success";

  return (
    <span className="inline-flex items-center">
      <Badge tone={tone} className={className} title={`Expires ${expiresAt}`}>
        <Timer className="size-3" />
        <span className="font-mono tabular">
          {String(hours).padStart(2, "0")}h {String(minutes).padStart(2, "0")}m
        </span>
      </Badge>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </span>
  );
}
