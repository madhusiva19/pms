"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Lock, Clock3, Calendar, CheckCircle2, AlertTriangle, Bell, Loader2 } from "lucide-react";
import { computeFreezeDates, getTemplatePermissions, formatDate, daysUntil } from "@/lib/freezeUtils";
import { ROLE_LEVEL_MAP } from "@/lib/freezeConfig";
import styles from "./TemplateNotificationContent.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

// ── Types ───────────────────────────────────────────────────────────────────

interface Props {
  level: number;
  basePath: string;
}

type NotifStatus = "info" | "warning" | "critical" | "frozen";

interface FreezeNotification {
  id: string;
  title: string;
  message: string;
  status: NotifStatus;
  date: string;
  isRead: boolean;
  actionUrl: string;
}

// ── Derive freeze dates from live cycle (DB) with fallback to computed ──────
//
// Priority:
//   1. activeCycle fields from the DB  (set by HQ Admin via Edit Cycle Dates)
//   2. computeFreezeDates() fallback    (used only if DB has no active cycle)

function resolveDates(
  activeCycle: any,
  fallback: ReturnType<typeof computeFreezeDates>,
): {
  pmsStart:      Date;
  objectiveEnd:  Date;
  graceEnd:      Date;
} {
  // If the DB cycle has explicit dates, use those — they may have been edited
  const objectiveEnd = activeCycle?.objective_setting_end ?? activeCycle?.objective_end
    ? new Date(activeCycle.objective_setting_end ?? activeCycle.objective_end)
    : fallback.objectiveSettingEnd;

  const graceEnd = activeCycle?.grace_period_end ?? activeCycle?.grace_end
    ? new Date(activeCycle.grace_period_end ?? activeCycle.grace_end)
    : fallback.graceEnd;

  const pmsStart = activeCycle?.pms_start
    ? new Date(activeCycle.pms_start)
    : fallback.pmsYearStart;

  return { pmsStart, objectiveEnd, graceEnd };
}

// ── Notification builder — spec section 4.4 ────────────────────────────────

