import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { getSession, type SessionUser } from "./session";

/**
 * Role gates.
 *
 * Server Functions are reachable by direct POST, not only through the UI, so
 * every mutation calls one of these itself rather than trusting that a layout
 * already checked. The layout guard is for navigation; these are the
 * enforcement point.
 */

export const ROLE_HOME: Record<UserRole, string> = {
  SUPER_ADMIN: "/admin",
  PUBLISHER: "/publisher",
  BUYER: "/buyer",
};

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(
  ...roles: UserRole[]
): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    // Send them to their own portal rather than a dead end.
    redirect(ROLE_HOME[user.role]);
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole("SUPER_ADMIN");
}

export async function requirePublisher(): Promise<SessionUser> {
  return requireRole("PUBLISHER");
}

export async function requireBuyer(): Promise<SessionUser> {
  return requireRole("BUYER");
}

/**
 * Tenant scoping for lead queries. An admin sees the whole network; a
 * publisher sees only what it submitted; a buyer sees only what it bought —
 * and a buyer never sees a lead before it was delivered to them.
 */
export function leadScopeFor(user: SessionUser) {
  switch (user.role) {
    case "SUPER_ADMIN":
      return {};
    case "PUBLISHER":
      return { publisherOrgId: user.orgId };
    case "BUYER":
      return { buyerOrgId: user.orgId, deliveredAt: { not: null } };
  }
}

/** Throwing variant for Server Functions, which must not redirect mid-mutation. */
export class ForbiddenError extends Error {
  constructor(message = "FORBIDDEN") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function assertRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new ForbiddenError("UNAUTHENTICATED");
  if (!roles.includes(user.role)) throw new ForbiddenError("FORBIDDEN");
  return user;
}
