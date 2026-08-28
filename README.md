# LeadOS

Lead intake, distribution and publisher vetting, built compliance-first.

Every lead walks a deterministic six-step waterfall before any buyer sees it.
Dedup, DNC/litigator scrub and consent verification are not checks a reviewer
has to remember to run — a lead that skipped them **cannot reach the routing
engine, because it does not type-check**.

---

## Stack

| Layer     | Choice                                                        |
| --------- | ------------------------------------------------------------- |
| Framework | Next.js 16 (App Router), React 19, TypeScript                 |
| Styling   | Tailwind CSS v4, Radix primitives, Lucide icons               |
| Tables    | TanStack Table v9                                             |
| Data      | PostgreSQL 14+ via Prisma 7 (`@prisma/adapter-pg` driver)     |
| Auth      | Cookie sessions, scrypt password hashing, role-scoped queries |

---

## Getting started

```bash
npm install
cp .env.example .env          # point DATABASE_URL at a PostgreSQL instance
npm run db:migrate            # apply prisma/migrations
npm run db:seed               # ~30 days of synthetic network history
npm run dev
```

Sign in at `/login`. Every seeded account uses the password `Passw0rd!`:

| Account                              | Role        | State                          |
| ------------------------------------ | ----------- | ------------------------------ |
| `admin@leados.example`               | SUPER_ADMIN | Full network control           |
| `apex@apexdigitalmedia.example`      | PUBLISHER   | Active, healthy                |
| `northgate@northgateperf.example`    | PUBLISHER   | Active, healthy                |
| `bluepeak@bluepeakinteractive.example` | PUBLISHER | Auto-suspended on return rate  |
| `meridian@meridianleadgroup.example` | PUBLISHER   | Pending vetting                |
| `redline@redlinetraffic.example`     | PUBLISHER   | Suspended (failed vetting)     |
| `statewide@statewidemutual.example`  | BUYER       | Auto insurance                 |
| `helios@heliossolar.example`         | BUYER       | Solar                          |
| `summit@summithealthadvisors.example` | BUYER      | Medicare                       |
| `cornerstone@cornerstonehome.example` | BUYER      | Home improvement               |
| `vertex@vertexlending.example`       | BUYER       | Personal loan                  |

The seed does not fabricate audit rows — it pushes every lead through the real
waterfall, so the trails you see carry genuine step timings, genuine scrub
payloads and genuine routing decisions.

---

## The ingest waterfall

```
1 Intake ─▶ 2 Validate ─▶ 3 Dedup ─▶ 4 DNC/Litigator ─▶ 5 Consent
  ─▶ 6 Qualify ─▶ 7 Route ─▶ 8 Deliver ─▶ 9 Dispute window ─▶ 10 Settle
```

| Step | Module                            | Halts with                                    |
| ---- | --------------------------------- | --------------------------------------------- |
| 1    | `pipeline/steps/step1-intake.ts`  | `UNKNOWN_SOURCE_ID`, `PUBLISHER_SUSPENDED`, … |
| 2    | `pipeline/steps/step2-validate.ts`| `INVALID_PHONE_FORMAT`, `NON_US_PHONE`, …     |
| 3    | `pipeline/steps/step3-dedup.ts`   | `DUPLICATE_INTRA_PUBLISHER` / `_CROSS_`       |
| 4    | `pipeline/steps/step4-scrub.ts`   | `DNC_FEDERAL_MATCH`, `TCPA_LITIGATOR_MATCH`, … |
| 5    | `pipeline/steps/step5-consent.ts` | **HOLD**, never discard                       |
| 6    | `pipeline/steps/step6-qualify.ts` | `OUT_OF_GEOGRAPHY`, `AGE_OUT_OF_RANGE`, …     |
| 7    | `pipeline/steps/step7-route.ts`   | `ALL_CAMPAIGNS_CAPPED`, `DAILY_BUDGET_EXHAUSTED` |
| 8    | `webhooks/dispatcher.ts`          | Exponential backoff, then capacity release    |
| 9/10 | `pipeline/settlement.ts`          | Auto-settles when the window lapses           |

`ingest.ts` orchestrates them; `finalizeHalt` is the single exit path for every
rejection, so a lead is never observable in a half-rejected state.

### How Rule 3 is enforced

> *"It must be structurally impossible for the code to invoke Step 7 if Step 3
> or Step 4 return a failure state."*

Each step returns a **branded context** minted by a module-private symbol:

```ts
declare const scrubBrand: unique symbol;          // step4-scrub.ts, not exported
export interface ScrubClearedContext {
  readonly [scrubBrand]: true;
  …
}
```

`runRouting` accepts only a `QualifiedContext`, which only step 6 can produce,
which accepts only a `ConsentVerifiedContext`, and so on back to step 3. Calling
the routing engine with an unscrubbed lead is not an error review has to catch —
it fails to compile.

### Other structural rules

- **Enum-only reasons.** Every rejection and dispute is a Prisma enum. Human
  labels live in `lib/domain/labels.ts`; no free-text error string is ever
  written to the database or returned to a publisher.
- **Source ID immutability.** `source_id` and the raw UTC receipt timestamp are
  copied verbatim into `leads`, every `lead_audit_trail` row, every webhook
  header (`x-leados-source-id`, `x-leados-received-at`), and the first two
  columns of every CSV export.
- **Never fail open.** A scrub provider outage produces `SCRUB_PROVIDER_ERROR`
  and halts. A consent provider outage parks the lead in `HOLD_QUEUE`. Neither
  is ever treated as a pass.

