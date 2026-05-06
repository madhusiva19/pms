// country-admin
"use client";
import TemplateNotificationContent from "@/components/notifications/TemplateNotificationContent";

export default function CountryAdminNotificationPage() {
  return (
    <TemplateNotificationContent
      userId="your-test-uuid-here"
      level={2}
      basePath="/country-admin"
    />
  );
}