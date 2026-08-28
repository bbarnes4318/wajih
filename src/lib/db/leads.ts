import { Prisma, type PipelineStage, type Vertical } from "@prisma/client";
import { prisma } from "./prisma";
import type { SessionUser } from "@/lib/auth/session";
import { leadScopeFor } from "@/lib/auth/rbac";

/**
 * Lead stream queries.
 *
 * Filtering and pagination are server-side and driven by URL search params, so
 * a filtered view is a shareable link and the table never has to hold the
 * whole network in memory.
 */

/** Buyer expiry-triage lens — see `buildWhere`'s `segment` handling below. */
export type LeadSegment = "closing2h" | "closingToday" | "allPending" | "history";

export interface LeadFilters {
  sourceId?: string;
  publisherOrgId?: string;
  buyerOrgId?: string;
  campaignId?: string;
  vertical?: Vertical;
  stage?: PipelineStage;
  /** Free text across lead id, phone, email and name. */
  q?: string;
  from?: string;
  to?: string;
  /** Only leads whose dispute window is still open. */
  disputable?: boolean;
  /** Buyer delivery-queue triage lens. Admin/publisher callers never pass this. */
  segment?: LeadSegment;
  /** `expiryAsc` sorts by soonest-closing window first; default is delivery-time order. */
  sort?: "expiryAsc" | "deliveredDesc";
  page?: number;
  pageSize?: number;
}

export const PAGE_SIZE = 50;

export function parseLeadFilters(
  params: Record<string, string | string[] | undefined>,
): LeadFilters {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const page = Number(one("page") ?? "1");
  const segment = one("segment");

  return {
    sourceId: one("source") || undefined,
    publisherOrgId: one("publisher") || undefined,
    buyerOrgId: one("buyer") || undefined,
    campaignId: one("campaign") || undefined,
    vertical: (one("vertical") as Vertical) || undefined,
    stage: (one("stage") as PipelineStage) || undefined,
    q: one("q")?.trim() || undefined,
    from: one("from") || undefined,
    to: one("to") || undefined,
    disputable: one("disputable") === "1" || undefined,
    segment: (["closing2h", "closingToday", "allPending", "history"] as const).includes(
      segment as LeadSegment,
    )
      ? (segment as LeadSegment)
      : undefined,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: PAGE_SIZE,
  };
}

function buildWhere(
  user: SessionUser,
  f: LeadFilters,
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { ...leadScopeFor(user) };

  if (f.sourceId) where.sourceId = f.sourceId;
  if (f.vertical) where.vertical = f.vertical;
  if (f.stage) where.pipelineStage = f.stage;
  if (f.campaignId) where.campaignId = f.campaignId;

  // A publisher may not widen its own scope by passing ?publisher=<someone else>.
  if (f.publisherOrgId && user.role !== "PUBLISHER") {
    where.publisherOrgId = f.publisherOrgId;
  }
  if (f.buyerOrgId && user.role !== "BUYER") {
    where.buyerOrgId = f.buyerOrgId;
  }

  if (f.disputable) {
    where.buyerStatus = "PENDING";
    where.disputeWindowExpiresAt = { gt: new Date() };
    where.deliveredAt = { not: null };
  }

  if (f.segment) {
    const now = new Date();
    if (f.segment === "history") {
      where.buyerStatus = { not: "PENDING" };
    } else {
      where.buyerStatus = "PENDING";
      where.deliveredAt = { not: null };
      if (f.segment === "closing2h") {
        where.disputeWindowExpiresAt = { gt: now, lte: new Date(now.getTime() + 2 * 3_600_000) };
      } else if (f.segment === "closingToday") {
        const endOfDay = new Date(now);
        endOfDay.setUTCHours(23, 59, 59, 999);
        where.disputeWindowExpiresAt = { gt: now, lte: endOfDay };
      }
      // "allPending" applies no further window constraint.
    }
  }

  if (f.from || f.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (f.from) createdAt.gte = new Date(`${f.from}T00:00:00.000Z`);
    if (f.to) createdAt.lte = new Date(`${f.to}T23:59:59.999Z`);
    where.createdAt = createdAt;
  }

  if (f.q) {
    const q = f.q;
    const digits = q.replace(/\D/g, "");
    where.OR = [
      { contactEmail: { contains: q, mode: "insensitive" } },
      { contactFirstName: { contains: q, mode: "insensitive" } },
      { contactLastName: { contains: q, mode: "insensitive" } },
      { sourceId: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 4
        ? [{ contactPhone: { contains: digits } } as Prisma.LeadWhereInput]
        : []),
      // Only try an id match when the string could actually be a UUID prefix.
      ...(/^[0-9a-f-]{8,36}$/i.test(q)
        ? [{ id: { equals: q } } as Prisma.LeadWhereInput]
        : []),
    ];
  }

  return where;
}

