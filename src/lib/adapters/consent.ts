import type {
  ConsentAdapter,
  ConsentFailure,
  ConsentRequest,
  ConsentResponse,
} from "./types";

/** TrustedForm certificate URLs are stable in shape; anything else is malformed. */
const TRUSTEDFORM_RE =
  /^https:\/\/cert\.trustedform\.com\/[0-9a-f]{40}$/i;

/** Jornaya (LeadiD) tokens are canonical UUIDs. */
const JORNAYA_RE =
  /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

/** TrustedForm retains a claimable certificate for 90 days. */
const CERT_MAX_AGE_DAYS = 90;

/**
 * Mock consent verifier.
 *
 * Validates certificate *shape* and freshness offline. It deliberately does
 * not claim the certificate — claiming is a billable, irreversible operation
 * that belongs in the production adapter only.
 */
export class MockConsentAdapter implements ConsentAdapter {
  readonly name = "mock-consent-inspector";

  async verify(req: ConsentRequest): Promise<ConsentResponse> {
    const started = Date.now();

    const hasTf = Boolean(req.certUrl && req.certUrl.trim());
    const hasJornaya = Boolean(req.jornayaLeadId && req.jornayaLeadId.trim());

    const base = {
      provider: this.name,
      latencyMs: 0,
      capturedAt: null as Date | null,
      certificateType: null as "TRUSTEDFORM" | "JORNAYA" | null,
    };

    const fail = (
      failure: ConsentFailure,
      raw: Record<string, unknown>,
    ): ConsentResponse => ({
      ...base,
      verified: false,
      failure,
      raw: { ...raw, provider: this.name },
      latencyMs: Date.now() - started,
    });

    if (!hasTf && !hasJornaya) {
      return fail("CERT_MISSING", {
        trustedform_present: false,
        jornaya_present: false,
      });
    }

    let certificateType: "TRUSTEDFORM" | "JORNAYA" | null = null;

    if (hasTf) {
      if (!TRUSTEDFORM_RE.test(req.certUrl!.trim())) {
        return fail("CERT_MALFORMED", {
          trustedform_cert_url: req.certUrl,
          expected_pattern: TRUSTEDFORM_RE.source,
        });
      }
      certificateType = "TRUSTEDFORM";
    } else if (hasJornaya) {
      if (!JORNAYA_RE.test(req.jornayaLeadId!.trim())) {
        return fail("CERT_MALFORMED", {
          jornaya_lead_id: req.jornayaLeadId,
          expected_pattern: "UUID",
        });
      }
      certificateType = "JORNAYA";
    }

    // A certificate older than the provider's retention window can no longer
    // be claimed, so it cannot evidence consent in a TCPA dispute.
    const ageDays =
      (Date.now() - req.receivedAtUtc.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays > CERT_MAX_AGE_DAYS) {
      return fail("CERT_EXPIRED", {
        certificate_type: certificateType,
        age_days: Math.round(ageDays),
        max_age_days: CERT_MAX_AGE_DAYS,
      });
    }

    if (!req.consentText || !req.consentText.trim()) {
      return fail("TEXT_MISSING", {
        certificate_type: certificateType,
        note: "Certificate present but no verbatim disclosure text captured.",
      });
    }

    return {
      verified: true,
      failure: null,
      certificateType,
      capturedAt: req.receivedAtUtc,
      raw: {
        provider: this.name,
        certificate_type: certificateType,
        trustedform_cert_url: req.certUrl ?? null,
        jornaya_lead_id: req.jornayaLeadId ?? null,
        consent_text_length: req.consentText.trim().length,
        age_days: Math.round(ageDays),
      },
      provider: this.name,
      latencyMs: Date.now() - started,
    };
  }
}

/**
 * Production adapter. Performs a non-destructive TrustedForm certificate
 * lookup (GET, not the billable claim POST) to confirm the certificate exists
 * and its captured timestamp is consistent with the lead.
 */
export class HttpConsentAdapter implements ConsentAdapter {
  readonly name = "trustedform-api";

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs = 4000,
  ) {}

  async verify(req: ConsentRequest): Promise<ConsentResponse> {
    const started = Date.now();

    if (!req.certUrl || !TRUSTEDFORM_RE.test(req.certUrl.trim())) {
      return {
        verified: false,
        failure: req.certUrl ? "CERT_MALFORMED" : "CERT_MISSING",
        certificateType: null,
        capturedAt: null,
        raw: { trustedform_cert_url: req.certUrl ?? null },
        provider: this.name,
        latencyMs: Date.now() - started,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(req.certUrl.trim(), {
        method: "GET",
        headers: {
          authorization: `Basic ${Buffer.from(`API:${this.apiKey}`).toString("base64")}`,
          accept: "application/json",
          "x-source-id": req.sourceId,
        },
        signal: controller.signal,
      });

      if (res.status === 404 || res.status === 410) {
        return {
          verified: false,
          failure: "CERT_EXPIRED",
          certificateType: "TRUSTEDFORM",
          capturedAt: null,
          raw: { http_status: res.status },
          provider: this.name,
          latencyMs: Date.now() - started,
        };
      }
      if (!res.ok) {
        throw new Error(`consent provider returned HTTP ${res.status}`);
      }

      const body = (await res.json()) as Record<string, unknown>;
      const capturedRaw = body["created_at"];
      const capturedAt =
        typeof capturedRaw === "string" ? new Date(capturedRaw) : null;

      if (!req.consentText || !req.consentText.trim()) {
        return {
          verified: false,
          failure: "TEXT_MISSING",
          certificateType: "TRUSTEDFORM",
          capturedAt,
          raw: body,
          provider: this.name,
          latencyMs: Date.now() - started,
        };
      }

      return {
        verified: true,
        failure: null,
        certificateType: "TRUSTEDFORM",
        capturedAt,
        raw: body,
        provider: this.name,
        latencyMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
