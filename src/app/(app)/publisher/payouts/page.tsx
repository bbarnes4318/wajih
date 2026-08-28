import type { Metadata } from "next";
import { CircleDollarSign, TriangleAlert, Wallet } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/domain/stat-tile";
import {
  DisputeReasonChip,
  SettlementChip,
} from "@/components/domain/status-chip";
import { requirePublisher } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { count, money, shortDate, utcTimestamp } from "@/lib/format";
import { verticalLabel } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "Payouts" };

/**
 * Publisher earnings.
 *
 * Splits payable from clawed-back rather than showing a single net figure —
 * a publisher arguing a return needs to see exactly which leads were reversed
 * and on what enum reason.
 */
export default async function PublisherPayoutsPage() {
  const user = await requirePublisher();
  const orgId = user.orgId;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [payable, pending, clawedBack, monthToDate, rates, recentClawbacks, byVertical] =
    await Promise.all([
      prisma.lead.aggregate({
        where: { publisherOrgId: orgId, settlementStatus: "SETTLED_PAYABLE" },
        _sum: { publisherPayoutAmount: true },
        _count: { _all: true },
      }),
      prisma.lead.aggregate({
        where: {
          publisherOrgId: orgId,
          settlementStatus: "UNSETTLED",
          deliveredAt: { not: null },
        },
        _sum: { publisherPayoutAmount: true },
        _count: { _all: true },
      }),
      prisma.lead.aggregate({
        where: { publisherOrgId: orgId, settlementStatus: "CLAWED_BACK" },
        _sum: { buyerCostAmount: true },
        _count: { _all: true },
      }),
      prisma.lead.aggregate({
        where: {
          publisherOrgId: orgId,
          settledAt: { gte: monthStart },
          settlementStatus: "SETTLED_PAYABLE",
        },
        _sum: { publisherPayoutAmount: true },
      }),
      prisma.publisherRate.findMany({
        where: { publisherOrgId: orgId },
        orderBy: { vertical: "asc" },
      }),
      prisma.lead.findMany({
        where: { publisherOrgId: orgId, settlementStatus: "CLAWED_BACK" },
        orderBy: { settledAt: "desc" },
        take: 20,
        select: {
          id: true,
          sourceId: true,
          vertical: true,
          contactFirstName: true,
          contactLastName: true,
          disputeReasonCode: true,
          settledAt: true,
          deliveredAt: true,
        },
      }),
      prisma.lead.groupBy({
        by: ["vertical"],
        where: { publisherOrgId: orgId, settlementStatus: "SETTLED_PAYABLE" },
        _sum: { publisherPayoutAmount: true },
        _count: { _all: true },
      }),
    ]);

  return (
    <>
      <Topbar
        user={user}
        title="Payouts"
        subtitle="Earnings by settlement state. A lead is payable once its return window closes."
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Payable"
            value={money(payable._sum.publisherPayoutAmount)}
            icon={<Wallet />}
            sub={`${count(payable._count._all)} settled leads`}
          />
          <StatTile
            label="Pending settlement"
            value={money(pending._sum.publisherPayoutAmount)}
            icon={<CircleDollarSign />}
            sub={`${count(pending._count._all)} inside return window`}
            help="Delivered leads whose dispute window has not yet closed. These become payable automatically if no return is filed."
          />
          <StatTile
            label="Month to date"
            value={money(monthToDate._sum.publisherPayoutAmount)}
            sub={`since ${shortDate(monthStart)}`}
          />
          <StatTile
            label="Clawed back"
            value={count(clawedBack._count._all)}
            icon={<TriangleAlert />}
            goodDirection="down"
            accent={clawedBack._count._all > 0 ? "warning" : undefined}
            sub="returns approved against you"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Panel>
            <PanelHeader
              title="Your rates"
              subtitle="Payout per accepted lead, by vertical."
            />
            <PanelBody dense>
              {rates.length === 0 ? (
                <EmptyState
                  title="No rates configured"
                  description="Routing falls back to 60% of the buyer's CPL until network operations sets a rate."
                />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {rates.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <span className="text-[13px] text-ink">
                        {verticalLabel(r.vertical)}
                      </span>
                      <span className="font-mono text-[14px] font-medium text-ink tabular">
                        {money(r.payoutCpl)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>

          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Payable by vertical"
              subtitle="Settled earnings, lifetime."
            />
            <PanelBody dense>
              {byVertical.length === 0 ? (
                <EmptyState title="Nothing settled yet" />
              ) : (
                <div className="grid-scroll">
                  <table className="w-full text-left">
                    <thead className="border-b border-line bg-sunken">
                      <tr>
                        {["Vertical", "Leads", "Earned", "Avg CPL"].map((h) => (
                          <th
                            key={h}
                            className="px-3.5 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {byVertical.map((v) => {
                        const total = Number(v._sum.publisherPayoutAmount ?? 0);
                        return (
                          <tr
                            key={v.vertical}
                            className="border-b border-line last:border-0"
                          >
                            <td className="px-3.5 py-2.5 text-[13px] text-ink">
                              {verticalLabel(v.vertical)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-muted tabular">
                              {count(v._count._all)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono text-[13px] text-ink tabular">
                              {money(total)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-muted tabular">
                              {money(v._count._all === 0 ? 0 : total / v._count._all)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </PanelBody>
          </Panel>
        </div>

        <Panel className="mt-3">
          <PanelHeader
            title="Clawbacks"
            subtitle="Leads where a buyer return was approved. The payout on these was voided."
          />
          <PanelBody dense>
            {recentClawbacks.length === 0 ? (
              <EmptyState
                title="No clawbacks"
                description="No buyer return has been approved against your traffic."
              />
            ) : (
              <div className="grid-scroll">
                <table className="w-full text-left">
                  <thead className="border-b border-line bg-sunken">
                    <tr>
                      {["Source ID", "Consumer", "Vertical", "Reason", "Delivered", "Settled", "State"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-3.5 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {recentClawbacks.map((l) => (
                      <tr key={l.id} className="border-b border-line last:border-0">
                        <td className="px-3.5 py-2.5 font-mono text-[12px] text-accent">
                          {l.sourceId}
                        </td>
                        <td className="px-3.5 py-2.5 text-[13px] text-ink">
                          {[l.contactFirstName, l.contactLastName]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </td>
                        <td className="px-3.5 py-2.5 text-[13px] text-muted">
                          {verticalLabel(l.vertical)}
                        </td>
                        <td className="px-3 py-2">
                          {l.disputeReasonCode && (
                            <DisputeReasonChip code={l.disputeReasonCode} />
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-[12px] whitespace-nowrap text-muted">
                          {utcTimestamp(l.deliveredAt)}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-[12px] whitespace-nowrap text-muted">
                          {utcTimestamp(l.settledAt)}
                        </td>
                        <td className="px-3 py-2">
                          <SettlementChip status="CLAWED_BACK" />
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
