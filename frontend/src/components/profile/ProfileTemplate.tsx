"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import styles from "./profile.module.css";
import AvatarUpload from "./AvatarUpload";
import { apiFetch } from "@/lib/apiFetch";
import { Role, ROLE_AVATAR_LABELS } from "@/lib/roleConfig";
import { generateProfilePDF, preloadProfilePDFAssets } from "@/utils/generateProfilePDF";

// ── Types ──────────────────────────────────────────────
export type SelfAchievement = {
  id: string;
  date: string;
  content: string;
  status: "pending" | "approved" | "rejected";
};

export type SupervisorComment = {
  id: string;
  date: string;
  supervisorName: string;
  comment: string;
};

export type ProfileData = {
  fullName: string;
  dob: string;
  joinedDate: string;
  designation: string;
  email: string;
  avatarUrl?: string | null;
  country?: string;
  branch?: string;
  department?: string;
  performanceScore?: number | null;
  potentialBlock?: "H" | "M" | "L" | null;
  cycleYear?: number | null;
  cyclePeriod?: string | null;
};

interface ProfileTemplateProps {
  role: Role;
  profile: ProfileData;
  sidebarName: string;
  initialSelfAchievements?: SelfAchievement[];
  initialSupervisorComments?: SupervisorComment[];
  dashboardPath: string;
  employeeId: string;
  reviewerId?: string;
  viewMode?: "own" | "supervisor";
}

// ── Role config ────────────────────────────────────────
const ROLE_CONFIG: Record<Role, {
  isHQ: boolean;
  showSupervisorComments: boolean;
  showBranch: boolean;
  showDepartment: boolean;
  approvedBy: string;
  avatarLabel: string;
}> = {
  "HQ Admin":       { isHQ: true,  showSupervisorComments: false, showBranch: false, showDepartment: false, approvedBy: "",              avatarLabel: ROLE_AVATAR_LABELS["HQ Admin"]       },
  "Country Admin":  { isHQ: false, showSupervisorComments: true,  showBranch: false, showDepartment: false, approvedBy: "HQ Admin",       avatarLabel: ROLE_AVATAR_LABELS["Country Admin"]  },
  "Branch Admin":   { isHQ: false, showSupervisorComments: true,  showBranch: true,  showDepartment: false, approvedBy: "Country Admin",  avatarLabel: ROLE_AVATAR_LABELS["Branch Admin"]   },
  "Dept Admin":     { isHQ: false, showSupervisorComments: true,  showBranch: true,  showDepartment: true,  approvedBy: "Branch Admin",   avatarLabel: ROLE_AVATAR_LABELS["Dept Admin"]     },
  "Sub Dept Admin": { isHQ: false, showSupervisorComments: true,  showBranch: true,  showDepartment: true,  approvedBy: "Dept Admin",     avatarLabel: ROLE_AVATAR_LABELS["Sub Dept Admin"] },
  "Employee":       { isHQ: false, showSupervisorComments: true,  showBranch: true,  showDepartment: true,  approvedBy: "Sub Dept Admin", avatarLabel: ROLE_AVATAR_LABELS["Employee"]       },
};

// ── Component ──────────────────────────────────────────
export default function ProfileTemplate({
  role,
  profile,
  sidebarName,
  initialSelfAchievements = [],
  initialSupervisorComments = [],
  dashboardPath,
  employeeId,
  reviewerId,
  viewMode = "own",
}: ProfileTemplateProps) {

  const router = useRouter();
  const config = ROLE_CONFIG[role];
  const { refreshBadges, updateUser } = useAuth();
  const [achievement, setAchievement] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId]   = useState<string | null>(null);
  const [selfAchievements, setSelfAchievements] = useState<SelfAchievement[]>(initialSelfAchievements);
  const [supervisorCommentsList, setSupervisorCommentsList] = useState<SupervisorComment[]>(initialSupervisorComments);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl || null);
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [diaryStatusFilter, setDiaryStatusFilter] = useState<"approved" | "rejected" | "pending">("approved");

  // ── Preload PDF assets (logo) in the background on mount ──
  useEffect(() => { preloadProfilePDFAssets(); }, []);

  // ── Download profile as PDF ──
  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      await generateProfilePDF({
        name:             profile.fullName,
        role,
        email:            profile.email,
        designation:      profile.designation,
        department:       profile.department,
        branch:           profile.branch,
        country:          profile.country,
        avatarUrl:        avatarUrl,
        performanceScore: profile.performanceScore,
        potentialBlock:   profile.potentialBlock,
        cycleYear:        profile.cycleYear,
        cyclePeriod:      profile.cyclePeriod,
        achievements:     selfAchievements,
        supervisorComments: config.showSupervisorComments ? supervisorCommentsList : [],
      });
    } finally {
      setPdfLoading(false);
    }
  };
  const initials = profile?.fullName
    ? profile.fullName
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
    : "??";
