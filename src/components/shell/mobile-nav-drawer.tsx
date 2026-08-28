"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useShell } from "./shell-context";
import { SidebarContent, type SidebarContentProps } from "./sidebar";

/**
 * Left-side nav drawer for below `lg`. Built directly on Radix `Dialog`
 * rather than the shared `Drawer` primitive — `Drawer` is hardcoded to the
 * right edge and used only by `LeadDrawer` today, so giving it a `side` prop
 * would mean re-verifying that one existing consumer for no benefit here.
 * Radix's `Dialog` already gives us the focus trap and Escape-to-close for
 * free; we only add closing on route change.
 */
export function MobileNavDrawer(props: SidebarContentProps) {
  const { mobileNavOpen, setMobileNavOpen } = useShell();
  const pathname = usePathname();

  useEffect(() => {
    setMobileNavOpen(false);
    // Only route changes should auto-close the drawer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Dialog.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:hidden data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line-strong bg-surface shadow-[var(--shadow-lg)] lg:hidden"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <Dialog.Close
            aria-label="Close navigation"
            className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-ink"
          >
            <X className="size-4" />
          </Dialog.Close>
          <SidebarContent {...props} onNavigate={() => setMobileNavOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
