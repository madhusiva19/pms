export interface CurrentUser {
  id: string;
  employee_id: string;
  email: string;
  full_name: string;
  role: string;
  org_level: number;
  iata_branch_code: string;
  avatar_url?: string | null;
  country_id?: string;
  branch_id?: string;
  dept_id?: string;
  sub_dept_id?: string;
}

export function useCurrentUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("pms_user");
  if (!raw) return null;
  return JSON.parse(raw) as CurrentUser;
}