const avatarBg = "#F9BE00";

  // ── Status filter tabs for "My Submissions" table (own, non-HQ mode) ──
  const showStatusFilter = viewMode === "own" && !config.isHQ;
  const STATUS_META: Record<"pending" | "approved" | "rejected", { label: string; bg: string; border: string }> = {
    pending:  { label: "Pending",  bg: "#FEF9C3", border: "#FDE047" },
    approved: { label: "Approved", bg: "#DCFCE7", border: "#86EFAC" },
    rejected: { label: "Rejected", bg: "#FEE2E2", border: "#F87171" },
  };
  const displayedAchievements = showStatusFilter
    ? selfAchievements.filter((item) => item.status === diaryStatusFilter)
    : selfAchievements;

  // ── Save (HQ Admin own profile only) ──
  const handleSave = async () => {
    if (achievement.trim().length === 0) return;
    setSaving(true);
    setStatus("idle");
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/diary/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          description: achievement.trim(),
          entry_date: new Date().toISOString().split("T")[0],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setStatusMsg(data.message || "Failed to save");
      } else {
        setStatus("success");
        setStatusMsg("Achievement saved successfully ✅");
        const date = new Date().toISOString().split("T")[0];
        setSelfAchievements((prev) => [
          { id: data.data?.diary_id || Math.random().toString(36).substr(2, 9), date, content: achievement.trim(), status: "approved" },
          ...prev,
        ]);
        setAchievement("");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Backend connection failed ❌");
    } finally {
      setSaving(false);
      setTimeout(() => { setStatus("idle"); setStatusMsg(""); }, 3000);
    }
  };

  // ── Open submit confirm modal (all roles except HQ Admin) ──
  const openSubmitModal = () => {
    if (achievement.trim().length === 0) return;
    setShowSubmitModal(true);
  };

  // ── Submit for approval (all roles except HQ Admin) ──
  const handleSubmit = async () => {
    if (achievement.trim().length === 0) return;
    setSaving(true);
    setStatus("idle");
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/diary/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          description: achievement.trim(),
          entry_date: new Date().toISOString().split("T")[0],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setStatusMsg(data.message || "Failed to submit");
      } else {
        setStatus("success");
        setStatusMsg("Achievement submitted for approval ✅");
        refreshBadges();
        const date = new Date().toISOString().split("T")[0];
        setSelfAchievements((prev) => [
          { id: data.data?.diary_id || Math.random().toString(36).substr(2, 9), date, content: achievement.trim(), status: "pending" },
          ...prev,
        ]);
        setAchievement("");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Backend connection failed ❌");
    } finally {
      setSaving(false);
      setShowSubmitModal(false);
      setTimeout(() => { setStatus("idle"); setStatusMsg(""); }, 3000);
    }
  };

  // ── Delete (HQ Admin own profile only) ──
  const openDeleteModal = (diaryId: string) => {
    setDeleteTargetId(diaryId);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/diary/${deleteTargetId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId }),
      });
      if (res.ok) {
        setSelfAchievements((prev) => prev.filter((item) => item.id !== deleteTargetId));
        setStatus("success");
        setStatusMsg("Entry deleted.");
      } else {
        setStatus("error");
        setStatusMsg("Failed to delete.");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Backend connection failed ❌");
    } finally {
      setShowDeleteModal(false);
      setDeleteTargetId(null);
    }
  };

  // ── Approve diary entry (supervisor mode) ──
  const handleApprove = async (diaryId: string) => {
    if (processingIds.includes(diaryId)) return;
    setProcessingIds((prev) => [...prev, diaryId]);
    try {
      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/diary/${diaryId}/approve`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewer_id: reviewerId }),
        }
      );
      if (res.ok) {
        setSelfAchievements((prev) =>
          prev.map((item) => item.id === diaryId ? { ...item, status: "approved" } : item)
        );
        setStatus("success");
        setStatusMsg("Entry approved successfully ✅");
        refreshBadges();
      } else {
        setStatus("error");
        setStatusMsg("Failed to approve entry");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Backend connection failed ❌");
    } finally {
      setProcessingIds((prev) => prev.filter((id) => id !== diaryId));
      setTimeout(() => { setStatus("idle"); setStatusMsg(""); }, 3000);
    }
  };

  // ── Reject diary entry (supervisor mode) ──
  const handleReject = async (diaryId: string) => {
    if (processingIds.includes(diaryId)) return;
    setProcessingIds((prev) => [...prev, diaryId]);
    try {
      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/diary/${diaryId}/reject`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewer_id: reviewerId }),
        }
      );
      if (res.ok) {
        setSelfAchievements((prev) =>
          prev.map((item) => item.id === diaryId ? { ...item, status: "rejected" } : item)
        );
        setStatus("success");
        setStatusMsg("Entry rejected ❌");
        refreshBadges();
      } else {
        setStatus("error");
        setStatusMsg("Failed to reject entry");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Backend connection failed ❌");
    } finally {
      setProcessingIds((prev) => prev.filter((id) => id !== diaryId));
      setTimeout(() => { setStatus("idle"); setStatusMsg(""); }, 3000);
    }
  };

  // ── Add supervisor diary comment (supervisor mode) ──
  const handleSupervisorComment = async () => {
    if (achievement.trim().length === 0) return;
    setSaving(true);
    setStatus("idle");
    try {
      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/diary/supervisor`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id:   employeeId,
            supervisor_id: reviewerId,
            description:   achievement.trim(),
            entry_date:    new Date().toISOString().split("T")[0],
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setStatusMsg("Supervisor comment added ✅");
        const date = new Date().toISOString().split("T")[0];
        setSupervisorCommentsList((prev) => [
          { id: data.data?.diary_id || Math.random().toString(36).substr(2, 9), date, supervisorName: sidebarName, comment: achievement.trim() },
          ...prev,
        ]);
        setAchievement("");
      } else {
        setStatus("error");
        setStatusMsg(data.message || "Failed to add comment");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Backend connection failed ❌");
    } finally {
      setSaving(false);
      setTimeout(() => { setStatus("idle"); setStatusMsg(""); }, 3000);
    }
  };

  return (
    <>
      <main style={{ flex: 1, minHeight: '100vh', background: '#F9FAFB', overflow: 'auto' }}>
      <div style={{ maxWidth: '1225px', margin: '0 auto', width: '100%', padding: '24px 32px 40px' }}>

        {/* Header */}
        <div className={styles.headerRow}>
          <div>
            {viewMode === "supervisor" && (
              <h1 className={styles.title}>{`${profile.fullName}'s Profile`}</h1>
            )}
            <p className={styles.subtitle}>Personal Details and Performance Highlights</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={handleDownloadPDF}
              disabled={pdfLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '130px', justifyContent: 'center' }}
            >
              {pdfLoading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  Exporting…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download PDF
                </>
              )}
            </button>
            <button className={styles.backBtn} type="button" onClick={() => router.back()}>
              Back
            </button>
          </div>
        </div>

        {/* Profile Hero Card + Score Cards */}
