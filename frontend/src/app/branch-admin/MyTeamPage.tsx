import MyTeam from '@/components/team/MyTeamPage';

// Branch Admin sees only Department Admins directly below them in the hierarchy.
export default function BranchAdminMyTeam() {
  return <MyTeam roleFilter="dept_admin" />;
}
