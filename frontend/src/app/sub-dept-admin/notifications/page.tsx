// app/(sub-dept-admin)/notifications/page.tsx
"use client";
import NotificationsPage from "@/components/notifications/NotificationsPage";
import AdminNotificationsPage from "@/components/notifications/AdminNotificationsPage";

export default function SubDeptAdminNotificationsPage() {
  return (
    <>
      <NotificationsPage level={5} />
      {/* AdminNotificationsPage — kept for compatibility with other branch */}
      {/* <AdminNotificationsPage 
            role="Sub Dept Admin" 
            dashboardPath="/sub-dept-admin/dashboard" 
            profilePath="/sub-dept-admin/profile" 
          /> */}
    </>
  );
}