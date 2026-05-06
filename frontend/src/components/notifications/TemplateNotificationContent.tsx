// src/components/templateNotifications/TemplateNotificationContent.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Lock, Clock3, Calendar, CheckCircle2,
  AlertTriangle, Bell, Loader2,
} from "lucide-react";
import Sidebar from "@/components/sidebar/Sidebar";
import styles from "./TemplateNotificationContent.module.css";

const API_BASE      = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";
const NEXT_API_BASE = process.env.NEXT_PUBLIC_API_URL      ?? "http://127.0.0.1:5000";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  userId:   string;
  level:    number;
  basePath: string;
}

type NotifStatus = "info" | "warning" | "critical" | "frozen";

interface DBNotification {
  id:           string;
  receiver_id:  string;
  type:         string;
  title:        string;
  message:      string;
  is_read:      boolean;
  triggered_by: string | null;
  action_link:  string | null;
  created_at:   string;
  read_at:      string | null;
}

interface ActiveCycle {
  id:                    number | null;
  pms_year:              number;
  objective_setting_end: string;
  grace_period_end:      string;
  freeze_status:         "open" | "grace" | "frozen";
}

const ROLE_LABEL: Record<number, string> = {
  1: "HQ Admin",
  2: "Country Admin",
  3: "Branch Admin",
  4: "Dept Admin",
  5: "Sub Dept Admin",
};

const CUTOFF_TYPES = new Set([
  "window_open", "subdept_reminder", "dept_alert",
  "branch_escalation", "country_escalation",
  "hq_final_escalation", "window_closed", "grace_ended",
]);

// ── Status helpers ────────────────────────────────────────────────────────────

function resolveStatus(type: string, cycle: ActiveCycle | null): NotifStatus {
  const now       = new Date();
  const objEnd    = cycle ? new Date(cycle.objective_setting_end) : null;
  const graceEnd  = cycle ? new Date(cycle.grace_period_end)      : null;
  const daysToObj = objEnd
    ? Math.ceil((objEnd.getTime() - now.getTime()) / 86_400_000)
    : 99;

  switch (type) {
    case "window_open":         return "info";
    case "subdept_reminder":    return daysToObj <= 7 ? "critical" : "warning";
    case "dept_alert":          return daysToObj <= 7 ? "critical" : "warning";
    case "branch_escalation":   return daysToObj <= 7 ? "critical" : "warning";
    case "country_escalation":  return daysToObj <= 7 ? "critical" : "warning";
    case "hq_final_escalation": return "critical";
    case "window_closed":
      return graceEnd && now < graceEnd ? "warning" : "frozen";
    case "grace_ended":         return "frozen";
    default:                    return "info";
  }
}

type StatusConfig = {
  bg: string; border: string; iconColor: string;
  badge: string; badgeText: string;
  Icon: React.ElementType;
};

