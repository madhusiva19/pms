"use client";
import AdminNotificationsPage from "@/components/notifications/AdminNotificationsPage";
export default function EmployeeNotificationsPage() {
  return <AdminNotificationsPage role="Employee" dashboardPath="/employee/profile" profilePath="/employee/profile" showCutoffs={false} />;
}
