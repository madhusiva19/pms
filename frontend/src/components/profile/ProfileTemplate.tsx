"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./profile.module.css";

// ── Types ──────────────────────────────────────────────
export type Role =
  | "HQ Admin"
  | "Country Admin"
  | "Branch Admin"
  | "Dept Admin"
  | "Sub Dept Admin"
  | "Employee";

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
  country?: string;
  branch?: string;
  department?: string;
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
  "HQ Admin":       { isHQ: true,  showSupervisorComments: false, showBranch: false, showDepartment: false, approvedBy: "",              avatarLabel: "HQ" },
  "Country Admin":  { isHQ: false, showSupervisorComments: true,  showBranch: false, showDepartment: false, approvedBy: "HQ Admin",       avatarLabel: "CA" },
  "Branch Admin":   { isHQ: false, showSupervisorComments: true,  showBranch: true,  showDepartment: false, approvedBy: "Country Admin",  avatarLabel: "BA" },
  "Dept Admin":     { isHQ: false, showSupervisorComments: true,  showBranch: true,  showDepartment: true,  approvedBy: "Branch Admin",   avatarLabel: "DA" },
  "Sub Dept Admin": { isHQ: false, showSupervisorComments: true,  showBranch: true,  showDepartment: true,  approvedBy: "Dept Admin",     avatarLabel: "SD" },
  "Employee":       { isHQ: false, showSupervisorComments: true,  showBranch: true,  showDepartment: true,  approvedBy: "Sub Dept Admin", avatarLabel: "EM" },
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

  const [achievement, setAchievement] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [selfAchievements, setSelfAchievements] = useState<SelfAchievement[]>(initialSelfAchievements);
  const [supervisorCommentsList, setSupervisorCommentsList] = useState<SupervisorComment[]>(initialSupervisorComments);

  const initials = profile.fullName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // ── Save (HQ Admin own profile only) ──
  const handleSave = async () => {
    if (achievement.trim().length === 0) return;
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/diary/save`, {
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

  // ── Submit for approval (all roles except HQ Admin) ──
  const handleSubmit = async () => {
    if (achievement.trim().length === 0) return;
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/diary/submit`, {
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
      setTimeout(() => { setStatus("idle"); setStatusMsg(""); }, 3000);
    }
  };

  // ── Delete (HQ Admin own profile only) ──
  const handleDelete = async (diaryId: string) => {
    if (!confirm("Are you sure you want to delete this entry?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/diary/${diaryId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId }),
      });
      if (res.ok) {
        setSelfAchievements((prev) => prev.filter((item) => item.id !== diaryId));
        setStatus("success");
        setStatusMsg("Entry deleted.");
      } else {
        setStatus("error");
        setStatusMsg("Failed to delete.");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Backend connection failed ❌");
    }
  };

  // ── Approve diary entry (supervisor mode) ──
  const handleApprove = async (diaryId: string) => {
    try {
      const res = await fetch(
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
      } else {
        setStatus("error");
        setStatusMsg("Failed to approve entry");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Backend connection failed ❌");
    } finally {
      setTimeout(() => { setStatus("idle"); setStatusMsg(""); }, 3000);
    }
  };

  // ── Reject diary entry (supervisor mode) ──
  const handleReject = async (diaryId: string) => {
    try {
      const res = await fetch(
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
      } else {
        setStatus("error");
        setStatusMsg("Failed to reject entry");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Backend connection failed ❌");
    } finally {
      setTimeout(() => { setStatus("idle"); setStatusMsg(""); }, 3000);
    }
  };

  // ── Add supervisor diary comment (supervisor mode) ──
  const handleSupervisorComment = async () => {
    if (achievement.trim().length === 0) return;
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch(
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
    <div className={styles.shell}>

      {/* ══════════════ SIDEBAR ══════════════ */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Image src="/dgl-logo.png" alt="DGL Logo" width={160} height={56} className={styles.brandLogoImg} priority />
        </div>

        <nav className={styles.sideNav}>
          <button type="button" className={styles.sideItem} onClick={() => router.push(dashboardPath)}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <rect x="3"  y="3"  width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
              <rect x="14" y="3"  width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
              <rect x="3"  y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
            </svg>
            <span className={styles.sideLabel}>Dashboard</span>
          </button>

          <button type="button" className={styles.sideItem}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M7 3h7l3 3v15H7V3Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M14 3v4h4"           stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M9 12h6"             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M9 16h6"             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>Template Management</span>
          </button>

          <button type="button" className={styles.sideItem}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M8 18c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M12 13a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 12 13Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M19 18c0-1.8-1.2-3.3-2.8-3.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>My Team</span>
          </button>

          <button type="button" className={styles.sideItem}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M5 20V4"    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M5 20h15"   stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M9 20v-7"   stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M13 20v-11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M17 20v-4"  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>Reports</span>
          </button>

          <button type="button" className={`${styles.sideItem} ${viewMode === "own" ? styles.active : ""}`}
            onClick={() => router.push(dashboardPath.replace("dashboard", "profile"))}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M20 21a8 8 0 0 0-16 0"                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>My Profile</span>
          </button>
        </nav>

        <div className={styles.sideFooter}>
          <div className={styles.profileRow}>
            <div className={styles.avatarCircle}>{config.avatarLabel}</div>
            <div className={styles.profileText}>
              <div className={styles.profileName}>{sidebarName}</div>
              <div className={styles.profileRole}>{role.toLowerCase()}</div>
            </div>
          </div>
          <button className={styles.logoutBtn} type="button" onClick={() => {
            localStorage.removeItem("pms_user");
            router.push("/login");
          }}>
            Logout
          </button>
        </div>
      </aside>

      {/* ══════════════ MAIN ══════════════ */}
      <main className={styles.main}>

        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <span className={styles.crumbSep}>›</span>
          {role !== "Employee" && (
            <>
              <span className={styles.crumbLink} onClick={() => router.push(dashboardPath)}>Dashboard</span>
              <span className={styles.crumbSep}>›</span>
            </>
          )}
          <span className={styles.crumbCurrent}>
            {viewMode === "supervisor" ? `${profile.fullName}'s Profile` : "My Profile"}
          </span>
        </div>

        {/* Header */}
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>
              {viewMode === "supervisor" ? `${profile.fullName}'s Profile` : "My Profile"}
            </h1>
            <p className={styles.subtitle}>Personal Details and Performance Highlights</p>
          </div>
          <button className={styles.backBtn} type="button" onClick={() => router.back()}>
            Back
          </button>
        </div>

        {/* Profile Hero Card */}
        <section className={styles.profileTopCard}>
          <div className={styles.profileHero}>
            <div className={styles.heroAvatar}><span className={styles.heroInitials}>{initials}</span></div>
            <div className={styles.heroText}>
              <div className={styles.heroName}>{profile.fullName}</div>
              <div className={styles.heroMeta}>
                <span className={styles.pill}>{profile.designation}</span>
                {profile.branch  && <><span className={styles.dot}>•</span><span className={styles.muted}>{profile.branch}</span></>}
                {profile.country && <><span className={styles.dot}>•</span><span className={styles.muted}>{profile.country}</span></>}
              </div>
              <div className={styles.heroEmail}>{profile.email}</div>
            </div>
          </div>
          <div className={styles.heroAccent} />
        </section>

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
                      <span style={{ marginLeft: "10px", fontSize: "12px", fontWeight: 400, color: "#6B7280" }}>
                        <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: "#FEF9C3", border: "1px solid #FDE047", marginRight: "4px" }} />
                        Pending
                        <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: "#DCFCE7", border: "1px solid #86EFAC", marginRight: "4px", marginLeft: "10px" }} />
                        Approved
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
                    {selfAchievements.length === 0 ? (
                      <tr><td colSpan={3} style={{ padding: "12px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>No entries yet</td></tr>
                    ) : (
                      selfAchievements.map((item) => (
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
                              <button onClick={() => handleDelete(item.id)}
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
                                <button onClick={() => handleApprove(item.id)}
                                  style={{ padding: "4px 10px", background: "#DCFCE7", color: "#065F46", border: "1px solid #86EFAC", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
                                  ✓ Approve
                                </button>
                                <button onClick={() => handleReject(item.id)}
                                  style={{ padding: "4px 10px", background: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
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
                    onClick={config.isHQ ? handleSave : handleSubmit}
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
      </main>
    </div>
  );
}