/**
 * app/(hq-admin)/template-management/freeze-management/page.tsx
 *
 * Route entry point for the Template Freeze Management page.
 *
 * URL: /hq-admin/template-management/freeze-management?templateId=<id>
 *
 * Access: HQ Admin only (shown when a template is frozen or in grace period).
 * The FreezeManagementPage component reads the templateId query parameter,
 * fetches the template record, and renders the freeze management interface.
 *
 * Navigation:
 *  - "Back to Templates" returns to /hq-admin/template-management.
 *  - Variant editor links navigate to template-creation with variantId param.
 */

import FreezeManagementPage from "@/components/freeze_management/FreezeManagementPage";

export default function FreezeManagementRoutePage() {
  return <FreezeManagementPage />;
}
