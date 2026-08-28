import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/auth/rbac";

export default async function RootPage() {
  const session = await getSession();
  redirect(session ? ROLE_HOME[session.role] : "/login");
}
