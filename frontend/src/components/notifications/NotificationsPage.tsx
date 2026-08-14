"use client";

import React, { useEffect, useState, useCallback } from "react";
import Sidebar    from "@/components/sidebar/Sidebar";
import Breadcrumb from "@/components/breadcrumb/Breadcrumb";
import styles from "./notifications.module.css";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuth } from "@/lib/auth-context";
import { logger } from "@/utils/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "approvals" | "cutoff" | "pa" | "manual" | "evaluation";

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

// ── Wathsala's types ──────────────────────────────────────────────────────────
type ReminderType = "period_opened" | "deadline_warning" | "supervisor_alert" | "manual_reminder";

type ManualRatingNotification = {
  id: string;
  type: ReminderType;
  title: string;
  message: string;
  period: string;
  pmsYear: number;
  isRead: boolean;
  createdAt: string;
};

type PaNotificationType =
  | "self_submitted" | "supervisor_completed" | "reconsideration_request"
  | "reconsideration_fyi" | "reconsideration_approved" | "reconsideration_rejected"
  | "reconsideration_approved_supervisor" | "reconsideration_rejected_supervisor";

type PaNotification = {
  id: string;
  type: PaNotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actionUrl: string;
  assessmentId?: string;
  reconsiderationAction?: string | null;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";
const API  = BASE + "/api";

const _rawApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:5000";
const WAPI = _rawApiUrl.endsWith("/api") ? _rawApiUrl.slice(0, -4) : _rawApiUrl;

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

// ── Denusha's evaluation badge configs ───────────────────────────────────────
const EVAL_STYLES: Record<string, { badge: string; badgeColor: string; badgeText: string; borderColor: string; bg: string; message: string }> = {
  approval_pending:  { badge: "#FEF9C3", badgeColor: "#92400E", badgeText: "⏳ Pending Approval", borderColor: "#FDE047", bg: "#FFFBEB", message: "Evaluation submitted and awaiting approval."               },
  approval_done:     { badge: "#DCFCE7", badgeColor: "#166534", badgeText: "✓ Approved",          borderColor: "#86EFAC", bg: "#F0FDF4", message: "Evaluation has been approved."                           },
  approval_rejected: { badge: "#FEE2E2", badgeColor: "#991B1B", badgeText: "✗ Rejected",          borderColor: "#FCA5A5", bg: "#FFF5F5", message: "Evaluation was rejected and returned for resubmission." },
  enquiry:           { badge: "#EDE9FE", badgeColor: "#6D28D9", badgeText: "🔄 Enquiry",          borderColor: "#C4B5FD", bg: "#F5F3FF", message: "A re-evaluation enquiry has been submitted."             },
};


const REMINDER_STYLES: Record<ReminderType, { badge: string; badgeColor: string; badgeText: string; borderColor: string; bg: string }> = {
  period_opened:    { badge: "#EFF6FF", badgeColor: "#1D4ED8", badgeText: " Window Open",     borderColor: "#BFDBFE", bg: "#F0F7FF" },
  deadline_warning: { badge: "#FEF9C3", badgeColor: "#92400E", badgeText: "Due Soon",         borderColor: "#FDE047", bg: "#FFFBEB" },
  supervisor_alert: { badge: "#FEE2E2", badgeColor: "#991B1B", badgeText: " Action Required", borderColor: "#FECACA", bg: "#FEF2F2" },
  manual_reminder:  { badge: "#F3E8FF", badgeColor: "#6B21A8", badgeText: "Reminder",        borderColor: "#D8B4FE", bg: "#FAF5FF" },
};

const PA_STYLES: Record<PaNotificationType, { badge: string; badgeColor: string; badgeText: string; borderColor: string; bg: string }> = {
  self_submitted:                      { badge: "#EFF6FF", badgeColor: "#1D4ED8", badgeText: "Self Submitted",                  borderColor: "#BFDBFE", bg: "#F0F7FF" },
  supervisor_completed:                { badge: "#DCFCE7", badgeColor: "#166534", badgeText: "Review Completed",                 borderColor: "#BFDBFE", bg: "#F0F7FF" },
  reconsideration_request:             { badge: "#FEF9C3", badgeColor: "#92400E", badgeText: "Requires Your Review",             borderColor: "#FDE047", bg: "#FFFBEB" },
  reconsideration_fyi:                 { badge: "#EFF6FF", badgeColor: "#1D4ED8", badgeText: "Reconsideration Requested (FYI)", borderColor: "#BFDBFE", bg: "#F0F7FF" },
  reconsideration_approved:            { badge: "#DCFCE7", badgeColor: "#166534", badgeText: "Reconsideration Approved",         borderColor: "#86EFAC", bg: "#F0FDF4" },
  reconsideration_rejected:            { badge: "#FEE2E2", badgeColor: "#991B1B", badgeText: "Reconsideration Rejected",         borderColor: "#FECACA", bg: "#FEF2F2" },
  reconsideration_approved_supervisor: { badge: "#DCFCE7", badgeColor: "#166534", badgeText: "Reconsideration Approved",         borderColor: "#86EFAC", bg: "#F0FDF4" },
  reconsideration_rejected_supervisor: { badge: "#FEE2E2", badgeColor: "#991B1B", badgeText: "Reconsideration Rejected",         borderColor: "#FECACA", bg: "#FEF2F2" },
};

const PA_APPRAISEE_FACING: PaNotificationType[] = ["supervisor_completed", "reconsideration_approved", "reconsideration_rejected"];
const PA_SUPERVISOR_OUTCOME_FACING: PaNotificationType[] = ["reconsideration_approved_supervisor", "reconsideration_rejected_supervisor"];

function resolvePaActionUrl(type: PaNotificationType, roleSlug: string, assessmentId?: string): string {
  if (PA_APPRAISEE_FACING.includes(type)) return roleSlug === "employee" ? "/employee/potential-assessment" : `/${roleSlug}/potential-assessment/self-assessment`;
  if (PA_SUPERVISOR_OUTCOME_FACING.includes(type)) return roleSlug === "hq-admin" ? "/hq-admin/potential-assessment" : `/${roleSlug}/potential-assessment/supervisor-review`;
  if (type === "reconsideration_fyi") return roleSlug === "hq-admin" ? "/hq-admin/potential-assessment" : `/${roleSlug}/potential-assessment/supervisor-review`;
  if (type === "reconsideration_request") return assessmentId ? `/${roleSlug}/potential-assessment/reconsideration/${assessmentId}` : (roleSlug === "hq-admin" ? "/hq-admin/potential-assessment" : `/${roleSlug}/potential-assessment/supervisor-review`);
  return roleSlug === "hq-admin" ? "/hq-admin/potential-assessment" : `/${roleSlug}/potential-assessment/supervisor-review`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    const d = iso.includes("T") ? new Date(iso) : parseLocalDate(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return "—"; }
}

function roleFromTriggerKey(key: string | null): string {
  if (!key) return "all";
  return key.split(":")[1] ?? "all";
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface NotificationsPageProps {
  level?: number;
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

  // ── Wathsala's state ──────────────────────────────────────────────────────
  const [manualReminderList, setManualReminderList] = useState<ManualRatingNotification[]>([]);
  const [paList,             setPaList]             = useState<PaNotification[]>([]);
  const [wLoading,           setWLoading]           = useState(true);

  // ── Evaluation Approvals state ────────────────────────────────────────────
  const [evalApprovals,  setEvalApprovals]  = useState<any[]>([]);
  const [evalLoading,    setEvalLoading]    = useState(true);
  const [readEvalIds,    setReadEvalIds]    = useState<Set<string>>(new Set());
  const [evalNotifs,     setEvalNotifs]     = useState<any[]>([]);

  // Load previously-read notification IDs from localStorage on mount.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("pms_eval_read") || "[]");
      setReadEvalIds(new Set(stored as string[]));
    } catch { /* ignore parse errors */ }
  }, []);

  const markEvalAllRead = useCallback(() => {
    const ids = evalApprovals.map(a => a.id as string);
    setReadEvalIds(prev => {
      const next = new Set([...prev, ...ids]);
      try { localStorage.setItem("pms_eval_read", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, [evalApprovals]);

  const markEvalRead = useCallback((id: string) => {
    setReadEvalIds(prev => {
      const next = new Set([...prev, id]);
      try { localStorage.setItem("pms_eval_read", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const currentUser = useCurrentUser();
  const { user: authUser } = useAuth() as any;

  const userId   = authUser?.id ?? "";
  const roleSlug = authUser?.role?.replace(/_/g, "-") ?? "hq-admin";

  const levelLabel = LEVEL_LABEL[level] ?? "Admin";
  const headers    = { "X-User-Level": String(level) };
  const rolePrefix = ROLE_PREFIXES[level] ?? "/hq-admin";
  const templateManagementPath = `${rolePrefix}/template-management`;

  // ── Their fetch functions (unchanged) ─────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API}/notifications/by-level`, { headers });
      if (res.ok) setNotifications(await res.json());
    } catch (e) { console.error("fetchNotifications:", e); }
  }, [level]);

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

  const fetchFreezeStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/pms-cycles/active`, { headers });
      if (res.ok) {
        const data = await res.json();
        setFreezeStatus(data.freeze_status ?? "open");
        setCycle((prev) => prev ?? { id: data.id, pms_year: data.pms_year, objective_setting_end: data.objective_setting_end, grace_period_end: data.grace_period_end });
      }
    } catch (e) { console.error("fetchFreezeStatus:", e); }
  }, [level]);

  const fetchAchievements = useCallback(async () => {
    if (!currentUser?.employee_id) return;
    try {
      const res  = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${currentUser.employee_id}`);
      const data = await res.json();
      const mapped = (data.notifications || [])
        .filter((n: any) => n.type === "diary_approval")
        .map((n: any) => ({ id: n.id, fromName: n.title, submittedAt: n.created_at?.split("T")[0], achievement: n.message, isRead: n.is_read, actionUrl: n.action_link }));
      setAchievementNotifs(mapped);
    } catch (e) { console.error("fetchAchievements:", e); }
  }, [currentUser?.employee_id]);

  const fetchEvalApprovals = useCallback(async () => {
    setEvalLoading(true);
    try {
      const withTimeout = (url: string, ms = 3000) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ms);
        return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
      };

      const toList = async (p: Promise<Response>, type: string) => {
        try {
          const res = await p;
          if (!res.ok) return [];
          const data = await res.json();
          return (Array.isArray(data) ? data : []).map((item: any) => {
            const status = (item.status ?? "pending").toLowerCase();
            const label = type === "enquiry"
              ? "Re-evaluation Enquiry"
              : status === "approved" ? "Evaluation Approved"
              : status === "rejected" ? "Evaluation Rejected"
              : "Evaluation Submitted";
            return {
              _type:  type,
              _label: label,
              id:     `${type}-${item.id}`,
              name:   item.employee || item.employee_name || item.member_name || item.name || "Team Member",
              status,
              date:   item.dueDate || item.created_at || item.date || "",
            };
          });
        } catch { return []; }
      };

      const [approvals, enquiries] = await Promise.all([
        toList(withTimeout(`${WAPI}/api/approvals`),  "approval"),
        toList(withTimeout(`${WAPI}/api/enquiries`),  "enquiry"),
      ]);

      setEvalApprovals([...approvals, ...enquiries]);
    } catch { /* silently ignore — backend may not be running */ }
    finally { setEvalLoading(false); }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchNotifications(), fetchSchedule(), fetchFreezeStatus(), fetchAchievements(), fetchEvalApprovals()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchNotifications, fetchSchedule, fetchFreezeStatus, fetchAchievements, fetchEvalApprovals]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Wathsala's fetch (PA + Manual Rating) ────────────────────────────────
  useEffect(() => {
    if (!userId) { setWLoading(false); return; }

    async function loadWathsala() {
      setWLoading(true);
      try {
        const reminderTypes: ReminderType[] = ["period_opened", "deadline_warning", "supervisor_alert", "manual_reminder"];

        const notifRes  = await fetch(`${WAPI}/api/manual-rating-notifications/${userId}`);
        const notifData = await notifRes.json();
        const allNotifs = Array.isArray(notifData) ? notifData : [];

        const reminders: ManualRatingNotification[] = allNotifs
          .filter((n: any) => reminderTypes.includes(n.type as ReminderType))
          .map((n: any) => ({
            id: n.id, type: n.type, title: n.title, message: n.message,
            period: n.period, pmsYear: n.pms_year, isRead: n.is_read,
            createdAt: n.created_at ? new Date(n.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "",
          }));
        setManualReminderList(reminders);

        const paRes  = await fetch(`${WAPI}/api/potential-assessment-notifications/${userId}`);
        const paData = await paRes.json();
        const paNotifs: PaNotification[] = (paData.data ?? []).map((n: any) => ({
          id: n.id, type: n.type, title: n.title, message: n.message,
          isRead: n.is_read,
          createdAt: n.created_at ? new Date(n.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "",
          assessmentId: n.assessment_id,
          actionUrl: resolvePaActionUrl(n.type, roleSlug, n.assessment_id),
          reconsiderationAction: n.reconsideration_action ?? null,
        }));
        setPaList(paNotifs);

      } catch (err) {
        logger.error('Failed to load PA/manual notifications', err);
      }
      setWLoading(false);
    }

    loadWathsala();
  }, [userId, roleSlug]);

  // ── Evaluation notifications (approval/rejection events from notifications table) ──
  useEffect(() => {
    async function loadEvalNotifs() {
      try {
        const res = await fetch(`${API}/evaluation-notifications`);
        if (res.ok) {
          const data = await res.json();
          setEvalNotifs(Array.isArray(data) ? data : []);
        }
      } catch (e) { console.error("loadEvalNotifs:", e); }
    }
    loadEvalNotifs();
  }, []);

  // ── Mark read helpers ─────────────────────────────────────────────────────
  const markRead = async (id: string) => {
    try {
      await fetch(`${API}/notifications/${id}/read`, { method: "PATCH", headers });
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) { console.error("markRead:", e); }
  };

  const markAllRead = async () => {
    try {
      await fetch(`${API}/notifications/mark-all-read`, { method: "PATCH", headers });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (e) { console.error("markAllRead:", e); }
  };

  const markPaRead = async (id: string) => {
    setPaList(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    try { await fetch(`${WAPI}/api/potential-assessment-notifications/${id}/read`, { method: "PATCH" }); }
    catch (err) { logger.error('Failed to mark PA notification as read', err); }
  };

  const markManualRead = async (id: string) => {
    setManualReminderList(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    try { await fetch(`${WAPI}/api/manual-rating-notifications/${id}/read`, { method: "PATCH" }); }
    catch (err) { logger.error('Failed to mark manual notification as read', err); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const unreadCount    = notifications.filter((n) => !n.is_read).length;
  const unreadPa       = paList.filter(n => !n.isRead).length;
  const unreadManual   = manualReminderList.filter(n => !n.isRead).length;
  const unreadEval     = evalApprovals.filter(a => !readEvalIds.has(a.id as string)).length;

  const renderBanner = () => null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.dashShell}>
      <main className={styles.mainContent}>
        <div className={styles.page}>
          <Breadcrumb />

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
              <button className={styles.refreshBtn} onClick={refresh} disabled={refreshing}>
                <RefreshIcon spinning={refreshing} />
                Refresh
              </button>
            </div>
          </div>

          {/* Tabs — their 2 + Wathsala's 2 */}
          <div className={styles.tabRow}>
            <button className={activeTab === "approvals" ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab("approvals")}>
              Achievement Approvals
            </button>
            <button className={activeTab === "cutoff" ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab("cutoff")}>
              Objectives Cut-off
              {unreadCount > 0 && <span className={styles.tabBadge}>{unreadCount}</span>}
            </button>
            <button className={activeTab === "pa" ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab("pa")}>
              Potential Assessment
              {unreadPa > 0 && <span className={styles.tabBadge}>{unreadPa}</span>}
            </button>
            <button className={activeTab === "manual" ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab("manual")}>
              Manual Rating Reminders
              {unreadManual > 0 && <span className={styles.tabBadge}>{unreadManual}</span>}
            </button>
            <button className={activeTab === "evaluation" ? styles.tabActive : styles.tabInactive} onClick={() => { setActiveTab("evaluation"); markEvalAllRead(); }}>
              Evaluation Approvals
              {unreadEval > 0 && <span className={styles.tabBadge}>{unreadEval}</span>}
            </button>
          </div>

          {/* Achievement Approvals — their tab, unchanged */}
          {activeTab === "approvals" && (
            <div className={styles.notifList}>
              {achievementNotifs.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}><BellIcon /></div>
                  <p className={styles.emptyTitle}>No approval notifications yet.</p>
                  <p className={styles.emptyBody}>Approval requests will appear here when team members submit their achievements.</p>
                </div>
              ) : (
                achievementNotifs.map((n) => (
                  <div key={n.id} className={`${styles.notifCard} ${!n.isRead ? styles.unread : ""}`}>
                    <div className={styles.notifTop}>
                      <div className={styles.notifMeta}>
                        {!n.isRead && <span className={styles.unreadDot} />}
                        <div>
                          <p className={styles.notifTitle}>{n.fromName.includes("Approved") || n.fromName.includes("Rejected") ? n.fromName : `Achievement submitted by ${n.fromName}`}</p>
                          <span className={styles.notifDate}>{n.submittedAt}</span>
                        </div>
                      </div>
                      {!n.isRead && <button className={styles.readBtn} onClick={() => markRead(n.id)}>Mark as read</button>}
                    </div>
                    <p className={styles.notifBody}>{n.achievement}</p>
                    <div className={styles.notifActions}>
                      <button type="button" className={styles.actionBtn} onClick={() => { markRead(n.id); window.location.href = n.actionUrl; }}>Review Achievement →</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Objectives Cut-off — their tab, unchanged */}
          {activeTab === "cutoff" && (
            <>
              {renderBanner()}
              {loading ? (
                <div className={styles.loadingWrap}>
                  {[1, 2, 3].map((i) => <div key={i} className={styles.skeletonCard} />)}
                </div>
              ) : (
                <>
                  {notifications.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}><BellIcon /></div>
                      <p className={styles.emptyTitle}>No cut-off notifications yet.</p>
                      <p className={styles.emptyBody}>Notifications are sent automatically on schedule and will appear here when triggered.</p>
                    </div>
                  ) : (
                    <div className={styles.notifList}>
                      {notifications.map((n) => (
                        <NotifCard key={n.id} notif={n} role={roleFromTriggerKey(n.trigger_key)} templateManagementPath={templateManagementPath} onMarkRead={() => markRead(n.id)} />
                      ))}
                    </div>
                  )}
                  {upcoming.length > 0 && (
                    <div className={styles.upcomingSection}>
                      <h2 className={styles.upcomingTitle}>Upcoming Notifications</h2>
                      <div className={styles.timelineList}>
                        {upcoming.map((s) => (
                          <div key={s.trigger_key} className={styles.timelineItem}>
                            <div className={styles.timelineDot} />
                            <div className={styles.timelineContent}>
                              <div className={styles.timelineHeader}>
                                <span className={styles.roleBadge} style={{ background: (ROLE_BADGE_COLOR[s.role] ?? "#374151") + "18", color: ROLE_BADGE_COLOR[s.role] ?? "#374151" }}>
                                  {ROLE_DISPLAY[s.role] ?? s.role}
                                </span>
                                <span className={styles.timelineDate}>
                                  {formatDate(s.trigger_date)}
                                  {s.days_until > 0 && <span className={styles.daysLeft}> · {s.days_until}d away</span>}
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

          {/* Potential Assessment */}
          {activeTab === "pa" && (
            <div className={styles.notifList}>
              {wLoading ? (
                <div className={styles.loadingWrap}>{[1,2,3].map(i => <div key={i} className={styles.skeletonCard} />)}</div>
              ) : paList.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}><BellIcon /></div>
                  <p className={styles.emptyTitle}>No potential assessment notifications yet.</p>
                </div>
              ) : (
                paList.map(n => {
                  const alreadyReviewed = n.type === 'reconsideration_request' && !!n.reconsiderationAction;
                  const reviewedStyle = { badge: "#DCFCE7", badgeColor: "#166534", badgeText: "Already Reviewed", borderColor: "#86EFAC", bg: "#F0FDF4" };
                  const s = alreadyReviewed ? reviewedStyle : (PA_STYLES[n.type] ?? PA_STYLES.self_submitted);
                  return (
                    <div key={n.id} className={`${styles.notifCard} ${!n.isRead ? styles.unread : ""}`} style={{ background: s.bg, borderColor: s.borderColor }}>
                      <div className={styles.notifTop}>
                        <div className={styles.notifMeta}>
                          {!n.isRead && <span className={styles.unreadDot} />}
                          <div>
                            <p className={styles.notifTitle}>{n.title}</p>
                            <p className={styles.notifRole}>{n.createdAt}</p>
                          </div>
                        </div>
                        <span style={{ padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: s.badge, color: s.badgeColor, whiteSpace: "nowrap" }}>{s.badgeText}</span>
                      </div>
                      <p className={styles.notifBody}>{n.message}</p>
                      <div className={styles.notifActions}>
                        {n.type === 'reconsideration_fyi' ? (
                          <span style={{ fontSize: '13px', color: '#64748B' }}>Informational only - awaiting senior supervisor review</span>
                        ) : alreadyReviewed ? (
                          <button type="button" className={styles.actionBtn} onClick={() => { markPaRead(n.id); window.location.href = n.actionUrl; }}>
                            View Review →
                          </button>
                        ) : (
                          <button type="button" className={styles.actionBtn} onClick={() => { markPaRead(n.id); window.location.href = n.actionUrl; }}>
                            {n.type === 'reconsideration_request' && "Review Reconsideration →"}
                            {PA_APPRAISEE_FACING.includes(n.type) && "View My Assessment →"}
                            {PA_SUPERVISOR_OUTCOME_FACING.includes(n.type) && "View Assessment →"}
                            {!n.type.includes('reconsideration') && !PA_APPRAISEE_FACING.includes(n.type) && "Review Assessment →"}
                          </button>
                        )}
                        {!n.isRead && <button type="button" className={styles.readBtn} onClick={() => markPaRead(n.id)}>Mark as read</button>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Manual Rating Reminders —  tab */}
          {activeTab === "manual" && (
            <div className={styles.notifList}>
              {wLoading ? (
                <div className={styles.loadingWrap}>{[1,2,3].map(i => <div key={i} className={styles.skeletonCard} />)}</div>
              ) : manualReminderList.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}><BellIcon /></div>
                  <p className={styles.emptyTitle}>No manual rating reminders yet.</p>
                </div>
              ) : (
                manualReminderList.map(n => {
                  const s = REMINDER_STYLES[n.type] ?? REMINDER_STYLES.manual_reminder;
                  return (
                    <div key={n.id} className={`${styles.notifCard} ${!n.isRead ? styles.unread : ""}`} style={{ background: s.bg, borderColor: s.borderColor }}>
                      <div className={styles.notifTop}>
                        <div className={styles.notifMeta}>
                          {!n.isRead && <span className={styles.unreadDot} />}
                          <div>
                            <p className={styles.notifTitle}>{n.title}</p>
                            <p className={styles.notifRole}>{n.period} {n.pmsYear} · {n.createdAt}</p>
                          </div>
                        </div>
                        <span style={{ padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: s.badge, color: s.badgeColor, whiteSpace: "nowrap" }}>{s.badgeText}</span>
                      </div>
                      <p className={styles.notifBody}>{n.message}</p>
                      <div className={styles.notifActions}>
                        <button type="button" className={styles.actionBtn} onClick={() => { markManualRead(n.id); window.location.href = `/${roleSlug}/manual-rating`; }}>Go to Manual Ratings →</button>
                        {!n.isRead && <button type="button" className={styles.readBtn} onClick={() => markManualRead(n.id)}>Mark as read</button>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Evaluation Approvals — Denusha's tab */}
          {activeTab === "evaluation" && (
            <div className={styles.notifList}>
              {evalLoading ? (
                <div className={styles.loadingWrap}>{[1,2,3].map(i => <div key={i} className={styles.skeletonCard} />)}</div>
              ) : evalApprovals.length === 0 && evalNotifs.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}><BellIcon /></div>
                  <p className={styles.emptyTitle}>No evaluation notifications yet.</p>
                  <p className={styles.emptyBody}>Evaluation submissions, approvals, and enquiries from your team will appear here.</p>
                </div>
              ) : (
                <>
                  {evalApprovals.map((a) => {
                    const isRead   = readEvalIds.has(a.id as string);
                    const status   = (a.status ?? "").toLowerCase();
                    const styleKey = a._type === "enquiry" ? "enquiry"
                                   : status === "approved"  ? "approval_done"
                                   : status === "rejected"  ? "approval_rejected"
                                   : "approval_pending";
                    const s        = EVAL_STYLES[styleKey];
                    return (
                      <div key={a.id} className={`${styles.notifCard} ${!isRead ? styles.unread : ""}`} style={{ background: s.bg, borderColor: s.borderColor }}>
                        <div className={styles.notifTop}>
                          <div className={styles.notifMeta}>
                            {!isRead && <span className={styles.unreadDot} />}
                            <div>
                              <p className={styles.notifTitle}>{a.name} — {a._label}</p>
                              <p className={styles.notifRole}>{a.date ? formatDate(a.date) : ""}</p>
                            </div>
                          </div>
                          <span style={{ padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: s.badge, color: s.badgeColor, whiteSpace: "nowrap" }}>{s.badgeText}</span>
                        </div>
                        <p className={styles.notifBody}>{s.message}</p>
                        <div className={styles.notifActions}>
                          {!isRead && <button type="button" className={styles.readBtn} onClick={() => markEvalRead(a.id as string)}>Mark as read</button>}
                        </div>
                      </div>
                    );
                  })}
                  {evalNotifs.map((n) => {
                    const ntype    = (n.notification_type ?? "").toLowerCase();
                    const styleKey = ntype === "rejection" ? "approval_rejected"
                                   : ntype === "approval_approved" ? "approval_done"
                                   : "approval_pending";
                    const s        = EVAL_STYLES[styleKey];
                    const notifId     = `evalnotif-${n.notification_id ?? n.id}`;
                    const isRead      = readEvalIds.has(notifId);
                    return (
                      <div key={notifId} className={`${styles.notifCard} ${!isRead ? styles.unread : ""}`} style={{ background: s.bg, borderColor: s.borderColor }}>
                        <div className={styles.notifTop}>
                          <div className={styles.notifMeta}>
                            {!isRead && <span className={styles.unreadDot} />}
                            <div>
                              <p className={styles.notifTitle}>{n.title ?? "Evaluation Update"}</p>
                              <p className={styles.notifRole}>{n.created_at ? formatDate(n.created_at) : ""}</p>
                            </div>
                          </div>
                          <span style={{ padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: s.badge, color: s.badgeColor, whiteSpace: "nowrap" }}>{s.badgeText}</span>
                        </div>
                        <p className={styles.notifBody}>{n.description ?? n.message ?? ""}</p>
                        <div className={styles.notifActions}>
                          {!isRead && <button type="button" className={styles.readBtn} onClick={() => markEvalRead(notifId)}>Mark as read</button>}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

// ─── NotifCard ────────────────────────────────────────────────────────────────

function NotifCard({ notif, role, templateManagementPath, onMarkRead }: { notif: DBNotification; role: string; templateManagementPath: string; onMarkRead: () => void; }) {
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
              <span className={styles.roleBadge} style={{ background: roleColor + "18", color: roleColor }}>{ROLE_DISPLAY[role] ?? role}</span>
              <span className={styles.notifDate}>{formatDate(notif.created_at)}</span>
            </div>
          </div>
        </div>
        {isUnread && <button className={styles.readBtn} onClick={onMarkRead}>Mark as read</button>}
      </div>
      <p className={styles.notifBody}>{notif.message}</p>
      {viewHref && (
        <div className={styles.notifActions}>
          <a href={viewHref} className={styles.actionBtn}>Go to Templates →</a>
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={spinning ? { animation: "spin 0.8s linear infinite" } : {}}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}