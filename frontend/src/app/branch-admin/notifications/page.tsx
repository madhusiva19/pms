// branch-admin
"use client";
import TemplateNotificationContent from "@/components/notifications/TemplateNotificationContent";

export default function BranchAdminNotificationPage() {
  return (
    <TemplateNotificationContent
      userId="your-test-uuid-here"
      level={3}
      basePath="/branch-admin"
    />
  );
}