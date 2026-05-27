"use client";

// app/employee/my-templates/page.tsx
// Renders the shared MyTemplates component under the Employee role.
// Pass empId from your auth context (session, cookie, etc.) via the prop.

import { MyTemplates } from "@/components/my-templates/my-templates";

// ── If you use an auth hook, import it here and pass empId as a prop ──────────
// import { useSession } from "next-auth/react";

export default function EmployeeMyTemplatesPage() {
  // Example: const { data: session } = useSession();
  // const empId = session?.user?.empId ?? "";

  // If you rely on window.__EMP_ID__ or NEXT_PUBLIC_DEV_EMP_ID, just omit the prop:
  return <MyTemplates />;

  // Or pass empId explicitly:
  // return <MyTemplates empId={empId} />;
}
