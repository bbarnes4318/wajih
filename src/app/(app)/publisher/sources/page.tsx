import type { Metadata } from "next";
import { Plug, Braces } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrafficSourceChip } from "@/components/domain/status-chip";
import { JsonBlock } from "@/components/domain/json-block";
import { requirePublisher } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { verticalLabel } from "@/lib/domain/labels";
import { csvTemplateHeaders } from "@/lib/domain/verticals";
import { count, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Sources & API" };

export default async function PublisherSourcesPage() {
  const user = await requirePublisher();

  const sources = await prisma.leadSource.findMany({
    where: { publisherOrgId: user.orgId },
    orderBy: { sourceId: "asc" },
    include: { _count: { select: { leads: true } } },
  });

  const sample = sources[0];

  return (
    <>
      <Topbar
        user={user}
        title="Sources & API"
        subtitle="Source IDs are immutable and carry through every table, header and export."
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <Panel className="mb-4">
          <PanelHeader
            icon={<Plug className="size-3.5" />}
            title="Your sources"
            subtitle="One per traffic stream. Provisioned by network operations."
          />
          <PanelBody dense>
            <div className="grid-scroll">
              <table className="w-full text-left">
                <thead className="border-b border-line bg-sunken">
                  <tr>
                    {["Source ID", "Label", "Vertical", "Traffic", "Landing page", "Leads", "State", "Created"].map((h) => (
                      <th key={h} className="px-3.5 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <td className="px-3.5 py-2.5 font-mono text-[12px] text-accent">{s.sourceId}</td>
                      <td className="px-3.5 py-2.5 text-[13px] text-ink">{s.label}</td>
                      <td className="px-3.5 py-2.5 text-[13px] text-muted">{verticalLabel(s.vertical)}</td>
                      <td className="px-3 py-2"><TrafficSourceChip source={s.trafficSource} /></td>
                      <td className="max-w-[18rem] truncate px-3.5 py-2.5 font-mono text-[12px] text-muted">
                        {s.landingPageUrl ?? "—"}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono text-[12px] text-ink tabular">
                        {count(s._count.leads)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={s.active ? "success" : "neutral"} dot>
                          {s.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-[12px] text-muted">{shortDate(s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            icon={<Braces className="size-3.5" />}
            title="Posting API"
            subtitle="Single-lead submissions run the identical waterfall as a CSV batch."
          />
          <PanelBody className="space-y-4">
            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                Endpoint
              </h3>
              <p className="font-mono text-[13px] text-ink">POST /api/intake</p>
            </div>

            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                Request body
              </h3>
              <JsonBlock
                value={{
                  source_id: sample?.sourceId ?? "YOUR-SOURCE-ID",
                  trustedform_cert_url: "https://cert.trustedform.com/<40-hex-chars>",
                  jornaya_lead_id: null,
                  consent_text: "The verbatim disclosure the consumer accepted.",
                  payload: {
                    first_name: "Jane",
                    last_name: "Doe",
                    phone: "+16025550142",
                    email: "jane.doe@example.com",
                    state: "AZ",
                    zip: "85004",
                    date_of_birth: "1984-06-11",
                  },
                }}
              />
            </div>

            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                Response
              </h3>
              <JsonBlock
                value={{
                  accepted: true,
                  lead_id: "1f0c9c1e-…",
                  source_id: sample?.sourceId ?? "YOUR-SOURCE-ID",
                  pipeline_stage: "ROUTED",
                  rejection_step: null,
                  reason_code: null,
                  duration_ms: 62,
                }}
              />
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                A rejection returns the same shape with{" "}
                <code className="font-mono">accepted: false</code> and an enum{" "}
                <code className="font-mono">reason_code</code>. There are no free-text
                error strings to parse.
              </p>
            </div>

            {sample && (
              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                  CSV columns for {verticalLabel(sample.vertical)}
                </h3>
                <p className="font-mono text-[12px] leading-relaxed break-all text-muted">
                  {csvTemplateHeaders(sample.vertical).join(", ")}
                </p>
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
