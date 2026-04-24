// src/app/sub-dept-admin/notifications/page.tsx
import NotificationTemplate from "@/components/notifications/NotificationTemplate";

export default function SubDeptNotificationsPage() {
  return (
    <NotificationTemplate
      role="Sub Dept Admin"
      sidebarName="Kumar"
      dashboardPath="/sub-dept-admin/dashboard"
    />
  );
}