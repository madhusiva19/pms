"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TrainingPassport from "@/components/training/TrainingPassport";
import Sidebar from "@/components/sidebar/Sidebar";
import styles from "@/components/training/training.module.css";

const CACHE_TTL = 0; // Disabled cache to prevent stale data

export default function HQAdminTrainingPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [attended, setAttended] = useState([]);
  const [subordinateSuggestions, setSubordinateSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("pms_user");
    if (!raw) { router.push("/login"); return; }
    const currentUser = JSON.parse(raw);
    setUser(currentUser);

    const fetchData = async () => {
      const cacheKey = `training_cache_${currentUser.employee_id}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { attended: at, subordinateSuggestions: ss, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setAttended(at);
            setSubordinateSuggestions(ss);
            setLoading(false);
            return;
          }
        } catch {}
      }

      try {
        const attRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/attended/${currentUser.employee_id}`);
        const attData = await attRes.json();
        const mappedAttended = (attData.trainings || []).map((t: any) => ({
          id: t.id, trainingName: t.training_name, date: t.training_date, provider: t.trainer_provider,
        }));

        const subRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/subordinate-suggestions/${currentUser.employee_id}`);
        const subData = await subRes.json();
        const mappedSubordinate = (subData.suggestions || []).map((s: any) => ({
          id: s.id, trainingName: s.training_name, justification: s.justification,
          status: s.status, submittedBy: s.users?.full_name || "", submittedByRole: s.users?.role || "",
        }));

        setAttended(mappedAttended);
        setSubordinateSuggestions(mappedSubordinate);

        localStorage.setItem(cacheKey, JSON.stringify({
          attended: mappedAttended,
          subordinateSuggestions: mappedSubordinate,
          timestamp: Date.now(),
        }));
      } catch (err) {
        console.error("Failed to fetch training data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
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
          <TrainingPassport
            role="HQ Admin"
            sidebarName={user.full_name.split(" ")[0]}
            dashboardPath="/hq-admin/dashboard"
            userName={user.full_name}
            designation={user.role}
            employeeId={user.employee_id}
            initialAttended={attended}
            initialSubordinateSuggestions={subordinateSuggestions}
          />
        )}
      </main>
    </div>
  );
}
