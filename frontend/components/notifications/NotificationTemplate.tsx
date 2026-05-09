"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import styles from "./notifications.module.css";
import Sidebar from "@/components/sidebar/Sidebar";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:5000";

// ── Types ──────────────────────────────────────────────
type AchievementNotification = {
  id: string;
  fromName: string;
  fromRole: string;
  submittedAt: string;
  achievement: string;
  isRead: boolean;
  actionUrl: string;
};

type CutoffStatus = "normal" | "urgent" | "critical" | "frozen";

type CutoffNotification = {
  id: string;
  title: string;
  message: string;
  cutoffDate: string;
  status: CutoffStatus;
  isRead: boolean;
  actionUrl: string;
};

// ── Cutoff status badge config ─────────────────────────
const STATUS_STYLES: Record<
  CutoffStatus,
  { bg: string; border: string; badge: string; badgeColor: string; badgeText: string }
> = {
  normal:   { bg: "#FFFFFF", border: "#E5E7EB", badge: "#EFF6FF", badgeColor: "#1D4ED8", badgeText: "Upcoming"   },
  urgent:   { bg: "#FFFBEB", border: "#FDE047", badge: "#FEF9C3", badgeColor: "#92400E", badgeText: "⚠ Due Soon" },
  critical: { bg: "#FEF2F2", border: "#FECACA", badge: "#FEE2E2", badgeColor: "#991B1B", badgeText: "🔴 Overdue" },
  frozen:   { bg: "#F3F4F6", border: "#D1D5DB", badge: "#E5E7EB", badgeColor: "#374151", badgeText: "🔒 Frozen"  },
};