---

## Modules

| Route                        | What it does                                                        |
| ---------------------------- | ------------------------------------------------------------------- |
| `/admin/leads`               | Master stream, server-side filters, row → full audit-trail drawer   |
| `/admin/publishers/vetting`  | 9-point checklist queue, per-point decisions and evidence           |
| `/admin/publishers/[id]`     | Vetting wizard, status overrides, return-rate rings                 |
| `/admin/disputes`            | Adjudication queue with the money at stake on both sides            |
| `/publisher/upload`          | Streaming CSV parse + file-level fraud screening                    |
| `/publisher/leads`           | Own stream; buyer identity and network revenue hidden               |
| `/buyer/leads`               | Delivery queue with live return-window countdowns                   |
| `/buyer/campaigns`           | Criteria the step 6 qualifier reads verbatim                        |

---

## Compliance adapters

Third-party checks sit behind interfaces in `lib/adapters/`. Defaults are
offline mocks, so a fresh checkout runs the full waterfall with no credentials.

```bash
DNC_PROVIDER=http      DNC_ENDPOINT=…  DNC_API_KEY=…
CONSENT_PROVIDER=http  TRUSTEDFORM_API_KEY=…
```

The mock DNC adapter reads the local `suppression_entries` table, so seeding a
number onto a list makes every subsequent lead carrying it reject deterministically.

---

## Auto-suspension

`lib/metrics/publisher-metrics.ts` recomputes rolling 7/14/30-day return rates.
A publisher at or above a **15% rolling 14-day return rate** is suspended
automatically, notified, and logged to the admin audit trail.

The rule carries a **minimum volume floor of 20 delivered leads in the window**.
Without it the rule is unusable in practice: a publisher's first delivered lead
being returned reads as a 100% return rate and terminates a relationship on a
sample size of one. Both constants are exported and adjustable.

Reinstating a publisher clears the latch, otherwise the next recompute would
immediately re-suspend on the same stale trigger.

---

## Scheduled jobs

Declared in `vercel.json`, guarded by `CRON_SECRET` (or Vercel's own
`x-vercel-cron` header).

**Current deployment is on the Vercel Hobby plan**, which allows 2 cron jobs at
a *daily* cadence, so the schedule is trimmed to fit:

| Endpoint               | Cadence     | Purpose                            |
| ---------------------- | ----------- | ---------------------------------- |
| `/api/cron/settle`     | daily 03:00 | Auto-settle lapsed dispute windows |
| `/api/cron/deliveries` | daily 04:00 | Drain the webhook retry queue      |

What this costs, stated plainly:

- **Settlement lags.** A return window that closes at 09:00 is not marked
  `SETTLED` until 03:00 the next day. This is bookkeeping lag only — it cannot
  produce a wrong outcome, because `fileDispute` independently rejects anything
  past `disputeWindowExpiresAt` with `WINDOW_EXPIRED`, and the buyer portal's
  countdown reads the same field. A buyer can never dispute a lapsed lead just
  because the settler has not run yet.
- **Delivery retries are slow.** A buyer endpoint that is down gets retried once
  a day rather than on the exponential backoff the dispatcher computes. The
  backoff schedule is still written to `delivery_attempts.next_retry_at`; the
  cron simply visits it less often.
- **`/api/cron/metrics` is not scheduled at all.** It is a backstop, not the
  primary path — `recomputePublisherMetrics` already runs inline after every
  ingest and every settlement, so return rates and the auto-suspension trigger
  stay current without it. Trigger it by hand any time:

  ```bash
  curl -X POST https://<deployment>/api/cron/metrics     -H "Authorization: Bearer $CRON_SECRET"
  ```

On Pro, restore the tighter schedule — every 10 minutes for deliveries, hourly
for settlement, daily for metrics. All three endpoints are idempotent, so
changing cadence is safe in either direction.

## Posting API

```http
POST /api/intake
{
  "source_id": "APEX-AUTO-PS-001",
  "trustedform_cert_url": "https://cert.trustedform.com/<40 hex chars>",
  "consent_text": "…the verbatim disclosure the consumer accepted…",
  "payload": { "first_name": "Jane", "phone": "+16025550142", … }
}
```

Returns the same shape whether accepted or not, with an enum `reason_code` and
the per-step timing breakdown. `200` routed, `202` held, `422` rejected,
`401` unresolvable Source ID.

Seeded campaigns deliver to `/api/mock/buyer/<campaign>`, a working reference
implementation that verifies the `x-leados-signature` HMAC.

---

## Commands

```bash
npm run dev          # dev server
npm run build        # prisma generate + next build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run db:migrate   # prisma migrate deploy
npm run db:seed      # reseed (truncates first)
npm run db:studio    # prisma studio
```

---

## Not built

Scoped out of this v1, and where they would attach:

- **Ping-post routing (v2).** Step 7 already scores every eligible campaign and
  returns a ranked candidate list; a ping-post auction replaces the selection
  rule inside `runRouting` without touching steps 1–6.
- **S3 storage.** `S3_*` env vars are defined and agreement/batch URLs are
  stored, but uploads currently record a URI rather than streaming bytes.
- **Automated tests.** No test runner is installed. The pure layers
  (`normalize.ts`, `criteria.ts`, `csv-batch.ts`) were written free of I/O
  specifically so they can be unit-tested without a database.
- **Real-time push.** The lead stream is server-rendered per request rather than
  streamed over a socket.
