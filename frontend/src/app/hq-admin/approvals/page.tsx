'use client';

import Approvals from '@/components/approvals/ApprovalsPage';
import ClientRoute from '@/app/ClientRoute';

export default function ApprovalsRoute() {
  return <ClientRoute><Approvals roleFilter="branch_admin" /></ClientRoute>;
}
