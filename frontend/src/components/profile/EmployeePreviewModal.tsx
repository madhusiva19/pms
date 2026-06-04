"use client";

import { useEffect, useState } from "react";
import ProfileTemplate from "@/components/profile/ProfileTemplate";
import type { ProfileData, SelfAchievement, SupervisorComment } from "@/components/profile/ProfileTemplate";

interface RawDiaryEntry      { id: string; entry_date: string; entry_text: string; status: string; }
interface RawSupervisorEntry { id: string; entry_date: string; entry_text: string; author_name?: string; }
interface RawProfileData     {
  full_name: string; date_of_birth?: string; joined_date?: string;
  email: string; avatar_url?: string | null; designations?: { name: string };
  country_id?: string; branch_id?: string; department_id?: string;
}

interface EmployeePreviewModalProps {
  employeeId: string;
  reviewerId: string;
  reviewerRole: string;
  onClose: () => void;
}

const ROLE_MAP: Record<string, any> = {
  hq_admin:       "HQ Admin",
  country_admin:  "Country Admin",
  branch_admin:   "Branch Admin",
  dept_admin:     "Dept Admin",
  sub_dept_admin: "Sub Dept Admin",
  employee:       "Employee",
};

export default function EmployeePreviewModal({
  employeeId,
  reviewerId,
  reviewerRole,
  onClose,
}: EmployeePreviewModalProps) {
  const [profileData,       setProfileData]       = useState<RawProfileData | null>(null);
  const [selfEntries,       setSelfEntries]       = useState<SelfAchievement[]>([]);
  const [supervisorEntries, setSupervisorEntries] = useState<SupervisorComment[]>([]);
  const [loading,           setLoading]           = useState(true);

  const API = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileRes, diaryRes] = await Promise.all([
          fetch(`${API}/api/profile/${employeeId}`),
          fetch(`${API}/api/diary/${employeeId}`),
        ]);
        const profileJson = await profileRes.json();
        const diaryJson   = await diaryRes.json();

        setProfileData(profileJson.profile);
        setSelfEntries(
          (diaryJson.self_entries || []).map((e: RawDiaryEntry) => ({
            id: e.id, date: e.entry_date, content: e.entry_text,
            status: e.status as "pending" | "approved" | "rejected",
          }))
        );
        setSupervisorEntries(
          (diaryJson.supervisor_entries || []).map((e: RawSupervisorEntry) => ({
            id: e.id, date: e.entry_date,
            supervisorName: e.author_name || "Supervisor",
            comment: e.entry_text,
          }))
        );
      } catch (err) {
        console.error("Failed to load employee preview:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [employeeId]);

  const profile: ProfileData | null = profileData ? {
    fullName:    profileData.full_name,
    dob:         profileData.date_of_birth || "",
    joinedDate:  profileData.joined_date   || "",
    designation: profileData.designations?.name || "",
    email:       profileData.email,
    avatarUrl:   profileData.avatar_url || null,
  } : null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#F9FAFB",
          borderRadius: "10px",
          width: "1000px",
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Close button ── */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: "16px", right: "16px", zIndex: 10,
            background: "#fff", border: "1.5px solid #E5E7EB",
            borderRadius: "50%", width: "32px", height: "32px",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#F3F4F6")}
          onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* ── Content ── */}
        {loading || !profile ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "300px", color: "#9CA3AF", fontSize: "14px",
          }}>
            Loading...
          </div>
        ) : (
          <ProfileTemplate
            role={ROLE_MAP[reviewerRole] || "Employee"}
            profile={profile}
            sidebarName=""
            dashboardPath=""
            employeeId={employeeId}
            reviewerId={reviewerId}
            viewMode="supervisor"
            initialSelfAchievements={selfEntries}
            initialSupervisorComments={supervisorEntries}
          />
        )}
      </div>
    </div>
  );
}
