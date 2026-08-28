"use client";

import { Menu } from "lucide-react";
import { useShell } from "./shell-context";
import { Button } from "@/components/ui/button";

/** Hamburger trigger for the mobile nav drawer. Hidden at `lg` and up, where the fixed rail takes over. */
export function SidebarTrigger() {
  const { setMobileNavOpen } = useShell();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Open navigation"
      onClick={() => setMobileNavOpen(true)}
      className="min-h-[44px] min-w-[44px] shrink-0 lg:hidden"
    >
      <Menu className="size-4.5" />
    </Button>
  );
}
