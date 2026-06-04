import TemplateCreateBase from "@/components/template_creation_assignment/TemplateCreateBase";

export default function CreateTemplatePage() {
  // HQ Admin = level 1. Pass the actual role level from your session/auth here.
  return <TemplateCreateBase level={4} />;
}
