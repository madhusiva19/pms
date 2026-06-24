import MyTeam from '@/components/team/MyTeamPage';

// Department Admin sees only Sub Department Admins directly below them in the hierarchy.
export default function DeptAdminMyTeam() {
  return <MyTeam roleFilter="sub_dept_admin" />;
}
