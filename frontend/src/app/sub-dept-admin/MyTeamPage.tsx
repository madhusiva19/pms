import MyTeam from '@/components/team/MyTeamPage';

// Sub Department Admin sees only Employees directly below them in the hierarchy.
export default function SubDeptAdminMyTeam() {
  return <MyTeam roleFilter="employee" />;
}
