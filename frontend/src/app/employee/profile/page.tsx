import ProfileTemplate from "@/components/profile/ProfileTemplate";

export default function EmployeeProfilePage() {
  return (
    <div style={{ display: "flex" }}>
      <ProfileTemplate
        role="Employee"
        sidebarName="Amarasinghe"
        profile={{ fullName: "Amarasinghe S. K.", dob: "1988-04-22", joinedDate: "2018-06-15", designation: "Marketing Director", email: "employee@dgl.com" }}
        dashboardPath="/employee/dashboard"
        apiEmail="employee@dgl.com"
      />
    </div>
  );
}