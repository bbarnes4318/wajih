import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/shell/sidebar";
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

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh overflow-hidden bg-app">
        <Sidebar
          role={user.role}
          orgName={user.orgName}
          orgStatus={user.orgStatus}
          unreadCount={unreadCount}
        />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </TooltipProvider>
  );
}
