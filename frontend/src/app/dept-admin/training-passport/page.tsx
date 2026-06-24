"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TrainingPassport from "@/components/training/TrainingPassport";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { CurrentUser } from "@/hooks/useCurrentUser";

interface RawTraining { id: string; training_name: string; training_date: string; trainer_provider: string; }
interface RawSuggestion { id: string; training_name: string; justification: string; status: "pending" | "approved" | "rejected"; supervisor_comment?: string; }
interface RawSubordinateSuggestion { id: string; training_name: string; justification: string; status: "pending" | "approved" | "rejected"; users?: { full_name: string; role: string; }; }

export default function DeptAdminTrainingPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [attended, setAttended] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [subordinateSuggestions, setSubordinateSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) { router.push("/login"); return; }
    setUser(currentUser);

    const fetchData = async () => {
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

        const subRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/subordinate-suggestions/${currentUser.employee_id}`);
        const subData = await subRes.json();
        const mappedSubordinate = (subData.suggestions || []).map((s: RawSubordinateSuggestion) => ({
          id: s.id, trainingName: s.training_name, justification: s.justification,
          status: s.status, submittedBy: s.users?.full_name || "", submittedByRole: s.users?.role || "",
        }));

        setAttended(mappedAttended);
        setSuggestions(mappedSuggestions);
        setSubordinateSuggestions(mappedSubordinate);
      } catch (err) {
        console.error("Failed to fetch training data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading || !user) {
    return (
      <div style={{ padding: "32px" }}>
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
        <div className="skeleton" style={{ height: 22, width: 260, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 14, width: 200, marginBottom: 32 }} />
        <div style={{ display: "flex", gap: 20, marginBottom: 32 }}>
          <div className="skeleton" style={{ width: 88, height: 88, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
            <div className="skeleton" style={{ height: 16, width: "40%" }} />
            <div className="skeleton" style={{ height: 13, width: "25%" }} />
            <div className="skeleton" style={{ height: 13, width: "30%" }} />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div className="skeleton" style={{ height: 56, width: "100%", borderRadius: 12 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <TrainingPassport
      role="Dept Admin"
      sidebarName={user.full_name.split(" ")[0]}
      dashboardPath="/dept-admin/dashboard"
      userName={user.full_name}
      designation={user.role}
      employeeId={user.employee_id}
      avatarUrl={user.avatar_url}
      initialAttended={attended}
      initialSuggestions={suggestions}
      initialSubordinateSuggestions={subordinateSuggestions}
    />
  );
}
