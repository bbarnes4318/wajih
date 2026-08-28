import type { Metadata } from "next";
import { Target } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { EmptyState } from "@/components/ui/empty-state";
import { CampaignCard } from "./campaign-card";
import { RequestCampaignButton } from "./request-campaign-button";
import { requireBuyer } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { utcDayStart } from "@/lib/pipeline/normalize";

export const metadata: Metadata = { title: "Campaigns" };

export default async function BuyerCampaignsPage() {
  const user = await requireBuyer();
  const statDate = utcDayStart(new Date());

  const campaigns = await prisma.buyerCampaign.findMany({
    where: { buyerOrgId: user.orgId },
    orderBy: [{ active: "desc" }, { priority: "asc" }, { name: "asc" }],
    include: {
      dailyStats: { where: { statDate }, take: 1 },
      _count: { select: { leads: true } },
    },
  });

  const returnedTotals = await prisma.lead.groupBy({
    by: ["campaignId"],
    where: { buyerOrgId: user.orgId, buyerStatus: "RETURN_APPROVED" },
    _count: { _all: true },
  });
  const returnedBy = new Map(
    returnedTotals.map((r) => [r.campaignId, r._count._all]),
  );

  const deliveredTotals = await prisma.lead.groupBy({
    by: ["campaignId"],
    where: { buyerOrgId: user.orgId, deliveredAt: { not: null } },
    _count: { _all: true },
  });
  const deliveredBy = new Map(
    deliveredTotals.map((d) => [d.campaignId, d._count._all]),
  );

  return (
    <>
      <Topbar
        user={user}
        title="Campaigns"
        subtitle="Filters here are evaluated verbatim by the step 6 qualifier."
        actions={campaigns.length > 0 ? <RequestCampaignButton /> : undefined}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        {campaigns.length === 0 ? (
          <EmptyState
            icon={<Target />}
            title="No campaigns yet"
            description="Request a campaign and network operations will review it — nothing routes until it's approved."
            action={<RequestCampaignButton variant="primary" />}
          />
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => {
              const stat = c.dailyStats[0];
              return (
                <CampaignCard
                  key={c.id}
                  campaign={{
                    id: c.id,
                    name: c.name,
                    vertical: c.vertical,
                    maxCpl: c.maxCpl.toString(),
                    dailyBudget: c.dailyBudget.toString(),
                    dailyCapLeads: c.dailyCapLeads,
                    returnWindowHours: c.returnWindowHours,
                    deliveryWebhookUrl: c.deliveryWebhookUrl,
                    acceptedStates: c.acceptedStates,
                    acceptedZips: c.acceptedZips,
                    criteriaJson: c.criteriaJson,
                    active: c.active,
                    approvalStatus: c.approvalStatus,
                    priority: c.priority,
                    deliveredToday: stat?.leadsDelivered ?? 0,
                    spendToday: Number(stat?.spendAmount ?? 0),
                    returnedToday: stat?.leadsReturned ?? 0,
                    deliveredTotal: deliveredBy.get(c.id) ?? 0,
                    returnedTotal: returnedBy.get(c.id) ?? 0,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
