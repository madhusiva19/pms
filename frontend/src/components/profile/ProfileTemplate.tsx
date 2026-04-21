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
  status: "pending" | "approved";
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
  branch?: string;     // Branch Admin, Dept Admin, Sub Dept Admin, Employee
  department?: string; // Dept Admin, Sub Dept Admin, Employee
};

interface ProfileTemplateProps {
  role: Role;
  profile: ProfileData;
  sidebarName: string;       // e.g. "Amarasinghe"
  initialSelfAchievements?: SelfAchievement[];
  initialSupervisorComments?: SupervisorComment[];
  dashboardPath: string;     // e.g. "/hq-admin/dashboard"
  apiEmail: string;
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
  apiEmail,
}: ProfileTemplateProps) {
  const router = useRouter();
  const config = ROLE_CONFIG[role];

  const [achievement, setAchievement] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<"none" | "pending" | "approved" | "rejected">("none");
  const [selfAchievements, setSelfAchievements] = useState<SelfAchievement[]>(initialSelfAchievements);
  const supervisorComments: SupervisorComment[] = initialSupervisorComments;

  const initials = profile.fullName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // ── Save (HQ Admin only) ──
  const handleSave = async () => {
    if (achievement.trim().length === 0) return;
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("http://127.0.0.1:5000/api/profile/achievement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: apiEmail, achievement: achievement.trim() }),
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
          { id: data.id || Math.random().toString(36).substr(2, 9), date, content: achievement.trim(), status: "approved" },
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
      const res = await fetch("http://127.0.0.1:5000/api/profile/achievement/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: apiEmail, achievement: achievement.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setStatusMsg(data.message || "Failed to submit");
      } else {
        setStatus("success");
        setStatusMsg("Achievement submitted for approval ✅");
        setApprovalStatus("pending");
        const date = new Date().toISOString().split("T")[0];
        setSelfAchievements((prev) => [
          { id: data.id || Math.random().toString(36).substr(2, 9), date, content: achievement.trim(), status: "pending" },
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

  // ── Delete (HQ Admin only) ──
  const handleDelete = async (achievementId: string) => {
    if (!confirm("Are you sure you want to delete this achievement? This action will be logged.")) return;
    try {
      const res = await fetch(`http://127.0.0.1:5000/api/profile/achievement/${achievementId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: apiEmail }),
      });
      if (res.ok) {
        setSelfAchievements((prev) => prev.filter((item) => item.id !== achievementId));
        setStatus("success");
        setStatusMsg("Achievement deleted and logged.");
      } else {
        setStatus("error");
        setStatusMsg("Failed to delete record.");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Backend connection failed ❌");
    }
  };

  const isSubmitDisabled =
    achievement.trim().length === 0 ||
    saving;

  return (
    <div className={styles.shell}>

      {/* ══════════════ SIDEBAR ══════════════ */}
      <aside className={styles.sidebar}>

        {/* Brand */}
        <div className={styles.brand}>
          <Image src="/dgl-logo.png" alt="DGL Logo" width={160} height={56} className={styles.brandLogoImg} priority />
        </div>

        {/* Nav — same 5 items for all roles, My Profile always active */}
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

          {/* My Profile — always active on this page */}
          <button type="button" className={`${styles.sideItem} ${styles.active}`}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M20 21a8 8 0 0 0-16 0"                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>My Profile</span>
          </button>

        </nav>

        {/* Footer */}
        <div className={styles.sideFooter}>
          <div className={styles.profileRow}>
            <div className={styles.avatarCircle}>{config.avatarLabel}</div>
            <div className={styles.profileText}>
              <div className={styles.profileName}>{sidebarName}</div>
              <div className={styles.profileRole}>{role.toLowerCase()}</div>
            </div>
          </div>
          <button className={styles.logoutBtn} type="button" onClick={() => router.push("/login")}>
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
          <span className={styles.crumbCurrent}>My Profile</span>
        </div>

        {/* Header */}
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>My Profile</h1>
            <p className={styles.subtitle}>Personal Details and Performance Highlights</p>
          </div>
          {role !== "Employee" && (
            <button className={styles.backBtn} type="button" onClick={() => router.push(dashboardPath)}>
              Back to Dashboard
            </button>
          )}
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

            {/* Table 1: Supervisor Comments (all roles except HQ Admin) */}
            {config.showSupervisorComments && (
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
                      {supervisorComments.length === 0 ? (
                        <tr><td colSpan={3} style={{ padding: "12px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>No comments yet</td></tr>
                      ) : (
                        supervisorComments.map((item, idx) => (
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
                {config.isHQ ? "My Achievements" : (
                  <>
                    My Submissions
                    <span style={{ marginLeft: "10px", fontSize: "12px", fontWeight: 400, color: "#6B7280" }}>
                      <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: "#FEF9C3", border: "1px solid #FDE047", marginRight: "4px" }} />
                      Pending
                      <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: "#DCFCE7", border: "1px solid #86EFAC", marginRight: "4px", marginLeft: "10px" }} />
                      Approved
                    </span>
                  </>
                )}
              </p>
              <div style={{ maxHeight: "160px", overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: "8px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#F9FAFB", position: "sticky", top: 0 } as React.CSSProperties}>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #E5E7EB", width: "100px" }}>Date</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Achievement</th>
                      {config.isHQ && (
                        <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: "#374151", borderBottom: "1px solid #E5E7EB", width: "50px" }}>Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {selfAchievements.length === 0 ? (
                      <tr><td colSpan={config.isHQ ? 3 : 2} style={{ padding: "12px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>No entries yet</td></tr>
                    ) : (
                      selfAchievements.map((item, idx) => (
                        <tr key={item.id} style={{
                          background: config.isHQ
                            ? (idx % 2 === 0 ? "#FFFFFF" : "#F9FAFB")
                            : (item.status === "approved" ? "#DCFCE7" : "#FEF9C3"),
                        }}>
                          <td style={{ padding: "8px 12px", color: "#6B7280", whiteSpace: "nowrap", verticalAlign: "top", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{item.date}</td>
                          <td style={{ padding: "8px 12px", color: "#111827", lineHeight: "1.5", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{item.content}</td>
                          {config.isHQ && (
                            <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(0,0,0,0.06)", textAlign: "center" }}>
                              <button onClick={() => handleDelete(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444" }} title="Delete">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </td>
                          )}
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
                placeholder="Write your achievements here (e.g., awards, targets reached, process improvements, customer appreciation...)"
                value={achievement}
                onChange={(e) => setAchievement(e.target.value)}
                maxLength={600}
                disabled={false}
              />
              <div className={styles.textAreaFooter}>
                <span className={styles.mutedSmall}>{achievement.length}/600</span>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={config.isHQ ? handleSave : handleSubmit}
                  disabled={config.isHQ ? (achievement.trim().length === 0 || saving) : isSubmitDisabled}
                >
                  {saving
                    ? (config.isHQ ? "Saving..." : "Submitting...")
                    : (config.isHQ ? "Save" : "Submit for Approval")}
                </button>
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

            {/* No pending block — users can submit multiple entries freely */}

            <div className={styles.tipBox}>
              <div className={styles.tipTitle}>Tip</div>
              <div className={styles.tipText}>
                {config.isHQ
                  ? "Keep it short and measurable! Focus on specific accomplishments that had a positive impact on your work or team."
                  : `Keep it short and measurable! Your achievement will be reviewed by the ${config.approvedBy} before it is recorded.`}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}