import { prisma } from "@/lib/db/prisma";
import type {
  DncListHit,
  DncScrubAdapter,
  ScrubRequest,
  ScrubResponse,
} from "./types";

/**
 * Mock scrub provider.
 *
 * Backed by the local `suppression_entries` table so the demo network behaves
 * deterministically: seed a number onto a list and every subsequent lead
 * carrying it is rejected with the matching enum code. Production swaps this
 * for `HttpDncScrubAdapter` via DNC_PROVIDER=http.
 */
export class MockDncScrubAdapter implements DncScrubAdapter {
  readonly name = "mock-suppression-db";

  async scrub(req: ScrubRequest): Promise<ScrubResponse> {
    const started = Date.now();

    const entries = await prisma.suppressionEntry.findMany({
      where: { phoneE164: req.phoneE164 },
      select: { listType: true, stateCode: true, note: true },
    });

    const hits: DncListHit[] = [];
    for (const e of entries) {
      // A state DNC listing only bites when the lead is in that state.
      if (e.listType === "STATE_DNC") {
        if (e.stateCode && req.stateCode && e.stateCode === req.stateCode) {
          hits.push("STATE_DNC");
        }
        continue;
      }
      hits.push(e.listType as DncListHit);
    }

    return {
      clean: hits.length === 0,
      hits,
      raw: {
        provider: this.name,
        queried_phone: req.phoneE164,
        queried_state: req.stateCode,
        matched_entries: entries.map((e) => ({
          list: e.listType,
          state: e.stateCode,
          note: e.note,
        })),
        checked_lists: [
          "FEDERAL_DNC",
          "STATE_DNC",
          "INTERNAL_DNC",
          "TCPA_LITIGATOR",
        ],
      },
      provider: this.name,
      latencyMs: Date.now() - started,
    };
  }
}

/**
 * Production adapter. Posts to a vendor scrub endpoint and maps the response
 * onto our list taxonomy.
 *
 * A provider error is NOT treated as clean — it surfaces as a thrown error so
 * step 4 records SCRUB_PROVIDER_ERROR and halts. Failing open on a DNC check
 * is the single most expensive mistake this system could make.
 */
export class HttpDncScrubAdapter implements DncScrubAdapter {
  readonly name = "http-dnc-provider";

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 4000,
  ) {}

  async scrub(req: ScrubRequest): Promise<ScrubResponse> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          "x-source-id": req.sourceId,
          "x-lead-id": req.leadId,
        },
        body: JSON.stringify({
          phone: req.phoneE164,
          state: req.stateCode,
          lists: ["federal_dnc", "state_dnc", "internal_dnc", "litigator"],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`scrub provider returned HTTP ${res.status}`);
      }

      const body = (await res.json()) as {
        federal_dnc?: boolean;
        state_dnc?: boolean;
        internal_dnc?: boolean;
        litigator?: boolean;
      };

      const hits: DncListHit[] = [];
      if (body.federal_dnc) hits.push("FEDERAL_DNC");
      if (body.state_dnc) hits.push("STATE_DNC");
      if (body.internal_dnc) hits.push("INTERNAL_DNC");
      if (body.litigator) hits.push("TCPA_LITIGATOR");

      return {
        clean: hits.length === 0,
        hits,
        raw: body as Record<string, unknown>,
        provider: this.name,
        latencyMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
