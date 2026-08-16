"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TrainingPassport from "@/components/training/TrainingPassport";
import LoadingScreen from "@/components/LoadingScreen";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { CurrentUser } from "@/hooks/useCurrentUser";
import { apiFetch } from "@/lib/apiFetch";

interface RawTraining { id: string; training_name: string; training_date: string; trainer_provider: string; }
interface RawSuggestion { id: string; training_name: string; justification: string; status: "pending" | "approved" | "rejected"; supervisor_comment?: string; }

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
      try {
        const attRes = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/attended/${currentUser.employee_id}`);
        const attData = await attRes.json();
        const mappedAttended = (attData.trainings || []).map((t: RawTraining) => ({
          id: t.id, trainingName: t.training_name, date: t.training_date, provider: t.trainer_provider,
        }));

        const suggRes = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/suggestions/${currentUser.employee_id}`);
        const suggData = await suggRes.json();
        const mappedSuggestions = (suggData.suggestions || []).map((s: RawSuggestion) => ({
          id: s.id, trainingName: s.training_name, justification: s.justification,
          status: s.status, supervisorComment: s.supervisor_comment || "",
        }));

        setAttended(mappedAttended);
        setSuggestions(mappedSuggestions);
      } catch (err) {
        console.error("Failed to fetch training data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading || !user) {
    return <LoadingScreen />;
  }

  return (
    <TrainingPassport
      role="Employee"
      sidebarName={user.full_name.split(" ")[0]}
      dashboardPath="/employee/profile"
      userName={user.full_name}
      designation={user.role}
      employeeId={user.employee_id}
      avatarUrl={user.avatar_url}
      initialAttended={attended}
      initialSuggestions={suggestions}
    />
  );
}
