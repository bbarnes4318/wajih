import type { Metadata } from "next";
import { CircleDollarSign, Receipt } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/domain/stat-tile";
import { requireBuyer } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { count, money, percent, shortDate } from "@/lib/format";
import { verticalLabel } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "Billing" };

/**
 * Buyer billing.
 *
 * Billable volume excludes approved returns — a credited lead was never
 * chargeable, so it is netted out at source rather than shown as a refund
 * line against an inflated invoice.
 */
export default async function BuyerBillingPage() {
  const user = await requireBuyer();
  const orgId = user.orgId;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [billable, credited, pending, byVertical, byCampaign, byDay, campaigns] =
    await Promise.all([
      prisma.lead.aggregate({
        where: {
          buyerOrgId: orgId,
          deliveredAt: { gte: monthStart },
          buyerStatus: { not: "RETURN_APPROVED" },
        },
        _sum: { buyerCostAmount: true },
        _count: { _all: true },
      }),
      prisma.lead.aggregate({
        where: {
          buyerOrgId: orgId,
          deliveredAt: { gte: monthStart },
          buyerStatus: "RETURN_APPROVED",
        },
        _sum: { buyerCostAmount: true },
        _count: { _all: true },
      }),
      prisma.lead.aggregate({
        where: {
          buyerOrgId: orgId,
          buyerStatus: { in: ["PENDING", "DISPUTED"] },
          deliveredAt: { not: null },
        },
        _sum: { buyerCostAmount: true },
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["vertical"],
        where: {
          buyerOrgId: orgId,
          deliveredAt: { gte: monthStart },
          buyerStatus: { not: "RETURN_APPROVED" },
        },
        _sum: { buyerCostAmount: true },
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["campaignId"],
        where: {
          buyerOrgId: orgId,
          deliveredAt: { gte: monthStart },
          buyerStatus: { not: "RETURN_APPROVED" },
        },
        _sum: { buyerCostAmount: true },
        _count: { _all: true },
      }),
      prisma.campaignDailyStat.findMany({
        where: { campaign: { buyerOrgId: orgId }, statDate: { gte: monthStart } },
        orderBy: { statDate: "desc" },
        include: { campaign: { select: { name: true } } },
        take: 40,
      }),
      prisma.buyerCampaign.findMany({
        where: { buyerOrgId: orgId },
        select: { id: true, name: true },
      }),
    ]);

  const nameById = new Map(campaigns.map((c) => [c.id, c.name]));
  const billableTotal = Number(billable._sum.buyerCostAmount ?? 0);
  const creditedTotal = Number(credited._sum.buyerCostAmount ?? 0);

  return (
    <>
      <Topbar
        user={user}
        title="Billing"
        subtitle={`Month to date, from ${shortDate(monthStart)}.`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Billable"
            value={money(billableTotal)}
            icon={<CircleDollarSign />}
            sub={`${count(billable._count._all)} leads`}
          />
          <StatTile
            label="Credited"
            value={money(creditedTotal)}
            goodDirection="down"
            sub={`${count(credited._count._all)} returns approved`}
            help="Approved returns are netted out of billable volume rather than invoiced and refunded."
          />
          <StatTile
            label="Effective CPL"
            value={money(
              billable._count._all === 0 ? 0 : billableTotal / billable._count._all,
            )}
            sub="after credits"
          />
          <StatTile
            label="Provisional"
            value={money(pending._sum.buyerCostAmount)}
            sub={`${count(pending._count._all)} still inside return window`}
            help="Delivered but not yet settled. These become final when their windows lapse."
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel>
            <PanelHeader
              icon={<Receipt className="size-3.5" />}
              title="By vertical"
              subtitle="Month to date, net of credits."
            />
            <PanelBody dense>
              {byVertical.length === 0 ? (
                <EmptyState title="No billable volume this month" />
              ) : (
                <table className="w-full text-left">
                  <thead className="border-b border-line bg-inset">
                    <tr>
                      {["Vertical", "Leads", "Spend", "Avg CPL"].map((h) => (
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
                    {byVertical.map((v) => {
                      const total = Number(v._sum.buyerCostAmount ?? 0);
                      return (
                        <tr
                          key={v.vertical}
                          className="border-b border-line last:border-0"
                        >
                          <td className="px-3.5 py-2.5 text-body text-ink">
                            {verticalLabel(v.vertical)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-meta text-muted tabular">
                            {count(v._count._all)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-body text-ink tabular">
                            {money(total)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-meta text-muted tabular">
                            {money(v._count._all === 0 ? 0 : total / v._count._all)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="By campaign"
              subtitle="Month to date, net of credits."
            />
            <PanelBody dense>
              {byCampaign.length === 0 ? (
                <EmptyState title="No billable volume this month" />
              ) : (
                <table className="w-full text-left">
                  <thead className="border-b border-line bg-inset">
                    <tr>
                      {["Campaign", "Leads", "Spend", "Share"].map((h) => (
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
                    {byCampaign.map((c) => {
                      const total = Number(c._sum.buyerCostAmount ?? 0);
                      return (
                        <tr
                          key={c.campaignId ?? "unrouted"}
                          className="border-b border-line last:border-0"
                        >
                          <td className="px-3.5 py-2.5 text-body text-ink">
                            {c.campaignId ? (nameById.get(c.campaignId) ?? "—") : "—"}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-meta text-muted tabular">
                            {count(c._count._all)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-body text-ink tabular">
                            {money(total)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-meta text-muted tabular">
                            {percent(
                              billableTotal === 0 ? 0 : total / billableTotal,
                              0,
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </PanelBody>
          </Panel>
        </div>

        <Panel className="mt-3">
          <PanelHeader
            title="Daily ledger"
            subtitle="The campaign pacing rows the routing engine reads to enforce budget."
          />
          <PanelBody dense>
            {byDay.length === 0 ? (
              <EmptyState title="No activity this month" />
            ) : (
              <div className="grid-scroll">
                <table className="w-full text-left">
                  <thead className="border-b border-line bg-inset">
                    <tr>
                      {["Date", "Campaign", "Delivered", "Returned", "Spend"].map(
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
                    {byDay.map((d) => (
                      <tr key={d.id} className="border-b border-line last:border-0">
                        <td className="px-3.5 py-2.5 font-mono text-meta text-muted">
                          {shortDate(d.statDate)}
                        </td>
                        <td className="px-3.5 py-2.5 text-body text-ink">
                          {d.campaign.name}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-meta text-ink tabular">
                          {count(d.leadsDelivered)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-meta text-danger tabular">
                          {count(d.leadsReturned)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-body text-ink tabular">
                          {money(d.spendAmount)}
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
