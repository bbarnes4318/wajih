// Must be first: populates process.env before the Prisma client module body
// reads DATABASE_URL at load time.
import "./load-env";

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  Prisma,
  PrismaClient,
  type DisputeReasonCode,
  type LeadOutcome,
  type VettingCheckKey,
  type VettingCheckStatus,
} from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { ingestLead } from "../src/lib/pipeline/ingest";
import { recomputeAllPublisherMetrics } from "../src/lib/metrics/publisher-metrics";
import {
  BUYERS,
  PLACES,
  PUBLISHERS,
  SEEDED_SUPPRESSIONS,
  makeRng,
  type PublisherFixture,
  type Rng,
  type VettingCheckKeyName,
} from "./seed-data";
import {
  generateLead,
  makeIp,
  rollDefect,
  type Defect,
} from "./seed-generators";

/**
 * Seeds the demo network.
 *
 * Leads are pushed through the real ingest waterfall rather than inserted
 * directly, so every seeded lead carries a genuine `lead_audit_trail` with
 * real step timings, real DNC provider payloads, and real routing decisions.
 * Delivery is simulated in-process (no buyer endpoint is listening during a
 * seed run), but it writes the same rows the live dispatcher would.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DEFAULT_PASSWORD = "Passw0rd!";
const DAYS_OF_HISTORY = 30;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

const ALL_CHECK_KEYS: VettingCheckKeyName[] = [
  "EIN_TAX_ID_VERIFIED",
  "BUSINESS_ENTITY_IN_GOOD_STANDING",
  "LANDING_PAGE_LIVE_CHECK",
  "VERBATIM_DISCLOSURE_MATCH",
  "CONSENT_CAPTURE_SAMPLE_REVIEWED",
  "TRAFFIC_SOURCE_DISCLOSURE_COMPLETE",
  "INDUSTRY_REFERENCES_CHECKED",
  "SIGNED_INDEMNITY_AGREEMENT",
  "TEST_BATCH_PASSED",
];

const DISPUTE_REASONS: DisputeReasonCode[] = [
  "INVALID_DISCONNECT",
  "TCPA_MISMATCH",
  "OUT_OF_GEOGRAPHY",
  "DUPLICATE_WITHIN_WINDOW",
  "WRONG_PERSON",
  "BOGUS_CONTACT_INFO",
];

function log(msg: string) {
  process.stdout.write(`  ${msg}\n`);
}

// ---------------------------------------------------------------------------
//  1. Reset
// ---------------------------------------------------------------------------

async function reset() {
  // Truncate in FK-safe order. RESTART IDENTITY is unnecessary (all UUIDs) but
  // CASCADE keeps this robust if a relation is added later.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "lead_audit_trail", "delivery_attempts", "leads", "csv_batches",
      "campaign_daily_stats", "buyer_campaigns", "publisher_rates",
      "lead_sources", "vetting_checks", "publisher_vetting_profiles",
      "publisher_metrics", "notifications", "admin_audit_log",
      "suppression_entries", "sessions", "users", "organizations"
    RESTART IDENTITY CASCADE
  `);
  log("truncated all tables");
}

// ---------------------------------------------------------------------------
//  2. Organizations, users, vetting
// ---------------------------------------------------------------------------

async function seedInternal() {
  const org = await prisma.organization.create({
    data: {
      name: "LeadOS Network Operations",
      type: "INTERNAL",
      einTaxId: "88-0000001",
      website: "https://leados.example",
      status: "ACTIVE",
      contactName: "Network Operations",
      contactEmail: "ops@leados.example",
    },
  });

  await prisma.user.create({
    data: {
      email: "admin@leados.example",
      passwordHash: await hashPassword(DEFAULT_PASSWORD),
      name: "Avery Kwon",
      role: "SUPER_ADMIN",
      orgId: org.id,
    },
  });

  log(`internal org + super admin (admin@leados.example)`);
  return org;
}

/**
 * Derives the 9-point checklist from the publisher's status, then applies any
 * explicit overrides from the fixture.
 */
