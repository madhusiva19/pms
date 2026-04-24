// src/app/dept-admin/notifications/page.tsx
import NotificationTemplate from "@/components/notifications/NotificationTemplate";

export default function DeptNotificationsPage() {
  return (
    <NotificationTemplate
      role="Dept Admin"
      sidebarName="Raj"
      dashboardPath="/dept-admin/dashboard"
    />
  );
}