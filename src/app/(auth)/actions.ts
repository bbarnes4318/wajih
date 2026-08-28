"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/auth/rbac";

export interface LoginState {
  error: string | null;
}

export async function signInAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter an email address and password." };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      role: true,
      org: { select: { status: true } },
    },
  });

  // Same message for "no such user" and "wrong password" so the form cannot be
  // used to enumerate which accounts exist.
  const invalid = { error: "Those credentials do not match an account." };
  if (!user) return invalid;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return invalid;

  if (user.org.status === "TERMINATED") {
    return { error: "This organization's access has been terminated." };
  }

  await createSession(user.id);
  redirect(ROLE_HOME[user.role]);
}

export async function signOutAction() {
  await destroySession();
  redirect("/login");
}
