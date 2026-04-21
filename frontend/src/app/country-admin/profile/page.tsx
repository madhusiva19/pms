// src/app/country-admin/profile/page.tsx
import ProfileTemplate from "@/components/profile/ProfileTemplate";

export default function CountryAdminProfilePage() {
  return (
    <ProfileTemplate
      role="Country Admin"
      sidebarName="Perera"
      profile={{ fullName: "Perera A. K.", dob: "1996-08-14", joinedDate: "2021-03-01", designation: "Senior Executive - Operations", email: "countryadmin@dgl.com", country: "Sri Lanka" }}
      dashboardPath="/country-admin/dashboard"
      apiEmail="countryadmin@dgl.com"
    />
  );
}