/** The row shape `toLeadTableRow` expects — shared with the SSE stream route so a pushed lead serializes identically to a paginated one. */
export const LEAD_ROW_SELECT = {
  id: true,
  sourceId: true,
  vertical: true,
  pipelineStage: true,
  rejectionStep: true,
  rejectionReasonCode: true,
  holdReason: true,
  buyerStatus: true,
  disputeReasonCode: true,
  disputeWindowExpiresAt: true,
  settlementStatus: true,
  contactFirstName: true,
  contactLastName: true,
  contactPhone: true,
  contactEmail: true,
  contactState: true,
  contactZip: true,
  trustedformCertUrl: true,
  jornayaLeadId: true,
  dncScrubPassed: true,
  litigatorScrubPassed: true,
  ingressChannel: true,
  ingressIp: true,
  publisherPayoutAmount: true,
  buyerCostAmount: true,
  pipelineDurationMs: true,
  createdAt: true,
  receivedAtUtc: true,
  deliveredAt: true,
  outcome: true,
  outcomeUpdatedAt: true,
  outcomeValueAmount: true,
  publisher: { select: { id: true, name: true } },
  buyer: { select: { id: true, name: true } },
  campaign: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;

export type LeadRow = Awaited<ReturnType<typeof queryLeads>>["rows"][number];

export async function queryLeads(user: SessionUser, f: LeadFilters) {
  const where = buildWhere(user, f);
  const page = f.page ?? 1;
  const pageSize = f.pageSize ?? PAGE_SIZE;

  const orderBy: Prisma.LeadOrderByWithRelationInput =
    f.sort === "expiryAsc" ? { disputeWindowExpiresAt: "asc" } : { createdAt: "desc" };

  const [rows, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: LEAD_ROW_SELECT,
    }),
    prisma.lead.count({ where }),
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Aggregate counts by pipeline stage for the filter rail and funnel charts. */
export async function stageCounts(user: SessionUser, f: LeadFilters) {
  const where = buildWhere(user, { ...f, stage: undefined, page: 1 });
  const grouped = await prisma.lead.groupBy({
    by: ["pipelineStage"],
    where,
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.pipelineStage, g._count._all]));
}

/** Unfiltered — the "closing within the hour" banner interrupts regardless of the buyer's current view. */
export async function buyerClosingSoonCount(user: SessionUser, minutes: number) {
  const now = new Date();
  return prisma.lead.count({
    where: {
      ...leadScopeFor(user),
      buyerStatus: "PENDING",
      deliveredAt: { not: null },
      disputeWindowExpiresAt: { gt: now, lte: new Date(now.getTime() + minutes * 60_000) },
    },
  });
}

/**
 * Counts for the buyer's expiry-triage segmented control, evaluated against
 * every filter *except* `segment` itself, so the counts describe "given your
 * other filters, how many fall in each triage lens" rather than double-
 * applying the currently-selected segment.
 */
export async function buyerSegmentCounts(
  user: SessionUser,
  f: LeadFilters,
): Promise<Record<LeadSegment, number>> {
  const segments: LeadSegment[] = ["closing2h", "closingToday", "allPending", "history"];
  const counts = await Promise.all(
    segments.map((segment) =>
      prisma.lead.count({
        where: buildWhere(user, { ...f, segment, page: 1 }),
      }),
    ),
  );
  return Object.fromEntries(segments.map((s, i) => [s, counts[i]])) as Record<
    LeadSegment,
    number
  >;
}

/** The buyer's saved filter-query-string snapshots, each with a live count against the current data. */
export async function buyerSavedViewsWithCounts(user: SessionUser) {
  const views = await prisma.savedView.findMany({
    where: { orgId: user.orgId, userId: user.id },
    orderBy: [{ pinned: "desc" }, { createdAt: "asc" }],
  });

  const counts = await Promise.all(
    views.map((v) => {
      const params = Object.fromEntries(new URLSearchParams(v.queryString));
      return prisma.lead.count({ where: buildWhere(user, parseLeadFilters(params)) });
    }),
  );

  return views.map((v, i) => ({ ...v, count: counts[i] }));
}

/** Full detail for the drill-down drawer, scoped to the caller's tenancy. */
export async function getLeadDetail(user: SessionUser, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...leadScopeFor(user) },
    include: {
      publisher: { select: { id: true, name: true } },
      buyer: { select: { id: true, name: true } },
      campaign: {
        select: { id: true, name: true, returnWindowHours: true, maxCpl: true },
      },
      source: { select: { sourceId: true, label: true, trafficSource: true } },
      auditTrail: { orderBy: [{ stepNumber: "asc" }, { createdAt: "asc" }] },
      deliveries: { orderBy: { attemptNumber: "asc" } },
    },
  });

  if (!lead) return null;

  // A publisher must not see what the network charged the buyer, and a buyer
  // must not see what the publisher was paid. Outcome is buyer-private too —
  // a buyer's sales performance is not a supply-quality signal a publisher
  // should ever see.
  if (user.role === "PUBLISHER") {
    return {
      ...lead,
      buyerCostAmount: null,
      outcome: null,
      outcomeUpdatedAt: null,
      outcomeValueAmount: null,
    };
  }
  if (user.role === "BUYER") {
    return { ...lead, publisherPayoutAmount: null };
  }
  return lead;
}

/** Distinct filter options, scoped to what the caller is allowed to see. */
export async function leadFilterOptions(user: SessionUser) {
  const [publishers, buyers, sources] = await Promise.all([
    user.role === "PUBLISHER"
      ? Promise.resolve([])
      : prisma.organization.findMany({
          where: { type: "PUBLISHER" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
    user.role === "BUYER"
      ? Promise.resolve([])
      : prisma.organization.findMany({
          where: { type: "BUYER" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
    prisma.leadSource.findMany({
      where:
        user.role === "PUBLISHER" ? { publisherOrgId: user.orgId } : undefined,
      select: { sourceId: true, label: true },
      orderBy: { sourceId: "asc" },
    }),
  ]);

  return { publishers, buyers, sources };
}
