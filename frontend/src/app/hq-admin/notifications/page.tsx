"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationTemplate from "@/components/notifications/NotificationTemplate";

export default function HQNotificationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [achievementNotifs, setAchievementNotifs] = useState([]);
  const [cutoffNotifs, setCutoffNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("epms_user");
    if (!raw) { router.push("/login"); return; }
    const currentUser = JSON.parse(raw);
    setUser(currentUser);

    const fetchNotifications = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${currentUser.employee_id}`
        );
        const data = await res.json();

        // Split into achievement and cutoff notifications
        const achievements = (data.notifications || [])
          .filter((n: any) => n.type === "diary_approval")
          .map((n: any) => ({
            id: n.id,
            fromName: n.title,
            fromRole: "",
            submittedAt: n.created_at?.split("T")[0],
            achievement: n.message,
            isRead: n.is_read,
            actionUrl: n.action_link || "/hq-admin/profile",
          }));

        const cutoffs = (data.notifications || [])
          .filter((n: any) => n.type === "objective_cutoff")
          .map((n: any) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            cutoffDate: n.created_at?.split("T")[0],
            status: "normal",
            isRead: n.is_read,
            actionUrl: n.action_link ||  "/hq-admin/dashboard",
          }));

        setAchievementNotifs(achievements);
        setCutoffNotifs(cutoffs);
      } catch (err) {
        console.error("Failed to fetch notifications:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, []);

  if (loading) return <div style={{ padding: "40px" }}>Loading...</div>;
  if (!user) return null;

  return (
    <NotificationTemplate
      role="HQ Admin"
      sidebarName={user.full_name.split(" ")[0]}
      dashboardPath="/hq-admin/dashboard"
      achievementNotifications={achievementNotifs}
      cutoffNotifications={cutoffNotifs}
    />
  );
}