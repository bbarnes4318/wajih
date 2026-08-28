import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { OrgStatusChip } from "@/components/domain/status-chip";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { count, money, percent, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Buyers" };

export default async function AdminBuyersPage() {
  const user = await requireAdmin();

  const [buyers, spendByBuyer, returnsByBuyer, disputesByBuyer] =
    await Promise.all([
      prisma.organization.findMany({
        where: { type: "BUYER" },
        orderBy: { name: "asc" },
        include: {
          campaigns: {
            select: { id: true, active: true, dailyBudget: true },
          },
          users: { select: { email: true, lastLoginAt: true } },
        },
      }),
      prisma.lead.groupBy({
        by: ["buyerOrgId"],
        where: { deliveredAt: { not: null }, buyerStatus: { not: "RETURN_APPROVED" } },
        _count: { _all: true },
        _sum: { buyerCostAmount: true },
      }),
      prisma.lead.groupBy({
        by: ["buyerOrgId"],
        where: { buyerStatus: "RETURN_APPROVED" },
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["buyerOrgId"],
        where: { buyerStatus: "DISPUTED" },
        _count: { _all: true },
      }),
    ]);

  const spendBy = new Map(spendByBuyer.map((s) => [s.buyerOrgId, s]));
  const returnsBy = new Map(returnsByBuyer.map((r) => [r.buyerOrgId, r._count._all]));
  const disputesBy = new Map(
    disputesByBuyer.map((d) => [d.buyerOrgId, d._count._all]),
  );

  return (
    <>
      <Topbar
        user={user}
        title="Buyers"
        subtitle="Demand-side accounts, campaign counts and lifetime spend."
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <Panel>
          <PanelHeader
            icon={<Building2 className="size-3.5" />}
            title="All buyers"
            subtitle="Return rate here is the share of a buyer's delivered leads they successfully returned."
          />
          <PanelBody dense>
            {buyers.length === 0 ? (
              <EmptyState title="No buyers configured" />
            ) : (
              <div className="grid-scroll">
                <table className="w-full text-left">
                  <thead className="border-b border-line bg-sunken">
                    <tr>
                      {[
                        "Buyer", "Status", "EIN", "Campaigns", "Daily budget",
                        "Purchased", "Spend", "Return rate", "Open disputes",
                        "Onboarded",
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
                    {buyers.map((b) => {
                      const agg = spendBy.get(b.id);
                      const purchased = agg?._count._all ?? 0;
                      const returned = returnsBy.get(b.id) ?? 0;
                      const open = disputesBy.get(b.id) ?? 0;
                      const totalBudget = b.campaigns
                        .filter((c) => c.active)
                        .reduce((sum, c) => sum + Number(c.dailyBudget), 0);

                      return (
                        <tr
                          key={b.id}
                          className="border-b border-line transition-colors last:border-0 hover:bg-hover"
                        >
                          <td className="px-3 py-2">
                            <div className="text-[13px] font-medium text-ink">
                              {b.name}
                            </div>
                            <div className="font-mono text-[12px] text-faint">
                              {b.users[0]?.email ?? "—"}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <OrgStatusChip status={b.status} />
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-[12px] text-muted">
                            {b.einTaxId ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              href="/admin/campaigns"
                              className="hover:text-accent"
                            >
                              <Badge tone="neutral">
                                {b.campaigns.filter((c) => c.active).length} active
                                {" / "}
                                {b.campaigns.length}
                              </Badge>
                            </Link>
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-muted tabular">
                            {money(totalBudget)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-ink tabular">
                            {count(purchased)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-[13px] text-ink tabular">
                            {money(Number(agg?._sum.buyerCostAmount ?? 0))}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-muted tabular">
                            {percent(
                              purchased + returned === 0
                                ? 0
                                : returned / (purchased + returned),
                              1,
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right">
                            {open > 0 ? (
                              <Link href="/admin/disputes">
                                <Badge tone="warning">{open}</Badge>
                              </Link>
                            ) : (
                              <span className="font-mono text-[12px] text-faint">0</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-[12px] text-muted">
                            {shortDate(b.createdAt)}
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
