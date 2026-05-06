// hq-admin
"use client";
import TemplateNotificationContent from "@/components/notifications/TemplateNotificationContent";

export default function HQAdminNotificationPage() {
  return (
    <TemplateNotificationContent
      userId="your-test-uuid-here"
      level={1}
      basePath="/hq-admin"
    />
  );
}