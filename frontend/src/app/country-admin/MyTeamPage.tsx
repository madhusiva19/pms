import MyTeam from '@/components/team/MyTeamPage';

// Country Admin sees only Branch Admins directly below them in the hierarchy.
export default function CountryAdminMyTeam() {
  return <MyTeam roleFilter="branch_admin" />;
}
