import type { Metadata } from "next";
import { Gavel, Scale } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/domain/stat-tile";
import { DisputeQueue } from "./queue";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { count, money, percent } from "@/lib/format";
import { DISPUTE_REASON } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "Dispute Queue" };

const THIRTY_DAYS_MS = 30 * 86_400_000;

/**
 * Data loading lives outside the component so the rolling window is computed
 * where reading the clock is expected, not during render.
 */
async function loadDisputeQueue() {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  const [open, recent, reasonMix, resolvedStats] = await Promise.all([
    prisma.lead.findMany({
      where: { buyerStatus: "DISPUTED" },
      orderBy: { disputedAt: "asc" },
      take: 100,
      select: {
        id: true,
        sourceId: true,
        vertical: true,
        contactFirstName: true,
        contactLastName: true,
        contactPhone: true,
        contactState: true,
        disputeReasonCode: true,
        disputeNotes: true,
        disputedAt: true,
        deliveredAt: true,
        buyerCostAmount: true,
        publisherPayoutAmount: true,
        publisher: { select: { id: true, name: true } },
        buyer: { select: { name: true } },
        campaign: { select: { name: true } },
      },
    }),
    prisma.lead.findMany({
      where: {
        buyerStatus: { in: ["RETURN_APPROVED", "RETURN_DENIED"] },
        disputeResolvedAt: { gte: since },
      },
      orderBy: { disputeResolvedAt: "desc" },
      take: 25,
      select: {
        id: true,
        sourceId: true,
        buyerStatus: true,
        disputeReasonCode: true,
        disputeResolvedAt: true,
        buyerCostAmount: true,
        publisher: { select: { name: true } },
        buyer: { select: { name: true } },
      },
    }),
    prisma.lead.groupBy({
      by: ["disputeReasonCode"],
      where: { disputedAt: { gte: since }, disputeReasonCode: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { disputeReasonCode: "desc" } },
    }),
    prisma.lead.groupBy({
      by: ["buyerStatus"],
      where: { disputeResolvedAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  return { open, recent, reasonMix, resolvedStats };
}

export default async function AdminDisputesPage() {
  const user = await requireAdmin();
  const { open, recent, reasonMix, resolvedStats } = await loadDisputeQueue();

  const approved =
    resolvedStats.find((r) => r.buyerStatus === "RETURN_APPROVED")?._count._all ?? 0;
  const denied =
    resolvedStats.find((r) => r.buyerStatus === "RETURN_DENIED")?._count._all ?? 0;
  const totalResolved = approved + denied;

  const exposure = open.reduce(
    (sum, l) => sum + Number(l.buyerCostAmount ?? 0),
    0,
  );

  return (
    <>
      <Topbar
        user={user}
        title="Dispute Queue"
        subtitle="Adjudicate buyer return requests. Approving voids the publisher payout."
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Open disputes"
            value={count(open.length)}
            icon={<Gavel />}
            accent={open.length > 0 ? "warning" : undefined}
            sub="awaiting a decision"
          />
          <StatTile
            label="Revenue at risk"
            value={money(exposure)}
            icon={<Scale />}
            sub="if every open return is approved"
          />
          <StatTile
            label="Approved (30d)"
            value={count(approved)}
            sub={
              totalResolved > 0
                ? `${percent(approved / totalResolved, 0)} of resolved`
                : undefined
            }
          />
          <StatTile
            label="Denied (30d)"
            value={count(denied)}
            sub={
              totalResolved > 0
                ? `${percent(denied / totalResolved, 0)} of resolved`
                : undefined
            }
          />
        </div>

        {reasonMix.length > 0 && (
          <Panel className="mb-4">
            <PanelHeader
              title="Dispute reason mix — 30 days"
              subtitle="Structured codes only; there is no free-text return path."
            />
            <PanelBody>
              <div className="flex flex-wrap gap-2">
                {reasonMix.map((r) => {
                  const code = r.disputeReasonCode!;
                  const meta = DISPUTE_REASON[code];
                  return (
                    <span
                      key={code}
                      className="flex items-center gap-2 rounded-md border border-line bg-sunken px-2.5 py-1.5"
                      title={meta.help}
                    >
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="font-mono text-[13px] text-ink tabular">
                        {r._count._all}
                      </span>
                    </span>
                  );
                })}
              </div>
            </PanelBody>
          </Panel>
        )}

        <Panel className="mb-4">
          <PanelHeader
            icon={<Gavel className="size-3.5" />}
            title="Open disputes"
            subtitle="Oldest first. Approving credits the buyer and claws back the publisher payout."
            action={<Badge tone={open.length > 0 ? "warning" : "success"}>{open.length}</Badge>}
          />
          <PanelBody dense>
            {open.length === 0 ? (
              <EmptyState
                title="No open disputes"
                description="Every filed return has been adjudicated."
              />
            ) : (
              <DisputeQueue
                rows={open.map((l) => ({
                  id: l.id,
                  sourceId: l.sourceId,
                  vertical: l.vertical,
                  contactName:
                    [l.contactFirstName, l.contactLastName]
                      .filter(Boolean)
                      .join(" ") || "—",
                  contactPhone: l.contactPhone,
                  contactState: l.contactState,
                  reasonCode: l.disputeReasonCode!,
                  notes: l.disputeNotes,
                  disputedAt: l.disputedAt?.toISOString() ?? null,
                  deliveredAt: l.deliveredAt?.toISOString() ?? null,
                  buyerCost: l.buyerCostAmount?.toString() ?? null,
                  publisherPayout: l.publisherPayoutAmount?.toString() ?? null,
                  publisherId: l.publisher.id,
                  publisherName: l.publisher.name,
                  buyerName: l.buyer?.name ?? "—",
                  campaignName: l.campaign?.name ?? "—",
                }))}
              />
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Recently adjudicated"
            subtitle="Last 30 days"
          />
          <PanelBody dense>
            {recent.length === 0 ? (
              <EmptyState title="Nothing adjudicated in the last 30 days" />
            ) : (
              <div className="grid-scroll">
                <table className="w-full text-left">
                  <thead className="border-b border-line bg-sunken">
                    <tr>
                      {["Source ID", "Publisher", "Buyer", "Reason", "Decision", "Value"].map(
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
                    {recent.map((l) => (
                      <tr key={l.id} className="border-b border-line last:border-0">
                        <td className="px-3.5 py-2.5 font-mono text-[12px] text-accent">
                          {l.sourceId}
                        </td>
                        <td className="px-3.5 py-2.5 text-[13px] text-ink">
                          {l.publisher.name}
                        </td>
                        <td className="px-3.5 py-2.5 text-[13px] text-muted">
                          {l.buyer?.name ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {l.disputeReasonCode && (
                            <Badge tone={DISPUTE_REASON[l.disputeReasonCode].tone}>
                              {DISPUTE_REASON[l.disputeReasonCode].label}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            tone={
                              l.buyerStatus === "RETURN_APPROVED" ? "danger" : "success"
                            }
                            dot
                          >
                            {l.buyerStatus === "RETURN_APPROVED"
                              ? "Return approved"
                              : "Return denied"}
                          </Badge>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-ink tabular">
                          {money(l.buyerCostAmount)}
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
