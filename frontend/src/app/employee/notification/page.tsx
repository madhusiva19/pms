// app/(employee)/notifications/page.tsx
"use client";
import NotificationsPage from "@/components/notifications/NotificationsPage";
import AdminNotificationsPage from "@/components/notifications/AdminNotificationsPage";

export default function EmployeeNotificationsPage() {
  return (
    <>
      <NotificationsPage level={6} />
      {/* AdminNotificationsPage — kept for compatibility with other branch */}
      {/* <AdminNotificationsPage 
            role="Employee" 
            dashboardPath="/employee/profile" 
            profilePath="/employee/profile" 
            showCutoffs={false}
          /> */}
    </>
  );
}