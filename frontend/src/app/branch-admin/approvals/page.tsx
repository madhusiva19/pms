'use client';

import Approvals from '@/components/approvals/ApprovalsPage';
import ClientRoute from '@/app/ClientRoute';

export default function ApprovalsRoute() {
  return <ClientRoute><Approvals roleFilter="sub_dept_admin" /></ClientRoute>;
}
