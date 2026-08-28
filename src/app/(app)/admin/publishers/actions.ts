"use server";

import { revalidatePath } from "next/cache";
import type {
  OrgStatus,
  VettingCheckKey,
  VettingCheckStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assertRole } from "@/lib/auth/rbac";
import { isChecklistComplete } from "@/lib/db/vetting";
import { recomputePublisherMetrics } from "@/lib/metrics/publisher-metrics";

/**
 * Vetting mutations.
 *
 * Every one of these re-checks the caller's role. Server Functions are
 * reachable by direct POST without ever rendering the admin layout, so the
 * layout's `requireAdmin` is not the enforcement point — this is.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** Records a decision on one of the nine checklist points. */
export async function setVettingCheckAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await assertRole("SUPER_ADMIN");

  const orgId = String(formData.get("orgId") ?? "");
  const key = String(formData.get("key") ?? "") as VettingCheckKey;
  const status = String(formData.get("status") ?? "") as VettingCheckStatus;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const evidenceUrl = String(formData.get("evidenceUrl") ?? "").trim() || null;

  if (!orgId || !key || !status) {
    return { ok: false, error: "MISSING_FIELDS" };
  }

  const profile = await prisma.publisherVettingProfile.findUnique({
    where: { orgId },
    select: { id: true },
  });
  if (!profile) return { ok: false, error: "NO_VETTING_PROFILE" };

  const before = await prisma.vettingCheck.findUnique({
    where: { profileId_key: { profileId: profile.id, key } },
    select: { status: true, notes: true },
  });

  await prisma.$transaction([
    prisma.vettingCheck.upsert({
      where: { profileId_key: { profileId: profile.id, key } },
      create: {
        profileId: profile.id,
        key,
        status,
        notes,
        evidenceUrl,
        checkedAt: new Date(),
        checkedByUserId: admin.id,
      },
      update: {
        status,
        notes,
        evidenceUrl,
        checkedAt: new Date(),
        checkedByUserId: admin.id,
      },
    }),
    prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "SET_VETTING_CHECK",
        entityType: "VettingCheck",
        entityId: `${profile.id}:${key}`,
        before: before ?? undefined,
        after: { status, notes, evidenceUrl },
      },
    }),
  ]);

  revalidatePath(`/admin/publishers/${orgId}`);
  revalidatePath("/admin/publishers/vetting");
  return { ok: true };
}

/**
 * Approves a publisher into ACTIVE.
 *
 * Refuses unless all nine points have passed or been explicitly waived — the
 * checklist is the gate, not a suggestion the reviewer can click past.
 */
export async function approvePublisherAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await assertRole("SUPER_ADMIN");
  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return { ok: false, error: "MISSING_FIELDS" };

  const profile = await prisma.publisherVettingProfile.findUnique({
    where: { orgId },
    include: { checks: { select: { key: true, status: true } } },
  });
  if (!profile) return { ok: false, error: "NO_VETTING_PROFILE" };

  if (!isChecklistComplete(profile.checks)) {
    return { ok: false, error: "CHECKLIST_INCOMPLETE" };
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { status: true, name: true },
  });
  if (!org) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction([
    prisma.organization.update({
      where: { id: orgId },
      data: { status: "ACTIVE" },
    }),
    prisma.publisherVettingProfile.update({
      where: { orgId },
      data: { approvedAt: new Date(), approvedByUserId: admin.id },
    }),
    prisma.notification.create({
      data: {
        orgId,
        severity: "INFO",
        code: "VETTING_APPROVED",
        title: "Vetting approved — your sources are live",
        body: "ALL_NINE_CHECKS_CLEARED",
      },
    }),
    prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "APPROVE_PUBLISHER",
        entityType: "Organization",
        entityId: orgId,
        before: { status: org.status },
        after: { status: "ACTIVE" },
      },
    }),
  ]);

  revalidatePath(`/admin/publishers/${orgId}`);
  revalidatePath("/admin/publishers/vetting");
  return { ok: true, message: `${org.name} is now ACTIVE.` };
}

/** Manual status override — suspension, reinstatement or termination. */
export async function setPublisherStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await assertRole("SUPER_ADMIN");

  const orgId = String(formData.get("orgId") ?? "");
  const status = String(formData.get("status") ?? "") as OrgStatus;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!orgId || !status) return { ok: false, error: "MISSING_FIELDS" };

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { status: true, name: true, type: true },
  });
  if (!org || org.type !== "PUBLISHER") return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction([
    prisma.organization.update({ where: { id: orgId }, data: { status } }),
    prisma.notification.create({
      data: {
        orgId,
        severity: status === "ACTIVE" ? "INFO" : "CRITICAL",
        code: `STATUS_${status}`,
        title:
          status === "ACTIVE"
            ? "Account reinstated"
            : status === "SUSPENDED"
              ? "Account suspended by network operations"
              : "Account terminated",
        body: reason || `STATUS_CHANGED_TO_${status}`,
      },
    }),
    prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "SET_PUBLISHER_STATUS",
        entityType: "Organization",
        entityId: orgId,
        before: { status: org.status },
        after: { status, reason: reason || null },
      },
    }),
  ]);

  // Reinstating clears the auto-suspension latch; without this the next
  // metrics recompute would immediately re-suspend on the same stale trigger.
  if (status === "ACTIVE") {
    await prisma.publisherMetrics.updateMany({
      where: { publisherOrgId: orgId },
      data: { autoSuspendedAt: null },
    });
  }

  revalidatePath(`/admin/publishers/${orgId}`);
  revalidatePath("/admin/publishers");
  return { ok: true, message: `${org.name} → ${status}` };
}

/** Saves the reviewer's free-form audit notes on the profile. */
export async function saveAuditNotesAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await assertRole("SUPER_ADMIN");
  const orgId = String(formData.get("orgId") ?? "");
  const auditNotes = String(formData.get("auditNotes") ?? "").trim() || null;

  if (!orgId) return { ok: false, error: "MISSING_FIELDS" };

  await prisma.publisherVettingProfile.update({
    where: { orgId },
    data: { auditNotes },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "SAVE_AUDIT_NOTES",
      entityType: "PublisherVettingProfile",
      entityId: orgId,
      after: { length: auditNotes?.length ?? 0 },
    },
  });

  revalidatePath(`/admin/publishers/${orgId}`);
  return { ok: true };
}

/** Forces a metrics recompute, which also re-evaluates the auto-suspension rule. */
export async function recomputeMetricsAction(
  formData: FormData,
): Promise<ActionResult> {
  await assertRole("SUPER_ADMIN");
  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return { ok: false, error: "MISSING_FIELDS" };

  const snapshot = await recomputePublisherMetrics(orgId);

  revalidatePath(`/admin/publishers/${orgId}`);
  return {
    ok: true,
    message: `14-day return rate ${(snapshot.returnRate14d * 100).toFixed(1)}%`,
  };
}
