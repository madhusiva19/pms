// app/(country-admin)/notifications/page.tsx
"use client";
import NotificationsPage from "@/components/notifications/NotificationsPage";
import AdminNotificationsPage from "@/components/notifications/AdminNotificationsPage";

export default function CountryAdminNotificationsPage() {
  return (
    <>
      <NotificationsPage level={2} />
      {/* AdminNotificationsPage — kept for compatibility with other branch */}
      {/* <AdminNotificationsPage 
            role="Country Admin" 
            dashboardPath="/country-admin/dashboard" 
            profilePath="/country-admin/profile" 
          /> */}
    </>
  );
}