<div className={styles.scoreRow}>

  {/* ── Hero Card ── */}
  <section className={styles.profileTopCard} style={{ flex: 1, marginBottom: 0 }}>
    <div className={styles.profileHero}>

      {/* Avatar */}
      <div className={styles.heroAvatar}>
        <AvatarUpload
          currentUrl={avatarUrl}
          initials={initials}
          employeeId={employeeId}
          onUpdate={(newUrl) => {
            setAvatarUrl(newUrl);
            updateUser({ avatar_url: newUrl });
          }}
          avatarBg={avatarBg}
          viewMode={viewMode}
        />
      </div>

      {/* Info */}
      <div className={styles.heroText}>
        <div className={styles.heroName}>{profile.fullName}</div>
        <div className={styles.heroMeta}>
          <span className={styles.pill}>{profile.designation}</span>
          {profile.branch  && <><span className={styles.dot}>•</span><span className={styles.muted}>{profile.branch}</span></>}
          {profile.country && <><span className={styles.dot}>•</span><span className={styles.muted}>{profile.country}</span></>}
        </div>
        <div className={styles.heroEmail}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="#9CA3AF" strokeWidth="1.8" style={{ flexShrink: 0 }}>
            <path d="M4 6h16v12H4V6Z" strokeLinejoin="round"/>
            <path d="M4.5 7l7.5 6 7.5-6" strokeLinejoin="round"/>
          </svg>
          {profile.email}
        </div>
      </div>

    </div>
    <div className={styles.heroAccent} />
  </section>

  {/* ── Performance Score Card ── */}
  <div className={`${styles.scoreCard} ${styles.scoreCardPerformance}`}>
    <span className={styles.scoreLabel}>Performance Score</span>
    <span className={styles.scoreValue}>{profile.performanceScore ?? "—"}</span>
  </div>

  {/* ── Potential Score Card ── */}
  <div className={`${styles.scoreCard} ${
    profile.potentialBlock === "H" ? styles.scoreCardHigh :
    profile.potentialBlock === "M" ? styles.scoreCardMedium :
    profile.potentialBlock === "L" ? styles.scoreCardLow :
    styles.scoreCardEmpty
  }`}>
    <span className={styles.scoreLabel}>Potential Score</span>
    <span className={styles.scoreValue}>{profile.potentialBlock ?? "—"}</span>
  </div>