function checksFor(pub: PublisherFixture): Array<{
  key: VettingCheckKey;
  status: VettingCheckStatus;
  notes: string | null;
}> {
  const baseline: VettingCheckStatus =
    pub.status === "ACTIVE"
      ? "PASSED"
      : pub.status === "PENDING_VETTING"
        ? "NOT_STARTED"
        : "PASSED";

  return ALL_CHECK_KEYS.map((key) => {
    const override = pub.vetting.checkOverrides?.[key];
    if (override) {
      return {
        key: key as VettingCheckKey,
        status: override.status as VettingCheckStatus,
        notes: override.notes ?? null,
      };
    }

    // A pending publisher has partial progress rather than a blank sheet.
    if (pub.status === "PENDING_VETTING") {
      const started: VettingCheckKeyName[] = [
        "EIN_TAX_ID_VERIFIED",
        "BUSINESS_ENTITY_IN_GOOD_STANDING",
        "LANDING_PAGE_LIVE_CHECK",
      ];
      if (started.includes(key)) {
        return { key: key as VettingCheckKey, status: "PASSED" as VettingCheckStatus, notes: null };
      }
      if (key === "VERBATIM_DISCLOSURE_MATCH") {
        return {
          key: key as VettingCheckKey,
          status: "FAILED" as VettingCheckStatus,
          notes: "Submitted disclosure is a paraphrase; network verbatim text required.",
        };
      }
      if (key === "CONSENT_CAPTURE_SAMPLE_REVIEWED") {
        return {
          key: key as VettingCheckKey,
          status: "IN_REVIEW" as VettingCheckStatus,
          notes: "No TrustedForm sample supplied yet.",
        };
      }
      return { key: key as VettingCheckKey, status: "NOT_STARTED" as VettingCheckStatus, notes: null };
    }

    return { key: key as VettingCheckKey, status: baseline, notes: null };
  });
}

async function seedPublishers(adminUserId: string) {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const created: Array<{ fixture: PublisherFixture; orgId: string }> = [];

  for (const pub of PUBLISHERS) {
    const org = await prisma.organization.create({
      data: {
        name: pub.name,
        type: "PUBLISHER",
        einTaxId: pub.einTaxId,
        website: pub.website,
        status: pub.status,
        contactName: pub.contactName,
        contactEmail: `${pub.key}@${pub.domain}`,
        contactPhone: "+15550142200",
        users: {
          create: {
            email: `${pub.key}@${pub.domain}`,
            passwordHash,
            name: pub.contactName,
            role: "PUBLISHER",
          },
        },
        vettingProfile: {
          create: {
            references: pub.vetting.references as unknown as Prisma.InputJsonValue,
            trafficSources: pub.vetting.trafficSources,
            landingPageUrls: pub.vetting.landingPageUrls,
            consentSampleUrl: pub.vetting.consentSampleUrl,
            disclosureText: pub.vetting.disclosureText,
            agreementSignedAt: pub.vetting.agreementSignedAt
              ? new Date(pub.vetting.agreementSignedAt)
              : null,
            agreementPdfUrl: pub.vetting.agreementPdfUrl,
            testBatchPassed: pub.vetting.testBatchPassed,
            auditNotes: pub.vetting.auditNotes,
            submittedAt: pub.vetting.submittedAt
              ? new Date(pub.vetting.submittedAt)
              : null,
            approvedAt: pub.vetting.approvedAt ? new Date(pub.vetting.approvedAt) : null,
            approvedByUserId: pub.vetting.approvedAt ? adminUserId : null,
          },
        },
        sources: {
          create: pub.sources.map((s) => ({
            sourceId: s.sourceId,
            label: s.label,
            vertical: s.vertical,
            trafficSource: s.trafficSource,
            landingPageUrl: s.landingPageUrl,
            active: s.active ?? true,
          })),
        },
        publisherRates: {
          create: pub.rates.map((r) => ({
            vertical: r.vertical,
            payoutCpl: new Prisma.Decimal(r.payoutCpl),
          })),
        },
      },
      include: { vettingProfile: true },
    });

    if (org.vettingProfile) {
      await prisma.vettingCheck.createMany({
        data: checksFor(pub).map((c) => ({
          profileId: org.vettingProfile!.id,
          key: c.key,
          status: c.status,
          notes: c.notes,
          checkedAt: c.status === "NOT_STARTED" ? null : pub.vetting.submittedAt
            ? new Date(pub.vetting.submittedAt)
            : null,
          checkedByUserId: c.status === "NOT_STARTED" ? null : adminUserId,
        })),
      });
    }

    created.push({ fixture: pub, orgId: org.id });
  }

  log(`${created.length} publishers with vetting profiles + 9-point checklists`);
  return created;
}

