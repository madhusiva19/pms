// app/(hq-admin)/notifications/page.tsx
"use client";
import NotificationsPage from "@/components/notifications/NotificationsPage";
import AdminNotificationsPage from "@/components/notifications/AdminNotificationsPage";

export default function HQAdminNotificationsPage() {
  return (
    <>
      <NotificationsPage level={1} />
      {/* AdminNotificationsPage — kept for compatibility with other branch */}
      {/* <AdminNotificationsPage 
            role="HQ Admin" 
            dashboardPath="/hq-admin/dashboard" 
            profilePath="/hq-admin/profile" 
          /> */}
    </>
  );
}