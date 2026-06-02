"use client";
import AdminNotificationsPage from "@/components/notifications/AdminNotificationsPage";
import NotificationsPage from "@/components/notifications/NotificationsPage";

// Use AdminNotificationsPage if available, fallback to NotificationsPage
export default function HQAdminNotificationsPage() {
  return (
    <>
      <AdminNotificationsPage
        role="HQ Admin"
        dashboardPath="/hq-admin/dashboard"
        profilePath="/hq-admin/profile"
      />
      {/* Dev-final's level-based page — remove if duplicate */}
      {/* <NotificationsPage level={1} /> */}
    </>
  );
}