async function seedBuyers() {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const campaignIdByKey = new Map<string, string>();

  for (const buyer of BUYERS) {
    const org = await prisma.organization.create({
      data: {
        name: buyer.name,
        type: "BUYER",
        einTaxId: buyer.einTaxId,
        website: buyer.website,
        status: "ACTIVE",
        contactName: buyer.contactName,
        contactEmail: `${buyer.key}@${buyer.domain}`,
        users: {
          create: {
            email: `${buyer.key}@${buyer.domain}`,
            passwordHash,
            name: buyer.contactName,
            role: "BUYER",
          },
        },
      },
    });

    for (const c of buyer.campaigns) {
      const campaign = await prisma.buyerCampaign.create({
        data: {
          name: c.name,
          buyerOrgId: org.id,
          vertical: c.vertical,
          maxCpl: new Prisma.Decimal(c.maxCpl),
          dailyBudget: new Prisma.Decimal(c.dailyBudget),
          dailyCapLeads: c.dailyCapLeads,
          acceptedStates: c.acceptedStates,
          acceptedZips: c.acceptedZips,
          criteriaJson: c.criteriaJson as Prisma.InputJsonValue,
          // Points at this app's own mock buyer endpoint so a live intake demo
          // actually completes an HTTP round trip.
          deliveryWebhookUrl: `${APP_URL}/api/mock/buyer/${c.key}`,
          returnWindowHours: c.returnWindowHours,
          priority: c.priority,
          active: c.active ?? true,
        },
      });
      campaignIdByKey.set(c.key, campaign.id);
    }
  }

  log(`${BUYERS.length} buyers with ${campaignIdByKey.size} campaigns`);
  return campaignIdByKey;
}

