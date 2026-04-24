// src/app/country-admin/notifications/page.tsx
import NotificationTemplate from "@/components/notifications/NotificationTemplate";

export default function CountryNotificationsPage() {
  return (
    <NotificationTemplate
      role="Country Admin"
      sidebarName="Amarasinghe"
      dashboardPath="/country-admin/dashboard"
    />
  );
}