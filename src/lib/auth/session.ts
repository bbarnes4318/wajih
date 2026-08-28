import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import type { OrgStatus, OrgType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const SESSION_COOKIE = "leados_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  orgId: string;
  orgName: string;
  orgType: OrgType;
  orgStatus: OrgStatus;
}

/**
 * Reads the current session.
 *
 * Wrapped in React `cache` so a single request that checks auth in a layout,
 * a page, and three server components still issues one query.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          orgId: true,
          org: { select: { name: true, type: true, status: true } },
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date()) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    orgId: session.user.orgId,
    orgName: session.user.org.name,
    orgType: session.user.org.type,
    orgStatus: session.user.org.status,
  };
});

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({ data: { token, userId, expiresAt } });
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  // Opportunistic cleanup — cheap, and keeps the table from growing forever
  // without needing a separate scheduled job.
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  store.delete(SESSION_COOKIE);
}