function resolveCutoffStatus(cutoffDate: string): CutoffStatus {
  const today  = new Date();
  const cutoff = new Date(cutoffDate);
  const diffDays = Math.ceil((cutoff.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (today > cutoff) return "critical";
  if (diffDays <= 7)  return "urgent";
  return "normal";
}

// ── Main Component ─────────────────────────────────────
export default function Notifications() {
  const { user } = useAuth();
  const router = useRouter();

  const userId   = user?.id ?? "";
  const roleSlug = user?.role?.replace(/_/g, "-") ?? "employee";
  const isEmployee = user?.role === "employee";

  const [activeTab,       setActiveTab]       = useState<"achievements" | "cutoff">("achievements");
  const [achievementList, setAchievementList] = useState<AchievementNotification[]>([]);
  const [cutoffList,      setCutoffList]      = useState<CutoffNotification[]>([]);
  const [loading,         setLoading]         = useState(true);

  // ── Fetch notifications ──────────────────────────────
  useEffect(() => {
    if (!userId) return;

    async function load() {
      setLoading(true);
      try {
        // Achievement notifications
        const notifRes  = await fetch(`${API}/api/manual-rating-notifications/${userId}`);
        const notifData = await notifRes.json();

        const achievements: AchievementNotification[] = (Array.isArray(notifData) ? notifData : []).map(
          (n: {
            id: string;
            title: string;
            message: string;
            type: string;
            period: string;
            pms_year: number;
            is_read: boolean;
            created_at: string;
          }) => ({
            id:          n.id,
            fromName:    n.title,
            fromRole:    n.type === "manual_reminder" ? "Supervisor Reminder" : "System Notification",
            submittedAt: n.created_at ? new Date(n.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "",
            achievement: n.message,
            isRead:      n.is_read,
            actionUrl:   `/${roleSlug}/manual-rating`,
          })
        );
        setAchievementList(achievements);

        // Cutoff notifications — from rating periods
        const periodRes  = await fetch(`${API}/api/rating-periods/current`);
        const periodData = await periodRes.json();
        const cutoffs: CutoffNotification[] = (periodData.periods ?? []).map(
          (p: { id: number; period: string; pms_year: number; rating_start: string; rating_end: string }) => ({
            id:          String(p.id),
            title:       `Rating Window — ${p.period} ${p.pms_year}`,
            message:     `The rating window for ${p.period} ${p.pms_year} runs from ${p.rating_start} to ${p.rating_end}. Ensure all manual ratings are completed before the window closes.`,
            cutoffDate:  p.rating_end,
            status:      resolveCutoffStatus(p.rating_end),
            isRead:      false,
            actionUrl:   `/${roleSlug}/rating-settings`,
          })
        );
        setCutoffList(cutoffs);
      } catch (err) {
        console.error("[Notifications] fetch error:", err);
      }
      setLoading(false);
    }

    load();
  }, [userId, roleSlug]);

  // ── Mark single notification read ────────────────────
  const callMarkRead = async (id: string) => {
    try {
      await fetch(`${API}/api/manual-rating-notifications/${id}/read`, { method: "PATCH" });
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const markAchievementRead = async (id: string) => {
    setAchievementList(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    await callMarkRead(id);
  };

  const markCutoffRead = (id: string) => {
    // Cutoff notifications have no backend read state — UI only
    setCutoffList(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  // ── Mark all read (active tab) ───────────────────────
  const markAllRead = async () => {
    if (activeTab === "achievements") {
      const unread = achievementList.filter(n => !n.isRead);
      setAchievementList(prev => prev.map(n => ({ ...n, isRead: true })));
      await Promise.all(unread.map(n => callMarkRead(n.id)));
    } else {
      setCutoffList(prev => prev.map(n => ({ ...n, isRead: true })));
    }
  };

  const unreadAchievements = achievementList.filter(n => !n.isRead).length;
  const unreadCutoffs      = cutoffList.filter(n => !n.isRead).length;

  if (loading) return (
    <div style={{ padding: "40px 24px", fontFamily: "Inter, sans-serif", color: "#64748B", fontSize: 14 }}>
      Loading notifications…
    </div>
  );

  return (
    <div className={styles.shell}>
      <Sidebar />

      <main className={styles.main}>

        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <span className={styles.crumbLink} onClick={() => router.push(`/${roleSlug}/dashboard`)}>Home</span>
          <span className={styles.crumbSep}>›</span>
          <span className={styles.crumbCurrent}>Notifications</span>
        </div>

        {/* Header */}
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Notifications</h1>
            <p className={styles.subtitle}>Stay updated on approvals and upcoming deadlines</p>
          </div>
          <button className={styles.markAllBtn} type="button" onClick={markAllRead}>
            Mark all as read
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabRow}>
          <button
            type="button"
            className={activeTab === "achievements" ? styles.tabActive : styles.tabInactive}
            onClick={() => setActiveTab("achievements")}
          >
            Achievement Approvals
            {unreadAchievements > 0 && <span className={styles.tabBadge}>{unreadAchievements}</span>}
          </button>

          {/* Employees don't see the cutoff tab */}
          {!isEmployee && (
            <button
              type="button"
              className={activeTab === "cutoff" ? styles.tabActive : styles.tabInactive}
              onClick={() => setActiveTab("cutoff")}
            >
              Objectives Cut-off
              {unreadCutoffs > 0 && <span className={styles.tabBadge}>{unreadCutoffs}</span>}
            </button>
          )}
        </div>

        {/* ── Achievement Approvals Tab ── */}
        {activeTab === "achievements" && (
          <div className={styles.notifList}>
            {achievementList.length === 0 ? (
              <div className={styles.emptyState}>No achievement approvals at the moment.</div>
            ) : (
              achievementList.map(n => (
                <div key={n.id} className={`${styles.notifCard} ${!n.isRead ? styles.unread : ""}`}>
                  <div className={styles.notifTop}>
                    <div className={styles.notifMeta}>
                      {!n.isRead && <span className={styles.unreadDot} />}
                      <div>
                        <p className={styles.notifTitle}>
                          {n.fromName.includes("Approved") || n.fromName.includes("Rejected")
                            ? n.fromName
                            : `Achievement submitted by ${n.fromName}`}
                        </p>
                        <p className={styles.notifRole}>{n.fromRole} · {n.submittedAt}</p>
                      </div>
                    </div>
                  </div>
                  <p className={styles.notifBody}>{n.achievement}</p>
                  <div className={styles.notifActions}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => { markAchievementRead(n.id); router.push(n.actionUrl); }}
                    >
                      Review Achievement →
                    </button>
                    {!n.isRead && (
                      <button type="button" className={styles.readBtn} onClick={() => markAchievementRead(n.id)}>
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Objectives Cut-off Tab ── */}
        {activeTab === "cutoff" && (
          <div className={styles.notifList}>
            {cutoffList.length === 0 ? (
              <div className={styles.emptyState}>No cut-off notifications at the moment.</div>
            ) : (
              cutoffList.map(n => {
                const s = STATUS_STYLES[n.status];
                return (
                  <div
                    key={n.id}
                    className={`${styles.notifCard} ${!n.isRead ? styles.unread : ""}`}
                    style={{ background: s.bg, borderColor: s.border }}
                  >
                    <div className={styles.notifTop}>
                      <div className={styles.notifMeta}>
                        {!n.isRead && <span className={styles.unreadDot} />}
                        <div>
                          <p className={styles.notifTitle}>{n.title}</p>
                          <p className={styles.notifRole}>Cut-off: {n.cutoffDate}</p>
                        </div>
                      </div>
                      <span style={{
                        padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700,
                        background: s.badge, color: s.badgeColor,
                      }}>
                        {s.badgeText}
                      </span>
                    </div>
                    <p className={styles.notifBody}>{n.message}</p>
                    <div className={styles.notifActions}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => { markCutoffRead(n.id); router.push(n.actionUrl); }}
                      >
                        Go to Template →
                      </button>
                      {!n.isRead && (
                        <button type="button" className={styles.readBtn} onClick={() => markCutoffRead(n.id)}>
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

      </main>
    </div>
  );
}