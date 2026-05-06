// dept-admin
"use client";
import TemplateNotificationContent from "@/components/notifications/TemplateNotificationContent";

export default function DeptAdminNotificationPage() {
  return (
    <TemplateNotificationContent
      userId="your-test-uuid-here"
      level={4}
      basePath="/dept-admin"
    />
  );
}