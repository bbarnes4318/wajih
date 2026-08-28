import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { NotificationList } from "@/components/domain/notification-list";
import { requireBuyer } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireBuyer();

  const rows = await prisma.notification.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Opening the feed is the read receipt; there is no separate mark-as-read.
  await prisma.notification.updateMany({
    where: { orgId: user.orgId, readAt: null },
    data: { readAt: new Date() },
  });

  return (
    <>
      <Topbar
        user={user}
        title="Notifications"
        subtitle="Rejections, holds, disputes and status changes."
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <Panel>
          <PanelHeader
            icon={<Bell className="size-3.5" />}
            title="Recent activity"
            subtitle="Newest first, last 100 events."
          />
          <PanelBody dense>
            <NotificationList
              rows={rows.map((n) => ({
                id: n.id,
                severity: n.severity,
                code: n.code,
                title: n.title,
                body: n.body,
                leadId: n.leadId,
                readAt: n.readAt?.toISOString() ?? null,
                createdAt: n.createdAt.toISOString(),
              }))}
              leadHref={(leadId) => `/buyer/leads?q=${leadId}`}
            />
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
