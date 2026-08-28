"use client";

import { useActionState, useState } from "react";
import { CircleAlert, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { signInAction, type LoginState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const INITIAL: LoginState = { error: null };

const PASSWORD = "Passw0rd!";

/**
 * The seeded roster. Listed here because this is a demo network — a real
 * deployment deletes this component and the account picker with it.
 */
const ACCOUNTS: Array<{
  email: string;
  role: "Admin" | "Publisher" | "Buyer";
  note: string;
}> = [
  { email: "admin@leados.example", role: "Admin", note: "Full network control" },
  { email: "apex@apexdigitalmedia.example", role: "Publisher", note: "Active · healthy" },
  { email: "bluepeak@bluepeakinteractive.example", role: "Publisher", note: "High return rate" },
  { email: "meridian@meridianleadgroup.example", role: "Publisher", note: "Pending vetting" },
  { email: "statewide@statewidemutual.example", role: "Buyer", note: "Auto insurance" },
  { email: "helios@heliossolar.example", role: "Buyer", note: "Solar" },
];

const ROLE_TONE = {
  Admin: "text-accent",
  Publisher: "text-violet",
  Buyer: "text-teal",
} as const;

export function SignInPanel() {
  const [state, action, pending] = useActionState(signInAction, INITIAL);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <>
      <form action={action} className="panel-glow space-y-3.5 p-5">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium tracking-wide text-muted uppercase">
            Email
          </span>
          <Input
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@leados.example"
            className="h-9 font-mono text-xs"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[12px] font-medium tracking-wide text-muted uppercase">
            Password
          </span>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-9"
          />
        </label>

        {state.error && (
          <p
            role="alert"
            className="flex items-start gap-1.5 rounded-md border border-danger-border bg-danger-soft px-2.5 py-2 text-xs leading-relaxed text-danger"
          >
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            {state.error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending}
          className="w-full"
        >
          <Lock className="size-3.5" />
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {/* Picking an account fills both fields — one click, then Sign in. */}
      <div className="mt-3 overflow-hidden rounded-[10px] border border-line bg-surface">
        <div className="flex items-baseline justify-between border-b border-line px-3 py-2">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
            Seeded accounts
          </span>
          <span className="text-[11px] text-faint">tap to fill</span>
        </div>

        <ul className="divide-y divide-[var(--border)]">
          {ACCOUNTS.map((a) => {
            const active = email === a.email;
            return (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(PASSWORD);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                    active ? "bg-accent-soft" : "hover:bg-hover",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate font-mono text-[12px]",
                        active ? "text-accent" : "text-ink",
                      )}
                    >
                      {a.email}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-faint">
                      <span className={cn("font-medium", ROLE_TONE[a.role])}>
                        {a.role}
                      </span>
                      {" · "}
                      {a.note}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
