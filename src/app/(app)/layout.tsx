import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileNavDrawer } from "@/components/shell/mobile-nav-drawer";
import { ShellProvider } from "@/components/shell/shell-context";
import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";

/**
 * Authenticated shell. The role gate here is for navigation only — every
 * Server Function re-checks authorization itself, because actions are
 * reachable by direct POST without ever rendering this layout.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  const unreadCount = await prisma.notification.count({
    where: { orgId: user.orgId, readAt: null },
  });

  const sidebarProps = {
    role: user.role,
    orgName: user.orgName,
    orgStatus: user.orgStatus,
    unreadCount,
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
