import { HttpConsentAdapter, MockConsentAdapter } from "./consent";
import { HttpDncScrubAdapter, MockDncScrubAdapter } from "./dnc";
import type { ConsentAdapter, DncScrubAdapter } from "./types";

/**
 * Provider registry — the single place a vendor is chosen.
 *
 * Toggle with env:
 *   DNC_PROVIDER=mock|http      DNC_ENDPOINT, DNC_API_KEY
 *   CONSENT_PROVIDER=mock|http  TRUSTEDFORM_API_KEY
 *
 * Defaults are `mock` so a fresh checkout runs the full waterfall with no
 * external credentials.
 */

let dncAdapter: DncScrubAdapter | null = null;
let consentAdapter: ConsentAdapter | null = null;

export function getDncAdapter(): DncScrubAdapter {
  if (dncAdapter) return dncAdapter;

  if (process.env.DNC_PROVIDER === "http") {
    const endpoint = process.env.DNC_ENDPOINT;
    const apiKey = process.env.DNC_API_KEY;
    if (!endpoint || !apiKey) {
      throw new Error(
        "DNC_PROVIDER=http requires DNC_ENDPOINT and DNC_API_KEY to be set.",
      );
    }
    dncAdapter = new HttpDncScrubAdapter(endpoint, apiKey);
  } else {
    dncAdapter = new MockDncScrubAdapter();
  }

  return dncAdapter;
}

export function getConsentAdapter(): ConsentAdapter {
  if (consentAdapter) return consentAdapter;

  if (process.env.CONSENT_PROVIDER === "http") {
    const apiKey = process.env.TRUSTEDFORM_API_KEY;
    if (!apiKey) {
      throw new Error(
        "CONSENT_PROVIDER=http requires TRUSTEDFORM_API_KEY to be set.",
      );
    }
    consentAdapter = new HttpConsentAdapter(apiKey);
  } else {
    consentAdapter = new MockConsentAdapter();
  }

  return consentAdapter;
}

/** Test seam — lets suites inject fakes without touching env. */
export function __setAdapters(opts: {
  dnc?: DncScrubAdapter;
  consent?: ConsentAdapter;
}) {
  if (opts.dnc) dncAdapter = opts.dnc;
  if (opts.consent) consentAdapter = opts.consent;
}

export * from "./types";
