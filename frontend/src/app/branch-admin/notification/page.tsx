// src/app/branch-admin/notifications/page.tsx
import NotificationTemplate from "@/components/notifications/NotificationTemplate";

export default function BranchNotificationsPage() {
  return (
    <NotificationTemplate
      role="Branch Admin"
      sidebarName="Silva"
      dashboardPath="/branch-admin/dashboard"
    />
  );
}