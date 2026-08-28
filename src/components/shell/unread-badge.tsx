import { cache } from "react";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db/prisma";

/**
 * `cache()` dedupes this within a single request — `Sidebar` (desktop rail)
 * and `MobileNavDrawer` both render an `UnreadBadge`, so without it the
 * count query would run twice per page load.
 */
const getUnreadCount = cache(async (orgId: string) => {
  return prisma.notification.count({ where: { orgId, readAt: null } });
});

/**
 * Isolated in its own Suspense boundary (see `(app)/layout.tsx`) so the rest
 * of the shell — nav, org identity — can stream in without waiting on it.
 */
export async function UnreadBadge({ orgId }: { orgId: string }) {
  const unreadCount = await getUnreadCount(orgId);
  if (unreadCount === 0) return null;
  return <Badge tone="danger">{unreadCount > 99 ? "99+" : unreadCount}</Badge>;
}