</div>

        {/* Details + Achievements Grid */}
        <section className={styles.grid}>

          {/* Personal Details Card */}
          <div className={styles.card}>
            <div className={styles.cardHead}><h2 className={styles.cardTitle}>Personal Details</h2></div>
            <div className={styles.detailGrid}>
              <div className={styles.field}><div className={styles.label}>Full Name</div><div className={styles.value}>{profile.fullName}</div></div>
              <div className={styles.field}><div className={styles.label}>Date Joined</div><div className={styles.value}>{profile.joinedDate}</div></div>
              <div className={styles.field}><div className={styles.label}>Date of Birth</div><div className={styles.value}>{profile.dob}</div></div>
              <div className={styles.field}><div className={styles.label}>Designation</div><div className={styles.value}>{profile.designation}</div></div>
        
              {config.showBranch && profile.branch && (
                <div className={styles.field}><div className={styles.label}>Branch</div><div className={styles.value}>{profile.branch}</div></div>
              )}
              {config.showDepartment && profile.department && (
                <div className={styles.field}><div className={styles.label}>Department</div><div className={styles.value}>{profile.department}</div></div>
              )}
            </div>
          </div>

          {/* Achievements Card */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Remarkable Performance / Achievements</h2>
            </div>
            

            

            {/* Table 1: Supervisor Comments */}
            {(config.showSupervisorComments || viewMode === "supervisor") && (
              <div style={{ padding: "14px 20px 0 20px" }}>
                <p style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                  Supervisor Comments
                </p>
                <div style={{ maxHeight: "160px", overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: "8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#F9FAFB", position: "sticky", top: 0 } as React.CSSProperties}>
                        <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #E5E7EB", width: "100px" }}>Date</th>
                        <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #E5E7EB", width: "130px" }}>Supervisor</th>
                        <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supervisorCommentsList.length === 0 ? (
                        <tr><td colSpan={3} style={{ padding: "12px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>No comments yet</td></tr>
                      ) : (
                        supervisorCommentsList.map((item, idx) => (
                          <tr key={item.id} style={{ background: idx % 2 === 0 ? "#FFFFFF" : "#F9FAFB" }}>
                            <td style={{ padding: "8px 12px", color: "#6B7280", whiteSpace: "nowrap", verticalAlign: "top", borderBottom: "1px solid #F3F4F6" }}>{item.date}</td>
                            <td style={{ padding: "8px 12px", color: "#374151", fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top", borderBottom: "1px solid #F3F4F6" }}>{item.supervisorName}</td>
                            <td style={{ padding: "8px 12px", color: "#111827", lineHeight: "1.5", borderBottom: "1px solid #F3F4F6" }}>{item.comment}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Table 2: Self Submissions */}
            <div style={{ padding: "14px 20px 0 20px" }}>
              <p style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                {viewMode === "supervisor" ? `${profile.fullName.split(" ")[0]}'s Submissions` : (
                  config.isHQ ? "My Achievements" : (
                    <>
                      My Submissions
                      <span style={{ marginLeft: "10px", display: "inline-flex", gap: "6px", verticalAlign: "middle" }}>
                        {(["pending", "approved", "rejected"] as const).map((key) => {
                          const meta = STATUS_META[key];
                          const active = diaryStatusFilter === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setDiaryStatusFilter(key)}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "4px",
                                padding: "3px 8px", borderRadius: "6px", cursor: "pointer",
                                fontSize: "12px", fontWeight: active ? 700 : 400,
                                color: "#374151", background: meta.bg,
                                border: active ? `1.5px solid ${meta.border}` : "1px solid transparent",
                                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
                                opacity: active ? 1 : 0.55,
                              }}
                            >
                              <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: meta.bg, border: `1px solid ${meta.border}` }} />
                              {meta.label}
                            </button>
                          );
                        })}
                      </span>
                    </>
                  )
                )}
              </p>
              <div style={{ maxHeight: "160px", overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: "8px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#F9FAFB", position: "sticky", top: 0 } as React.CSSProperties}>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #E5E7EB", width: "100px" }}>Date</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Achievement</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: "#374151", borderBottom: "1px solid #E5E7EB", width: "120px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAchievements.length === 0 ? (
                      <tr><td colSpan={3} style={{ padding: "12px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>No entries yet</td></tr>
                    ) : (
                      displayedAchievements.map((item) => (
                        <tr key={item.id} style={{
                          background:
                            item.status === "approved" ? "#DCFCE7" :
                            item.status === "rejected" ? "#FEE2E2" : "#FEF9C3",
                        }}>
                          <td style={{ padding: "8px 12px", color: "#6B7280", whiteSpace: "nowrap", verticalAlign: "top", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{item.date}</td>
                          <td style={{ padding: "8px 12px", color: "#111827", lineHeight: "1.5", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{item.content}</td>
                          <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(0,0,0,0.06)", textAlign: "center" }}>

                            {/* Own mode — HQ Admin delete */}
                            {viewMode === "own" && config.isHQ && (
                              <button onClick={() => openDeleteModal(item.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444" }} title="Delete">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            )}

                            {/* Own mode — show status badge for non-HQ */}
                            {viewMode === "own" && !config.isHQ && (
                              <span style={{
                                padding: "3px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 700,
                                background: item.status === "approved" ? "#DCFCE7" : item.status === "rejected" ? "#FEE2E2" : "#FEF9C3",
                                color: item.status === "approved" ? "#065F46" : item.status === "rejected" ? "#991B1B" : "#92400E",
                              }}>
                                {item.status === "approved" ? "✓ Approved" : item.status === "rejected" ? "✕ Rejected" : "⏳ Pending"}
                              </span>
                            )}

                            {/* Supervisor mode — approve/reject pending */}
                            {viewMode === "supervisor" && item.status === "pending" && (
                              <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                                <button 
                                  onClick={() => handleApprove(item.id)}
                                  disabled={processingIds.includes(item.id)}
                                  style={{ 
                                    padding: "4px 10px", 
                                    background: "#DCFCE7", 
                                    color: "#065F46", 
                                    border: "1px solid #86EFAC", 
                                    borderRadius: "6px", 
                                    cursor: processingIds.includes(item.id) ? "not-allowed" : "pointer", 
                                    fontSize: "12px", 
                                    fontWeight: 600,
                                    opacity: processingIds.includes(item.id) ? 0.6 : 1
                                  }}
                                >
                                  ✓ Approve
                                </button>
                                <button 
                                  onClick={() => handleReject(item.id)}
                                  disabled={processingIds.includes(item.id)}
                                  style={{ 
                                    padding: "4px 10px", 
                                    background: "#FEE2E2", 
                                    color: "#991B1B", 
                                    border: "1px solid #FECACA", 
                                    borderRadius: "6px", 
                                    cursor: processingIds.includes(item.id) ? "not-allowed" : "pointer", 
                                    fontSize: "12px", 
                                    fontWeight: 600,
                                    opacity: processingIds.includes(item.id) ? 0.6 : 1
                                  }}
                                >
                                  ✕ Reject
                                </button>
                              </div>
                            )}

                            {/* Supervisor mode — already reviewed */}
                            {viewMode === "supervisor" && item.status !== "pending" && (
                              <span style={{
                                padding: "3px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 700,
                                background: item.status === "approved" ? "#DCFCE7" : "#FEE2E2",
                                color: item.status === "approved" ? "#065F46" : "#991B1B",
                              }}>
                                {item.status === "approved" ? "✓ Approved" : "✕ Rejected"}
                              </span>
                            )}

                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Textarea + Button */}
            <div className={styles.textAreaWrap}>
              <textarea
                className={styles.textArea}
                placeholder={
                  viewMode === "supervisor"
                    ? "Add a supervisor comment about this employee's performance..."
                    : "Write your achievements here (e.g., awards, targets reached, process improvements...)"
                }
                value={achievement}
                onChange={(e) => setAchievement(e.target.value)}
                maxLength={600}
              />
              <div className={styles.textAreaFooter}>
                <span className={styles.mutedSmall}>{achievement.length}/600</span>

                {/* Own mode buttons */}
                {viewMode === "own" && (
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={config.isHQ ? handleSave : openSubmitModal}
                    disabled={achievement.trim().length === 0 || saving}
                  >
                    {saving
                      ? (config.isHQ ? "Saving..." : "Submitting...")
                      : (config.isHQ ? "Save" : "Submit for Approval")}
                  </button>
                )}

                {/* Supervisor mode button */}
                {viewMode === "supervisor" && (
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={handleSupervisorComment}
                    disabled={achievement.trim().length === 0 || saving}
                  >
                    {saving ? "Adding..." : "Add Supervisor Comment"}
                  </button>
                )}
              </div>
            </div>

            {/* Status message */}
            {status !== "idle" && (
              <div style={{
                margin: "0 20px 10px 20px",
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 500,
                background: status === "success" ? "#ECFDF5" : "#FEF2F2",
                color: status === "success" ? "#065F46" : "#991B1B",
                border: `1px solid ${status === "success" ? "#A7F3D0" : "#FECACA"}`,
              }}>
                {statusMsg}
              </div>
            )}

            {/* Tip box — only in own mode */}
            {viewMode === "own" && (
              <div className={styles.tipBox}>
                <div className={styles.tipTitle}>Tip</div>
                <div className={styles.tipText}>
                  {config.isHQ
                    ? "Keep it short and measurable! Focus on specific accomplishments that had a positive impact."
                    : `Keep it short and measurable! Your achievement will be reviewed by the ${config.approvedBy} before it is recorded.`}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
      </main>

      {/* ── Submit Confirmation Modal ── */}
      {showSubmitModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "#fff", borderRadius: "20px", padding: "32px 28px",
            width: "400px", maxWidth: "calc(100vw - 32px)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          }}>

            <h3 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: 700, color: "#111827" }}>
              Confirm Submission
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#9CA3AF" }}>
              This will be sent to your {config.approvedBy} for approval
            </p>

            {/* Achievement preview */}
            <div style={{
              background: "#F9FAFB", border: "1.5px solid #E5E7EB",
              borderRadius: "12px", padding: "14px 16px", marginBottom: "20px",
              textAlign: "left",
            }}>
              <p style={{
                margin: 0, fontSize: "13px", color: "#374151",
                lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {achievement.trim()}
              </p>
            </div>

            {/* Date */}
            <p style={{ margin: "0 0 24px", fontSize: "12px", color: "#9CA3AF", textAlign: "left" }}>
              📅 Submitted on {new Date().toLocaleDateString("en-GB", {
                day: "numeric", month: "long", year: "numeric"
              })}
            </p>

            {/* Buttons */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px",
                  border: "1.5px solid #E5E7EB", background: "#fff",
                  cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#374151",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  flex: 2, padding: "10px", borderRadius: "10px",
                  border: "none", background: saving ? "#93C5FD" : "#2563EB",
                  color: "#fff", cursor: saving ? "not-allowed" : "pointer",
                  fontSize: "13px", fontWeight: 700, transition: "background 0.2s",
                }}
              >
                {saving ? "Submitting..." : "Submit for Approval"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "#fff", borderRadius: "20px", padding: "32px 28px",
            width: "400px", maxWidth: "calc(100vw - 32px)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          }}>

            <div style={{
              width: "48px", height: "48px", borderRadius: "50%",
              background: "#FEF2F2", display: "flex", alignItems: "center",
              justifyContent: "center", margin: "0 auto 16px",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </div>

            <h3 style={{
              margin: "0 0 4px", fontSize: "17px", fontWeight: 700,
              color: "#111827", textAlign: "center",
            }}>
              Delete Entry
            </h3>
            <p style={{
              margin: "0 0 24px", fontSize: "13px", color: "#9CA3AF",
              textAlign: "center",
            }}>
              This achievement entry will be permanently removed and cannot be undone.
            </p>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => { setShowDeleteModal(false); setDeleteTargetId(null); }}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px",
                  border: "1.5px solid #E5E7EB", background: "#fff",
                  cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#374151",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px",
                  border: "none", background: "#EF4444",
                  color: "#fff", cursor: "pointer",
                  fontSize: "13px", fontWeight: 700, transition: "background 0.2s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#DC2626")}
                onMouseLeave={e => (e.currentTarget.style.background = "#EF4444")}
              >
                Delete
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}