"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationTemplate from "@/components/notifications/NotificationTemplate";
import Sidebar from "@/components/sidebar/Sidebar";
import styles from "@/components/notifications/notifications.module.css";

const CACHE_TTL = 0; // Disabled cache to prevent stale data

export default function EmployeeNotificationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [achievementNotifs, setAchievementNotifs] = useState([]);
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
          const { achievementNotifs: an, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setAchievementNotifs(an);
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
          actionUrl: n.action_link || "/employee/profile",
        }));

        setAchievementNotifs(mappedAchievements);

        localStorage.setItem(cacheKey, JSON.stringify({
          achievementNotifs: mappedAchievements,
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
            role="Employee"
            sidebarName={user.full_name.split(" ")[0]}
            dashboardPath="/employee/profile"
            achievementNotifications={achievementNotifs}
          />
        )}
      </main>
    </div>
  );
}
