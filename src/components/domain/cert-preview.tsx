"use client";

import { useState } from "react";
import { ExternalLink, ShieldCheck, ShieldX } from "lucide-react";
import type { LeadDetailView } from "@/lib/db/lead-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { utcTimestamp } from "@/lib/format";
import { CopyButton } from "./copy-button";

/**
 * One-click compliance certificate preview.
 *
 * Deliberately does not iframe the certificate: TrustedForm session replays
 * are authenticated, billable to claim, and hostile to embedding. What an
 * auditor needs from this view is the certificate identity, the disclosure
 * text captured alongside it, and a link out — which is what it shows.
 */
export function CertPreview({ lead }: { lead: LeadDetailView }) {
  const [open, setOpen] = useState(false);

  const kind = lead.hasTrustedForm
    ? "TrustedForm"
    : lead.hasJornaya
      ? "Jornaya"
      : null;

  if (!kind) {
    return (
      <Badge tone="danger" dot>
        None captured
      </Badge>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded border border-violet-border bg-violet-soft px-1.5 py-0.5 text-meta font-medium text-violet transition-opacity hover:opacity-80"
      >
        <ShieldCheck className="size-3" />
        {kind}
      </button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Consent certificate"
        subtitle={`Lead ${lead.id}`}
        footer={
          lead.trustedformCertUrl ? (
            <Button asChild variant="secondary" size="md">
              <a
                href={lead.trustedformCertUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-3.5" />
                Open certificate
              </a>
            </Button>
          ) : null
        }
      >
        <div className="space-y-4">
          <dl className="panel divide-y divide-[var(--border)] p-3">
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="text-meta text-faint">Provider</dt>
              <dd className="text-body text-ink">{kind}</dd>
            </div>

            {lead.trustedformCertUrl && (
              <div className="flex items-baseline justify-between gap-3 py-1">
                <dt className="shrink-0 text-meta text-faint">Certificate URL</dt>
                <dd className="flex min-w-0 items-center gap-1">
                  <span className="truncate font-mono text-meta text-muted">
                    {lead.trustedformCertUrl}
                  </span>
                  <CopyButton value={lead.trustedformCertUrl} label="certificate URL" />
                </dd>
              </div>
            )}

            {lead.jornayaLeadId && (
              <div className="flex items-baseline justify-between gap-3 py-1">
                <dt className="shrink-0 text-meta text-faint">Jornaya LeadiD</dt>
                <dd className="flex min-w-0 items-center gap-1">
                  <span className="truncate font-mono text-meta text-muted">
                    {lead.jornayaLeadId}
                  </span>
                  <CopyButton value={lead.jornayaLeadId} label="Jornaya ID" />
                </dd>
              </div>
            )}

            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="text-meta text-faint">Captured (UTC)</dt>
              <dd className="font-mono text-meta text-muted tabular">
                {utcTimestamp(lead.receivedAtUtc)}
              </dd>
            </div>

            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="text-meta text-faint">Ingress IP</dt>
              <dd className="font-mono text-meta text-muted">
                {lead.ingressIp ?? "—"}
              </dd>
            </div>
          </dl>

          <div>
            <h3 className="mb-1.5 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
              Verbatim disclosure captured at submission
            </h3>
            {lead.consentTextCaptured ? (
              <blockquote className="rounded-md border border-line bg-sunken px-3 py-2.5 text-body leading-relaxed text-muted">
                {lead.consentTextCaptured}
              </blockquote>
            ) : (
              <p className="flex items-center gap-1.5 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-body text-danger">
                <ShieldX className="size-3.5 shrink-0" />
                No disclosure text was captured with this certificate.
              </p>
            )}
          </div>

          {lead.ingressUserAgent && (
            <div>
              <h3 className="mb-1.5 text-micro font-semibold tracking-[0.07em] text-faint uppercase">
                Submitting user agent
              </h3>
              <p className="font-mono text-meta leading-relaxed break-all text-muted">
                {lead.ingressUserAgent}
              </p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
