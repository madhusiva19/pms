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
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
  notificationCount: number;
  trainingBadgeCount: number;
  refreshBadges: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {},
  logout: () => {},
  notificationCount: 0,
  trainingBadgeCount: 0,
  refreshBadges: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [trainingBadgeCount, setTrainingBadgeCount] = useState(0);

  useEffect(() => {
    const raw = localStorage.getItem("pms_user");
    if (raw) {
      const parsedUser = JSON.parse(raw);
      setUser(parsedUser);

      // Sync user to public.users if not already there
      fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/sync-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id:   parsedUser.id,
          email:     parsedUser.email,
          full_name: parsedUser.full_name,
        }),
      }).catch(() => {}); // silent fail — non-critical
    }
  }, []);

  const refreshBadges = useCallback(async () => {
    const raw = localStorage.getItem("pms_user");
    if (!raw) return;
    const currentUser = JSON.parse(raw);
    const employeeId = currentUser.employee_id;
    const role = currentUser.role;
    const API = process.env.NEXT_PUBLIC_API_URL;

    try {
      // ── Notification badge ──
      const notifRes = await fetch(`${API}/api/notifications/${employeeId}`);
      const notifData = await notifRes.json();
      const unread = (notifData.notifications || []).filter((n: any) => !n.is_read).length;
      setNotificationCount(unread);

      // ── Training badge ──
      const isSupervisor = ["hq_admin", "country_admin", "branch_admin", "dept_admin", "sub_dept_admin"].includes(role);

      if (isSupervisor) {
        const subRes = await fetch(`${API}/api/training/subordinate-suggestions/${employeeId}`);
        const subData = await subRes.json();
        setTrainingBadgeCount((subData.suggestions || []).length);
      } else {
        const suggRes = await fetch(`${API}/api/training/suggestions/${employeeId}`);
        const suggData = await suggRes.json();
        const pending = (suggData.suggestions || []).filter((s: any) => s.status === "pending").length;
        setTrainingBadgeCount(pending);
      }

    } catch (err) {
      console.error("Failed to fetch badges:", err);
    }
  }, []);

  // Refresh badges when user changes
  useEffect(() => {
    if (user) refreshBadges();
  }, [user, refreshBadges]);

  const logout = () => {
    localStorage.removeItem("pms_user");
    setUser(null);
    setNotificationCount(0);
    setTrainingBadgeCount(0);
  };

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      logout,
      notificationCount,
      trainingBadgeCount,
      refreshBadges,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}



