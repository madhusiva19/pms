import MyTeam from '@/components/team/MyTeamPage';

// HQ Admin sees only Country Admins directly below them in the hierarchy.
export default function HQAdminMyTeam() {
  return <MyTeam roleFilter="country_admin" />;
}
