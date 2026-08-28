import { Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileNavDrawer } from "@/components/shell/mobile-nav-drawer";
import { ShellProvider } from "@/components/shell/shell-context";
import { UnreadBadge } from "@/components/shell/unread-badge";
import { requireUser } from "@/lib/auth/rbac";

/**
 * Authenticated shell. The role gate here is for navigation only — every
 * Server Function re-checks authorization itself, because actions are
 * reachable by direct POST without ever rendering this layout.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  const sidebarProps = {
    role: user.role,
    orgName: user.orgName,
    orgStatus: user.orgStatus,
    // Isolated in its own Suspense boundary so the unread-notification count
    // doesn't hold up the rest of the shell — nav, org identity — from
    // painting. (The auth check above still gates first paint; see the
    // known limitation noted in loading.tsx for why a page-level loading.tsx
    // alone can't mask that.)
    unreadBadge: (
      <Suspense fallback={null}>
        <UnreadBadge orgId={user.orgId} />
      </Suspense>
    ),
  };

  return (
    <TooltipProvider delayDuration={200}>
      <ShellProvider>
        <div className="flex h-dvh overflow-hidden bg-app">
          <Sidebar {...sidebarProps} />
          <MobileNavDrawer {...sidebarProps} />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </ShellProvider>
    </TooltipProvider>
  );
}
