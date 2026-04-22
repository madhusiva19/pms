// lib/freezeUtils.ts
// WHY: All time-based and role-based freeze logic lives here.
// Components call these functions — they never compute dates themselves.

import { FREEZE_CONFIG, ROLE_LEVEL_MAP } from "./freezeConfig";

export interface FreezeDates {
  pmsYearStart: Date;
  objectiveSettingEnd: Date;  // 31 Aug — window closes for all roles
  graceEnd: Date;             // 15 Sep — HQ grace period ends → hard freeze
  notificationDates: { role: string; date: Date }[];
}

export type FreezeStatus =
  | "open"    // Before 31 Aug — all authorised roles can edit
  | "grace"   // 1 Sep – 15 Sep — only HQ Admin (level 1) can edit
  | "frozen"; // After 15 Sep — nobody can edit

export interface TemplatePermissions {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  freezeStatus: FreezeStatus;
  roleLabel: string;
}

// ─── Derive all PMS cycle dates from today ─────────────────────────────────

export function computeFreezeDates(referenceDate: Date = new Date()): FreezeDates {
  const year = referenceDate.getFullYear();

  // PMS year starts 1 July
  let pmsYearStart = new Date(
    year,
    FREEZE_CONFIG.pmsStartMonth,
    FREEZE_CONFIG.pmsStartDay
  );

  // If we haven't reached 1 July yet this year, roll back to last year's start
  if (referenceDate < pmsYearStart) {
    pmsYearStart = new Date(
      year - 1,
      FREEZE_CONFIG.pmsStartMonth,
      FREEZE_CONFIG.pmsStartDay
    );
  }

  // Objective-setting window closes N months after PMS start
  const objectiveSettingEnd = new Date(pmsYearStart);
  objectiveSettingEnd.setMonth(
    objectiveSettingEnd.getMonth() + FREEZE_CONFIG.objectiveSettingMonths
  );

  // Grace period ends N days after objective window closes
  const graceEnd = new Date(objectiveSettingEnd);
  graceEnd.setDate(graceEnd.getDate() + FREEZE_CONFIG.gracePeriodDays);

  // Notification dates derived from config
  const notificationDates = FREEZE_CONFIG.notifications.map(({ role, monthOffset, day }) => {
    const date = new Date(pmsYearStart);
    date.setMonth(date.getMonth() + monthOffset);
    date.setDate(day);
    return { role, date };
  });

  return { pmsYearStart, objectiveSettingEnd, graceEnd, notificationDates };
}

// ─── Current freeze status ────────────────────────────────────────────────

export function getFreezeStatus(
  freezeDates: FreezeDates,
  now: Date = new Date()
): FreezeStatus {
  if (now >= freezeDates.graceEnd) return "frozen";
  if (now >= freezeDates.objectiveSettingEnd) return "grace";
  return "open";
}

// ─── Role + time = permissions ────────────────────────────────────────────

export function getTemplatePermissions(
  level: number,
  freezeDates: FreezeDates,
  now: Date = new Date()
): TemplatePermissions {
  const status = getFreezeStatus(freezeDates, now);
  const roleLabel = ROLE_LEVEL_MAP[level] ?? "Unknown";
  const isHqAdmin = level === 1;

  return {
    freezeStatus: status,
    roleLabel,
    canView: true, // Everyone can always view

    // Edit:
    //   open   → HQ Admin only (level 1) — matches the requirement that only
    //            HQ creates/manages templates globally
    //   grace  → HQ Admin only (level 1)
    //   frozen → nobody
    canEdit: status !== "frozen" && isHqAdmin,

    // Delete: HQ Admin only, only when not frozen
    canDelete: status !== "frozen" && isHqAdmin,

    // Create: HQ Admin only, when not frozen
    canCreate: status !== "frozen" && isHqAdmin,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

// Returns days remaining until a future date (0 if already past)
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}
