import type { Metadata } from "next";
import { Prisma, type Vertical } from "@prisma/client";
import { CircleDollarSign, PhoneCall, Target, TrendingUp } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/domain/stat-tile";
import { requireBuyer } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { verticalLabel } from "@/lib/domain/labels";
import { count, money, percent, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Performance" };

/** Minimum outcomes set before "best hours/states" guidance is trustworthy enough to show. */
const MIN_OUTCOMES_FOR_GUIDANCE = 30;
/** Minimum sample size within a single hour/state bucket before its rate counts toward guidance. */
const MIN_BUCKET_SAMPLE = 3;

interface BreakdownRow {
  key: string | number | Date | null;
  delivered: bigint;
  contacted: bigint;
  sold: bigint;
  spend: Prisma.Decimal | null;
}

function rate(numerator: bigint, denominator: bigint): number | null {
  return denominator === BigInt(0) ? null : Number(numerator) / Number(denominator);
}

function costPerSale(spend: Prisma.Decimal | null, sold: bigint): number | null {
  const s = Number(spend ?? 0);
  return sold === BigInt(0) ? null : s / Number(sold);
}

async function loadPerformance(orgId: string) {
  // "Contacted or better" — every outcome except the two that mean the buyer
  // never actually reached the consumer. NULL (never set) is excluded by
  // Postgres's NOT IN semantics without a separate IS NOT NULL check.
  const [headlineRows, byCampaign, byState, byVertical, byHour, byWeek] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        delivered: bigint;
        withOutcome: bigint;
        contacted: bigint;
        sold: bigint;
        spend: Prisma.Decimal | null;
      }>
    >`
      SELECT
        COUNT(*) AS delivered,
        COUNT(*) FILTER (WHERE "outcome" IS NOT NULL) AS "withOutcome",
        COUNT(*) FILTER (WHERE "outcome" NOT IN ('NOT_WORKED', 'NO_CONTACT')) AS contacted,
        COUNT(*) FILTER (WHERE "outcome" = 'SOLD') AS sold,
        COALESCE(SUM("buyer_cost_amount"), 0) AS spend
      FROM "leads"
      WHERE "buyer_org_id" = ${orgId} AND "delivered_at" IS NOT NULL
    `,
    prisma.$queryRaw<BreakdownRow[]>`
      SELECT
        bc.name AS key,
        COUNT(l.id) AS delivered,
        COUNT(*) FILTER (WHERE l."outcome" NOT IN ('NOT_WORKED', 'NO_CONTACT')) AS contacted,
        COUNT(*) FILTER (WHERE l."outcome" = 'SOLD') AS sold,
        COALESCE(SUM(l."buyer_cost_amount"), 0) AS spend
      FROM "leads" l
      LEFT JOIN "buyer_campaigns" bc ON bc.id = l."campaign_id"
      WHERE l."buyer_org_id" = ${orgId} AND l."delivered_at" IS NOT NULL
      GROUP BY bc.name
      ORDER BY delivered DESC
    `,
    prisma.$queryRaw<BreakdownRow[]>`
      SELECT
        l."contact_state" AS key,
        COUNT(*) AS delivered,
        COUNT(*) FILTER (WHERE l."outcome" NOT IN ('NOT_WORKED', 'NO_CONTACT')) AS contacted,
        COUNT(*) FILTER (WHERE l."outcome" = 'SOLD') AS sold,
        COALESCE(SUM(l."buyer_cost_amount"), 0) AS spend
      FROM "leads" l
      WHERE l."buyer_org_id" = ${orgId} AND l."delivered_at" IS NOT NULL AND l."contact_state" IS NOT NULL
      GROUP BY l."contact_state"
      ORDER BY delivered DESC
    `,
    prisma.$queryRaw<BreakdownRow[]>`
      SELECT
        l."vertical" AS key,
        COUNT(*) AS delivered,
        COUNT(*) FILTER (WHERE l."outcome" NOT IN ('NOT_WORKED', 'NO_CONTACT')) AS contacted,
        COUNT(*) FILTER (WHERE l."outcome" = 'SOLD') AS sold,
        COALESCE(SUM(l."buyer_cost_amount"), 0) AS spend
      FROM "leads" l
      WHERE l."buyer_org_id" = ${orgId} AND l."delivered_at" IS NOT NULL
      GROUP BY l."vertical"
      ORDER BY delivered DESC
    `,
    // delivered_at is stored as a naive UTC timestamp (Rule 2) — EXTRACT
    // reads its wall-clock hour directly, no zone conversion needed.
    prisma.$queryRaw<BreakdownRow[]>`
      SELECT
        EXTRACT(HOUR FROM l."delivered_at")::int AS key,
        COUNT(*) AS delivered,
        COUNT(*) FILTER (WHERE l."outcome" NOT IN ('NOT_WORKED', 'NO_CONTACT')) AS contacted,
        COUNT(*) FILTER (WHERE l."outcome" = 'SOLD') AS sold,
        COALESCE(SUM(l."buyer_cost_amount"), 0) AS spend
      FROM "leads" l
      WHERE l."buyer_org_id" = ${orgId} AND l."delivered_at" IS NOT NULL
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<BreakdownRow[]>`
      SELECT
        date_trunc('week', l."delivered_at") AS key,
        COUNT(*) AS delivered,
        COUNT(*) FILTER (WHERE l."outcome" NOT IN ('NOT_WORKED', 'NO_CONTACT')) AS contacted,
        COUNT(*) FILTER (WHERE l."outcome" = 'SOLD') AS sold,
        COALESCE(SUM(l."buyer_cost_amount"), 0) AS spend
      FROM "leads" l
      WHERE l."buyer_org_id" = ${orgId} AND l."delivered_at" IS NOT NULL
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 12
    `,
  ]);

  const headline = headlineRows[0];

  return { headline, byCampaign, byState, byVertical, byHour, byWeek };
}

function BreakdownTable({
  title,
  subtitle,
  rows,
  keyLabel,
  formatKey,
}: {
  title: string;
  subtitle?: string;
  rows: BreakdownRow[];
  keyLabel: string;
  formatKey: (key: BreakdownRow["key"]) => string;
}) {
  return (
    <Panel>
      <PanelHeader title={title} subtitle={subtitle} />
      <PanelBody dense>
        {rows.length === 0 ? (
          <EmptyState title="No delivered leads yet" />
        ) : (
          <div className="grid-scroll">
            <table className="w-full text-left">
              <thead className="border-b border-line bg-inset">
                <tr>
                  {[keyLabel, "Delivered", "Contact rate", "Sale rate", "Cost / sale"].map((h) => (
                    <th
                      key={h}
                      className="px-3.5 py-2.5 text-micro font-semibold tracking-[0.08em] text-faint uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3.5 py-2.5 text-body text-ink">{formatKey(r.key)}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-meta text-ink tabular">
                      {count(Number(r.delivered))}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-meta text-muted tabular">
                      {percent(rate(r.contacted, r.delivered), 0)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-meta text-muted tabular">
                      {percent(rate(r.sold, r.delivered), 0)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-body text-ink tabular">
                      {money(costPerSale(r.spend, r.sold))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

export default async function BuyerPerformancePage() {
  const user = await requireBuyer();
  const { headline, byCampaign, byState, byVertical, byHour, byWeek } = await loadPerformance(
    user.orgId,
  );

  const delivered = Number(headline?.delivered ?? 0);
  const sold = Number(headline?.sold ?? 0);
  const contacted = Number(headline?.contacted ?? 0);
  const withOutcome = Number(headline?.withOutcome ?? 0);
  const spend = Number(headline?.spend ?? 0);
  const guidanceReady = withOutcome >= MIN_OUTCOMES_FOR_GUIDANCE;

  const bestHours = guidanceReady
    ? byHour
        .filter((r) => Number(r.delivered) >= MIN_BUCKET_SAMPLE)
        .map((r) => ({ key: r.key as number, rate: rate(r.sold, r.delivered) ?? 0 }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 3)
    : [];
  const bestStates = guidanceReady
    ? byState
        .filter((r) => Number(r.delivered) >= MIN_BUCKET_SAMPLE)
        .map((r) => ({ key: r.key as string, rate: rate(r.sold, r.delivered) ?? 0 }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 3)
    : [];

  return (
    <>
      <Topbar
        user={user}
        title="Performance"
        subtitle="Your outcomes, not the network's — cost per sale and where your best leads come from."
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 xl:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Cost per sale"
            value={money(costPerSale(headline?.spend ?? null, headline?.sold ?? BigInt(0)))}
            icon={<CircleDollarSign />}
            size="hero"
            sub={`${count(sold)} sold of ${count(delivered)} delivered`}
          />
          <StatTile
            label="Contact rate"
            value={percent(rate(headline?.contacted ?? BigInt(0), headline?.delivered ?? BigInt(0)), 1)}
            icon={<PhoneCall />}
            sub={`${count(contacted)} contacted or further`}
          />
          <StatTile
            label="Sale rate"
            value={percent(rate(headline?.sold ?? BigInt(0), headline?.delivered ?? BigInt(0)), 1)}
            icon={<Target />}
            sub={`${count(sold)} of ${count(delivered)}`}
          />
          <StatTile
            label="Effective CPL"
            value={money(delivered === 0 ? null : spend / delivered)}
            icon={<TrendingUp />}
            sub="all delivered leads"
          />
        </div>

        {!guidanceReady ? (
          <Panel>
            <PanelBody>
              <p className="text-body text-muted">
                Set an outcome on {count(MIN_OUTCOMES_FOR_GUIDANCE - withOutcome)} more lead
                {MIN_OUTCOMES_FOR_GUIDANCE - withOutcome === 1 ? "" : "s"} ({count(withOutcome)} of{" "}
                {count(MIN_OUTCOMES_FOR_GUIDANCE)} so far) to unlock best-performing hours and
                states — a sample this small isn&apos;t reliable pacing guidance yet.
              </p>
            </PanelBody>
          </Panel>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Your best-performing hours"
                subtitle="By sale rate, delivery hour (UTC), minimum 3 leads."
              />
              <PanelBody>
                {bestHours.length === 0 ? (
                  <EmptyState title="Not enough volume in any single hour yet" />
                ) : (
                  <ul className="space-y-2">
                    {bestHours.map((h) => (
                      <li key={h.key} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-body text-ink tabular">
                          {String(h.key).padStart(2, "0")}:00–{String(h.key).padStart(2, "0")}:59 UTC
                        </span>
                        <span className="font-mono text-body text-success tabular">
                          {percent(h.rate, 0)} sale rate
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader
                title="Your best-performing states"
                subtitle="By sale rate, minimum 3 leads."
              />
              <PanelBody>
                {bestStates.length === 0 ? (
                  <EmptyState title="Not enough volume in any single state yet" />
                ) : (
                  <ul className="space-y-2">
                    {bestStates.map((s) => (
                      <li key={s.key} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-body text-ink tabular">{s.key}</span>
                        <span className="font-mono text-body text-success tabular">
                          {percent(s.rate, 0)} sale rate
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </PanelBody>
            </Panel>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <BreakdownTable
            title="By campaign"
            rows={byCampaign}
            keyLabel="Campaign"
            formatKey={(k) => (k as string | null) ?? "—"}
          />
          <BreakdownTable
            title="By vertical"
            rows={byVertical}
            keyLabel="Vertical"
            formatKey={(k) => verticalLabel(k as Vertical)}
          />
          <BreakdownTable
            title="By state"
            rows={byState}
            keyLabel="State"
            formatKey={(k) => (k as string | null) ?? "—"}
          />
          <BreakdownTable
            title="By hour of delivery"
            subtitle="UTC"
            rows={byHour}
            keyLabel="Hour"
            formatKey={(k) => `${String(k).padStart(2, "0")}:00`}
          />
        </div>

        <Panel>
          <PanelHeader title="Cohort by delivery week" subtitle="Last 12 weeks, week starting Monday (UTC)." />
          <PanelBody dense>
            {byWeek.length === 0 ? (
              <EmptyState title="No delivered leads yet" />
            ) : (
              <div className="grid-scroll">
                <table className="w-full text-left">
                  <thead className="border-b border-line bg-inset">
                    <tr>
                      {["Week of", "Delivered", "Contact rate", "Sale rate", "Cost / sale"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-3.5 py-2.5 text-micro font-semibold tracking-[0.08em] text-faint uppercase"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {byWeek.map((r, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="px-3.5 py-2.5 font-mono text-body text-ink">
                          {shortDate(r.key as Date)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-meta text-ink tabular">
                          {count(Number(r.delivered))}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-meta text-muted tabular">
                          {percent(rate(r.contacted, r.delivered), 0)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-meta text-muted tabular">
                          {percent(rate(r.sold, r.delivered), 0)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-body text-ink tabular">
                          {money(costPerSale(r.spend, r.sold))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
