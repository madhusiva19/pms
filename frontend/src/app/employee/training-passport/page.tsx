"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TrainingPassport from "@/components/training/TrainingPassport";
import Sidebar from "@/components/sidebar/Sidebar";
import styles from "@/components/training/training.module.css";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { CurrentUser } from "@/hooks/useCurrentUser";

interface RawTraining { id: string; training_name: string; training_date: string; trainer_provider: string; }
interface RawSuggestion { id: string; training_name: string; justification: string; status: "pending" | "approved" | "rejected"; supervisor_comment?: string; }

const CACHE_TTL = 0; // Disabled cache to prevent stale data

export default function EmployeeTrainingPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [attended, setAttended] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) { router.push("/login"); return; }
    setUser(currentUser);

    const fetchData = async () => {
      const cacheKey = `training_cache_${currentUser.employee_id}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { attended: at, suggestions: sg, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setAttended(at);
            setSuggestions(sg);
            setLoading(false);
            return;
          }
        } catch {}
      }

      try {
        const attRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/attended/${currentUser.employee_id}`);
        const attData = await attRes.json();
        const mappedAttended = (attData.trainings || []).map((t: RawTraining) => ({
          id: t.id, trainingName: t.training_name, date: t.training_date, provider: t.trainer_provider,
        }));

        const suggRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/suggestions/${currentUser.employee_id}`);
        const suggData = await suggRes.json();
        const mappedSuggestions = (suggData.suggestions || []).map((s: RawSuggestion) => ({
          id: s.id, trainingName: s.training_name, justification: s.justification,
          status: s.status, supervisorComment: s.supervisor_comment || "",
        }));

        setAttended(mappedAttended);
        setSuggestions(mappedSuggestions);

        localStorage.setItem(cacheKey, JSON.stringify({
          attended: mappedAttended,
          suggestions: mappedSuggestions,
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
            role="Employee"
            sidebarName={user.full_name.split(" ")[0]}
            dashboardPath="/employee/profile"
            userName={user.full_name}
            designation={user.role}
            employeeId={user.employee_id}
            initialAttended={attended}
            initialSuggestions={suggestions}
          />
        )}
      </main>
    </div>
  );
}
