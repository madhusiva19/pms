"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationTemplate from "@/components/notifications/NotificationTemplate";

export default function SubDeptAdminNotificationsPage() {
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
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${currentUser.employee_id}`);
        const data = await res.json();

        setAchievementNotifs(
          (data.notifications || []).filter((n: any) => n.type === "diary_approval").map((n: any) => ({
            id: n.id,
            fromName: n.title,
            fromRole: "",
            submittedAt: n.created_at?.split("T")[0],
            achievement: n.message,
            isRead: n.is_read,
            actionUrl: n.action_link || "/sub-dept-admin/profile",
          }))
        );

        setCutoffNotifs(
          (data.notifications || []).filter((n: any) => n.type === "objective_cutoff").map((n: any) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            cutoffDate: n.created_at?.split("T")[0],
            status: "normal",
            isRead: n.is_read,
            actionUrl: n.action_link ||  "/sub-dept-admin/dashboard",
          }))
        );
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
      role="Sub Dept Admin"
      sidebarName={user.full_name.split(" ")[0]}
      dashboardPath="/sub-dept-admin/dashboard"
      achievementNotifications={achievementNotifs}
      cutoffNotifications={cutoffNotifs}
    />
  );
}