const STATUS_CONFIG: Record<NotifStatus, StatusConfig> = {
  info:     {
    bg: "#eff6ff", border: "#bfdbfe", iconColor: "#3b82f6",
    badge: "#dbeafe", badgeText: "Upcoming",  Icon: Calendar,
  },
  warning:  {
    bg: "#fffbeb", border: "#fde68a", iconColor: "#d97706",
    badge: "#fef3c7", badgeText: "Due Soon",  Icon: AlertTriangle,
  },
  critical: {
    bg: "#fef2f2", border: "#fecaca", iconColor: "#ef4444",
    badge: "#fee2e2", badgeText: "Urgent",    Icon: AlertTriangle,
  },
  frozen:   {
    bg: "#f8fafc", border: "#e2e8f0", iconColor: "#64748b",
    badge: "#f1f5f9", badgeText: "Frozen",    Icon: Lock,
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TemplateNotificationContent({ userId, level, basePath }: Props) {
  const router = useRouter();

  const [activeTab,     setActiveTab]     = useState<"achievements" | "cutoff">("achievements");
  const [notifications, setNotifications] = useState<DBNotification[]>([]);
  const [activeCycle,   setActiveCycle]   = useState<ActiveCycle | null>(null);
  const [isLoading,     setIsLoading]     = useState(true);

  const roleLabel   = ROLE_LABEL[level] ?? "Admin";
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── Freeze status display ───────────────────────────────────────────────────
  const freezeStatus = activeCycle?.freeze_status ?? "open";
  const objectiveEnd = activeCycle ? new Date(activeCycle.objective_setting_end) : null;
  const graceEnd     = activeCycle ? new Date(activeCycle.grace_period_end)      : null;

  function formatDate(d: Date | null): string {
    if (!d) return "—";
    return d.toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  }

  function daysUntil(d: Date | null): number {
    if (!d) return 0;
    return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  }

  // ── Fetch cutoff notifications + active cycle ───────────────────────────────
  useEffect(() => {
    if (!userId) return;
    setIsLoading(true);

    Promise.all([
      fetch(`${API_BASE}/api/notifications/${userId}`)
        .then((r) => r.ok ? r.json() : []),
      fetch(`${API_BASE}/pms-cycles/active`)
        .then((r) => r.ok ? r.json() : null),
    ])
      .then(([notifs, cycle]) => {
        const filtered = (notifs as DBNotification[]).filter(
          (n) => CUTOFF_TYPES.has(n.type),
        );
        setNotifications(filtered);
        setActiveCycle(cycle);
      })
      .catch(() => setNotifications([]))
      .finally(() => setIsLoading(false));
  }, [userId]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, is_read: true } : n),
    );
    try {
      await fetch(`${NEXT_API_BASE}/api/notifications/${id}/read`, {
        method: "PATCH",
      });
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await fetch(`${NEXT_API_BASE}/api/notifications/mark-all-read/${userId}`, {
        method: "PATCH",
      });
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={styles.shell}>

      <Sidebar />

      <main className={styles.main}>

        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <span
            className={styles.crumbLink}
            onClick={() => router.push(basePath)}
          >
            Home
          </span>
          <span className={styles.crumbSep}>›</span>
          <span className={styles.crumbCurrent}>Notifications</span>
        </div>

        {/* Header */}
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Notifications</h1>
            <p className={styles.subtitle}>
              Stay updated on approvals and upcoming deadlines ·{" "}
              <strong>{roleLabel}</strong>
            </p>
          </div>
          {activeTab === "cutoff" && unreadCount > 0 && (
            <button
              type="button"
              className={styles.markAllBtn}
              onClick={markAllRead}
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className={styles.tabRow}>

          {/* Achievement tab — placeholder, not your responsibility */}
          <button
            type="button"
            className={activeTab === "achievements" ? styles.tabActive : styles.tabInactive}
            onClick={() => setActiveTab("achievements")}
          >
            Achievement Approvals
          </button>

          {/* Cutoff tab — your implementation */}
{level !== 6 && (
  <button
    type="button"
    className={activeTab === "cutoff" ? styles.tabActive : styles.tabInactive}
    onClick={() => setActiveTab("cutoff")}
  >
    Objectives Cut-off
    {unreadCount > 0 && (
      <span className={styles.tabBadge}>{unreadCount}</span>
    )}
  </button>
)}

        </div>

        {/* ── Achievement Tab — placeholder ── */}
        {activeTab === "achievements" && (
          <div className={styles.notifList}>
            <div className={styles.emptyState}>
              No achievement approvals at the moment.
            </div>
          </div>
        )}

        {/* ── Cutoff Tab — your implementation ── */}
        {activeTab === "cutoff" && (
          <>
            {/* Live status bar */}
            <div className={styles.statusBar} data-status={freezeStatus}>
              {freezeStatus === "frozen" && <Lock         size={14} />}
              {freezeStatus === "grace"  && <Clock3       size={14} />}
              {freezeStatus === "open"   && <CheckCircle2 size={14} />}
              <span>
                {freezeStatus === "open"
                  ? `Objective-setting window open · closes ${formatDate(objectiveEnd)} (${daysUntil(objectiveEnd)} days remaining)`
                  : freezeStatus === "grace"
                  ? `Grace period active · hard freeze ${formatDate(graceEnd)} (${daysUntil(graceEnd)} days remaining)`
                  : `Templates fully frozen since ${formatDate(graceEnd)}`}
              </span>
            </div>

            {/* Notification cards */}
            {isLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
                <Loader2
                  size={28}
                  color="#3b82f6"
                  style={{ animation: "spin 1s linear infinite" }}
                />
              </div>
            ) : notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <Bell
                  size={32}
                  color="#cbd5e1"
                  style={{ margin: "0 auto 12px", display: "block" }}
                />
                No cut-off notifications at this time.
              </div>
            ) : (
              <div className={styles.notifList}>
                {notifications.map((n) => {
                  const status = resolveStatus(n.type, activeCycle);
                  const cfg    = STATUS_CONFIG[status];
                  const Icon   = cfg.Icon;

                  return (
                    <div
                      key={n.id}
                      className={`${styles.notifCard} ${!n.is_read ? styles.unread : ""}`}
                      style={{
                        background:  cfg.bg,
                        borderColor: n.is_read ? "#e5e7eb" : cfg.border,
                      }}
                    >
                      {/* Top row */}
                      <div className={styles.notifTop}>
                        <div className={styles.notifMeta}>
                          {!n.is_read && <span className={styles.unreadDot} />}
                          <Icon
                            size={18}
                            color={cfg.iconColor}
                            style={{ flexShrink: 0, marginTop: 2 }}
                          />
                          <div>
                            <p className={styles.notifTitle}>{n.title}</p>
                            <p className={styles.notifRole}>
                              {new Date(n.created_at).toLocaleDateString("en-GB", {
                                day: "numeric", month: "short", year: "numeric",
                              })}
                            </p>
                          </div>
                        </div>
                        <span
                          style={{
                            padding:      "3px 10px",
                            borderRadius: "999px",
                            fontSize:     "11px",
                            fontWeight:   700,
                            background:   cfg.badge,
                            color:        cfg.iconColor,
                            whiteSpace:   "nowrap",
                            flexShrink:   0,
                          }}
                        >
                          {cfg.badgeText}
                        </span>
                      </div>

                      {/* Message */}
                      <p className={styles.notifBody}>{n.message}</p>

                      {/* Actions */}
                      <div className={styles.notifActions}>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => {
                            markRead(n.id);
                            router.push(
                              n.action_link ?? `${basePath}/template-management`,
                            );
                          }}
                        >
                          Go to Templates →
                        </button>
                        {!n.is_read && (
                          <button
                            type="button"
                            className={styles.readBtn}
                            onClick={() => markRead(n.id)}
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </main>
    </div>
  );
}