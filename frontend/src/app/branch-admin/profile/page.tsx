"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProfileTemplate from "@/components/profile/ProfileTemplate";
import Sidebar from "@/components/sidebar/Sidebar";
import styles from "@/components/profile/profile.module.css";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { CurrentUser } from "@/hooks/useCurrentUser";

interface RawProfileData {
  full_name: string;
  date_of_birth?: string;
  date_joined?: string;
  designation: string;
  email: string;
  avatar_url?: string | null;
  iata_branch_code?: string;
}
interface RawDiaryEntry { id: string; entry_date: string; entry_text: string; status: "pending" | "approved" | "rejected"; }
interface RawSupervisorEntry { id: string; entry_date: string; entry_text: string; author_name?: string; }

export default function BranchAdminProfilePage() {
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
        const profileRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/${targetId}`);
        const profileJson = await profileRes.json();

        const diaryRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/diary/${targetId}`);
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

  return (

      <main className={styles.main}>
        {(loading || !user || !profileData) ? (
          <div style={{ padding: "32px 40px", width: "100%" }}>
            <style>{`
              @keyframes shimmer {
                0%   { background-position: -600px 0; }
                100% { background-position:  600px 0; }
              }
              .skeleton {
                background: linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%);
                background-size: 600px 100%;
                animation: shimmer 1.4s infinite linear;
                border-radius: 8px;
              }
            `}</style>
            <div className="skeleton" style={{ height: 14, width: 180, marginBottom: 28 }} />
            <div className="skeleton" style={{ height: 22, width: 260, marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 14, width: 200, marginBottom: 32 }} />
            <div style={{ display: "flex", gap: 20, marginBottom: 32 }}>
              <div className="skeleton" style={{ width: 88, height: 88, borderRadius: "50%", flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
                <div className="skeleton" style={{ height: 16, width: "40%" }} />
                <div className="skeleton" style={{ height: 13, width: "25%" }} />
                <div className="skeleton" style={{ height: 13, width: "30%" }} />
              </div>
            </div>
            {[1,2,3].map((i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div className="skeleton" style={{ height: 56, width: "100%", borderRadius: 12 }} />
              </div>
            ))}
          </div>
        ) : (
          <ProfileTemplate
            role="Branch Admin"
            sidebarName={user.full_name.split(" ")[0]}
            profile={{
              fullName: profileData.full_name,
              dob: profileData.date_of_birth ? new Date(profileData.date_of_birth).toLocaleDateString("en-GB").replace(/\//g, "-") : "Not set",
              joinedDate: profileData.date_joined ? new Date(profileData.date_joined).toLocaleDateString("en-GB").replace(/\//g, "-") : "Not set",
              designation: profileData.designation,
              email: profileData.email,
              avatarUrl: profileData.avatar_url || null,
              branch: profileData.iata_branch_code,
            }}
            dashboardPath="/branch-admin/dashboard"
            employeeId={targetId}
            reviewerId={user.employee_id}
            viewMode={isOwnProfile ? "own" : "supervisor"}
            initialSelfAchievements={selfEntries}
            initialSupervisorComments={supervisorEntries}
          />
        )}
      </main>
  );
}
