// app/(dept-admin)/notifications/page.tsx
"use client";
import NotificationsPage from "@/components/notifications/NotificationsPage";
import AdminNotificationsPage from "@/components/notifications/AdminNotificationsPage";

export default function DeptAdminNotificationsPage() {
  return (
    <>
      <NotificationsPage level={4} />
      {/* AdminNotificationsPage — kept for compatibility with other branch */}
      {/* <AdminNotificationsPage 
            role="Dept Admin" 
            dashboardPath="/dept-admin/dashboard" 
            profilePath="/dept-admin/profile" 
          /> */}
    </>
  );
}
