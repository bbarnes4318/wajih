"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { countdownParts } from "@/lib/format";

/**
 * Live dispute-window countdown.
 *
 * The server renders the initial value so there is no blank frame, then this
 * ticks it once a minute. Colour escalates as the window closes because a
 * buyer's ops team triages by "what expires next", not by exact remaining time.
 */
export function CountdownBadge({
  expiresAt,
  className,
}: {
  expiresAt: string | null;
  className?: string;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt) {
    return (
      <Badge tone="neutral" className={className}>
        No window
      </Badge>
    );
  }

  const { expired, hours, minutes } = countdownParts(expiresAt, now);

  if (expired) {
    return (
      <Badge tone="neutral" className={className} title="Return window has closed.">
        Window closed
      </Badge>
    );
  }

  const tone = hours < 6 ? "danger" : hours < 24 ? "warning" : "success";

  return (
    <Badge tone={tone} className={className} title={`Expires ${expiresAt}`}>
      <Timer className="size-3" />
      <span className="font-mono tabular">
        {String(hours).padStart(2, "0")}h {String(minutes).padStart(2, "0")}m
      </span>
    </Badge>
  );
}
