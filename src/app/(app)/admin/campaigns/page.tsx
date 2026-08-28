import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Target } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PacingBar } from "@/components/domain/charts";
import { CampaignRequestActions } from "./campaign-request-row";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { utcDayStart } from "@/lib/pipeline/normalize";
import { count, money, percent } from "@/lib/format";
import { verticalLabel } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "Campaigns" };

export default async function AdminCampaignsPage() {
  const user = await requireAdmin();
  const statDate = utcDayStart(new Date());

  const [campaigns, deliveredTotals, returnedTotals, pendingRequests] = await Promise.all([
    prisma.buyerCampaign.findMany({
      where: { approvalStatus: { not: "PENDING_APPROVAL" } },
      orderBy: [{ active: "desc" }, { vertical: "asc" }, { priority: "asc" }],
      include: {
        buyer: { select: { id: true, name: true, status: true } },
        dailyStats: { where: { statDate }, take: 1 },
      },
    }),
    prisma.lead.groupBy({
      by: ["campaignId"],
      where: { deliveredAt: { not: null } },
      _count: { _all: true },
      _sum: { buyerCostAmount: true },
    }),
    prisma.lead.groupBy({
      by: ["campaignId"],
      where: { buyerStatus: "RETURN_APPROVED" },
      _count: { _all: true },
    }),
    prisma.buyerCampaign.findMany({
      where: { approvalStatus: "PENDING_APPROVAL" },
      orderBy: { createdAt: "asc" },
      include: { buyer: { select: { name: true } } },
    }),
  ]);

  const deliveredBy = new Map(deliveredTotals.map((d) => [d.campaignId, d]));
  const returnedBy = new Map(
    returnedTotals.map((r) => [r.campaignId, r._count._all]),
  );

  return (
    <>
      <Topbar
        user={user}
        title="Campaigns"
        subtitle="Every buyer campaign, with today's pacing and lifetime performance."
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 xl:p-6">
        {pendingRequests.length > 0 && (
          <Panel className="border-warning-border">
            <PanelHeader
              icon={<Inbox className="size-3.5" />}
              title="Pending campaign requests"
              subtitle="Self-serve drafts from buyers. Nothing here routes until approved."
              action={<Badge tone="warning">{count(pendingRequests.length)}</Badge>}
            />
            <PanelBody dense>
              <ul className="divide-y divide-[var(--border)]">
                {pendingRequests.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-[12rem] flex-1">
                      <div className="text-body font-medium text-ink">{c.name}</div>
                      <div className="text-meta text-muted">{c.buyer.name}</div>
                    </div>
                    <div className="text-meta text-muted">{verticalLabel(c.vertical)}</div>
                    <div className="font-mono text-meta text-ink tabular">
                      {money(c.maxCpl)} CPL · {money(c.dailyBudget)}/day
                    </div>
                    <div className="min-w-0 flex-1 truncate font-mono text-micro text-faint">
                      {c.deliveryWebhookUrl}
                    </div>
                    <CampaignRequestActions campaignId={c.id} />
                  </li>
                ))}
              </ul>
            </PanelBody>
          </Panel>
        )}

        <Panel>
          <PanelHeader
            icon={<Target className="size-3.5" />}
            title="All campaigns"
            subtitle="Priority is ascending — lower numbers are matched first at step 7."
          />
          <PanelBody dense>
            {campaigns.length === 0 ? (
              <EmptyState title="No campaigns configured" />
            ) : (
              <div className="grid-scroll">
                <table className="w-full text-left">
                  <thead className="border-b border-line bg-sunken">
                    <tr>
                      {[
                        "Campaign", "Buyer", "Vertical", "Priority", "Max CPL",
                        "Geo", "Window", "Cap fill", "Budget fill",
                        "Delivered", "Return rate", "Revenue", "State",
                      ].map((h) => (
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
                    {campaigns.map((c) => {
                      const stat = c.dailyStats[0];
                      const deliveredToday = stat?.leadsDelivered ?? 0;
                      const spendToday = Number(stat?.spendAmount ?? 0);
                      const budget = Number(c.dailyBudget);
                      const lifetime = deliveredBy.get(c.id);
                      const deliveredTotal = lifetime?._count._all ?? 0;
                      const returned = returnedBy.get(c.id) ?? 0;

                      return (
                        <tr
                          key={c.id}
                          className="border-b border-line transition-colors last:border-0 hover:bg-hover"
                        >
                          <td className="max-w-[14rem] truncate px-3.5 py-2.5 text-[13px] text-ink">
                            {c.name}
                          </td>
                          <td className="px-3.5 py-2.5 text-[13px] text-muted">
                            <Link
                              href={`/admin/buyers`}
                              className="hover:text-accent"
                            >
                              {c.buyer.name}
                            </Link>
                          </td>
                          <td className="px-3.5 py-2.5 text-[13px] text-muted">
                            {verticalLabel(c.vertical)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-muted tabular">
                            {c.priority}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-ink tabular">
                            {money(c.maxCpl)}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-[12px] text-muted">
                            {c.acceptedStates.length === 0
                              ? "all"
                              : `${c.acceptedStates.length} states`}
                            {c.acceptedZips.length > 0 &&
                              ` · ${c.acceptedZips.length} ZIPs`}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-muted tabular">
                            {c.returnWindowHours}h
                          </td>
                          <td className="min-w-[8rem] px-3.5 py-2.5">
                            <PacingBar
                              fill={
                                c.dailyCapLeads
                                  ? deliveredToday / c.dailyCapLeads
                                  : null
                              }
                              label={`${deliveredToday}${c.dailyCapLeads ? ` / ${c.dailyCapLeads}` : ""}`}
                            />
                          </td>
                          <td className="min-w-[8rem] px-3.5 py-2.5">
                            <PacingBar
                              fill={budget === 0 ? 0 : spendToday / budget}
                              label={`${money(spendToday)} / ${money(budget)}`}
                            />
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-ink tabular">
                            {count(deliveredTotal)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-muted tabular">
                            {percent(
                              deliveredTotal === 0 ? 0 : returned / deliveredTotal,
                              1,
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-ink tabular">
                            {money(Number(lifetime?._sum.buyerCostAmount ?? 0))}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={c.active ? "success" : "neutral"} dot>
                              {c.active ? "Active" : "Paused"}
                            </Badge>
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
    </>
  );
}
