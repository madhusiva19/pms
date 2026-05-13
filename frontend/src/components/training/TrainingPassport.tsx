"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import styles from "./training.module.css";
import Sidebar from "@/components/sidebar/Sidebar";

// ── Types ──────────────────────────────────────────────────────────────────
export type Role =
  | "HQ Admin"
  | "Country Admin"
  | "Branch Admin"
  | "Dept Admin"
  | "Sub Dept Admin"
  | "Employee";

type TrainingAttended = {
  id: string;
  trainingName: string;
  date: string;
  provider: string;
};

type TrainingSuggestion = {
  id: string;
  trainingName: string;
  justification: string;
  status: "pending" | "approved" | "rejected";
  supervisorComment?: string;
  submittedBy?: string;
  submittedByRole?: string;
};

type AIRecommendation = {
  id: string;
  trainingName: string;
  reason: string;
  basedOn: string;
};

interface TrainingPassportProps {
  role: Role;
  sidebarName: string;
  dashboardPath: string;
  userName: string;
  designation: string;
  employeeId?: string;
  initialAttended?: TrainingAttended[];
  initialSuggestions?: TrainingSuggestion[];
  initialSubordinateSuggestions?: TrainingSuggestion[];
  aiRecommendations?: AIRecommendation[];
}

// ── Role config ────────────────────────────────────────────────────────────
const ROLE_CONFIG: Record<Role, {
  avatarLabel: string;
  roleLabel: string;
  canLog: boolean;
  canSuggest: boolean;
  canReview: boolean;
  showAI: boolean;
}> = {
  "HQ Admin":       { avatarLabel: "HQ", roleLabel: "hq admin",      canLog: true,  canSuggest: false, canReview: true,  showAI: false },
  "Country Admin":  { avatarLabel: "CA", roleLabel: "country admin",  canLog: true,  canSuggest: true,  canReview: true,  showAI: true  },
  "Branch Admin":   { avatarLabel: "BA", roleLabel: "branch admin",   canLog: true,  canSuggest: true,  canReview: true,  showAI: true  },
  "Dept Admin":     { avatarLabel: "DA", roleLabel: "dept admin",     canLog: true,  canSuggest: true,  canReview: true,  showAI: true  },
  "Sub Dept Admin": { avatarLabel: "SD", roleLabel: "sub dept admin", canLog: true,  canSuggest: true,  canReview: true,  showAI: true  },
  "Employee":       { avatarLabel: "EM", roleLabel: "employee",       canLog: true,  canSuggest: true,  canReview: false, showAI: true  },
};

// ── Status badge styles ────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: "#FEF9C3", color: "#92400E", label: "⏳ Pending"  },
  approved: { bg: "#DCFCE7", color: "#065F46", label: "✅ Approved" },
  rejected: { bg: "#FEE2E2", color: "#991B1B", label: "❌ Rejected" },
};

// ── Dummy AI recommendations (replace with real API later) ─────────────────
const DUMMY_AI: AIRecommendation[] = [
  { id: "1", trainingName: "Strategic Leadership & Decision Making",          reason: "Leadership KPI scored below target (2.8/5) in last appraisal.", basedOn: "PMS Score"      },
  { id: "2", trainingName: "Freight Forwarding & Customs Clearance Advanced", reason: "Supervisor identified gaps in regulatory compliance knowledge.",  basedOn: "Supervisor Input" },
  { id: "3", trainingName: "Data Analytics for Operations Managers",          reason: "Self-suggested interest in digital tools aligns with company roadmap.", basedOn: "Self Suggestion" },
];

