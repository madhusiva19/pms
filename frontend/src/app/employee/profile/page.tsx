"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProfileTemplate from "@/components/profile/ProfileTemplate";
import Sidebar from "@/components/sidebar/Sidebar";
import styles from "@/components/profile/profile.module.css";

const CACHE_TTL = 0; // Disabled cache to prevent stale data

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
      const cacheKey = `profile_cache_${targetId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { profileData: pd, selfEntries: se, supervisorEntries: sve, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setProfileData(pd);
            setSelfEntries(se);
            setSupervisorEntries(sve);
            setLoading(false);
            return;
          }
        } catch {}
      }

      try {
        const profileRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/${targetId}`);
        const profileJson = await profileRes.json();

        const diaryRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/diary/${targetId}`);
        const diaryJson = await diaryRes.json();

        const mappedSelf = (diaryJson.self_entries || []).map((e: any) => ({
          id: e.id, date: e.entry_date, content: e.entry_text, status: e.status,
        }));
        const mappedSupervisor = (diaryJson.supervisor_entries || []).map((e: any) => ({
          id: e.id, date: e.entry_date, supervisorName: e.author_name, comment: e.entry_text,
        }));

        setProfileData(profileJson.profile);
        setSelfEntries(mappedSelf);
        setSupervisorEntries(mappedSupervisor);

        localStorage.setItem(cacheKey, JSON.stringify({
          profileData: profileJson.profile,
          selfEntries: mappedSelf,
          supervisorEntries: mappedSupervisor,
          timestamp: Date.now(),
        }));
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [searchParams]);

  const targetId = searchParams.get("employee_id") || user?.employee_id || "";
  const isOwnProfile = user ? targetId === user.employee_id : false;

  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        {(loading || !user || !profileData) ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#9CA3AF", fontSize: "14px" }}>
            Loading...
          </div>
        ) : (
          <ProfileTemplate
            role="Employee"
            sidebarName={user.full_name.split(" ")[0]}
            profile={{
              fullName: profileData.full_name,
              dob: profileData.date_of_birth ? new Date(profileData.date_of_birth).toLocaleDateString("en-GB").replace(/\//g, "-") : "Not set",
              joinedDate: profileData.date_joined ? new Date(profileData.date_joined).toLocaleDateString("en-GB").replace(/\//g, "-") : "Not set",
              designation: profileData.designation,
              email: profileData.email,
              avatarUrl: profileData.avatar_url || null,
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
        )}
      </main>
    </div>
  );
}
