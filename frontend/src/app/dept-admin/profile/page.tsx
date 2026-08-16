"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProfileTemplate from "@/components/profile/ProfileTemplate";
import LoadingScreen from "@/components/LoadingScreen";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { CurrentUser } from "@/hooks/useCurrentUser";
import { apiFetch } from "@/lib/apiFetch";

interface RawProfileData {
  full_name: string;
  date_of_birth?: string;
  date_joined?: string;
  designation: string;
  department?: string | null;
  email: string;
  avatar_url?: string | null;
  iata_branch_code?: string;
  performance_score?: number | null;
  potential_block?: "H" | "M" | "L" | null;
  cycle_year?: number | null;
  cycle_period?: string | null;
}
interface RawDiaryEntry { id: string; entry_date: string; entry_text: string; status: "pending" | "approved" | "rejected"; }
interface RawSupervisorEntry { id: string; entry_date: string; entry_text: string; author_name?: string; }

export default function DeptAdminProfilePage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [profileData, setProfileData] = useState<RawProfileData | null>(null);
  const [selfEntries, setSelfEntries] = useState([]);
  const [supervisorEntries, setSupervisorEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) { router.push("/login"); return; }
    setUser(currentUser);

    const targetId = searchParams.get("employee_id") || currentUser.employee_id;

    const fetchData = async () => {
      try {
        const profileRes = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/${targetId}`);
        if (!profileRes.ok) { router.push("/login"); return; }
        const profileJson = await profileRes.json();

        const diaryRes = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/diary/${targetId}`);
        const diaryJson = await diaryRes.json();

        const mappedSelf = (diaryJson.self_entries || []).map((e: RawDiaryEntry) => ({
          id: e.id, date: e.entry_date, content: e.entry_text, status: e.status,
        }));
        const mappedSupervisor = (diaryJson.supervisor_entries || []).map((e: RawSupervisorEntry) => ({
          id: e.id, date: e.entry_date, supervisorName: e.author_name, comment: e.entry_text,
        }));

        setProfileData(profileJson.profile);
        setSelfEntries(mappedSelf);
        setSupervisorEntries(mappedSupervisor);
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

  if (loading || !user) {
    return <LoadingScreen />;
  }

  if (!profileData) { return null; }

  return (
    <ProfileTemplate
      role="Dept Admin"
      sidebarName={user.full_name.split(" ")[0]}
      profile={{
        fullName: profileData.full_name,
        dob: profileData.date_of_birth ? new Date(profileData.date_of_birth).toLocaleDateString("en-GB").replace(/\//g, "-") : "Not set",
        joinedDate: profileData.date_joined ? new Date(profileData.date_joined).toLocaleDateString("en-GB").replace(/\//g, "-") : "Not set",
        designation: profileData.designation,
        email: profileData.email,
        avatarUrl: profileData.avatar_url || null,
        branch: profileData.iata_branch_code,
        department: profileData.department || undefined,
        performanceScore: profileData.performance_score ?? null,
        potentialBlock:   profileData.potential_block   ?? null,
        cycleYear:        profileData.cycle_year        ?? null,
        cyclePeriod:      profileData.cycle_period      ?? null,
      }}
      dashboardPath="/dept-admin/dashboard"
      employeeId={targetId}
      reviewerId={user.employee_id}
      viewMode={isOwnProfile ? "own" : "supervisor"}
      initialSelfAchievements={selfEntries}
      initialSupervisorComments={supervisorEntries}
    />
  );
}