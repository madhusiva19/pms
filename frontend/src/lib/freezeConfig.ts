// lib/freezeConfig.ts
// WHY: Single source of truth for all PMS freeze/notification dates.
// To test freeze behaviour, change values HERE ONLY — nowhere else in the codebase.
//
// TEST EXAMPLES:
//   Simulate "Open":  objectiveSettingMonths: 12  (window stays open a full year)
//   Simulate "Grace": objectiveSettingMonths: 0   (closes immediately, grace still applies)
//   Simulate "Frozen": objectiveSettingMonths: 0, gracePeriodDays: 0  (hard freeze now)
//   Restore production: objectiveSettingMonths: 2, gracePeriodDays: 15

export const FREEZE_CONFIG = {
  // PMS year starts 1st July (month index 6 in JS Date = July)
  pmsStartMonth: 7,
  pmsStartDay: 1,

  // How many months after PMS start before objective-setting window closes (31 Aug)
  objectiveSettingMonths: 2,

  // Grace period in days that HQ Admin gets after the objective window closes (→ 15 Sep)
  gracePeriodDays: 215,

  // Cascading notification schedule (monthOffset = months after PMS year start)
  notifications: [
    { role: "Sub Dept Admin", monthOffset: 0, day: 31 }, // 31 Jul
    { role: "Dept Admin",     monthOffset: 1, day: 5  }, //  5 Aug
    { role: "Branch Admin",   monthOffset: 1, day: 10 }, // 10 Aug
    { role: "Country Admin",  monthOffset: 1, day: 15 }, // 15 Aug
    { role: "HQ Admin",       monthOffset: 1, day: 25 }, // 25 Aug
  ],
} as const;

// Role level mapping — matches the `level` prop passed by each page
export const ROLE_LEVEL_MAP: Record<number, string> = {
  1: "HQ Admin",
  2: "Country Admin",
  3: "Branch Admin",
  4: "Dept Admin",
  5: "Sub Dept Admin",
  6: "Employee",
};