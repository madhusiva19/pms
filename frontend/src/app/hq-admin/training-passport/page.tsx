"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TrainingPassport from "@/components/training/TrainingPassport";

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
      try {
        // Attended — HQ Admin can't log so this will be empty
        const attRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/attended/${currentUser.employee_id}`);
        const attData = await attRes.json();
        setAttended((attData.trainings || []).map((t: any) => ({
          id: t.id, trainingName: t.training_name, date: t.training_date, provider: t.trainer_provider,
        })));

        // Subordinate suggestions only — HQ reviews Country Admins
        const subRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/subordinate-suggestions/${currentUser.employee_id}`);
        const subData = await subRes.json();
        setSubordinateSuggestions((subData.suggestions || []).map((s: any) => ({
          id: s.id, trainingName: s.training_name, justification: s.justification,
          status: s.status, submittedBy: s.users?.full_name || "", submittedByRole: s.users?.role || "",
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
      role="HQ Admin"
      sidebarName={user.full_name.split(" ")[0]}
      dashboardPath="/hq-admin/dashboard"
      userName={user.full_name}
      designation={user.role}
      employeeId={user.employee_id}
      initialAttended={attended}
      initialSubordinateSuggestions={subordinateSuggestions}
    />
  );
}