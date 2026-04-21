import ProfileTemplate from "@/components/profile/ProfileTemplate";

export default function SubDeptAdminProfilePage() {
  return (
    <div style={{ display: "flex" }}>
      <ProfileTemplate
        role="Sub Dept Admin"
        sidebarName="Dovindu"
        profile={{ fullName: "Dovindu S. K.", dob: "1988-04-22", joinedDate: "2018-06-15", designation: "Marketing Director", email: "subdeptadmin@dgl.com" }}
        dashboardPath="/sub-dept-admin/dashboard"
        apiEmail="subdeptadmin@dgl.com"
      />
    </div>
  );
}