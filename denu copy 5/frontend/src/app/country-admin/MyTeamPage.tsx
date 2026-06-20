import MyTeam from '@/views/MyTeamPage';

// Country Admin sees only Branch Admins directly below them in the hierarchy.
export default function CountryAdminMyTeam() {
  return <MyTeam roleFilter="branch_admin" />;
}
