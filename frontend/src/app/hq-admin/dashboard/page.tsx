"use client";

import DashboardBase from "@/components/dashboard/DashboardBase";

export default function HQAdminDashboard() {
  // We explicitly pass level 1 to trigger the HQ Admin configuration
  return <DashboardBase level={1} />;
}