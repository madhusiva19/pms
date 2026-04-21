import ProfileTemplate from "@/components/profile/ProfileTemplate";

export default function BranchAdminProfilePage() {
  return (
    <div style={{ display: "flex" }}>
      <ProfileTemplate
        role="Branch Admin"
        sidebarName="Bandara"
        profile={{ fullName: "Bandara S. K.", dob: "1988-04-22", joinedDate: "2018-06-15", designation: "Marketing Director", email: "branchadmin@dgl.com" }}
        dashboardPath="/branch-admin/dashboard"
        apiEmail="branchadmin@dgl.com"
      />
    </div>
  );
}