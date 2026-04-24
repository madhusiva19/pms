// src/app/hq-admin/notifications/page.tsx
import NotificationTemplate from "@/components/notifications/NotificationTemplate";

export default function HQNotificationsPage() {
  return (
    <NotificationTemplate
      role="HQ Admin"
      sidebarName="Amarasinghe"
      dashboardPath="/hq-admin/dashboard"
    />
  );
}