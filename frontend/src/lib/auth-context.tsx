"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

interface User {
  id: string;
  employee_id: string;
  email: string;
  full_name: string;
  role: string;
  org_level: number;
  iata_branch_code: string;
  avatar_url?: string | null;
  // Wathsala's extra fields needed for dashboard/reporting pages
  country_id?: string;
  branch_id?: string;
  dept_id?: string;
  sub_dept_id?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
  notificationCount: number;
  trainingBadgeCount: number;
  refreshBadges: () => void;
  clearTrainingBadge: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  setUser: () => {},
  logout: () => {},
  notificationCount: 0,
  trainingBadgeCount: 0,
  refreshBadges: () => {},
  clearTrainingBadge: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationCount, setNotificationCount] = useState(0);
  const [trainingBadgeCount, setTrainingBadgeCount] = useState(0);
  const clearTrainingBadge = () => setTrainingBadgeCount(0);

  useEffect(() => {
    const raw = localStorage.getItem("pms_user");
    if (raw) {
      const parsedUser = JSON.parse(raw);
      setUser(parsedUser);
    }
    setLoading(false);
  }, []);

  const refreshBadges = useCallback(async () => {
    const raw = localStorage.getItem("pms_user");
    if (!raw) return;
    const currentUser = JSON.parse(raw);
    const employeeId = currentUser.employee_id;
    const role = currentUser.role;
    const API = process.env.NEXT_PUBLIC_API_URL;
    if (!API) return;

    try {
      // ── Notification badge ──
      const notifRes  = await fetch(`${API}/api/notifications/${employeeId}`);
      const notifData = await notifRes.json();
      const unread = (notifData.notifications || []).filter((n: any) => !n.is_read).length;
      setNotificationCount(unread);

      // ── Training badge ──
      const isSupervisor = ["hq_admin", "country_admin", "branch_admin", "dept_admin", "sub_dept_admin"].includes(role);

      let trainingBadge = 0;

      const suggRes  = await fetch(`${API}/api/training/suggestions/${employeeId}`);
      const suggData = await suggRes.json();
      const reviewed = (suggData.suggestions || []).filter(
        (s: any) => s.status === "approved" || s.status === "rejected"
      ).length;
      trainingBadge += reviewed;

      if (isSupervisor) {
        const subRes  = await fetch(`${API}/api/training/subordinate-suggestions/${employeeId}`);
        const subData = await subRes.json();
        trainingBadge += (subData.suggestions || []).length;
      }

      setTrainingBadgeCount(trainingBadge);

    } catch {
      // silently fail — badges are non-critical
    }
  }, []);

  useEffect(() => {
    if (user) refreshBadges();
  }, [user, refreshBadges]);

  const logout = () => {
    localStorage.removeItem("pms_user");
    document.cookie = "pms_auth=; path=/; max-age=0; SameSite=Lax";
    setUser(null);
    setNotificationCount(0);
    setTrainingBadgeCount(0);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      setUser,
      logout,
      notificationCount,
      trainingBadgeCount,
      refreshBadges,
      clearTrainingBadge,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}