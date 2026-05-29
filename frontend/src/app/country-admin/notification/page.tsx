"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationTemplate from "@/components/notifications/NotificationTemplate";
import Sidebar from "@/components/sidebar/Sidebar";
import styles from "@/components/notifications/notifications.module.css";

const CACHE_TTL = 0; // Disabled cache to prevent stale data

export default function CountryAdminNotificationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [achievementNotifs, setAchievementNotifs] = useState([]);
  const [cutoffNotifs, setCutoffNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("pms_user");
    if (!raw) { router.push("/login"); return; }
    const currentUser = JSON.parse(raw);
    setUser(currentUser);

    const fetchNotifications = async () => {
      const cacheKey = `notification_cache_${currentUser.employee_id}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { achievementNotifs: an, cutoffNotifs: cn, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setAchievementNotifs(an);
            setCutoffNotifs(cn);
            setLoading(false);
            return;
          }
        } catch {}
      }

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${currentUser.employee_id}`);
        const data = await res.json();

        const mappedAchievements = (data.notifications || []).filter((n: any) => n.type === "diary_approval").map((n: any) => ({
          id: n.id,
          fromName: n.title,
          fromRole: "",
          submittedAt: n.created_at?.split("T")[0],
          achievement: n.message,
          isRead: n.is_read,
          actionUrl: n.action_link || "/country-admin/profile",
        }));

        const mappedCutoffs = (data.notifications || []).filter((n: any) => n.type === "objective_cutoff").map((n: any) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          cutoffDate: n.created_at?.split("T")[0],
          status: "normal",
          isRead: n.is_read,
          actionUrl: n.action_link || "/country-admin/dashboard",
        }));

        setAchievementNotifs(mappedAchievements);
        setCutoffNotifs(mappedCutoffs);

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
      <Sidebar />
      <main className={styles.main}>
        {(loading || !user) ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#9CA3AF", fontSize: "14px" }}>
            Loading...
          </div>
        ) : (
          <NotificationTemplate
            role="Country Admin"
            sidebarName={user.full_name.split(" ")[0]}
            dashboardPath="/country-admin/dashboard"
            achievementNotifications={achievementNotifs}
            cutoffNotifications={cutoffNotifs}
          />
        )}
      </main>
    </div>
  );
}
