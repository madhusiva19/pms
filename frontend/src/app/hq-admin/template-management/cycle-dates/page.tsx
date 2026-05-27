/**
 * app/(hq-admin)/template-management/cycle-dates/page.tsx
 *
 * Route entry point for the Edit PMS Cycle Dates page.
 *
 * URL: /hq-admin/template-management/cycle-dates?cycleId=<id>
 *
 * Access: HQ Admin only.
 * The CycleDatesPage component reads the cycleId query parameter,
 * fetches the corresponding PMS cycle, and renders the edit form.
 *
 * Navigation:
 *  - "Back to Templates" returns to /hq-admin/template-management.
 *  - Saving successfully also redirects back to the dashboard.
 */

import CycleDatesPage from "@/components/cycle_dates/CycleDatesPage";

export default function CycleDatesRoutePage() {
  return <CycleDatesPage />;
}