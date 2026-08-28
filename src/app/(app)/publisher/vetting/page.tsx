import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { VettingChecklist } from "@/components/domain/vetting-checklist";
import { OrgStatusChip } from "@/components/domain/status-chip";
import { requirePublisher } from "@/lib/auth/rbac";
import { getPublisherDetail } from "@/lib/db/vetting";
import { shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Vetting Status" };

/**
 * Read-only mirror of the admin checklist. The publisher sees exactly which
 * points are outstanding and the reviewer's notes on each — the standard is
 * published, not hidden behind an opaque "under review".
 */
export default async function PublisherVettingPage() {
  const user = await requirePublisher();
  const detail = await getPublisherDetail(user.orgId);
  if (!detail) notFound();

  const { org, checks, progress } = detail;

  return (
    <>
      <Topbar
        user={user}
        title="Vetting Status"
        subtitle="Nine verification points stand between an account and live traffic."
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <Panel>
          <PanelHeader
            icon={<ShieldCheck className="size-3.5" />}
            title="Your checklist"
            subtitle={
              org.vettingProfile?.approvedAt
                ? `Approved ${shortDate(org.vettingProfile.approvedAt)}.`
                : "Every point must pass or be waived before your sources go live."
            }
            action={
              <div className="flex items-center gap-2.5">
                <OrgStatusChip status={org.status} />
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
              </div>
            }
          />
          <PanelBody dense>
            <VettingChecklist
              orgId={org.id}
              readOnly
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
      </div>
    </>
  );
}
