"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import styles from "./notifications.module.css";
import Sidebar from "@/components/sidebar/Sidebar";

// ── Types ──────────────────────────────────────────────
export type Role =
  | "HQ Admin"
  | "Country Admin"
  | "Branch Admin"
  | "Dept Admin"
  | "Sub Dept Admin"
  | "Employee";

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

interface NotificationPageProps {
  role: Role;
  sidebarName: string;
  dashboardPath: string;
  achievementNotifications?: AchievementNotification[];
  cutoffNotifications?: CutoffNotification[];
}

// ── Role config ────────────────────────────────────────
const ROLE_CONFIG: Record<Role, { avatarLabel: string; roleLabel: string }> = {
  "HQ Admin":       { avatarLabel: "HQ", roleLabel: "hq admin" },
  "Country Admin":  { avatarLabel: "CA", roleLabel: "country admin" },
  "Branch Admin":   { avatarLabel: "BA", roleLabel: "branch admin" },
  "Dept Admin":     { avatarLabel: "DA", roleLabel: "dept admin" },
  "Sub Dept Admin": { avatarLabel: "SD", roleLabel: "sub dept admin" },
  "Employee":       { avatarLabel: "EM", roleLabel: "employee" },
};

// ── Cutoff status helpers ──────────────────────────────
function getCutoffStatus(cutoffDate: string): CutoffStatus {
  const today = new Date();
  const cutoff = new Date(cutoffDate);
  const graceEnd = new Date("2026-09-15");
  const diffDays = Math.ceil((cutoff.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (today > graceEnd) return "frozen";
  if (today > cutoff) return "critical";
  if (diffDays <= 7) return "urgent";
  return "normal";
}

const STATUS_STYLES: Record<CutoffStatus, { bg: string; border: string; badge: string; badgeColor: string; badgeText: string }> = {
  normal:   { bg: "#FFFFFF",  border: "#E5E7EB", badge: "#EFF6FF", badgeColor: "#1D4ED8", badgeText: "Upcoming"    },
  urgent:   { bg: "#FFFBEB",  border: "#FDE047", badge: "#FEF9C3", badgeColor: "#92400E", badgeText: "⚠ Due Soon"  },
  critical: { bg: "#FEF2F2",  border: "#FECACA", badge: "#FEE2E2", badgeColor: "#991B1B", badgeText: "🔴 Overdue"  },
  frozen:   { bg: "#F3F4F6",  border: "#D1D5DB", badge: "#E5E7EB", badgeColor: "#374151", badgeText: "🔒 Frozen"   },
};

// ── Component ──────────────────────────────────────────
export default function NotificationTemplate({
  role,
  sidebarName,
  dashboardPath,
  achievementNotifications = [],
  cutoffNotifications = [],
}: NotificationPageProps) {
  const router = useRouter();
  const config = ROLE_CONFIG[role];

  const [activeTab, setActiveTab] = useState<"achievements" | "cutoff">("achievements");
  const [achievementList, setAchievementList] = useState<AchievementNotification[]>(achievementNotifications);
  const [cutoffList, setCutoffList]           = useState<CutoffNotification[]>(cutoffNotifications);

  const unreadAchievements = achievementList.filter((n) => !n.isRead).length;
  const unreadCutoffs      = cutoffList.filter((n) => !n.isRead).length;
  const totalUnread        = unreadAchievements + unreadCutoffs;

  // ── Mark achievement as read ──
  const markAchievementRead = async (id: string) => {
    setAchievementList((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${id}/read`, {
        method: "PATCH",
      });
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  // ── Mark cutoff as read ──
  const markCutoffRead = async (id: string) => {
    setCutoffList((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${id}/read`, {
        method: "PATCH",
      });
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  // ── Mark all as read ──
  const markAllRead = async () => {
    if (activeTab === "achievements") {
      const unread = achievementList.filter((n) => !n.isRead);
      setAchievementList((prev) => prev.map((n) => ({ ...n, isRead: true })));
      for (const n of unread) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${n.id}/read`, {
            method: "PATCH",
          });
        } catch (err) {
          console.error("Failed to mark as read:", err);
        }
      }
    } else {
      const unread = cutoffList.filter((n) => !n.isRead);
      setCutoffList((prev) => prev.map((n) => ({ ...n, isRead: true })));
      for (const n of unread) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${n.id}/read`, {
            method: "PATCH",
          });
        } catch (err) {
          console.error("Failed to mark as read:", err);
        }
      }
    }
  };

  // ── Get user from localStorage ──
  const raw = typeof window !== "undefined" ? localStorage.getItem("pms_user") : null;
  const user = raw ? JSON.parse(raw) : null;

  return (
    <div className={styles.shell}>

      <Sidebar />

      {/* ══════════════ MAIN ══════════════ */}
      <main className={styles.main}>

        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <span className={styles.crumbLink} onClick={() => router.push(dashboardPath)}>Home</span>
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

        {/* ── Pill Tabs ── */}
        <div className={styles.tabRow}>
          <button
            type="button"
            className={activeTab === "achievements" ? styles.tabActive : styles.tabInactive}
            onClick={() => setActiveTab("achievements")}
          >
            Achievement Approvals
            {unreadAchievements > 0 && (
              <span className={styles.tabBadge}>{unreadAchievements}</span>
            )}
          </button>
          {role !== "Employee" && (
            <button
              type="button"
              className={activeTab === "cutoff" ? styles.tabActive : styles.tabInactive}
              onClick={() => setActiveTab("cutoff")}
            >
              Objectives Cut-off
              {unreadCutoffs > 0 && (
                <span className={styles.tabBadge}>{unreadCutoffs}</span>
              )}
            </button>
          )}
        </div>

        {/* ── Achievement Approvals Tab ── */}
        {activeTab === "achievements" && (
          <div className={styles.notifList}>
            {achievementList.length === 0 ? (
              <div className={styles.emptyState}>No achievement approvals at the moment.</div>
            ) : (
              achievementList.map((n) => (
                <div key={n.id} className={`${styles.notifCard} ${!n.isRead ? styles.unread : ""}`}>
                  <div className={styles.notifTop}>
                    <div className={styles.notifMeta}>
                      {!n.isRead && <span className={styles.unreadDot} />}
                      <div><p className={styles.notifTitle}>
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
              cutoffList.map((n) => {
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