async function seedSuppressions() {
  const rng = makeRng(90210);

  // The named roster the generator draws from...
  await prisma.suppressionEntry.createMany({
    data: SEEDED_SUPPRESSIONS.map((s) => ({
      phoneE164: s.phoneE164,
      listType: s.listType,
      stateCode: s.stateCode,
      note: s.note,
    })),
  });

  // ...plus synthetic bulk so the list looks like a real scrub file. These use
  // the 555-08xx block, which the lead generator never produces.
  const bulk: Prisma.SuppressionEntryCreateManyInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 240; i++) {
    const place = rng.pick(PLACES);
    const phone = `+1${place.areaCode}555${String(rng.int(800, 900)).padStart(4, "0")}`;
    const listType = rng.pick(["FEDERAL_DNC", "INTERNAL_DNC", "STATE_DNC"] as const);
    const key = `${phone}|${listType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bulk.push({
      phoneE164: phone,
      listType,
      stateCode: listType === "STATE_DNC" ? place.state : null,
      note: listType === "FEDERAL_DNC" ? "Federal DNC registry match." : null,
    });
  }
  await prisma.suppressionEntry.createMany({ data: bulk, skipDuplicates: true });

  log(`${SEEDED_SUPPRESSIONS.length + bulk.length} suppression entries`);
}

// ---------------------------------------------------------------------------
//  3. Lead history
// ---------------------------------------------------------------------------

/**
 * Mirrors what `attemptDelivery` writes on success, without needing a live
 * buyer endpoint. Occasionally records a failed first attempt followed by a
 * successful retry, so the delivery log shows real backoff behaviour.
 */
async function simulateDelivery(
  leadId: string,
  deliveredAt: Date,
  rng: ReturnType<typeof makeRng>,
) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      sourceId: true,
      campaignId: true,
      payload: true,
      buyerCostAmount: true,
      disputeWindowExpiresAt: true,
      campaign: { select: { deliveryWebhookUrl: true, returnWindowHours: true } },
    },
  });
  if (!lead?.campaignId || !lead.campaign) return;

  const headers = {
    "content-type": "application/json",
    "user-agent": "LeadOS-Delivery/1.0",
    "x-leados-lead-id": lead.id,
    "x-leados-source-id": lead.sourceId,
    "x-leados-received-at": deliveredAt.toISOString(),
  };
  const requestBody = {
    leadId: lead.id,
    sourceId: lead.sourceId,
    payload: lead.payload,
  } as unknown as Prisma.InputJsonValue;

  let attemptNumber = 1;

  // ~7% of deliveries need a retry.
  if (rng.chance(0.07)) {
    await prisma.deliveryAttempt.create({
      data: {
        leadId: lead.id,
        campaignId: lead.campaignId,
        attemptNumber: 1,
        url: lead.campaign.deliveryWebhookUrl,
        requestHeaders: { ...headers, "x-leados-attempt": "1" },
        requestBody,
        status: "FAILED",
        responseStatus: rng.pick([502, 503, 504]),
        responseBody: "upstream temporarily unavailable",
        latencyMs: rng.int(9000, 10001),
        errorLog: "buyer endpoint returned a retryable status",
        nextRetryAt: new Date(deliveredAt.getTime() - 30_000),
        createdAt: new Date(deliveredAt.getTime() - 32_000),
      },
    });
    attemptNumber = 2;
  }

  const latencyMs = rng.int(60, 900);

  await prisma.$transaction([
    prisma.deliveryAttempt.create({
      data: {
        leadId: lead.id,
        campaignId: lead.campaignId,
        attemptNumber,
        url: lead.campaign.deliveryWebhookUrl,
        requestHeaders: { ...headers, "x-leados-attempt": String(attemptNumber) },
        requestBody,
        status: "SUCCESS",
        responseStatus: 200,
        responseBody: JSON.stringify({ accepted: true, buyer_ref: randomUUID() }),
        latencyMs,
        createdAt: deliveredAt,
      },
    }),
    prisma.lead.update({
      where: { id: lead.id },
      data: { pipelineStage: "DELIVERED", deliveredAt },
    }),
    prisma.leadAuditTrail.create({
      data: {
        leadId: lead.id,
        sourceId: lead.sourceId,
        stepNumber: 8,
        stepName: "Delivery & Webhook",
        inputData: {
          url: lead.campaign.deliveryWebhookUrl,
          attempt_number: attemptNumber,
        },
        outputStatus: "PASS",
        outputData: {
          http_status: 200,
          latency_ms: latencyMs,
          retried: attemptNumber > 1,
        },
        executionMs: latencyMs,
        createdAt: deliveredAt,
      },
    }),
  ]);
}

interface SeedLeadStats {
  submitted: number;
  routed: number;
  rejected: number;
  held: number;
}

async function seedLeadHistory(
  publishers: Array<{ fixture: PublisherFixture; orgId: string }>,
): Promise<SeedLeadStats> {
  const rng = makeRng(20260825);
  const stats: SeedLeadStats = { submitted: 0, routed: 0, rejected: 0, held: 0 };

  const suppressionPhones = SEEDED_SUPPRESSIONS.map((s) => s.phoneE164);
  const priorPhones: string[] = [];
  /** leadId -> the publisher that submitted it, for the dispute pass. */
  const delivered: Array<{ leadId: string; publisherKey: string; deliveredAt: Date }> = [];

  const now = new Date();

  for (let dayOffset = DAYS_OF_HISTORY - 1; dayOffset >= 0; dayOffset--) {
    for (const { fixture } of publishers) {
      // Suspended and pending publishers still submit — the pipeline rejects
      // them at step 1, which is exactly what the audit trail should show.
      const volume = Math.max(
        0,
        fixture.quality.dailyVolume + rng.int(-3, 4),
      );

      const weightedSources = fixture.sources.flatMap((s) =>
        Array.from({ length: s.weight }, () => s),
      );

      for (let i = 0; i < volume; i++) {
        const source = rng.pick(weightedSources);

        // Spread submissions across business hours.
        const receivedAt = new Date(now.getTime() - dayOffset * 86400_000);
        receivedAt.setUTCHours(rng.int(13, 24), rng.int(0, 60), rng.int(0, 60), 0);
        if (receivedAt > now) receivedAt.setTime(now.getTime() - rng.int(60_000, 3_600_000));

        const defect: Defect = rollDefect(rng, fixture.quality);
        const generated = generateLead({
          rng,
          vertical: source.vertical,
          defect,
          receivedAt,
          suppressionPhones,
          priorPhones,
        });

        const result = await ingestLead(
          {
            sourceId: source.sourceId,
            payload: generated.payload,
            trustedformCertUrl: generated.trustedformCertUrl,
            jornayaLeadId: generated.jornayaLeadId,
            consentText: generated.consentText,
            ingressIp: generated.ingressIp,
            ingressUserAgent: generated.ingressUserAgent,
            ingressChannel: rng.chance(0.82) ? "API" : "SINGLE_FORM",
          },
          {
            receivedAtUtc: receivedAt,
            deferDelivery: true,
            deferMetrics: true,
          },
        );

        stats.submitted += 1;

        if (result.accepted && result.leadId) {
          stats.routed += 1;
          priorPhones.push(generated.phoneE164);
          if (priorPhones.length > 400) priorPhones.shift();

          // Delivery lands seconds after routing.
          const deliveredAt = new Date(receivedAt.getTime() + rng.int(400, 4000));
          await simulateDelivery(result.leadId, deliveredAt, rng);
          delivered.push({
            leadId: result.leadId,
            publisherKey: fixture.key,
            deliveredAt,
          });
        } else if (result.pipelineStage === "HOLD_QUEUE") {
          stats.held += 1;
        } else {
          stats.rejected += 1;
        }
      }
    }
  }

  // `created_at` defaults to now(); align it with the backdated intake clock so
  // date filters and rolling windows read correctly.
  await prisma.$executeRawUnsafe(`UPDATE "leads" SET "created_at" = "received_at_utc"`);
  await prisma.$executeRawUnsafe(
    `UPDATE "lead_audit_trail" a SET "created_at" = l."received_at_utc" FROM "leads" l WHERE a."lead_id" = l."id" AND a."step_number" < 8`,
  );

  log(
    `${stats.submitted} leads submitted -> ${stats.routed} routed, ${stats.rejected} rejected, ${stats.held} held`,
  );

  await seedDisputesAndSettlement(delivered, rng);
  return stats;
}

/**
 * Walks delivered leads and applies the commercial lifecycle:
 * expired windows auto-settle, a slice get disputed, and most disputes are
 * adjudicated. Recent leads are left inside their window so the buyer portal
 * has live countdown timers to render.
 */
async function seedDisputesAndSettlement(
  delivered: Array<{ leadId: string; publisherKey: string; deliveredAt: Date }>,
  rng: ReturnType<typeof makeRng>,
) {
  const now = new Date();
  const returnRateByPublisher = new Map(
    PUBLISHERS.map((p) => [p.key, p.quality.approvedReturnRate]),
  );

  let disputed = 0;
  let approved = 0;
  let denied = 0;
  let settled = 0;
  let pending = 0;
  let openForQueue = 0;

  for (const d of delivered) {
    const lead = await prisma.lead.findUnique({
      where: { id: d.leadId },
      select: {
        id: true,
        sourceId: true,
        campaignId: true,
        buyerCostAmount: true,
        receivedAtUtc: true,
        disputeWindowExpiresAt: true,
      },
    });
    if (!lead?.disputeWindowExpiresAt) continue;

    const windowOpen = lead.disputeWindowExpiresAt > now;
    const returnRate = returnRateByPublisher.get(d.publisherKey) ?? 0.03;

    // --- Still inside the window: nothing has settled yet ------------------
    if (windowOpen) {
      // A slice is disputed-but-unadjudicated, so the admin queue has work.
      if (rng.chance(returnRate)) {
        const filedAt = new Date(
          d.deliveredAt.getTime() +
            rng.int(600_000, Math.max(600_001, now.getTime() - d.deliveredAt.getTime())),
        );
        await fileSeedDispute(lead, rng.pick(DISPUTE_REASONS), filedAt);
        disputed += 1;
        openForQueue += 1;
      } else {
        pending += 1;
      }
      continue;
    }

    // --- Window has lapsed: this lead's outcome is final -------------------
    //
    // The roll is against the *approved return* rate directly, not against a
    // filing rate that then decays through adjudication. `approvedReturnRate`
    // is what `publisher_metrics.return_rate_14d` measures, so a fixture
    // asking for 22% produces a publisher that measures ~22% — which is what
    // makes the 15% auto-suspension threshold demonstrable rather than a coin
    // flip. Denied returns are layered on top at a fixed fraction so the
    // dispute queue shows both outcomes.
    const roll = rng.next();
    const deniedRate = returnRate * 0.45;

    if (roll < returnRate) {
      await resolveSeedDispute(lead, rng, now, true);
      disputed += 1;
      approved += 1;
    } else if (roll < returnRate + deniedRate) {
      await resolveSeedDispute(lead, rng, now, false);
      disputed += 1;
      denied += 1;
    } else {
      const settledAt = new Date(
        lead.disputeWindowExpiresAt.getTime() + rng.int(1000, 60_000),
      );
      await prisma.$transaction([
        prisma.lead.update({
          where: { id: lead.id },
          data: {
            buyerStatus: "ACCEPTED",
            pipelineStage: "SETTLED",
            settlementStatus: "SETTLED_PAYABLE",
            settledAt,
          },
        }),
        prisma.leadAuditTrail.create({
          data: {
            leadId: lead.id,
            sourceId: lead.sourceId,
            stepNumber: 10,
            stepName: "Settlement",
            inputData: { trigger: "DISPUTE_WINDOW_LAPSED" },
            outputStatus: "PASS",
            outputData: {
              settled_at: settledAt.toISOString(),
              settlement_status: "SETTLED_PAYABLE",
            },
            executionMs: 0,
            createdAt: settledAt,
          },
        }),
      ]);
      settled += 1;
    }
  }

  log(
    `commercial lifecycle: ${settled} auto-settled, ${pending} awaiting window, ${disputed} disputed (${approved} returns approved / ${denied} denied / ${openForQueue} still open)`,
  );
}

type SeedLead = {
  id: string;
  sourceId: string;
  campaignId: string | null;
  buyerCostAmount: Prisma.Decimal | null;
  receivedAtUtc: Date;
  disputeWindowExpiresAt: Date | null;
};

/** Writes the DISPUTED transition and its step 9 audit row. */
async function fileSeedDispute(
  lead: SeedLead,
  reasonCode: DisputeReasonCode,
  filedAt: Date,
) {
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        buyerStatus: "DISPUTED",
        pipelineStage: "DISPUTED",
        disputeReasonCode: reasonCode,
        disputedAt: filedAt,
      },
    }),
    prisma.leadAuditTrail.create({
      data: {
        leadId: lead.id,
        sourceId: lead.sourceId,
        stepNumber: 9,
        stepName: "Dispute Filed",
        inputData: { reason_code: reasonCode },
        outputStatus: "PASS",
        outputData: {
          filed_at: filedAt.toISOString(),
          window_expires_at: lead.disputeWindowExpiresAt?.toISOString() ?? null,
        },
        executionMs: 0,
        createdAt: filedAt,
      },
    }),
  ]);
}

/** Files a dispute and adjudicates it, mirroring `resolveDispute`. */
async function resolveSeedDispute(
  lead: SeedLead,
  rng: ReturnType<typeof makeRng>,
  now: Date,
  approve: boolean,
) {
  const reasonCode = rng.pick(DISPUTE_REASONS);
  const windowEnd = lead.disputeWindowExpiresAt!.getTime();

  // Filed inside the window, adjudicated after it — but never in the future.
  const filedAt = new Date(
    Math.min(windowEnd - 60_000, lead.receivedAtUtc.getTime() + rng.int(3_600_000, 72_000_000)),
  );
  await fileSeedDispute(lead, reasonCode, filedAt);

  const resolvedAt = new Date(
    Math.min(
      now.getTime() - rng.int(60_000, 3_600_000),
      Math.max(filedAt.getTime() + 3_600_000, windowEnd + rng.int(1000, 86_400_000)),
    ),
  );

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        buyerStatus: approve ? "RETURN_APPROVED" : "RETURN_DENIED",
        pipelineStage: approve ? "SETTLED" : "ACCEPTED",
        settlementStatus: approve ? "CLAWED_BACK" : "SETTLED_PAYABLE",
        settledAt: resolvedAt,
        disputeResolvedAt: resolvedAt,
        ...(approve ? { publisherPayoutAmount: new Prisma.Decimal(0) } : {}),
      },
    }),
    prisma.leadAuditTrail.create({
      data: {
        leadId: lead.id,
        sourceId: lead.sourceId,
        stepNumber: 10,
        stepName: "Dispute Adjudicated",
        inputData: { dispute_reason_code: reasonCode },
        outputStatus: "PASS",
        outputData: {
          decision: approve ? "RETURN_APPROVED" : "RETURN_DENIED",
          publisher_payout_voided: approve,
        },
        executionMs: 0,
        createdAt: resolvedAt,
      },
    }),
    ...(approve && lead.campaignId
      ? [
          prisma.campaignDailyStat.updateMany({
            where: {
              campaignId: lead.campaignId,
              statDate: new Date(
                Date.UTC(
                  lead.receivedAtUtc.getUTCFullYear(),
                  lead.receivedAtUtc.getUTCMonth(),
                  lead.receivedAtUtc.getUTCDate(),
                ),
              ),
            },
            data: { leadsReturned: { increment: 1 } },
          }),
        ]
      : []),
  ]);
}

// ---------------------------------------------------------------------------
//  4. CSV batch history
// ---------------------------------------------------------------------------

async function seedCsvBatches(
  publishers: Array<{ fixture: PublisherFixture; orgId: string }>,
) {
  const rng = makeRng(4242);
  const active = publishers.filter((p) => p.fixture.status === "ACTIVE");
  let count = 0;

  for (const { fixture, orgId } of active) {
    const user = await prisma.user.findFirst({
      where: { orgId },
      select: { id: true },
    });
    if (!user) continue;

    for (let i = 0; i < 3; i++) {
      const createdAt = new Date(Date.now() - rng.int(1, 28) * 86400_000);
      const rowCount = rng.int(120, 900);
      const rejectedCount = Math.round(rowCount * (0.04 + rng.next() * 0.14));

      // One deliberately fraudulent batch on the low-quality publisher, so the
      // pre-flight heuristics have something real to display.
      const isFraud = fixture.key === "bluepeak" && i === 0;

      await prisma.csvBatch.create({
        data: {
          publisherOrgId: orgId,
          uploadedByUserId: user.id,
          filename: `${fixture.key}-${fixture.sources[0].vertical.toLowerCase()}-${createdAt
            .toISOString()
            .slice(0, 10)}.csv`,
          storageUrl: `s3://leados-batches/${orgId}/${randomUUID()}.csv`,
          status: isFraud ? "VALIDATION_FAILED" : "COMPLETED",
          rowCount,
          acceptedCount: isFraud ? 0 : rowCount - rejectedCount,
          rejectedCount: isFraud ? rowCount : rejectedCount,
          integrityFlags: isFraud
            ? ["SEQUENTIAL_PHONE_PATTERN", "DUPLICATE_IP_CLUSTER", "UNIFORM_TIMESTAMPS"]
            : [],
          integrityDetail: isFraud
            ? {
                SEQUENTIAL_PHONE_PATTERN: {
                  longest_run: 47,
                  example: ["+16025550310", "+16025550311", "+16025550312"],
                },
                DUPLICATE_IP_CLUSTER: {
                  distinct_ips: 3,
                  rows: rowCount,
                  top_ip: makeIp(rng),
                },
                UNIFORM_TIMESTAMPS: {
                  distinct_second_values: 2,
                  note: "Every row submitted within a 4-second span.",
                },
              }
            : {},
          createdAt,
          completedAt: new Date(createdAt.getTime() + rng.int(4000, 90_000)),
        },
      });
      count += 1;
    }
  }

  log(`${count} CSV batch records (1 flagged as fraudulent)`);
}

