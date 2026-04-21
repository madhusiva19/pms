import ProfileTemplate from "@/components/profile/ProfileTemplate";

export default function DeptAdminProfilePage() {
  return (
    <div style={{ display: "flex" }}>
      <ProfileTemplate
        role="Dept Admin"
        sidebarName="Amarasinghe"
        profile={{ fullName: "Charles S. K.", dob: "1988-04-22", joinedDate: "2018-06-15", designation: "Marketing Director", email: "deptadmin@dgl.com" }}
        dashboardPath="/dept-admin/dashboard"
        apiEmail="deptadmin@dgl.com"
      />
    </div>
  );
}