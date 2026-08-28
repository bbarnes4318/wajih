"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";

export interface SavedViewActionResult {
  ok: boolean;
  error?: string;
}

/** Saving a view pins it immediately — that's the whole discovery mechanism, there's no separate "manage views" list. */
export async function createSavedViewAction(
  name: string,
  queryString: string,
): Promise<SavedViewActionResult> {
  const user = await assertRole("BUYER");
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) return { ok: false, error: "MISSING_FIELDS" };

  await prisma.savedView.create({
    data: { orgId: user.orgId, userId: user.id, name: trimmed, queryString, pinned: true },
  });

  revalidatePath("/buyer/leads");
  return { ok: true };
}

export async function deleteSavedViewAction(id: string): Promise<SavedViewActionResult> {
  const user = await assertRole("BUYER");
  const result = await prisma.savedView.deleteMany({
    where: { id, orgId: user.orgId, userId: user.id },
  });
  if (result.count === 0) return { ok: false, error: "NOT_FOUND" };

  revalidatePath("/buyer/leads");
  return { ok: true };
}
