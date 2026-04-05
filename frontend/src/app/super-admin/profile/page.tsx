"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./profile.module.css";

export default function SuperAdminProfilePage() {
  const router = useRouter();
  const [achievement, setAchievement] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<"none" | "pending" | "approved" | "rejected">("none");

  // Dummy data for interim
  const admin = {
    fullName: "Amarasinghe S. K.",
    dob: "1988-04-22",
    joinedDate: "2018-06-15",
    designation: "Mraketing Director",
    email: "superadmin@dgl.com",
    branch: "Head Office",
  };

  const handleSubmit = async () => {
    if (achievement.trim().length === 0) return;

    setSaving(true);
    setStatus("idle");

    try {
      const res = await fetch("http://127.0.0.1:5000/api/profile/achievement/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "superadmin@dgl.com",
          achievement: achievement.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setStatusMsg(data.message || "Failed to submit");
      } else {
        setStatus("success");
        setStatusMsg("Achievement submitted for approval ✅");
        setApprovalStatus("pending");
      }
    } catch (err) {
      setStatus("error");
      setStatusMsg("Backend connection failed ❌");
    } finally {
      setSaving(false);
      setTimeout(() => {
        setStatus("idle");
        setStatusMsg("");
      }, 3000);
    }
  };

  const badgeConfig = {
    none:     { label: "",                    bg: "transparent", color: "transparent" },
    pending:  { label: "⏳ Pending Approval", bg: "#FFFBEB",     color: "#92400E" },
    approved: { label: "✅ Approved",          bg: "#ECFDF5",     color: "#065F46" },
    rejected: { label: "❌ Rejected",          bg: "#FEF2F2",     color: "#991B1B" },
  };

  const badge = badgeConfig[approvalStatus];

  return (
    <div className={styles.shell}>
      {/* ── Sidebar (same color as Group Admin) ── */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Image
            src="/dgl-logo.png"
            alt="DGL Logo"
            width={160}
            height={56}
            className={styles.brandLogoImg}
            priority
          />
        </div>

        <nav className={styles.sideNav}>
          {/* Dashboard */}
          <button
            type="button"
            className={styles.sideItem}
            onClick={() => router.push("/super-admin/dashboard")}
          >
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <rect x="3"  y="3"  width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
              <rect x="14" y="3"  width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
              <rect x="3"  y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
            </svg>
            <span className={styles.sideLabel}>Dashboard</span>
          </button>

          {/* Template Management */}
          <button type="button" className={styles.sideItem}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M7 3h7l3 3v15H7V3Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M14 3v4h4"           stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M9 12h6"             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M9 16h6"             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>Template Management</span>
          </button>

          {/* My Team */}
          <button type="button" className={styles.sideItem}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M8 18c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M12 13a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 12 13Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M19 18c0-1.8-1.2-3.3-2.8-3.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>My Team</span>
          </button>

          {/* Reports */}
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

          {/* My Profile — Active */}
          <button type="button" className={`${styles.sideItem} ${styles.active}`}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M20 21a8 8 0 0 0-16 0"                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>My Profile</span>
          </button>
        </nav>

        <div className={styles.sideFooter}>
          <div className={styles.profileRow}>
            <div className={styles.avatarCircle}>SA</div>
            <div className={styles.profileText}>
              <div className={styles.profileName}>Amarasinghe</div>
              <div className={styles.profileRole}>super admin</div>
            </div>
          </div>
          <button
            className={styles.logoutBtn}
            type="button"
            onClick={() => router.push("/login")}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className={styles.main}>
        <div className={styles.breadcrumb}>
          <span className={styles.crumbLink} onClick={() => router.push("/super-admin/dashboard")}>
            Home
          </span>
          <span className={styles.crumbSep}>›</span>
          <span className={styles.crumbLink} onClick={() => router.push("/super-admin/dashboard")}>
            Dashboard
          </span>
          <span className={styles.crumbSep}>›</span>
          <span className={styles.crumbCurrent}>My Profile</span>
        </div>

        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>My Profile</h1>
            <p className={styles.subtitle}>Personal Details and Performance Highlights</p>
          </div>
          <button
            className={styles.backBtn}
            type="button"
            onClick={() => router.push("/super-admin/dashboard")}
          >
            Back to Dashboard
          </button>
        </div>

        {/* Profile Header Card */}
        <section className={styles.profileTopCard}>
          <div className={styles.profileHero}>
            <div className={styles.heroAvatar}>
              <span className={styles.heroInitials}>A</span>
            </div>
            <div className={styles.heroText}>
              <div className={styles.heroName}>{admin.fullName}</div>
              <div className={styles.heroMeta}>
                <span className={styles.pill}>{admin.designation}</span>
                <span className={styles.dot}>•</span>
                <span className={styles.muted}>{admin.branch}</span>
              </div>
              <div className={styles.heroEmail}>{admin.email}</div>
            </div>
          </div>
          <div className={styles.heroAccent} />
        </section>

        {/* Details + Achievements */}
        <section className={styles.grid}>
          {/* Personal Details Card */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Personal Details</h2>
            </div>
            <div className={styles.detailGrid}>
              <div className={styles.field}>
                <div className={styles.label}>Full Name</div>
                <div className={styles.value}>{admin.fullName}</div>
              </div>
              <div className={styles.field}>
                <div className={styles.label}>Date of Birth</div>
                <div className={styles.value}>{admin.dob}</div>
              </div>
              <div className={styles.field}>
                <div className={styles.label}>Date Joined</div>
                <div className={styles.value}>{admin.joinedDate}</div>
              </div>
              <div className={styles.field}>
                <div className={styles.label}>Designation</div>
                <div className={styles.value}>{admin.designation}</div>
              </div>
            </div>
          </div>

          {/* Achievements Card */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Remarkable Performance / Achievements</h2>

              {/* Approval status badge */}
              {approvalStatus !== "none" && (
                <span style={{
                  padding: "4px 12px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: badge.bg,
                  color: badge.color,
                  border: `1px solid ${badge.color}`,
                }}>
                  {badge.label}
                </span>
              )}
            </div>

            <div className={styles.textAreaWrap}>
              <textarea
                className={styles.textArea}
                placeholder="Write your achievements here (e.g., awards, targets reached, process improvements, customer appreciation...)"
                value={achievement}
                onChange={(e) => setAchievement(e.target.value)}
                maxLength={600}
                disabled={approvalStatus === "pending" || approvalStatus === "approved"}
              />
              <div className={styles.textAreaFooter}>
                <span className={styles.mutedSmall}>{achievement.length}/600</span>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={handleSubmit}
                  disabled={
                    achievement.trim().length === 0 ||
                    saving ||
                    approvalStatus === "pending" ||
                    approvalStatus === "approved"
                  }
                >
                  {saving ? "Submitting..." : "Submit for Approval"}
                </button>
              </div>
            </div>

            {/* Status message */}
            {status !== "idle" && (
              <div style={{
                marginTop: "10px",
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 500,
                background: status === "success" ? "#ECFDF5" : "#FEF2F2",
                color:      status === "success" ? "#065F46" : "#991B1B",
                border: `1px solid ${status === "success" ? "#A7F3D0" : "#FECACA"}`,
              }}>
                {statusMsg}
              </div>
            )}

            {/* Pending note */}
            {approvalStatus === "pending" && (
              <div style={{
                marginTop: "10px",
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                background: "#FFFBEB",
                color: "#92400E",
                border: "1px solid #FDE68A",
              }}>
                Your achievement is awaiting review by the Group Admin. You cannot edit it until a decision is made.
              </div>
            )}

            <div className={styles.tipBox}>
              <div className={styles.tipTitle}>Tip</div>
              <div className={styles.tipText}>
                Keep it short and measurable! Your achievement will be reviewed by the Group Admin before it is recorded.
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}