// lib/freezeConfig.ts


export const FREEZE_CONFIG = {

  pmsStartMonth: 7,
  pmsStartDay: 1,
  objectiveSettingMonths: 12,
  gracePeriodDays: 15,

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