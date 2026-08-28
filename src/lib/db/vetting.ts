import type { VettingCheckKey, VettingCheckStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { VETTING_CHECK_ORDER } from "@/lib/domain/labels";

/**
 * Publisher vetting queries.
 *
 * The 9-point checklist is stored as rows rather than booleans on the profile
 * so each point carries its own status, reviewer, timestamp and evidence link
 * — which is what makes it auditable after the fact.
 */

export interface VettingReference {
  name: string;
  company: string;
  email: string;
  phone: string;
  relationship: string;
  verified: boolean;
}

/** A profile is approvable only when all nine points have passed or been waived. */
export function isChecklistComplete(
  checks: Array<{ key: VettingCheckKey; status: VettingCheckStatus }>,
): boolean {
  const byKey = new Map(checks.map((c) => [c.key, c.status]));
  return VETTING_CHECK_ORDER.every((k) => {
    const s = byKey.get(k);
    return s === "PASSED" || s === "WAIVED";
  });
}

export function checklistProgress(
  checks: Array<{ key: VettingCheckKey; status: VettingCheckStatus }>,
) {
  const passed = checks.filter(
    (c) => c.status === "PASSED" || c.status === "WAIVED",
  ).length;
  const failed = checks.filter((c) => c.status === "FAILED").length;
  const inReview = checks.filter((c) => c.status === "IN_REVIEW").length;
  return {
    passed,
    failed,
    inReview,
    total: VETTING_CHECK_ORDER.length,
    complete: isChecklistComplete(checks),
  };
}

export async function listPublishers() {
  const publishers = await prisma.organization.findMany({
    where: { type: "PUBLISHER" },
    select: {
      id: true,
      name: true,
      status: true,
      einTaxId: true,
      website: true,
      contactName: true,
      contactEmail: true,
      createdAt: true,
      metrics: true,
      vettingProfile: {
        select: {
          id: true,
          submittedAt: true,
          approvedAt: true,
          agreementSignedAt: true,
          testBatchPassed: true,
          checks: { select: { key: true, status: true } },
        },
      },
      sources: { select: { id: true, vertical: true, active: true } },
      _count: { select: { leadsAsPublisher: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return publishers.map((p) => ({
    ...p,
    progress: checklistProgress(p.vettingProfile?.checks ?? []),
  }));
}

export async function getPublisherDetail(orgId: string) {
  const org = await prisma.organization.findFirst({
    where: { id: orgId, type: "PUBLISHER" },
    include: {
      metrics: true,
      users: { select: { id: true, name: true, email: true, lastLoginAt: true } },
      sources: { orderBy: { sourceId: "asc" } },
      publisherRates: { orderBy: { vertical: "asc" } },
      vettingProfile: { include: { checks: true } },
    },
  });

  if (!org) return null;

  // Fill in any checklist point that has no row yet, so the wizard always
  // renders all nine in a stable order.
  const existing = new Map(
    (org.vettingProfile?.checks ?? []).map((c) => [c.key, c]),
  );
  const checks = VETTING_CHECK_ORDER.map((key) => {
    const row = existing.get(key);
    return {
      key,
      status: row?.status ?? ("NOT_STARTED" as VettingCheckStatus),
      notes: row?.notes ?? null,
      evidenceUrl: row?.evidenceUrl ?? null,
      checkedAt: row?.checkedAt ?? null,
      id: row?.id ?? null,
    };
  });

  const [submitted, delivered, returned, rejected] = await Promise.all([
    prisma.lead.count({ where: { publisherOrgId: orgId } }),
    prisma.lead.count({ where: { publisherOrgId: orgId, deliveredAt: { not: null } } }),
    prisma.lead.count({ where: { publisherOrgId: orgId, buyerStatus: "RETURN_APPROVED" } }),
    prisma.lead.count({ where: { publisherOrgId: orgId, pipelineStage: "REJECTED" } }),
  ]);

  const topRejections = await prisma.lead.groupBy({
    by: ["rejectionReasonCode", "rejectionStep"],
    where: { publisherOrgId: orgId, rejectionReasonCode: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { rejectionReasonCode: "desc" } },
    take: 6,
  });

  return {
    org,
    checks,
    progress: checklistProgress(checks),
    references: (org.vettingProfile?.references ?? []) as unknown as VettingReference[],
    volume: { submitted, delivered, returned, rejected },
    topRejections: topRejections
      .filter((r) => r.rejectionReasonCode !== null)
      .map((r) => ({
        code: r.rejectionReasonCode!,
        step: r.rejectionStep,
        count: r._count._all,
      })),
  };
}

/** The vetting queue: anything not yet approved, plus anything suspended. */
export async function vettingQueue() {
  const all = await listPublishers();
  return {
    pending: all.filter((p) => p.status === "PENDING_VETTING"),
    suspended: all.filter((p) => p.status === "SUSPENDED"),
    active: all.filter((p) => p.status === "ACTIVE"),
    terminated: all.filter((p) => p.status === "TERMINATED"),
  };
}