// ── Component ──────────────────────────────────────────────────────────────
export default function TrainingPassport({
  role,
  sidebarName,
  dashboardPath,
  userName,
  designation,
  employeeId,
  initialAttended = [],
  initialSuggestions = [],
  initialSubordinateSuggestions = [],
  aiRecommendations = DUMMY_AI,
}: TrainingPassportProps) {
  const router = useRouter();
  const config = ROLE_CONFIG[role];
  const { refreshBadges } = useAuth();

  const [activeTab, setActiveTab] = useState<"attended" | "suggestions">("attended");

  // ── Attended state ──
  const [attendedList, setAttendedList]   = useState<TrainingAttended[]>(initialAttended);
  const [newTraining, setNewTraining]     = useState({ trainingName: "", date: "", provider: "" });
  const [addingTraining, setAddingTraining] = useState(false);
  const [savingTraining, setSavingTraining] = useState(false);
  const [trainingMsg, setTrainingMsg]     = useState("");

  // ── Suggestions state ──
  const [suggestionList, setSuggestionList]             = useState<TrainingSuggestion[]>(initialSuggestions);
  const [subordinateSuggestions, setSubordinateSuggestions] = useState<TrainingSuggestion[]>(initialSubordinateSuggestions);
  const [newSuggestion, setNewSuggestion]               = useState({ trainingName: "", justification: "" });
  const [addingSuggestion, setAddingSuggestion]         = useState(false);
  const [reviewComment, setReviewComment]               = useState<Record<string, string>>({});
  const [savingSuggestion, setSavingSuggestion]         = useState(false);
  const [suggestionMsg, setSuggestionMsg]               = useState("");

  // ── Add Training — validates all fields before saving ──
  const handleAddTraining = async () => {
    if (!newTraining.trainingName || !newTraining.date || !newTraining.provider) {
      setTrainingMsg("All fields are required ❌");
      setTimeout(() => setTrainingMsg(""), 3000);
      return;
    }
    setSavingTraining(true);
    setTrainingMsg("");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/attended`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id:      employeeId,
          programme_name:   newTraining.trainingName,
          training_date:    newTraining.date,
          trainer_provider: newTraining.provider,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAttendedList((prev) => [{
          id:           data.data?.id || Math.random().toString(36).substr(2, 9),
          trainingName: newTraining.trainingName,
          date:         newTraining.date,
          provider:     newTraining.provider,
        }, ...prev]);
        setNewTraining({ trainingName: "", date: "", provider: "" });
        setAddingTraining(false);
        setTrainingMsg("Training record saved ✅");
      } else {
        setTrainingMsg(data.message || "Failed to save ❌");
      }
    } catch {
      setTrainingMsg("Backend connection failed ❌");
    } finally {
      setSavingTraining(false);
      setTimeout(() => setTrainingMsg(""), 3000);
    }
  };

  // ── Add Suggestion — validates fields before submitting ──
  const handleAddSuggestion = async () => {
    if (!newSuggestion.trainingName || !newSuggestion.justification) {
      setSuggestionMsg("All fields are required ❌");
      setTimeout(() => setSuggestionMsg(""), 3000);
      return;
    }
    setSavingSuggestion(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id:   employeeId,
          training_name: newSuggestion.trainingName,
          justification: newSuggestion.justification,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuggestionList((prev) => [{
          id:            data.data?.id || Math.random().toString(36).substr(2, 9),
          trainingName:  newSuggestion.trainingName,
          justification: newSuggestion.justification,
          status:        "pending",
        }, ...prev]);
        setNewSuggestion({ trainingName: "", justification: "" });
        setAddingSuggestion(false);
        setSuggestionMsg("Suggestion submitted ✅");
        refreshBadges();
      } else {
        setSuggestionMsg(data.message || "Failed ❌");
      }
    } catch {
      setSuggestionMsg("Backend connection failed ❌");
    } finally {
      setSavingSuggestion(false);
      setTimeout(() => setSuggestionMsg(""), 3000);
    }
  };

  // ── Review subordinate suggestion — approve or reject ──
  const handleReview = async (id: string, action: "approved" | "rejected") => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/training/suggestions/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, comment: reviewComment[id] || "" }),
        }
      );
      if (res.ok) {
        setSubordinateSuggestions((prev) =>
          prev.map((s) => s.id === id
            ? { ...s, status: action, supervisorComment: reviewComment[id] || "" }
            : s
          )
        );
        refreshBadges();
      }
    } catch (err) {
      console.error("Failed to review suggestion:", err);
    }
  };

  const initials = userName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  // ── Pending counts for badges ──
  const pendingSubordinateCount = subordinateSuggestions.filter(s => s.status === "pending").length;
  const pendingOwnCount         = suggestionList.filter(s => s.status === "pending").length;

  return (
    <div className={styles.shell}>

      <Sidebar />

      {/* ══════════ MAIN ══════════ */}
      <main className={styles.main}>

        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <span className={styles.crumbLink} onClick={() => router.push(dashboardPath)}>Home</span>
          <span className={styles.crumbSep}>›</span>
          <span className={styles.crumbCurrent}>Training Passport</span>
        </div>

        {/* Header */}
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Training Passport</h1>
            <p className={styles.subtitle}>Track attended trainings, suggest future ones and get AI-powered recommendations</p>
          </div>
        </div>

        {/* Profile strip */}
        <div className={styles.profileStrip}>
          <div className={styles.stripAvatar}>{initials}</div>
          <div>
            <div className={styles.stripName}>{userName}</div>
            <div className={styles.stripDesig}>{designation}</div>
          </div>
        </div>

        {/* ── Pill Tabs ── */}
        {(config.canLog || config.canSuggest || config.canReview) && (
          <div className={styles.tabRow}>

            {/* Trainings Attended tab */}
            {(config.canLog || config.canReview) && (
              <button
                type="button"
                className={activeTab === "attended" ? styles.tabActive : styles.tabInactive}
                onClick={() => setActiveTab("attended")}
              >
                📋 Trainings Attended
              </button>
            )}

            {/* Training Suggestions tab — with badge */}
            {(config.canSuggest || config.canReview) && (
              <button
                type="button"
                className={activeTab === "suggestions" ? styles.tabActive : styles.tabInactive}
                onClick={() => setActiveTab("suggestions")}
              >
                🔮 Training Suggestions
                {/* Badge for supervisor — pending subordinate suggestions */}
                {config.canReview && pendingSubordinateCount > 0 && (
                  <span className={styles.tabBadge}>{pendingSubordinateCount}</span>
                )}
                {/* Badge for employee — own pending suggestions */}
                {config.canSuggest && !config.canReview && pendingOwnCount > 0 && (
                  <span className={styles.tabBadge}>{pendingOwnCount}</span>
                )}
              </button>
            )}

          </div>
        )}

        {/* ══ TAB: Attended ══ */}
        {activeTab === "attended" && (
          <div className={styles.section}>

            {/* Add training form */}
            {config.canLog && (
              <div className={styles.addBox}>
                {!addingTraining ? (
                  <button type="button" className={styles.addBtn} onClick={() => setAddingTraining(true)}>
                    + Add Training Attended
                  </button>
                ) : (
                  <div className={styles.formGrid}>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Training Name *</label>
                      <input
                        className={styles.formInput}
                        placeholder="e.g. Leadership Excellence Program"
                        value={newTraining.trainingName}
                        onChange={(e) => setNewTraining((p) => ({ ...p, trainingName: e.target.value }))}
                      />
                    </div>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Date *</label>
                      <input
                        className={styles.formInput}
                        type="date"
                        value={newTraining.date}
                        onChange={(e) => setNewTraining((p) => ({ ...p, date: e.target.value }))}
                      />
                    </div>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Provider *</label>
                      <input
                        className={styles.formInput}
                        placeholder="e.g. IATA, Internal HR"
                        value={newTraining.provider}
                        onChange={(e) => setNewTraining((p) => ({ ...p, provider: e.target.value }))}
                      />
                    </div>
                    <div className={styles.formActions}>
                      <button
                        type="button"
                        className={styles.saveBtn}
                        onClick={handleAddTraining}
                        disabled={savingTraining}
                      >
                        {savingTraining ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelBtn}
                        onClick={() => { setAddingTraining(false); setTrainingMsg(""); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {trainingMsg && (
                  <p style={{
                    marginTop: "8px", fontSize: "13px", fontWeight: 500,
                    color: trainingMsg.includes("✅") ? "#065F46" : "#991B1B"
                  }}>
                    {trainingMsg}
                  </p>
                )}
              </div>
            )}

            {/* Trainings attended table */}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>#</th>
                    <th className={styles.th}>Training Name</th>
                    <th className={styles.th}>Date</th>
                    <th className={styles.th}>Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {attendedList.length === 0 ? (
                    <tr><td colSpan={4} className={styles.emptyCell}>No trainings recorded yet.</td></tr>
                  ) : (
                    attendedList.map((t, idx) => (
                      <tr key={t.id || idx} className={idx % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                        <td className={styles.td}>{idx + 1}</td>
                        <td className={styles.td}>{t.trainingName}</td>
                        <td className={styles.td}>{t.date}</td>
                        <td className={styles.td}>{t.provider}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ TAB: Suggestions ══ */}
        {activeTab === "suggestions" && (
          <div className={styles.section}>

            {/* My Suggestions — only for roles that can suggest */}
            {config.canSuggest && (
              <>
                <h3 className={styles.sectionSubTitle}>My Suggestions</h3>

                {!addingSuggestion ? (
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => setAddingSuggestion(true)}
                    style={{ marginBottom: "16px" }}
                  >
                    + Add Suggestion
                  </button>
                ) : (
                  <div className={styles.addBox}>
                    <div className={styles.formGrid}>
                      <div className={styles.formField} style={{ gridColumn: "1 / -1" }}>
                        <label className={styles.formLabel}>Training Name *</label>
                        <input
                          className={styles.formInput}
                          placeholder="e.g. PMP Certification"
                          value={newSuggestion.trainingName}
                          onChange={(e) => setNewSuggestion((p) => ({ ...p, trainingName: e.target.value }))}
                        />
                      </div>
                      <div className={styles.formField} style={{ gridColumn: "1 / -1" }}>
                        <label className={styles.formLabel}>Justification *</label>
                        <textarea
                          className={styles.formTextarea}
                          placeholder="Why do you need this training?"
                          value={newSuggestion.justification}
                          onChange={(e) => setNewSuggestion((p) => ({ ...p, justification: e.target.value }))}
                        />
                      </div>
                      <div className={styles.formActions}>
                        <button
                          type="button"
                          className={styles.saveBtn}
                          onClick={handleAddSuggestion}
                          disabled={savingSuggestion}
                        >
                          {savingSuggestion ? "Submitting..." : "Submit"}
                        </button>
                        <button
                          type="button"
                          className={styles.cancelBtn}
                          onClick={() => { setAddingSuggestion(false); setSuggestionMsg(""); }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                    {suggestionMsg && (
                      <p style={{
                        marginTop: "8px", fontSize: "13px", fontWeight: 500,
                        color: suggestionMsg.includes("✅") ? "#065F46" : "#991B1B"
                      }}>
                        {suggestionMsg}
                      </p>
                    )}
                  </div>
                )}

                {/* Own suggestions list */}
                <div className={styles.cardList}>
                  {suggestionList.length === 0 ? (
                    <div className={styles.emptyState}>No suggestions submitted yet.</div>
                  ) : (
                    suggestionList.map((s, idx) => {
                      const st = STATUS_STYLE[s.status];
                      return (
                        <div key={s.id || idx} className={styles.suggCard}>
                          <div className={styles.suggTop}>
                            <p className={styles.suggName}>{s.trainingName}</p>
                            <span style={{ padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: st.bg, color: st.color }}>
                              {st.label}
                            </span>
                          </div>
                          <p className={styles.suggJustification}>{s.justification}</p>
                          {s.supervisorComment && (
                            <div className={styles.supervisorNote}>
                              <span className={styles.supervisorNoteLabel}>Supervisor Comment:</span> {s.supervisorComment}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {/* Subordinate Suggestions — only for roles that can review */}
            {config.canReview && (
              <>
                <h3 className={styles.sectionSubTitle} style={{ marginTop: config.canSuggest ? "32px" : "0" }}>
                  Subordinate Suggestions — Pending Review
                </h3>
                <div className={styles.cardList}>
                  {subordinateSuggestions.filter(s => s.status === "pending").length === 0 ? (
                    <div className={styles.emptyState}>No pending suggestions to review.</div>
                  ) : (
                    subordinateSuggestions.filter(s => s.status === "pending").map((s, idx) => (
                      <div key={s.id || idx} className={styles.suggCard}>
                        <div className={styles.suggTop}>
                          <p className={styles.suggName}>{s.trainingName}</p>
                          <span style={{ fontSize: "12px", color: "#6B7280" }}>
                            {s.submittedBy} · {s.submittedByRole}
                          </span>
                        </div>
                        <p className={styles.suggJustification}>{s.justification}</p>
                        <div className={styles.reviewRow}>
                          <input
                            className={styles.formInput}
                            placeholder="Add a comment (optional)"
                            value={reviewComment[s.id] || ""}
                            onChange={(e) => setReviewComment((p) => ({ ...p, [s.id]: e.target.value }))}
                            style={{ flex: 1 }}
                          />
                          <button type="button" className={styles.approveBtn} onClick={() => handleReview(s.id, "approved")}>✓ Approve</button>
                          <button type="button" className={styles.rejectBtn}  onClick={() => handleReview(s.id, "rejected")}>✕ Reject</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ AI Recommendations — only for roles with showAI ══ */}
        {config.showAI && (
          <div className={styles.aiSection}>
            <div className={styles.aiHeader}>
              <div className={styles.aiTitleRow}>
                <span className={styles.aiIcon}>✦</span>
                <h2 className={styles.aiTitle}>AI Training Recommendations</h2>
              </div>
              <p className={styles.aiSubtitle}>Based on your PMS performance scores, supervisor inputs and self suggestions</p>
            </div>
            <div className={styles.aiGrid}>
              {aiRecommendations.map((rec) => (
                <div key={rec.id} className={styles.aiCard}>
                  <div className={styles.aiCardTop}>
                    <p className={styles.aiCardName}>{rec.trainingName}</p>
                    <span className={styles.aiBadge}>{rec.basedOn}</span>
                  </div>
                  <p className={styles.aiCardReason}>{rec.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}