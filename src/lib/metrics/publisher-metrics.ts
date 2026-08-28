import { prisma } from "@/lib/db/prisma";

/**
 * Publisher return-rate metrics and the auto-suspension trigger.
 *
 * Rolling windows are measured against *delivery* time, not submission time:
 * a return can only exist for a lead that reached a buyer, so pairing returns
 * with submissions would understate the rate for publishers whose leads are
 * mostly filtered out pre-delivery.
 */

/** Rolling 14-day return rate at or above this suspends the publisher. */
export const AUTO_SUSPEND_RETURN_RATE = 0.15;

/**
 * Minimum delivered volume in the window before the trigger can fire.
 *
 * Without a floor the rule is unusable in practice — a publisher's first
 * delivered lead being returned reads as a 100% return rate and terminates
 * a relationship on a sample size of one. 20 is the smallest window where a
 * 15% threshold is more signal than noise.
 */
export const AUTO_SUSPEND_MIN_VOLUME = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns approved by the network, i.e. leads the publisher does not get paid for. */
const RETURNED_STATUSES = ["RETURN_APPROVED"] as const;

export interface PublisherMetricsSnapshot {
  publisherOrgId: string;
  totalSubmitted: number;
  totalDelivered: number;
  totalReturned: number;
  totalRejected: number;
  returnRate7d: number;
  returnRate14d: number;
  returnRate30d: number;
  autoSuspended: boolean;
  autoSuspendedAt: Date | null;
}

async function windowedReturnRate(
  publisherOrgId: string,
  days: number,
  now: Date,
): Promise<number> {
  const since = new Date(now.getTime() - days * DAY_MS);

  const [delivered, returned] = await Promise.all([
    prisma.lead.count({
      where: { publisherOrgId, deliveredAt: { gte: since } },
    }),
    prisma.lead.count({
      where: {
        publisherOrgId,
        deliveredAt: { gte: since },
        buyerStatus: { in: [...RETURNED_STATUSES] },
      },
    }),
  ]);

  return delivered === 0 ? 0 : returned / delivered;
}

export async function recomputePublisherMetrics(
  publisherOrgId: string,
): Promise<PublisherMetricsSnapshot> {
  const now = new Date();

  const [totalSubmitted, totalDelivered, totalReturned, totalRejected] =
    await Promise.all([
      prisma.lead.count({ where: { publisherOrgId } }),
      prisma.lead.count({ where: { publisherOrgId, deliveredAt: { not: null } } }),
      prisma.lead.count({
        where: { publisherOrgId, buyerStatus: { in: [...RETURNED_STATUSES] } },
      }),
      prisma.lead.count({ where: { publisherOrgId, pipelineStage: "REJECTED" } }),
    ]);

  const [returnRate7d, returnRate14d, returnRate30d] = await Promise.all([
    windowedReturnRate(publisherOrgId, 7, now),
    windowedReturnRate(publisherOrgId, 14, now),
    windowedReturnRate(publisherOrgId, 30, now),
  ]);

  const existing = await prisma.publisherMetrics.findUnique({
    where: { publisherOrgId },
    select: { autoSuspendedAt: true },
  });

  const deliveredIn14d = await prisma.lead.count({
    where: {
      publisherOrgId,
      deliveredAt: { gte: new Date(now.getTime() - 14 * DAY_MS) },
    },
  });

  const breaches =
    deliveredIn14d >= AUTO_SUSPEND_MIN_VOLUME &&
    returnRate14d >= AUTO_SUSPEND_RETURN_RATE;

  const autoSuspendedAt = breaches
    ? (existing?.autoSuspendedAt ?? now)
    : existing?.autoSuspendedAt ?? null;

  await prisma.publisherMetrics.upsert({
    where: { publisherOrgId },
    create: {
      publisherOrgId,
      totalSubmitted,
      totalDelivered,
      totalReturned,
      totalRejected,
      returnRate7d,
      returnRate14d,
      returnRate30d,
      autoSuspendedAt,
      lastComputedAt: now,
    },
    update: {
      totalSubmitted,
      totalDelivered,
      totalReturned,
      totalRejected,
      returnRate7d,
      returnRate14d,
      returnRate30d,
      autoSuspendedAt,
      lastComputedAt: now,
    },
  });

  // Fire the suspension exactly once — on the transition, not on every recompute.
  if (breaches && !existing?.autoSuspendedAt) {
    await suspendPublisher(publisherOrgId, returnRate14d, deliveredIn14d);
  }

  return {
    publisherOrgId,
    totalSubmitted,
    totalDelivered,
    totalReturned,
    totalRejected,
    returnRate7d,
    returnRate14d,
    returnRate30d,
    autoSuspended: Boolean(autoSuspendedAt),
    autoSuspendedAt,
  };
}

async function suspendPublisher(
  publisherOrgId: string,
  rate14d: number,
  volume14d: number,
) {
  const org = await prisma.organization.findUnique({
    where: { id: publisherOrgId },
    select: { name: true, status: true },
  });
  if (!org || org.status !== "ACTIVE") return;

  const admins = await prisma.organization.findMany({
    where: { type: "INTERNAL" },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.organization.update({
      where: { id: publisherOrgId },
      data: { status: "SUSPENDED" },
    }),
    prisma.notification.create({
      data: {
        orgId: publisherOrgId,
        severity: "CRITICAL",
        code: "AUTO_SUSPENDED",
        title: "Account suspended — 14-day return rate threshold breached",
        body: `RETURN_RATE_14D=${(rate14d * 100).toFixed(1)}% THRESHOLD=${(
          AUTO_SUSPEND_RETURN_RATE * 100
        ).toFixed(0)}% DELIVERED_14D=${volume14d}`,
      },
    }),
    ...admins.map((a) =>
      prisma.notification.create({
        data: {
          orgId: a.id,
          severity: "CRITICAL",
          code: "PUBLISHER_AUTO_SUSPENDED",
          title: `${org.name} auto-suspended`,
          body: `RETURN_RATE_14D=${(rate14d * 100).toFixed(1)}% DELIVERED_14D=${volume14d}`,
        },
      }),
    ),
    prisma.adminAuditLog.create({
      data: {
        // System-initiated: the actor is the org itself, not a human user.
        actorUserId: publisherOrgId,
        action: "AUTO_SUSPEND_PUBLISHER",
        entityType: "Organization",
        entityId: publisherOrgId,
        before: { status: org.status },
        after: {
          status: "SUSPENDED",
          trigger: "RETURN_RATE_14D",
          rate: rate14d,
          volume: volume14d,
        },
      },
    }),
  ]);
}

/** Recompute every publisher — used by the nightly job and the admin console. */
export async function recomputeAllPublisherMetrics(): Promise<number> {
  const publishers = await prisma.organization.findMany({
    where: { type: "PUBLISHER" },
    select: { id: true },
  });

  for (const p of publishers) {
    await recomputePublisherMetrics(p.id);
  }

  return publishers.length;
}
