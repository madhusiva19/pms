"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TrainingPassport from "@/components/training/TrainingPassport";

export default function CountryAdminTrainingPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [attended, setAttended] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [subordinateSuggestions, setSubordinateSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("pms_user");
    if (!raw) { router.push("/login"); return; }
    const currentUser = JSON.parse(raw);
    setUser(currentUser);

    const fetchData = async () => {
      try {
        const attRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/attended/${currentUser.employee_id}`);
        const attData = await attRes.json();
        setAttended((attData.trainings || []).map((t: any) => ({
          id: t.training_id, trainingName: t.programme_name, date: t.training_date, provider: t.trainer_provider,
        })));

        const suggRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/suggestions/${currentUser.employee_id}`);
        const suggData = await suggRes.json();
        setSuggestions((suggData.suggestions || []).map((s: any) => ({
          id: s.suggestion_id, trainingName: s.training_name, justification: s.justification,
          status: s.status, supervisorComment: s.supervisor_comment || "",
        })));

        const subRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/subordinate-suggestions/${currentUser.employee_id}`);
        const subData = await subRes.json();
        setSubordinateSuggestions((subData.suggestions || []).map((s: any) => ({
          id: s.suggestion_id, trainingName: s.training_name, justification: s.justification,
          status: s.status, submittedBy: s.employees?.full_name || "", submittedByRole: s.employees?.role || "",
        })));

      } catch (err) {
        console.error("Failed to fetch training data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div style={{ padding: "40px" }}>Loading...</div>;
  if (!user) return null;

  return (
    <TrainingPassport
      role="Country Admin"
      sidebarName={user.full_name.split(" ")[0]}
      dashboardPath="/country-admin/dashboard"
      userName={user.full_name}
      designation={user.role}
      employeeId={user.employee_id}
      initialAttended={attended}
      initialSuggestions={suggestions}
      initialSubordinateSuggestions={subordinateSuggestions}
    />
  );
}