"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationTemplate from "@/components/notifications/NotificationTemplate";
import type { Role } from "@/components/notifications/NotificationTemplate";
import Sidebar from "@/components/sidebar/Sidebar";
import styles from "@/components/notifications/notifications.module.css";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { CurrentUser } from "@/hooks/useCurrentUser";

const CACHE_TTL = 60_000;

interface ApiNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
  action_link?: string;
}

interface Props {
  role: Role;
  dashboardPath: string;
  profilePath: string;
  showCutoffs?: boolean;
}

export default function AdminNotificationsPage({ role, dashboardPath, profilePath, showCutoffs = true }: Props) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [achievementNotifs, setAchievementNotifs] = useState([]);
  const [cutoffNotifs, setCutoffNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) { router.push("/login"); return; }
    setUser(currentUser);

    const fetchNotifications = async () => {
      const cacheKey = `notification_cache_${currentUser.employee_id}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { achievementNotifs: an, cutoffNotifs: cn, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setAchievementNotifs(an);
            if (showCutoffs) setCutoffNotifs(cn ?? []);
            setLoading(false);
            return;
          }
        } catch {}
      }

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${currentUser.employee_id}`);
        const data = await res.json();

        const mappedAchievements = (data.notifications || [])
          .filter((n: ApiNotification) => n.type === "diary_approval")
          .map((n: ApiNotification) => ({
            id: n.id,
            fromName: n.title,
            fromRole: "",
            submittedAt: n.created_at?.split("T")[0],
            achievement: n.message,
            isRead: n.is_read,
            actionUrl: n.action_link || profilePath,
          }));

        const mappedCutoffs = showCutoffs
          ? (data.notifications || [])
              .filter((n: ApiNotification) => n.type === "objective_cutoff")
              .map((n: ApiNotification) => ({
                id: n.id,
                title: n.title,
                message: n.message,
                cutoffDate: n.created_at?.split("T")[0],
                status: "normal",
                isRead: n.is_read,
                actionUrl: n.action_link || dashboardPath,
              }))
          : [];

        setAchievementNotifs(mappedAchievements);
        if (showCutoffs) setCutoffNotifs(mappedCutoffs);

        localStorage.setItem(cacheKey, JSON.stringify({
          achievementNotifs: mappedAchievements,
          cutoffNotifs: mappedCutoffs,
          timestamp: Date.now(),
        }));
      } catch (err) {
        console.error("Failed to fetch notifications:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchNotifications();
  }, []);

  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        {(loading || !user) ? (
          <div style={{ padding: "32px", width: "100%", boxSizing: "border-box" }}>
            <style>{`
              @keyframes shimmer {
                0%   { background-position: -600px 0; }
                100% { background-position:  600px 0; }
              }
              .skeleton {
                background: linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%);
                background-size: 600px 100%;
                animation: shimmer 1.4s infinite linear;
                border-radius: 8px;
              }
            `}</style>
            <div className="skeleton" style={{ height: 14, width: 180, marginBottom: 28 }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <div className="skeleton" style={{ height: 22, width: 200, marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 14, width: 300 }} />
              </div>
              <div className="skeleton" style={{ height: 34, width: 130, borderRadius: 8 }} />
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
              <div className="skeleton" style={{ height: 36, width: 180, borderRadius: 999 }} />
              <div className="skeleton" style={{ height: 36, width: 160, borderRadius: 999 }} />
            </div>
            {[1,2,3,4].map((i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div className="skeleton" style={{ height: 88, width: "100%", borderRadius: 12 }} />
              </div>
            ))}
          </div>
        ) : (
          <NotificationTemplate
            role={role}
            sidebarName={user.full_name.split(" ")[0]}
            dashboardPath={dashboardPath}
            achievementNotifications={achievementNotifs}
            {...(showCutoffs ? { cutoffNotifications: cutoffNotifs } : {})}
          />
        )}
      </main>
    </div>
  );
}
