import NotificationTemplate from "@/components/notifications/NotificationTemplate";

export default function EmployeeNotificationsPage() {
  return (
    <NotificationTemplate
      role="Employee"
      sidebarName="Amarasinghe"
      dashboardPath="/employee/dashboard"
    />
  );
}