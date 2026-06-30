export type Role =
  | "HQ Admin"
  | "Country Admin"
  | "Branch Admin"
  | "Dept Admin"
  | "Sub Dept Admin"
  | "Employee";

// ── Lowercase display label per role (e.g. badges, captions) ──
export const ROLE_LABELS: Record<Role, string> = {
  "HQ Admin":       "hq admin",
  "Country Admin":  "country admin",
  "Branch Admin":   "branch admin",
  "Dept Admin":     "dept admin",
  "Sub Dept Admin": "sub dept admin",
  "Employee":       "employee",
};

// ── Avatar initials per role ──
export const ROLE_AVATAR_LABELS: Record<Role, string> = {
  "HQ Admin":       "HQ",
  "Country Admin":  "CA",
  "Branch Admin":   "BA",
  "Dept Admin":     "DA",
  "Sub Dept Admin": "SD",
  "Employee":       "EM",
};
