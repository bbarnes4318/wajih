"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Mobile nav drawer open/closed state, shared between the hamburger trigger
 * in `Topbar` and the drawer itself — they're siblings under `(app)/layout.tsx`,
 * not parent/child, so this is a small context rather than lifted props.
 */
interface ShellContextValue {
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  return (
    <ShellContext.Provider value={{ mobileNavOpen, setMobileNavOpen }}>
      {children}
    </ShellContext.Provider>
  );
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <ShellProvider>");
  return ctx;
}
