"use client";

import { useEffect, useRef } from "react";
import type { LeadTableRow } from "@/lib/db/lead-view";

interface UseBuyerLeadStreamOptions {
  onDelivered: (lead: LeadTableRow) => void;
  /** A lead settled or crossed into its final hour — state the client can't derive locally. */
  onNeedsRefresh: () => void;
}

/**
 * Drives the buyer delivery-queue live stream. `EventSource` auto-reconnects
 * on its own (the route's `retry` field and its own periodic self-close are
 * expected, not failures — see `/api/buyer/stream`'s comment), so this only
 * falls back to 30s polling after reconnects themselves start failing.
 * Paused entirely while the tab is hidden: nothing is lost, since the next
 * poll cycle after resuming catches up via the same `lastCheckedAt` window
 * server-side that a fresh connection re-establishes.
 */
export function useBuyerLeadStream({ onDelivered, onNeedsRefresh }: UseBuyerLeadStreamOptions) {
  const onDeliveredRef = useRef(onDelivered);
  const onNeedsRefreshRef = useRef(onNeedsRefresh);
  useEffect(() => {
    onDeliveredRef.current = onDelivered;
    onNeedsRefreshRef.current = onNeedsRefresh;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    let source: EventSource | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let consecutiveFailures = 0;
    let stopped = false;

    function stopPolling() {
      if (pollId !== null) {
        clearInterval(pollId);
        pollId = null;
      }
    }

    function startPolling() {
      stopPolling();
      pollId = setInterval(() => onNeedsRefreshRef.current(), 30_000);
    }

    function closeSource() {
      source?.close();
      source = null;
    }

    function connect() {
      if (stopped || document.hidden) return;
      closeSource();
      source = new EventSource("/api/buyer/stream");

      source.addEventListener("open", () => {
        consecutiveFailures = 0;
        stopPolling();
      });

      source.addEventListener("lead.delivered", (e) => {
        try {
          onDeliveredRef.current(JSON.parse((e as MessageEvent).data));
        } catch {
          // Malformed payload — drop this one event, keep the connection.
        }
      });

      source.addEventListener("lead.settled", () => onNeedsRefreshRef.current());
      source.addEventListener("window.expiring", () => onNeedsRefreshRef.current());

      source.addEventListener("error", () => {
        consecutiveFailures += 1;
        // The route deliberately self-closes every ~50s to respect
        // serverless execution limits; EventSource treats that exactly like
        // a dropped connection and reconnects on its own. A genuinely dead
        // connection fails to reopen too, so failures stop resetting to 0
        // and accumulate — that's the real signal to fall back.
        if (consecutiveFailures >= 2) {
          closeSource();
          startPolling();
        }
      });
    }

    function onVisibilityChange() {
      if (document.hidden) {
        closeSource();
        stopPolling();
      } else {
        connect();
      }
    }

    connect();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      closeSource();
      stopPolling();
    };
  }, []);
}
