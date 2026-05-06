// sub-dept-admin
"use client";
import TemplateNotificationContent from "@/components/notifications/TemplateNotificationContent";

export default function SubDeptAdminNotificationPage() {
  return (
    <TemplateNotificationContent
      userId="your-test-uuid-here"
      level={5}
      basePath="/sub-dept-admin"
    />
  );
}