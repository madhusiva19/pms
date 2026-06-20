'use client';

import MyTeam from '@/components/team/MyTeamPage';
import ClientRoute from '@/app/ClientRoute';

export default function SubDeptAdminMyTeamRoute() {
  return <ClientRoute><MyTeam roleFilter="employee" /></ClientRoute>;
}