// ---------------------------------------------------------------------------
//  5. Buyer sales outcomes (B9)
// ---------------------------------------------------------------------------

/** Roughly realistic spread across a buyer's own sales pipeline. */
const OUTCOME_WEIGHTS: Array<{ outcome: LeadOutcome; weight: number }> = [
  { outcome: "NOT_WORKED", weight: 0.15 },
  { outcome: "NO_CONTACT", weight: 0.2 },
  { outcome: "CONTACTED", weight: 0.25 },
  { outcome: "APPOINTMENT_SET", weight: 0.15 },
  { outcome: "QUOTED", weight: 0.1 },
  { outcome: "SOLD", weight: 0.1 },
  { outcome: "CLOSED_LOST", weight: 0.05 },
];

function rollOutcome(rng: Rng): LeadOutcome {
  const total = OUTCOME_WEIGHTS.reduce((sum, o) => sum + o.weight, 0);
  let roll = rng.next() * total;
  for (const { outcome, weight } of OUTCOME_WEIGHTS) {
    if (roll < weight) return outcome;
    roll -= weight;
  }
  return OUTCOME_WEIGHTS[OUTCOME_WEIGHTS.length - 1].outcome;
}

/**
 * Buyer-private and entirely separate from the compliance waterfall, so
 * unlike leads themselves this is written directly rather than through
 * `ingestLead` — there's no pipeline step to replay. Only leads the buyer
 * actually kept (ACCEPTED / RETURN_DENIED) get an outcome; a returned lead
 * was never theirs to work.
 */