function buildNotifications(
  level: number,
  activeCycle: any,
  fallbackDates: ReturnType<typeof computeFreezeDates>,
  basePath: string,
): FreezeNotification[] {
  const now         = new Date();
  const notifications: FreezeNotification[] = [];
  const templateUrl = `${basePath}/template-management`;

  // Always use live DB dates if available, fall back to computed
  const { pmsStart, objectiveEnd, graceEnd } = resolveDates(activeCycle, fallbackDates);

  const isOpen   = now >= pmsStart && now < objectiveEnd;
  const isGrace  = now >= objectiveEnd && now < graceEnd;
  const isFrozen = now >= graceEnd;

  // Cascade dates derived from pmsStart (same logic as spec)
  const jul31 = new Date(pmsStart); jul31.setMonth(jul31.getMonth() + 0); jul31.setDate(31);
  const aug5  = new Date(pmsStart); aug5.setMonth(aug5.getMonth()   + 1); aug5.setDate(5);
  const aug10 = new Date(pmsStart); aug10.setMonth(aug10.getMonth() + 1); aug10.setDate(10);
  const aug15 = new Date(pmsStart); aug15.setMonth(aug15.getMonth() + 1); aug15.setDate(15);
  const aug25 = new Date(pmsStart); aug25.setMonth(aug25.getMonth() + 1); aug25.setDate(25);

  // ── 1. Window open — all roles ───────────────────────────────────────────
  if (isOpen) {
    notifications.push({
      id: "window-open",
      title: "Objective Setting Window Is Open",
      message: `A new appraisal year has started. The objective-setting window is now open and will close on ${formatDate(objectiveEnd)}. Set KPIs for editable (non-locked) objectives now.`,
      status: "info",
      date: formatDate(objectiveEnd),
      isRead: false,
      actionUrl: templateUrl,
    });
  }

  // ── 2. Role-specific cascading reminders ────────────────────────────────

  // Sub Dept Admin (level 5) — from 31 Jul
  if (level === 5 && isOpen && now >= jul31) {
    notifications.push({
      id: "subdept-reminder",
      title: "Reminder: Set Team Objectives by Deadline",
      message: `Objectives must be set for your team by ${formatDate(objectiveEnd)}. Please begin KPI assignment now for all editable (non-locked) objectives.`,
      status: daysUntil(objectiveEnd) <= 7 ? "critical" : "warning",
      date: formatDate(objectiveEnd),
      isRead: false,
      actionUrl: templateUrl,
    });
  }

  // Dept Admin (level 4) — from 5 Aug
  if (level === 4 && isOpen && now >= aug5) {
    notifications.push({
      id: "dept-alert",
      title: "Alert: Verify Sub Dept Admin Progress",
      message: "Objective setting is in progress. Verify that your Sub Dept Admins have begun KPI assignments for their teams.",
      status: daysUntil(objectiveEnd) <= 7 ? "critical" : "warning",
      date: formatDate(objectiveEnd),
      isRead: false,
      actionUrl: templateUrl,
    });
  }

  // Branch Admin (level 3) — from 10 Aug
  if (level === 3 && isOpen && now >= aug10) {
    notifications.push({
      id: "branch-escalation",
      title: "Escalation: Objective Deadline Approaching",
      message: "Confirm that Dept Admins under your branch are progressing with KPI assignments.",
      status: daysUntil(objectiveEnd) <= 7 ? "critical" : "warning",
      date: formatDate(objectiveEnd),
      isRead: false,
      actionUrl: templateUrl,
    });
  }

  // Country Admin (level 2) — from 15 Aug
  if (level === 2 && isOpen && now >= aug15) {
    notifications.push({
      id: "country-escalation",
      title: "Escalation: Nearing Final Deadline",
      message: `Ensure all branches in your country have completed or are completing KPI objective assignments by ${formatDate(objectiveEnd)}.`,
      status: daysUntil(objectiveEnd) <= 7 ? "critical" : "warning",
      date: formatDate(objectiveEnd),
      isRead: false,
      actionUrl: templateUrl,
    });
  }

  // HQ Admin (level 1) — from 25 Aug
  if (level === 1 && isOpen && now >= aug25) {
    notifications.push({
      id: "hq-final-escalation",
      title: "Final Escalation: Objective Setting Closing Soon",
      message: `Objective setting closes on ${formatDate(objectiveEnd)}. Any incomplete assignments will be frozen with the previous year's KPIs. A grace period is available until ${formatDate(graceEnd)}.`,
      status: "critical",
      date: formatDate(objectiveEnd),
      isRead: false,
      actionUrl: templateUrl,
    });
  }

  // ── 3. Window closed — all roles ─────────────────────────────────────────
  if (isGrace || isFrozen) {
    notifications.push({
      id: "window-closed",
      title: "Objective Setting Window Is Now Closed",
      message: `The objective-setting window closed on ${formatDate(objectiveEnd)}. All set objectives are saved. Incomplete objectives have been automatically frozen with the previous year's KPIs.`,
      status: isGrace ? "warning" : "frozen",
      date: formatDate(objectiveEnd),
      isRead: false,
      actionUrl: templateUrl,
    });
  }

  // ── 4. Grace period active — HQ Admin only ───────────────────────────────
  if (level === 1 && isGrace) {
    notifications.push({
      id: "grace-active",
      title: "Grace Period Active — You Retain Edit Access",
      message: `As HQ Admin you retain edit access until ${formatDate(graceEnd)} (${daysUntil(graceEnd)} days remaining). After this date templates are fully frozen.`,
      status: daysUntil(graceEnd) <= 3 ? "critical" : "warning",
      date: formatDate(graceEnd),
      isRead: false,
      actionUrl: templateUrl,
    });
  }

  // ── 5. Fully frozen ───────────────────────────────────────────────────────
  if (isFrozen) {
    notifications.push({
      id: "fully-frozen",
      title: level === 1 ? "Grace Period Ended — Templates Fully Frozen" : "Templates Fully Frozen",
      message: level === 1
        ? `Grace period ended on ${formatDate(graceEnd)}. PMS templates are now fully frozen. No further changes are permitted until the next appraisal cycle.`
        : `All templates are now fully frozen as of ${formatDate(graceEnd)}. No changes are permitted until the next PMS cycle begins.`,
      status: "frozen",
      date: formatDate(graceEnd),
      isRead: false,
      actionUrl: templateUrl,
    });
  }

  // ── 6. Mid-year review approaching — all roles ───────────────────────────
  if (activeCycle?.mid_year_review) {
    const midYear   = new Date(activeCycle.mid_year_review);
    const daysToMid = daysUntil(midYear);
    if (daysToMid <= 30 && now < midYear) {
      notifications.push({
        id: "mid-year",
        title: "Mid-Year Review Approaching",
        message: `The mid-year performance review is scheduled for ${formatDate(midYear)}. Ensure all objectives are properly set and documented.`,
        status: daysToMid <= 7 ? "warning" : "info",
        date: formatDate(midYear),
        isRead: false,
        actionUrl: templateUrl,
      });
    }
  }

  // ── 7. Year-end review approaching — all roles ───────────────────────────
  if (activeCycle?.year_end_review) {
    const yearEnd   = new Date(activeCycle.year_end_review);
    const daysToEnd = daysUntil(yearEnd);
    if (daysToEnd <= 30 && now < yearEnd) {
      notifications.push({
        id: "year-end",
        title: "Year-End Review Approaching",
        message: `The year-end performance review is scheduled for ${formatDate(yearEnd)}. Ensure all performance records are finalised.`,
        status: daysToEnd <= 7 ? "warning" : "info",
        date: formatDate(yearEnd),
        isRead: false,
        actionUrl: templateUrl,
      });
    }
  }

  return notifications;
}

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<NotifStatus, {
  bg: string; border: string; iconColor: string;
  badge: string; badgeText: string; Icon: any;
}> = {
  info:     { bg: "#eff6ff", border: "#bfdbfe", iconColor: "#3b82f6", badge: "#dbeafe", badgeText: "Upcoming",  Icon: Calendar     },
  warning:  { bg: "#fffbeb", border: "#fde68a", iconColor: "#d97706", badge: "#fef3c7", badgeText: "Due Soon",  Icon: AlertTriangle },
  critical: { bg: "#fef2f2", border: "#fecaca", iconColor: "#ef4444", badge: "#fee2e2", badgeText: "Urgent",    Icon: AlertTriangle },
  frozen:   { bg: "#f8fafc", border: "#e2e8f0", iconColor: "#64748b", badge: "#f1f5f9", badgeText: "Frozen",    Icon: Lock         },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function TemplateNotificationContent({ level, basePath }: Props) {
  const router = useRouter();

  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [notifList,   setNotifList]   = useState<FreezeNotification[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);

  // fallback dates from config (used only if no active cycle in DB)
  const fallbackDates = useMemo(() => computeFreezeDates(new Date()), []);

  // Derive freeze status from live cycle dates (reflects edits made by HQ Admin)
  const resolvedDates = useMemo(
    () => resolveDates(activeCycle, fallbackDates),
    [activeCycle, fallbackDates],
  );

  const freezeStatus = useMemo(() => {
    const now = new Date();
    if (now >= resolvedDates.graceEnd)     return "frozen";
    if (now >= resolvedDates.objectiveEnd) return "grace";
    return "open";
  }, [resolvedDates]);

  const roleLabel = ROLE_LEVEL_MAP[level] ?? "Admin";

  useEffect(() => {
    setIsLoading(true);
    fetch(`${API_BASE}/pms-cycles/active`)
      .then((r) => r.ok ? r.json() : null)
      .then((cycle) => {
        setActiveCycle(cycle);
        setNotifList(buildNotifications(level, cycle, fallbackDates, basePath));
      })
      .catch(() => {
        setNotifList(buildNotifications(level, null, fallbackDates, basePath));
      })
      .finally(() => setIsLoading(false));
  }, [level, fallbackDates, basePath]);

  const unreadCount = notifList.filter((n) => !n.isRead).length;

  const markRead    = (id: string) =>
    setNotifList((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));

  const markAllRead = () =>
    setNotifList((prev) => prev.map((n) => ({ ...n, isRead: true })));

  return (
    <div className={styles.wrapper}>

      {/* Header */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Template Notifications</h1>
          <p className={styles.subtitle}>
            PMS cycle deadlines and freeze alerts · <strong>{roleLabel}</strong>
          </p>
        </div>
        {unreadCount > 0 && (
          <button className={styles.markAllBtn} onClick={markAllRead}>
            Mark all as read
          </button>
        )}
      </div>

      {/* Freeze status bar — uses live cycle dates */}
      <div className={styles.statusBar} data-status={freezeStatus}>
        {freezeStatus === "frozen" && <Lock size={14} />}
        {freezeStatus === "grace"  && <Clock3 size={14} />}
        {freezeStatus === "open"   && <CheckCircle2 size={14} />}
        <span>
          {freezeStatus === "open"
            ? `Objective-setting window open · closes ${formatDate(resolvedDates.objectiveEnd)}`
            : freezeStatus === "grace"
            ? `Grace period active · hard freeze on ${formatDate(resolvedDates.graceEnd)}`
            : `Templates fully frozen since ${formatDate(resolvedDates.graceEnd)}`}
        </span>
      </div>

      {/* Notification cards */}
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
          <Loader2 size={28} color="#3b82f6" style={{ animation: "spin 1s linear infinite" }} />
        </div>
      ) : (
        <div className={styles.notifList}>
          {notifList.length === 0 ? (
            <div className={styles.emptyState}>
              <Bell size={32} color="#cbd5e1" style={{ margin: "0 auto 12px", display: "block" }} />
              No notifications at this time.
            </div>
          ) : (
            notifList.map((n) => {
              const cfg  = STATUS_CONFIG[n.status];
              const Icon = cfg.Icon;
              return (
                <div
                  key={n.id}
                  className={`${styles.notifCard} ${!n.isRead ? styles.unread : ""}`}
                  style={{ background: cfg.bg, borderColor: n.isRead ? cfg.border : undefined }}
                >
                  <div className={styles.notifTop}>
                    <div className={styles.notifMeta}>
                      {!n.isRead && <span className={styles.unreadDot} />}
                      <Icon size={18} color={cfg.iconColor} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <p className={styles.notifTitle}>{n.title}</p>
                        <p className={styles.notifDate}>Key date: {n.date}</p>
                      </div>
                    </div>
                    <span className={styles.badge} style={{ background: cfg.badge, color: cfg.iconColor }}>
                      {cfg.badgeText}
                    </span>
                  </div>

                  <p className={styles.notifBody}>{n.message}</p>

                  <div className={styles.notifActions}>
                    <button
                      className={styles.actionBtn}
                      onClick={() => { markRead(n.id); router.push(n.actionUrl); }}
                    >
                      Go to Templates →
                    </button>
                    {!n.isRead && (
                      <button className={styles.readBtn} onClick={() => markRead(n.id)}>
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
    </div>
  );
}

