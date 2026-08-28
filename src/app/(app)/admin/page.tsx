import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Ban,
  CircleDollarSign,
  Gavel,
  Inbox,
  ShieldCheck,
  Target,
  TriangleAlert,
} from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { MiniStat, StatTile } from "@/components/domain/stat-tile";
import {
  PacingBar,
  PipelineFunnel,
  RejectionBars,
  VolumeChart,
} from "@/components/domain/charts";
import { OrgStatusChip } from "@/components/domain/status-chip";
import { requireAdmin } from "@/lib/auth/rbac";
import {
  campaignPacing,
  dailyVolume,
  delta,
  holdQueueCount,
  networkTotals,
  openDisputeCount,
  pendingVettingCount,
  previousWindowTotals,
  publisherLeaderboard,
  rejectionBreakdown,
  stageBreakdown,
} from "@/lib/db/analytics";
import { AUTO_SUSPEND_RETURN_RATE } from "@/lib/metrics/publisher-metrics";
import { count, money, percent } from "@/lib/format";
import { verticalCode } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "Network Overview" };

export default async function AdminOverviewPage() {
  const user = await requireAdmin();

  const [
    totals,
    prev,
    stages,
    rejections,
    volume,
    leaderboard,
    pacing,
    disputes,
    pendingVetting,
    holds,
  ] = await Promise.all([
    networkTotals(30),
    previousWindowTotals(30),
    stageBreakdown(30),
    rejectionBreakdown(30, 8),
    dailyVolume(30),
    publisherLeaderboard(30),
    campaignPacing(),
    openDisputeCount(),
    pendingVettingCount(),
    holdQueueCount(),
  ]);

  const margin = totals.revenue - totals.payout;
  const prevMargin = prev.revenue - prev.payout;
  const acceptRate = totals.submitted === 0 ? 0 : totals.delivered / totals.submitted;
  const returnRate = totals.delivered === 0 ? 0 : totals.returned / totals.delivered;

  const atRisk = leaderboard.filter(
    (p) => p.returnRate14d >= AUTO_SUSPEND_RETURN_RATE * 0.7 && p.delivered > 0,
  );

  return (
    <>
      <Topbar
        user={user}
        title="Network Overview"
        subtitle="Trailing 30 days across every publisher, buyer and campaign."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin/leads">
              <Activity className="size-3.5" />
              Lead stream
            </Link>
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        {/* Action rail — the three queues that need a human today */}
        {(disputes > 0 || pendingVetting > 0 || holds > 0) && (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <QueueCard
              href="/admin/disputes"
              icon={<Gavel />}
              label="Open disputes"
              value={disputes}
              tone={disputes > 0 ? "warning" : "neutral"}
              detail="Awaiting adjudication"
            />
            <QueueCard
              href="/admin/publishers/vetting"
              icon={<ShieldCheck />}
              label="Publishers in vetting"
              value={pendingVetting}
              tone={pendingVetting > 0 ? "accent" : "neutral"}
              detail="9-point checklist incomplete"
            />
            <QueueCard
              href="/admin/leads?stage=HOLD_QUEUE"
              icon={<Inbox />}
              label="Hold queue"
              value={holds}
              tone={holds > 0 ? "warning" : "neutral"}
              detail="Blocked pending consent evidence"
            />
          </div>
        )}

        {/* KPI bento */}
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Submitted"
            value={count(totals.submitted)}
            delta={delta(totals.submitted, prev.submitted)}
            icon={<Activity />}
            sub="leads received"
          />
          <StatTile
            label="Delivered"
            value={count(totals.delivered)}
            delta={delta(totals.delivered, prev.delivered)}
            icon={<Target />}
            sub={`${percent(acceptRate, 1)} of submitted`}
          />
          <StatTile
            label="Gross revenue"
            value={money(totals.revenue)}
            delta={delta(totals.revenue, prev.revenue)}
            icon={<CircleDollarSign />}
            sub={`${money(totals.payout)} paid out`}
          />
          <StatTile
            label="Net margin"
            value={money(margin)}
            delta={delta(margin, prevMargin)}
            icon={<ArrowUpRight />}
            sub={
              totals.revenue > 0
                ? `${percent(margin / totals.revenue, 1)} of revenue`
                : undefined
            }
          />
        </div>

        {/* Pipeline health — supporting figures, deliberately lighter than the
            hero KPIs above so the page has a clear first read. */}
        <Panel className="mb-5">
          <div className="grid divide-y divide-[var(--border)] sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
            <MiniStat
              label="Accept rate"
              value={percent(acceptRate, 1)}
              sub="submitted → delivered"
              tone={acceptRate >= 0.4 ? "success" : "warning"}
            />
            <MiniStat
              label="Return rate"
              value={percent(returnRate, 1)}
              sub={`${count(totals.returned)} returns approved · suspends at ${percent(AUTO_SUSPEND_RETURN_RATE, 0)}`}
              tone={
                returnRate >= AUTO_SUSPEND_RETURN_RATE
                  ? "danger"
                  : returnRate >= AUTO_SUSPEND_RETURN_RATE * 0.7
                    ? "warning"
                    : "success"
              }
            />
            <MiniStat
              label="Rejected"
              value={count(totals.rejected)}
              sub={
                totals.submitted > 0
                  ? `${percent(totals.rejected / totals.submitted, 1)} of submitted`
                  : "—"
              }
              tone="neutral"
            />
            <MiniStat
              label="Held for consent"
              value={count(totals.held)}
              sub="retained, undeliverable"
              tone={totals.held > 0 ? "warning" : "neutral"}
            />
          </div>
        </Panel>

        {/* Charts */}
        <div className="mb-5 grid gap-4 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Daily volume"
              subtitle="Submitted leads by outcome, trailing 30 days"
              icon={<Activity className="size-3.5" />}
            />
            <PanelBody>
              <VolumeChart data={volume} />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Pipeline distribution"
              subtitle="Where the last 30 days landed"
            />
            <PanelBody>
              <PipelineFunnel counts={stages} />
            </PanelBody>
          </Panel>
        </div>

        <div className="mb-5 grid gap-4 xl:grid-cols-3">
          <Panel>
            <PanelHeader
              title="Top rejection reasons"
              subtitle="Enum codes, ranked by volume"
              icon={<Ban className="size-3.5" />}
            />
            <PanelBody>
              <RejectionBars rows={rejections} />
            </PanelBody>
          </Panel>

          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Campaign pacing — today"
              subtitle="Cap and budget fill against each active campaign"
              icon={<Target className="size-3.5" />}
              action={
                <Button asChild variant="ghost" size="xs">
                  <Link href="/admin/campaigns">View all</Link>
                </Button>
              }
            />
            <PanelBody dense>
              <div className="grid-scroll">
                <table className="w-full text-left">
                  <thead className="border-b border-line bg-sunken">
                    <tr>
                      {["Campaign", "Buyer", "Vertical", "Cap fill", "Budget fill", "CPL"].map(
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
                    {pacing.slice(0, 7).map((c) => (
                      <tr key={c.id} className="border-b border-line last:border-0">
                        <td className="max-w-[12rem] truncate px-3.5 py-2.5 text-[13px] text-ink">
                          {c.name}
                        </td>
                        <td className="max-w-[10rem] truncate px-3.5 py-2.5 text-[13px] text-muted">
                          {c.buyerName}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone="neutral" className="font-mono">
                            {verticalCode(c.vertical)}
                          </Badge>
                        </td>
                        <td className="min-w-[8rem] px-3.5 py-2.5">
                          <PacingBar
                            fill={c.capFill}
                            label={`${c.delivered}${c.dailyCapLeads ? ` / ${c.dailyCapLeads}` : ""}`}
                          />
                        </td>
                        <td className="min-w-[8rem] px-3.5 py-2.5">
                          <PacingBar
                            fill={c.budgetFill}
                            label={`${money(c.spend)} / ${money(c.budget)}`}
                          />
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-ink tabular">
                          {money(c.maxCpl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelBody>
          </Panel>
        </div>

        {/* Publisher leaderboard */}
        <Panel>
          <PanelHeader
            title="Publisher performance"
            subtitle={`Return rate rings show the rolling 14-day figure; auto-suspension fires at ${percent(AUTO_SUSPEND_RETURN_RATE, 0)}.`}
            icon={<ShieldCheck className="size-3.5" />}
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/admin/publishers">Manage</Link>
              </Button>
            }
          />
          <PanelBody dense>
            <div className="grid-scroll">
              <table className="w-full text-left">
                <thead className="border-b border-line bg-sunken">
                  <tr>
                    {[
                      "Publisher",
                      "Status",
                      "Submitted",
                      "Delivered",
                      "Accept",
                      "Payout",
                      "Margin",
                      "7d",
                      "14d",
                      "30d",
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
                  {leaderboard.map((p) => {
                    const breach = p.returnRate14d >= AUTO_SUSPEND_RETURN_RATE;
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-line transition-colors last:border-0 hover:bg-hover"
                      >
                        <td className="px-3 py-2">
                          <Link
                            href={`/admin/publishers/${p.id}`}
                            className="text-[13px] text-ink hover:text-accent"
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <OrgStatusChip status={p.status} />
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-muted tabular">
                          {count(p.submitted)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-ink tabular">
                          {count(p.delivered)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-muted tabular">
                          {percent(p.acceptRate, 0)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-muted tabular">
                          {money(p.payout)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-ink tabular">
                          {money(p.revenue - p.payout)}
                        </td>
                        <td className="px-3 py-2">
                          <ReturnCell value={p.returnRate7d} />
                        </td>
                        <td className="px-3 py-2">
                          <ReturnCell value={p.returnRate14d} emphasize={breach} />
                        </td>
                        <td className="px-3 py-2">
                          <ReturnCell value={p.returnRate30d} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </PanelBody>
          {atRisk.length > 0 && (
            <div className="border-t border-warning-border bg-warning-soft px-4 py-2 text-[12px] text-warning">
              <TriangleAlert className="mr-1.5 inline size-3" />
              {atRisk.length} publisher{atRisk.length === 1 ? "" : "s"} within reach of the
              auto-suspension threshold:{" "}
              {atRisk.map((p) => p.name).join(", ")}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function ReturnCell({
  value,
  emphasize = false,
}: {
  value: number;
  emphasize?: boolean;
}) {
  const tone =
    value >= AUTO_SUSPEND_RETURN_RATE
      ? "danger"
      : value >= AUTO_SUSPEND_RETURN_RATE * 0.7
        ? "warning"
        : "success";

  return (
    <div className="flex items-center gap-1.5">
      <ProgressRing
        value={value}
        max={Math.max(AUTO_SUSPEND_RETURN_RATE * 2, value)}
        size={22}
        strokeWidth={3}
        tone={tone}
      />
      <span
        className={`font-mono text-[12px] tabular ${
          emphasize ? "font-semibold text-danger" : "text-muted"
        }`}
      >
        {percent(value, 1)}
      </span>
    </div>
  );
}

function QueueCard({
  href,
  icon,
  label,
  value,
  detail,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  tone: "neutral" | "accent" | "warning";
}) {
  return (
    <Link
      href={href}
      className={`panel-glow flex items-center gap-3 p-3 transition-colors hover:bg-hover ${
        tone === "warning"
          ? "border-warning-border"
          : tone === "accent"
            ? "border-accent-border"
            : ""
      }`}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4 ${
          tone === "warning"
            ? "bg-warning-soft text-warning"
            : tone === "accent"
              ? "bg-accent-soft text-accent"
              : "bg-chip text-faint"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-lg leading-none font-semibold text-ink tabular">
            {value}
          </span>
          <span className="truncate text-[13px] text-ink">{label}</span>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-muted">{detail}</p>
      </div>
      <ArrowUpRight className="size-3.5 shrink-0 text-faint" />
    </Link>
  );
}
