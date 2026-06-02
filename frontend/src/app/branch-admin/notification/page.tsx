// app/(branch-admin)/notifications/page.tsx
"use client";
import NotificationsPage from "@/components/notifications/NotificationsPage";
import AdminNotificationsPage from "@/components/notifications/AdminNotificationsPage";

export default function BranchAdminNotificationsPage() {
  return (
    <>
      <NotificationsPage level={3} />
      {/* AdminNotificationsPage — kept for compatibility with other branch */}
      {/* <AdminNotificationsPage 
            role="Branch Admin" 
            dashboardPath="/branch-admin/dashboard" 
            profilePath="/branch-admin/profile" 
          /> */}
    </>
  );
}