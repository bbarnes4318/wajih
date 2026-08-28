import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/auth/rbac";
import { SignInPanel } from "./sign-in-panel";

export const metadata: Metadata = { title: "Sign in" };

/**
 * A single centred column.
 *
 * The earlier split-screen left a large empty field on any wide monitor no
 * matter how the columns were weighted — a marketing hero has nothing to say
 * on the login screen of an internal ops tool. One narrow column cannot look
 * sparse, and it puts the only thing that matters in the middle of the view.
 */
export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(ROLE_HOME[session.role]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-app px-6 py-12">
      <div className="w-full max-w-[24rem]">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-accent text-[14px] font-bold text-white shadow-[var(--shadow-sm)]">
            L
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-ink">
              LeadOS
            </div>
            <div className="text-[12px] text-muted">
              Lead intake, distribution &amp; publisher vetting
            </div>
          </div>
        </div>

        <SignInPanel />

        <p className="mt-6 text-center text-[12px] leading-relaxed text-faint">
          Demo network. All organizations, consumers and certificates are fictional.
        </p>
      </div>
    </main>
  );
}
