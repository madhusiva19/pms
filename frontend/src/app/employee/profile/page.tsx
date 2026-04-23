"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProfileTemplate from "@/components/profile/ProfileTemplate";

export default function EmployeeProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [selfEntries, setSelfEntries] = useState([]);
  const [supervisorEntries, setSupervisorEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("pms_user");
    if (!raw) { router.push("/login"); return; }
    const currentUser = JSON.parse(raw);
    setUser(currentUser);

    const targetId = searchParams.get("employee_id") || currentUser.employee_id;

    const fetchData = async () => {
      try {
        const profileRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/${targetId}`);
        const profileJson = await profileRes.json();
        setProfileData(profileJson.profile);

        const diaryRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/diary/${targetId}`);
        const diaryJson = await diaryRes.json();

        setSelfEntries((diaryJson.self_entries || []).map((e: any) => ({
          id: e.id, date: e.entry_date, content: e.entry_text, status: e.status,
        })));
        setSupervisorEntries((diaryJson.supervisor_entries || []).map((e: any) => ({
          id: e.id, date: e.entry_date, supervisorName: e.author_id, comment: e.entry_text,
        })));
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [searchParams]);

  if (loading) return <div style={{ padding: "40px" }}>Loading...</div>;
  if (!user || !profileData) return null;

  const targetId = searchParams.get("employee_id") || user.employee_id;
  const isOwnProfile = targetId === user.employee_id;

  return (
    <div style={{ display: "flex" }}>
      <ProfileTemplate
        role="Employee"
        sidebarName={user.full_name.split(" ")[0]}
        profile={{
          fullName: profileData.full_name,
          dob: "1995-05-18",
          joinedDate: "2023-04-01",
          designation: profileData.role,
          email: profileData.email,
          branch: profileData.iata_branch_code,
          department: "Air Freight",
        }}
        dashboardPath="/employee/profile"
        employeeId={targetId}
        reviewerId={user.employee_id}
        viewMode={isOwnProfile ? "own" : "supervisor"}
        initialSelfAchievements={selfEntries}
        initialSupervisorComments={supervisorEntries}
      />
    </div>
  );
}