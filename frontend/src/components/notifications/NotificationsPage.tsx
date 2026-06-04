"use client";

import React, { useEffect, useState, useCallback } from "react";
import Sidebar    from "@/components/sidebar/Sidebar";
import Breadcrumb from "@/components/breadcrumb/Breadcrumb";
import styles from "./notifications.module.css";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "approvals" | "cutoff";

interface DBNotification {
  id:           string;
  type:         string;
  title:        string;
  message:      string;
  action_link:  string | null;
  triggered_by: string | null;
  is_read:      boolean;
  read_at:      string | null;
  pms_cycle_id: number | null;
  trigger_key:  string | null;
  created_at:   string;
}

interface ScheduleEntry {
  trigger_date: string;
  role:         string;
  level:        number;
  title:        string;
  message:      string;
  action_link:  string;
  trigger_key:  string;
  is_triggered: boolean;
  days_until:   number;
}

interface CycleInfo {
  id:                    number;
  pms_year:              number;
  objective_setting_end: string;
  grace_period_end:      string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";
const API  = BASE + "/api";

const ROLE_PREFIXES: Record<number, string> = {
  1:  "/hq-admin",
  2:  "/country-admin",
  3:  "/branch-admin",
  4:  "/dept-admin",
  5:  "/sub-dept-admin",
};

const ROLE_BADGE_COLOR: Record<string, string> = {
  hq_admin:      "#7C3AED",
  country_admin: "#0369A1",
  branch_admin:  "#0F766E",
  dept_admin:    "#B45309",
  sub_dept_admin:"#BE185D",
  all:           "#374151",
};

const ROLE_DISPLAY: Record<string, string> = {
  hq_admin:      "HQ Admin",
  country_admin: "Country Admin",
  branch_admin:  "Branch Admin",
  dept_admin:    "Dept Admin",
  sub_dept_admin:"Sub Dept Admin",
  all:           "All Users",
};

const LEVEL_LABEL: Record<number, string> = {
  1:  "HQ Admin",
  2:  "Country Admin",
  3:  "Branch Admin",
  4:  "Dept Admin",
  5:  "Sub Dept Admin",
  99: "User",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a date-only ISO string (YYYY-MM-DD) as LOCAL midnight.
 * Never use new Date("YYYY-MM-DD") directly — it parses as UTC midnight
 * and shifts back 1 day in timezones behind UTC (e.g. Asia/Colombo).
 */
function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("T")[0].split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysRemaining(endDateStr: string): number {
  if (!endDateStr) return 0;
  const end = parseLocalDate(endDateStr);
  const now = new Date();
  end.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    // Use parseLocalDate for date-only strings to avoid UTC shift
    const d = iso.includes("T") ? new Date(iso) : parseLocalDate(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch {
    return "—";
  }
}

function roleFromTriggerKey(key: string | null): string {
  if (!key) return "all";
  return key.split(":")[1] ?? "all";
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface NotificationsPageProps {
  level?: number; // 1=HQ, 2=Country, 3=Branch, 4=Dept, 5=SubDept, 99=User
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NotificationsPage({ level = 1 }: NotificationsPageProps) {
  const [activeTab,        setActiveTab]        = useState<Tab>("cutoff");
  const [notifications,    setNotifications]    = useState<DBNotification[]>([]);
  const [upcoming,         setUpcoming]         = useState<ScheduleEntry[]>([]);
  const [cycle,            setCycle]            = useState<CycleInfo | null>(null);
  const [freezeStatus,     setFreezeStatus]     = useState<"open" | "grace" | "frozen">("open");
  const [loading,          setLoading]          = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const [achievementNotifs, setAchievementNotifs] = useState<any[]>([]);
  const currentUser = useCurrentUser();

  const levelLabel = LEVEL_LABEL[level] ?? "Admin";
  const headers    = { "X-User-Level": String(level) };
  const rolePrefix = ROLE_PREFIXES[level] ?? "/hq-admin";
  const templateManagementPath = `${rolePrefix}/template-management`;

  // ── Fetch triggered notifications (DB rows) ───────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API}/notifications/by-level`, { headers });
      if (res.ok) setNotifications(await res.json());
    } catch (e) { console.error("fetchNotifications:", e); }
  }, [level]);

  // ── Fetch schedule (triggered + upcoming split) ───────────────────────────
  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`${API}/notifications/cutoff-schedule`, { headers });
      if (res.ok) {
        const data = await res.json();
        setCycle(data.cycle ?? null);
        setUpcoming((data.schedule ?? []).filter((s: ScheduleEntry) => !s.is_triggered));
      }
    } catch (e) { console.error("fetchSchedule:", e); }
  }, [level]);

  // ── Fetch freeze status ───────────────────────────────────────────────────
  const fetchFreezeStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/pms-cycles/active`, { headers });
      if (res.ok) {
        const data = await res.json();
        setFreezeStatus(data.freeze_status ?? "open");
        setCycle((prev) => prev ?? {
          id:                    data.id,
          pms_year:              data.pms_year,
          objective_setting_end: data.objective_setting_end,
          grace_period_end:      data.grace_period_end,
        });
      }
    } catch (e) { console.error("fetchFreezeStatus:", e); }
  }, [level]);

  // ── Fetch achievement notifications ───────────────────────────────────────
  const fetchAchievements = useCallback(async () => {
    if (!currentUser?.employee_id) return;
    try {
      const res  = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${currentUser.employee_id}`
      );
      const data = await res.json();
      const mapped = (data.notifications || [])
        .filter((n: any) => n.type === "diary_approval")
        .map((n: any) => ({
          id:          n.id,
          fromName:    n.title,
          submittedAt: n.created_at?.split("T")[0],
          achievement: n.message,
          isRead:      n.is_read,
          actionUrl:   n.action_link,
        }));
      setAchievementNotifs(mapped);
    } catch (e) { console.error("fetchAchievements:", e); }
  }, [currentUser?.employee_id]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchNotifications(), fetchSchedule(), fetchFreezeStatus(), fetchAchievements()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchNotifications, fetchSchedule, fetchFreezeStatus, fetchAchievements]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Mark single read ──────────────────────────────────────────────────────
  const markRead = async (id: string) => {
    try {
      await fetch(`${API}/notifications/${id}/read`, { method: "PATCH", headers });
      setNotifications((prev) =>
        prev.map((n) => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch (e) { console.error("markRead:", e); }
  };

  // ── Mark all read ─────────────────────────────────────────────────────────
  const markAllRead = async () => {
    try {
      await fetch(`${API}/notifications/mark-all-read`, { method: "PATCH", headers });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (e) { console.error("markAllRead:", e); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── Banner ────────────────────────────────────────────────────────────────
  const renderBanner = () => {
    if (!cycle) return null;
    const objEnd   = cycle.objective_setting_end;
    const graceEnd = cycle.grace_period_end;

    if (freezeStatus === "frozen") return (
      <div className={`${styles.banner} ${styles.bannerFrozen}`}>
        <span className={styles.bannerIcon}>🔒</span>
        <span>
          PMS templates are fully frozen · Grace period ended{" "}
          <strong>{formatDate(graceEnd)}</strong>
        </span>
      </div>
    );
    if (freezeStatus === "grace") return (
      <div className={`${styles.banner} ${styles.bannerGrace}`}>
        <span className={styles.bannerIcon}>⚠️</span>
        <span>
          Grace period active · ends <strong>{formatDate(graceEnd)}</strong>{" "}
          ({daysRemaining(graceEnd)} days remaining)
        </span>
      </div>
    );
    return (
      <div className={`${styles.banner} ${styles.bannerOpen}`}>
        <span className={styles.bannerIcon}>🕐</span>
        <span>
          Objective-setting window open · closes{" "}
          <strong>{formatDate(objEnd)}</strong>{" "}
          ({daysRemaining(objEnd)} days remaining)
        </span>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.dashShell}>
      <Sidebar />
      <main className={styles.mainContent}>
        <Breadcrumb />
        <div className={styles.page}>

          {/* Header */}
          <div className={styles.headerRow}>
            <div>
              <h1 className={styles.title}>Notifications</h1>
              <p className={styles.subtitle}>
                Stay updated on approvals and upcoming deadlines ·{" "}
                <strong>{levelLabel}</strong>
              </p>
            </div>
            <div className={styles.headerActions}>
              {unreadCount > 0 && activeTab === "cutoff" && (
                <button className={styles.markAllBtn} onClick={markAllRead}>
                  Mark all as read
                </button>
              )}
              <button
                className={styles.refreshBtn}
                onClick={refresh}
                disabled={refreshing}
              >
                <RefreshIcon spinning={refreshing} />
                Refresh
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className={styles.tabRow}>
            <button
              className={activeTab === "approvals" ? styles.tabActive : styles.tabInactive}
              onClick={() => setActiveTab("approvals")}
            >
              Achievement Approvals
            </button>
            <button
              className={activeTab === "cutoff" ? styles.tabActive : styles.tabInactive}
              onClick={() => setActiveTab("cutoff")}
            >
              Objectives Cut-off
              {unreadCount > 0 && (
                <span className={styles.tabBadge}>{unreadCount}</span>
              )}
            </button>
          </div>

          {/* Achievement Approvals */}
          {activeTab === "approvals" && (
            <div className={styles.notifList}>
              {achievementNotifs.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}><BellIcon /></div>
                  <p className={styles.emptyTitle}>No approval notifications yet.</p>
                  <p className={styles.emptyBody}>
                    Approval requests will appear here when team members submit
                    their achievements.
                  </p>
                </div>
              ) : (
                achievementNotifs.map((n) => (
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
                          <span className={styles.notifDate}>{n.submittedAt}</span>
                        </div>
                      </div>
                      {!n.isRead && (
                        <button className={styles.readBtn} onClick={() => markRead(n.id)}>
                          Mark as read
                        </button>
                      )}
                    </div>
                    <p className={styles.notifBody}>{n.achievement}</p>
                    <div className={styles.notifActions}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => {
                          markRead(n.id);
                          window.location.href = n.actionUrl;
                        }}
                      >
                        Review Achievement →
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Objectives Cut-off tab */}
          {activeTab === "cutoff" && (
            <>
              {renderBanner()}

              {loading ? (
                <div className={styles.loadingWrap}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className={styles.skeletonCard} />
                  ))}
                </div>
              ) : (
                <>
                  {/* Triggered notifications from DB */}
                  {notifications.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}><BellIcon /></div>
                      <p className={styles.emptyTitle}>
                        No cut-off notifications yet.
                      </p>
                      <p className={styles.emptyBody}>
                        Notifications are sent automatically on schedule and
                        will appear here when triggered.
                      </p>
                    </div>
                  ) : (
                    <div className={styles.notifList}>
                      {notifications.map((n) => (
                        <NotifCard
                          key={n.id}
                          notif={n}
                          role={roleFromTriggerKey(n.trigger_key)}
                          templateManagementPath={templateManagementPath}
                          onMarkRead={() => markRead(n.id)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Upcoming schedule timeline */}
                  {upcoming.length > 0 && (
                    <div className={styles.upcomingSection}>
                      <h2 className={styles.upcomingTitle}>
                        Upcoming Notifications
                      </h2>
                      <div className={styles.timelineList}>
                        {upcoming.map((s) => (
                          <div
                            key={s.trigger_key}
                            className={styles.timelineItem}
                          >
                            <div className={styles.timelineDot} />
                            <div className={styles.timelineContent}>
                              <div className={styles.timelineHeader}>
                                <span
                                  className={styles.roleBadge}
                                  style={{
                                    background:
                                      (ROLE_BADGE_COLOR[s.role] ?? "#374151") +
                                      "18",
                                    color:
                                      ROLE_BADGE_COLOR[s.role] ?? "#374151",
                                  }}
                                >
                                  {ROLE_DISPLAY[s.role] ?? s.role}
                                </span>
                                <span className={styles.timelineDate}>
                                  {formatDate(s.trigger_date)}
                                  {s.days_until > 0 && (
                                    <span className={styles.daysLeft}>
                                      {" "}· {s.days_until}d away
                                    </span>
                                  )}
                                </span>
                              </div>
                              <p className={styles.timelineMsg}>{s.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── NotifCard ────────────────────────────────────────────────────────────────

function NotifCard({
  notif,
  role,
  templateManagementPath,
  onMarkRead,
}: {
  notif: DBNotification;
  role: string;
  templateManagementPath: string;
  onMarkRead: () => void;
}) {
  const isUnread  = !notif.is_read;
  const roleColor = ROLE_BADGE_COLOR[role] ?? "#374151";

  const isTemplateAction = notif.action_link === "/template-management";
  const viewHref = isTemplateAction ? templateManagementPath : null;

  return (
    <div className={`${styles.notifCard} ${isUnread ? styles.unread : ""}`}>
      <div className={styles.notifTop}>
        <div className={styles.notifMeta}>
          {isUnread && <span className={styles.unreadDot} />}
          <div>
            <p className={styles.notifTitle}>{notif.title}</p>
            <div className={styles.notifRoleRow}>
              <span
                className={styles.roleBadge}
                style={{
                  background: roleColor + "18",
                  color: roleColor,
                }}
              >
                {ROLE_DISPLAY[role] ?? role}
              </span>
              <span className={styles.notifDate}>
                {formatDate(notif.created_at)}
              </span>
            </div>
          </div>
        </div>
        {isUnread && (
          <button className={styles.readBtn} onClick={onMarkRead}>
            Mark as read
          </button>
        )}
      </div>
      <p className={styles.notifBody}>{notif.message}</p>
      {viewHref && (
        <div className={styles.notifActions}>
          <a href={viewHref} className={styles.actionBtn}>
            Go to Templates →
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={spinning ? { animation: "spin 0.8s linear infinite" } : {}}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}



