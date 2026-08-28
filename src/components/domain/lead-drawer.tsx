"use client";

import { useEffect, useState } from "react";
import {
  Braces,
  ExternalLink,
  Hash,
  MapPin,
  Send,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import type { LeadDetailView } from "@/lib/db/lead-view";
import { cn } from "@/lib/utils";
import {
  midTruncate,
  money,
  ms,
  phoneDisplay,
  utcTimestamp,
} from "@/lib/format";
import { humanize, verticalLabel } from "@/lib/domain/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditTrail } from "./audit-trail";
import { CertPreview } from "./cert-preview";
import { CopyButton } from "./copy-button";
import { CountdownBadge } from "./countdown-badge";
import { JsonBlock } from "./json-block";
import {
  BuyerStatusChip,
  ChannelChip,
  DisputeReasonChip,
  ReasonChip,
  SettlementChip,
  StageChip,
  StepChip,
} from "./status-chip";

type Tab = "trail" | "payload" | "delivery";

const TABS: Array<{ id: Tab; label: string; icon: typeof Workflow }> = [
  { id: "trail", label: "Audit Trail", icon: Workflow },
  { id: "payload", label: "Payload", icon: Braces },
  { id: "delivery", label: "Delivery", icon: Send },
];

function Row({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-meta text-faint">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right text-body text-ink",
          mono && "font-mono text-meta tabular",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel p-3">
      <h3 className="mb-1.5 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
        {title}
      </h3>
      <dl className="divide-y divide-[var(--border)]">{children}</dl>
    </div>
  );
}

/**
 * Full-detail inspection for one lead. Opens over the stream so the reader
 * keeps their place in the list.
 */
/** One fetch outcome, tagged with the lead it belongs to. */
type FetchResult =
  | { leadId: string; data: LeadDetailView; error?: undefined }
  | { leadId: string; data?: undefined; error: string };

export function LeadDrawer({
  leadId,
  onClose,
  /** Rendered in the footer — dispute controls for buyers, adjudication for admins. */
  actions,
}: {
  leadId: string | null;
  onClose: () => void;
  actions?: (lead: LeadDetailView) => React.ReactNode;
}) {
  // A single result object tagged with its lead id, so nothing has to be reset
  // synchronously when `leadId` changes — a stale result simply stops matching
  // and `loading` falls out of that comparison.
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    if (!leadId) return;

    const controller = new AbortController();

    fetch(`/api/leads/${leadId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "NOT_FOUND" : "LOAD_FAILED");
        return (await res.json()) as LeadDetailView;
      })
      .then((data) => setResult({ leadId, data }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResult({
          leadId,
          error: err instanceof Error ? err.message : "LOAD_FAILED",
        });
      });

    return () => controller.abort();
  }, [leadId]);

  const current = result?.leadId === leadId ? result : null;
  const lead = current?.data ?? null;
  const error = current?.error ?? null;
  const loading = Boolean(leadId) && current === null;

  return (
    <Drawer
      open={Boolean(leadId)}
      onOpenChange={(open) => !open && onClose()}
      width="2xl"
      title={
        <span className="flex items-center gap-2">
          <Hash className="size-3.5 text-faint" />
          <span className="font-mono text-body">
            {leadId ? midTruncate(leadId, 12, 6) : ""}
          </span>
          {leadId && <CopyButton value={leadId} label="lead ID" />}
        </span>
      }
      subtitle={
        lead ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-accent">{lead.sourceId}</span>
            <span className="text-faint">·</span>
            <span>{verticalLabel(lead.vertical)}</span>
            <span className="text-faint">·</span>
            <span>{lead.publisherName}</span>
          </span>
        ) : undefined
      }
      footer={lead && actions ? actions(lead) : undefined}
    >
      {loading && (
        <div className="space-y-3 p-5">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {error && (
        <p className="p-8 text-center text-ui text-danger">
          {error === "NOT_FOUND"
            ? "This lead does not exist, or is outside your access scope."
            : "Could not load this lead."}
        </p>
      )}

      {lead && !loading && (
        <LeadDrawerBody key={lead.id} lead={lead} />
      )}
    </Drawer>
  );
}

/**
 * The loaded body. Keyed by lead id in the parent, so opening a different lead
 * mounts a fresh copy and the active tab returns to the audit trail without an
 * effect having to reset it.
 */
function LeadDrawerBody({ lead }: { lead: LeadDetailView }) {
  const [tab, setTab] = useState<Tab>("trail");

  return (
        <>
          {/* Status strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-sunken px-5 py-2.5">
            <StageChip stage={lead.pipelineStage} />
            {lead.rejectionStep && <StepChip step={lead.rejectionStep} />}
            {(lead.rejectionReasonCode || lead.holdReason) && (
              <ReasonChip code={(lead.rejectionReasonCode ?? lead.holdReason)!} />
            )}
            {lead.deliveredAt && <BuyerStatusChip status={lead.buyerStatus} />}
            {lead.disputeReasonCode && (
              <DisputeReasonChip code={lead.disputeReasonCode} />
            )}
            {lead.deliveredAt && lead.buyerStatus === "PENDING" && (
              <CountdownBadge expiresAt={lead.disputeWindowExpiresAt} />
            )}
            <SettlementChip status={lead.settlementStatus} />
            <ChannelChip channel={lead.ingressChannel} />
          </div>

          {/* Summary grid */}
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <Section title="Consumer">
              <Row label="Name">{lead.contactName}</Row>
              <Row label="Phone" mono>
                {phoneDisplay(lead.contactPhone)}
              </Row>
              <Row label="Email" mono>
                {lead.contactEmail ?? "—"}
              </Row>
              <Row label="Location" mono>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3 text-faint" />
                  {lead.contactState ?? "—"} {lead.contactZip ?? ""}
                </span>
              </Row>
            </Section>

            <Section title="Intake">
              <Row label="Source ID" mono>
                <span className="text-accent">{lead.sourceId}</span>
              </Row>
              <Row label="Source label">{lead.sourceLabel ?? "—"}</Row>
              <Row label="Traffic source">
                {lead.trafficSource ? humanize(lead.trafficSource) : "—"}
              </Row>
              <Row label="Received (UTC)" mono>
                {utcTimestamp(lead.receivedAtUtc)}
              </Row>
              <Row label="Ingress IP" mono>
                {lead.ingressIp ?? "—"}
              </Row>
              <Row label="Pipeline time" mono>
                {ms(lead.pipelineDurationMs)}
              </Row>
            </Section>

            <Section title="Compliance">
              <Row label="DNC scrub">
                {lead.dncScrubPassed === null ? (
                  <span className="text-faint">not reached</span>
                ) : (
                  <Badge tone={lead.dncScrubPassed ? "success" : "danger"} dot>
                    {lead.dncScrubPassed ? "Clear" : "Hit"}
                  </Badge>
                )}
              </Row>
              <Row label="Litigator scrub">
                {lead.litigatorScrubPassed === null ? (
                  <span className="text-faint">not reached</span>
                ) : (
                  <Badge tone={lead.litigatorScrubPassed ? "success" : "danger"} dot>
                    {lead.litigatorScrubPassed ? "Clear" : "Hit"}
                  </Badge>
                )}
              </Row>
              <Row label="Dedup hash" mono>
                <span title={lead.dedupHash}>{midTruncate(lead.dedupHash, 10, 6)}</span>
              </Row>
              <Row label="Certificate">
                <CertPreview lead={lead} />
              </Row>
            </Section>

            <Section title="Commercial">
              <Row label="Buyer">{lead.buyerName ?? "—"}</Row>
              <Row label="Campaign">{lead.campaignName ?? "—"}</Row>
              {lead.buyerCostAmount !== null && (
                <Row label="Buyer cost" mono>
                  {money(lead.buyerCostAmount)}
                </Row>
              )}
              {lead.publisherPayoutAmount !== null && (
                <Row label="Publisher payout" mono>
                  {money(lead.publisherPayoutAmount)}
                </Row>
              )}
              <Row label="Delivered (UTC)" mono>
                {utcTimestamp(lead.deliveredAt)}
              </Row>
              <Row label="Return window" mono>
                {lead.campaignReturnWindowHours
                  ? `${lead.campaignReturnWindowHours}h`
                  : "—"}
              </Row>
            </Section>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-line px-5">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-body transition-colors",
                    active
                      ? "border-accent font-medium text-ink"
                      : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                  {t.id === "trail" && (
                    <Badge tone="neutral">{lead.auditTrail.length}</Badge>
                  )}
                  {t.id === "delivery" && lead.deliveries.length > 0 && (
                    <Badge tone="neutral">{lead.deliveries.length}</Badge>
                  )}
                </button>
              );
            })}
          </div>

          {tab === "trail" && <AuditTrail rows={lead.auditTrail} />}

          {tab === "payload" && (
            <div className="space-y-3 p-5">
              {lead.consentTextCaptured && (
                <div className="panel p-3">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
                    <ShieldCheck className="size-3" />
                    Verbatim disclosure captured
                  </h3>
                  <p className="text-body leading-relaxed text-muted">
                    {lead.consentTextCaptured}
                  </p>
                </div>
              )}
              <div>
                <h3 className="mb-1.5 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
                  Lead payload (JSONB)
                </h3>
                <JsonBlock value={lead.payload} maxHeight="32rem" />
              </div>
              {lead.ingressUserAgent && (
                <div>
                  <h3 className="mb-1.5 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
                    User agent
                  </h3>
                  <p className="font-mono text-meta leading-relaxed break-all text-muted">
                    {lead.ingressUserAgent}
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "delivery" && (
            <div className="space-y-3 p-5">
              {lead.deliveries.length === 0 ? (
                <p className="py-8 text-center text-xs text-faint">
                  No delivery attempts recorded — this lead never reached routing.
                </p>
              ) : (
                lead.deliveries.map((d) => (
                  <div key={d.id} className="panel overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-meta text-faint">
                          #{d.attemptNumber}
                        </span>
                        <Badge
                          tone={
                            d.status === "SUCCESS"
                              ? "success"
                              : d.status === "EXHAUSTED"
                                ? "danger"
                                : d.status === "FAILED"
                                  ? "warning"
                                  : "neutral"
                          }
                          dot
                        >
                          {humanize(d.status)}
                        </Badge>
                        {d.responseStatus !== null && (
                          <span className="font-mono text-meta text-muted">
                            HTTP {d.responseStatus}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-meta text-muted tabular">
                          {ms(d.latencyMs)}
                        </span>
                        <span className="font-mono text-micro text-faint">
                          {utcTimestamp(d.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="px-3 py-2">
                      <div className="mb-1 flex items-center gap-1.5">
                        <ExternalLink className="size-3 text-faint" />
                        <span className="font-mono text-meta break-all text-muted">
                          {d.url}
                        </span>
                      </div>
                      {d.nextRetryAt && (
                        <p className="text-meta text-warning">
                          Next retry scheduled {utcTimestamp(d.nextRetryAt)}
                        </p>
                      )}
                      {d.errorLog && (
                        <p className="mt-1 font-mono text-meta text-danger">
                          {d.errorLog}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-3 border-t border-line px-3 py-2.5 lg:grid-cols-2">
                      <div>
                        <div className="mb-1 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
                          Request headers
                        </div>
                        <JsonBlock value={d.requestHeaders} maxHeight="12rem" />
                      </div>
                      <div>
                        <div className="mb-1 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
                          Response body
                        </div>
                        <pre className="max-h-48 overflow-auto rounded-md border border-line bg-sunken px-3 py-2.5 font-mono text-meta leading-relaxed break-words whitespace-pre-wrap text-muted">
                          {d.responseBody ?? "—"}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
  );
}

export { Button as DrawerButton };
