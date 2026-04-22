// app/create-template/page.tsx
// WHY: Thin wrapper — just passes the user's level to TemplateCreateBase.
// The level prop tells the component what the user is allowed to do.
// Replace `level={1}` with whatever your auth system provides for the current user.

import TemplateCreateBase from "@/components/templatecreation/TemplateCreateBase";

export default function CreateTemplatePage() {
  // HQ Admin = level 1. Pass the actual role level from your session/auth here.
  return <TemplateCreateBase level={1} />;
}