async function seedBuyerOutcomes() {
  const rng = makeRng(90909);

  const kept = await prisma.lead.findMany({
    where: { buyerOrgId: { not: null }, buyerStatus: { in: ["ACCEPTED", "RETURN_DENIED"] } },
    select: { id: true, deliveredAt: true },
  });

  let sold = 0;
  const CHUNK = 25;
  for (let i = 0; i < kept.length; i += CHUNK) {
    const batch = kept.slice(i, i + CHUNK);
    await Promise.all(
      batch.map((lead) => {
        const outcome = rollOutcome(rng);
        if (outcome === "SOLD") sold += 1;
        const deliveredAt = lead.deliveredAt ?? new Date();
        return prisma.lead.update({
          where: { id: lead.id },
          data: {
            outcome,
            outcomeUpdatedAt: new Date(deliveredAt.getTime() + rng.int(1, 96) * 3_600_000),
            outcomeValueAmount:
              outcome === "SOLD" ? new Prisma.Decimal(rng.int(400, 3200)) : null,
          },
        });
      }),
    );
  }

  log(`${kept.length} leads given a buyer outcome (${sold} marked sold)`);
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------

async function main() {
  process.stdout.write("\nSeeding LeadOS demo network\n\n");

  await reset();

  const internalOrg = await seedInternal();
  const admin = await prisma.user.findFirstOrThrow({
    where: { orgId: internalOrg.id },
    select: { id: true },
  });

  const publishers = await seedPublishers(admin.id);
  await seedBuyers();
  await seedSuppressions();
  await seedLeadHistory(publishers);
  await seedCsvBatches(publishers);
  await seedBuyerOutcomes();

  const suspended = await recomputeAllPublisherMetrics();
  log(`recomputed metrics for ${suspended} publishers`);

  const autoSuspended = await prisma.organization.findMany({
    where: { type: "PUBLISHER", status: "SUSPENDED" },
    select: { name: true, metrics: { select: { returnRate14d: true } } },
  });
  for (const s of autoSuspended) {
    log(
      `SUSPENDED: ${s.name} (14d return rate ${((s.metrics?.returnRate14d ?? 0) * 100).toFixed(1)}%)`,
    );
  }

  process.stdout.write("\n  Sign in with any of:\n");
  process.stdout.write(`    admin@leados.example            (SUPER_ADMIN)\n`);
  for (const p of PUBLISHERS) {
    process.stdout.write(`    ${`${p.key}@${p.domain}`.padEnd(32)}(PUBLISHER — ${p.status})\n`);
  }
  for (const b of BUYERS) {
    process.stdout.write(`    ${`${b.key}@${b.domain}`.padEnd(32)}(BUYER)\n`);
  }
  process.stdout.write(`\n  Password for every account: ${DEFAULT_PASSWORD}\n\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
