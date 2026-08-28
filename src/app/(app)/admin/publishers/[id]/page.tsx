import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Ban,
  Building2,
  CircleCheck,
  ExternalLink,
  FileText,
  Radio,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StatTile } from "@/components/domain/stat-tile";
import { RejectionBars } from "@/components/domain/charts";
import { VettingChecklist } from "@/components/domain/vetting-checklist";
import {
  OrgStatusChip,
  TrafficSourceChip,
} from "@/components/domain/status-chip";
import { PublisherAdminControls } from "./controls";
import { AuditNotes } from "./audit-notes";
import { requireAdmin } from "@/lib/auth/rbac";
import { getPublisherDetail } from "@/lib/db/vetting";
import { AUTO_SUSPEND_RETURN_RATE } from "@/lib/metrics/publisher-metrics";
import { count, money, percent, shortDate, utcTimestamp } from "@/lib/format";
import { TRAFFIC_SOURCE, verticalLabel } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "Publisher" };

export default async function PublisherDetailPage(
  props: PageProps<"/admin/publishers/[id]">,
) {
  const user = await requireAdmin();
  const { id } = await props.params;

  const detail = await getPublisherDetail(id);
  if (!detail) notFound();

  const { org, checks, progress, references, volume, topRejections } = detail;
  const profile = org.vettingProfile;
  const metrics = org.metrics;
  const rate14 = metrics?.returnRate14d ?? 0;
  const breach = rate14 >= AUTO_SUSPEND_RETURN_RATE;

  return (
    <>
      <Topbar
        user={user}
        title={org.name}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="font-mono">EIN {org.einTaxId ?? "—"}</span>
            <span className="text-faint">·</span>
            <span>Onboarded {shortDate(org.createdAt)}</span>
          </span>
        }
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href={`/admin/leads?publisher=${org.id}`}>
              <Radio className="size-3.5" />
              View leads
            </Link>
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        {/* Auto-suspension banner */}
        {metrics?.autoSuspendedAt && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger-border bg-danger-soft px-4 py-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-danger">
                Auto-suspended {utcTimestamp(metrics.autoSuspendedAt)}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-danger/85">
                The rolling 14-day return rate reached{" "}
                <span className="font-mono">{percent(rate14, 1)}</span>, at or above
                the {percent(AUTO_SUSPEND_RETURN_RATE, 0)} threshold. Every source on
                this account now rejects at step 1 with{" "}
                <span className="font-mono">PUBLISHER_SUSPENDED</span>. Reinstating
                clears the latch and re-arms the trigger.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
          {/* ------------------------------------------------ Left column */}
          <div className="space-y-3">
            {/* Checklist */}
            <Panel>
              <PanelHeader
                icon={<ShieldCheck className="size-3.5" />}
                title="9-point verification checklist"
                subtitle="Every point must pass or be explicitly waived before the account can go live."
                action={
                  <div className="flex items-center gap-2.5">
                    <ProgressRing
                      value={progress.passed}
                      max={progress.total}
                      size={34}
                      strokeWidth={4}
                      tone={
                        progress.failed > 0
                          ? "danger"
                          : progress.complete
                            ? "success"
                            : "accent"
                      }
                      label={`${progress.passed}`}
                    />
                    <div className="text-right">
                      <div className="font-mono text-[12px] text-ink tabular">
                        {progress.passed} / {progress.total}
                      </div>
                      <div className="text-[11px] text-faint">
                        {progress.failed > 0
                          ? `${progress.failed} failed`
                          : progress.complete
                            ? "complete"
                            : `${progress.inReview} in review`}
                      </div>
                    </div>
                  </div>
                }
              />
              <PanelBody dense>
                <VettingChecklist
                  orgId={org.id}
                  checks={checks.map((c) => ({
                    key: c.key,
                    status: c.status,
                    notes: c.notes,
                    evidenceUrl: c.evidenceUrl,
                    checkedAt: c.checkedAt?.toISOString() ?? null,
                  }))}
                />
              </PanelBody>
            </Panel>

            {/* Declared profile */}
            <Panel>
              <PanelHeader
                icon={<Building2 className="size-3.5" />}
                title="Declared profile"
                subtitle="What the publisher submitted at onboarding."
              />
              <PanelBody className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                      Traffic sources
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {(profile?.trafficSources ?? []).length === 0 ? (
                        <span className="text-[13px] text-faint">None declared.</span>
                      ) : (
                        profile!.trafficSources.map((t) => (
                          <TrafficSourceChip key={t} source={t} />
                        ))
                      )}
                    </div>
                    {profile?.trafficSources.some(
                      (t) => TRAFFIC_SOURCE[t].tone === "danger",
                    ) && (
                      <p className="mt-1.5 text-[12px] leading-relaxed text-warning">
                        Declares a high-risk source class. Buyers excluding it will
                        never match these leads at step 6.
                      </p>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                      Agreement
                    </h3>
                    {profile?.agreementSignedAt ? (
                      <div className="space-y-1">
                        <Badge tone="success" dot>
                          Signed {shortDate(profile.agreementSignedAt)}
                        </Badge>
                        {profile.agreementPdfUrl && (
                          <p className="font-mono text-[12px] break-all text-muted">
                            {profile.agreementPdfUrl}
                          </p>
                        )}
                      </div>
                    ) : (
                      <Badge tone="danger" dot>
                        Not signed
                      </Badge>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                    Landing pages
                  </h3>
                  <ul className="space-y-1">
                    {(profile?.landingPageUrls ?? []).map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[12px] text-accent hover:underline"
                        >
                          {url}
                          <ExternalLink className="size-3" />
                        </a>
                      </li>
                    ))}
                    {(profile?.landingPageUrls ?? []).length === 0 && (
                      <li className="text-[13px] text-faint">None declared.</li>
                    )}
                  </ul>
                </div>

                <div>
                  <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                    Submitted disclosure text
                  </h3>
                  {profile?.disclosureText ? (
                    <blockquote className="rounded-md border border-line bg-sunken px-3 py-2.5 text-[13px] leading-relaxed text-muted">
                      {profile.disclosureText}
                    </blockquote>
                  ) : (
                    <p className="text-[13px] text-faint">None submitted.</p>
                  )}
                </div>

                {profile?.consentSampleUrl && (
                  <div>
                    <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                      Consent capture sample
                    </h3>
                    <a
                      href={profile.consentSampleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[12px] text-accent hover:underline"
                    >
                      {profile.consentSampleUrl}
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                )}

                <div>
                  <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                    Industry references
                  </h3>
                  {references.length === 0 ? (
                    <p className="text-[13px] text-faint">None supplied.</p>
                  ) : (
                    <ul className="divide-y divide-[var(--border)] rounded-md border border-line">
                      {references.map((r) => (
                        <li
                          key={`${r.email}-${r.company}`}
                          className="flex items-start justify-between gap-3 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="text-[13px] text-ink">
                              {r.name}
                              <span className="text-faint"> · {r.company}</span>
                            </div>
                            <div className="font-mono text-[12px] text-muted">
                              {r.email}
                            </div>
                            <div className="mt-0.5 text-[12px] text-faint">
                              {r.relationship}
                            </div>
                          </div>
                          <Badge tone={r.verified ? "success" : "warning"} dot>
                            {r.verified ? "Verified" : "Unverified"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </PanelBody>
            </Panel>

            {/* Sources */}
            <Panel>
              <PanelHeader
                icon={<Radio className="size-3.5" />}
                title="Sources"
                subtitle="Source IDs are immutable and travel with every lead."
              />
              <PanelBody dense>
                <div className="grid-scroll">
                  <table className="w-full text-left">
                    <thead className="border-b border-line bg-sunken">
                      <tr>
                        {["Source ID", "Label", "Vertical", "Traffic", "Landing page", "State"].map(
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
                      {org.sources.map((s) => (
                        <tr key={s.id} className="border-b border-line last:border-0">
                          <td className="px-3.5 py-2.5 font-mono text-[12px] text-accent">
                            {s.sourceId}
                          </td>
                          <td className="px-3.5 py-2.5 text-[13px] text-ink">{s.label}</td>
                          <td className="px-3.5 py-2.5 text-[13px] text-muted">
                            {verticalLabel(s.vertical)}
                          </td>
                          <td className="px-3 py-2">
                            <TrafficSourceChip source={s.trafficSource} />
                          </td>
                          <td className="max-w-[16rem] truncate px-3.5 py-2.5 font-mono text-[12px] text-muted">
                            {s.landingPageUrl ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={s.active ? "success" : "neutral"} dot>
                              {s.active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PanelBody>
            </Panel>
          </div>

          {/* ----------------------------------------------- Right column */}
          <div className="space-y-3">
            <Panel>
              <PanelHeader title="Status" icon={<UserCheck className="size-3.5" />} />
              <PanelBody className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-muted">Account</span>
                  <OrgStatusChip status={org.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-muted">Vetting</span>
                  {profile?.approvedAt ? (
                    <Badge tone="success" dot>
                      Approved {shortDate(profile.approvedAt)}
                    </Badge>
                  ) : (
                    <Badge tone="warning" dot>
                      Not approved
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-muted">Test batch</span>
                  <Badge tone={profile?.testBatchPassed ? "success" : "danger"} dot>
                    {profile?.testBatchPassed ? "Passed" : "Not passed"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-muted">Website</span>
                  {org.website ? (
                    <a
                      href={org.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[12px] text-accent hover:underline"
                    >
                      {org.website.replace(/^https?:\/\//, "")}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span className="text-[13px] text-faint">—</span>
                  )}
                </div>

                <PublisherAdminControls
                  orgId={org.id}
                  status={org.status}
                  checklistComplete={progress.complete}
                  checklistFailed={progress.failed}
                />
              </PanelBody>
            </Panel>

            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label="Submitted"
                value={count(volume.submitted)}
                icon={<Radio />}
              />
              <StatTile
                label="Delivered"
                value={count(volume.delivered)}
                icon={<CircleCheck />}
                sub={
                  volume.submitted > 0
                    ? percent(volume.delivered / volume.submitted, 0)
                    : undefined
                }
              />
              <StatTile
                label="Rejected"
                value={count(volume.rejected)}
                icon={<Ban />}
                goodDirection="down"
              />
              <StatTile
                label="Returns"
                value={count(volume.returned)}
                icon={<TriangleAlert />}
                goodDirection="down"
                accent={breach ? "danger" : undefined}
              />
            </div>

            <Panel>
              <PanelHeader
                title="Return rate"
                subtitle={`Auto-suspension fires at ${percent(AUTO_SUSPEND_RETURN_RATE, 0)} over 14 days.`}
              />
              <PanelBody className="space-y-3">
                {(
                  [
                    ["7-day", metrics?.returnRate7d ?? 0],
                    ["14-day", rate14],
                    ["30-day", metrics?.returnRate30d ?? 0],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex items-center gap-3">
                    <ProgressRing
                      value={value}
                      max={Math.max(AUTO_SUSPEND_RETURN_RATE * 2, value)}
                      size={38}
                      strokeWidth={4}
                      tone={
                        value >= AUTO_SUSPEND_RETURN_RATE
                          ? "danger"
                          : value >= AUTO_SUSPEND_RETURN_RATE * 0.7
                            ? "warning"
                            : "success"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-muted">{label}</div>
                      <div
                        className={`font-mono text-[14px] font-semibold tabular ${
                          value >= AUTO_SUSPEND_RETURN_RATE ? "text-danger" : "text-ink"
                        }`}
                      >
                        {percent(value, 1)}
                      </div>
                    </div>
                  </div>
                ))}
                <p className="border-t border-line pt-2 font-mono text-[11px] text-faint">
                  last computed {utcTimestamp(metrics?.lastComputedAt ?? null)}
                </p>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader
                title="Rejection profile"
                subtitle="Where this publisher's leads die."
              />
              <PanelBody>
                <RejectionBars rows={topRejections} />
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader
                title="Payout rates"
                icon={<FileText className="size-3.5" />}
              />
              <PanelBody dense>
                <ul className="divide-y divide-[var(--border)]">
                  {org.publisherRates.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between px-4 py-2"
                    >
                      <span className="text-[13px] text-muted">
                        {verticalLabel(r.vertical)}
                      </span>
                      <span className="font-mono text-[13px] text-ink tabular">
                        {money(r.payoutCpl)}
                      </span>
                    </li>
                  ))}
                  {org.publisherRates.length === 0 && (
                    <li className="px-4 py-3 text-[13px] text-faint">
                      No rates configured — routing falls back to 60% of buyer CPL.
                    </li>
                  )}
                </ul>
              </PanelBody>
            </Panel>

            <AuditNotes orgId={org.id} initial={profile?.auditNotes ?? ""} />
          </div>
        </div>
      </div>
    </>
  );
}
