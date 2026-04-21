import ProfileTemplate from "@/components/profile/ProfileTemplate";

export default function HQAdminProfilePage() {
  return (
    <div style={{ display: "flex" }}>
      <ProfileTemplate
        role="HQ Admin"
        sidebarName="Amarasinghe"
        profile={{ fullName: "Amarasinghe S. K.", dob: "1988-04-22", joinedDate: "2018-06-15", designation: "Marketing Director", email: "hqadmin@dgl.com" }}
        dashboardPath="/hq-admin/dashboard"
        apiEmail="hqadmin@dgl.com"
      />
    </div>
  );
}