"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import styles from "./training.module.css";
import { apiFetch } from "@/lib/apiFetch";
import { logger } from "@/utils/logger";
import { Role, ROLE_LABELS, ROLE_AVATAR_LABELS } from "@/lib/roleConfig";

// ── Types ──────────────────────────────────────────────────────────────────
type TrainingAttended = {
  id: string;
  trainingName: string;
  date: string;
  provider: string;
  evidenceUrl?: string;
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
  avatarUrl?: string | null;
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
  "HQ Admin":       { avatarLabel: ROLE_AVATAR_LABELS["HQ Admin"],       roleLabel: ROLE_LABELS["HQ Admin"],       canLog: true,  canSuggest: false, canReview: true,  showAI: false },
  "Country Admin":  { avatarLabel: ROLE_AVATAR_LABELS["Country Admin"],  roleLabel: ROLE_LABELS["Country Admin"],  canLog: true,  canSuggest: true,  canReview: true,  showAI: true  },
  "Branch Admin":   { avatarLabel: ROLE_AVATAR_LABELS["Branch Admin"],   roleLabel: ROLE_LABELS["Branch Admin"],   canLog: true,  canSuggest: true,  canReview: true,  showAI: true  },
  "Dept Admin":     { avatarLabel: ROLE_AVATAR_LABELS["Dept Admin"],     roleLabel: ROLE_LABELS["Dept Admin"],     canLog: true,  canSuggest: true,  canReview: true,  showAI: true  },
  "Sub Dept Admin": { avatarLabel: ROLE_AVATAR_LABELS["Sub Dept Admin"], roleLabel: ROLE_LABELS["Sub Dept Admin"], canLog: true,  canSuggest: true,  canReview: true,  showAI: true  },
  "Employee":       { avatarLabel: ROLE_AVATAR_LABELS["Employee"],       roleLabel: ROLE_LABELS["Employee"],       canLog: true,  canSuggest: true,  canReview: false, showAI: true  },
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

// ── Training date bounds (no future dates, nothing before 1960) ────────────
const MIN_TRAINING_DATE = "1960-01-01";
const todayDateString = new Date().toISOString().split("T")[0];

// ── Proof of evidence upload constraints ────────────────────────────────────
const ALLOWED_EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_EVIDENCE_SIZE = 5 * 1024 * 1024;

// ── Component ──────────────────────────────────────────────────────────────
export default function TrainingPassport({
  role,
  dashboardPath,
  userName,
  designation,
  employeeId,
  avatarUrl,
  initialAttended = [],
  initialSuggestions = [],
  initialSubordinateSuggestions = [],
  aiRecommendations = DUMMY_AI,
}: TrainingPassportProps) {
  const config = ROLE_CONFIG[role];
  const { refreshBadges, clearTrainingBadge } = useAuth();

  const [activeTab, setActiveTab] = useState<"attended" | "suggestions">("attended");

  // ── Attended state ──
  const [attendedList, setAttendedList]   = useState<TrainingAttended[]>(initialAttended);
  const [newTraining, setNewTraining]     = useState({ trainingName: "", date: "", provider: "" });
  const [evidenceFile, setEvidenceFile]   = useState<File | null>(null);
  const [evidenceError, setEvidenceError] = useState("");
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const [addingTraining, setAddingTraining] = useState(false);
  const [savingTraining, setSavingTraining] = useState(false);
  const [trainingMsg, setTrainingMsg]     = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId]   = useState<string | null>(null);

  // ── Suggestions state ──
  const [suggestionList, setSuggestionList]             = useState<TrainingSuggestion[]>(initialSuggestions);
  const [subordinateSuggestions, setSubordinateSuggestions] = useState<TrainingSuggestion[]>(initialSubordinateSuggestions);
  const [newSuggestion, setNewSuggestion]               = useState({ trainingName: "", justification: "" });
  const [addingSuggestion, setAddingSuggestion]         = useState(false);
  const [reviewComment, setReviewComment]               = useState<Record<string, string>>({});
  const [savingSuggestion, setSavingSuggestion]         = useState(false);
  const [suggestionMsg, setSuggestionMsg]               = useState("");

  // ── Evidence file selection — validates type and size ──
  const handleEvidenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) { setEvidenceFile(null); return; }
    if (!ALLOWED_EVIDENCE_TYPES.includes(file.type)) {
      setEvidenceError("Only JPG, PNG, WebP or PDF files are allowed");
      setEvidenceFile(null);
      return;
    }
    if (file.size > MAX_EVIDENCE_SIZE) {
      setEvidenceError("File must be under 5MB");
      setEvidenceFile(null);
      return;
    }
    setEvidenceError("");
    setEvidenceFile(file);
  };

  // ── Add Training — validates all fields before saving ──
  const handleAddTraining = async () => {
    if (!newTraining.trainingName || !newTraining.date || !newTraining.provider || !evidenceFile) {
      setTrainingMsg("All fields are required, including proof of evidence ❌");
      setTimeout(() => setTrainingMsg(""), 3000);
      return;
    }
    if (newTraining.date < MIN_TRAINING_DATE || newTraining.date > todayDateString) {
      setTrainingMsg(`Date must be between ${MIN_TRAINING_DATE} and ${todayDateString} ❌`);
      setTimeout(() => setTrainingMsg(""), 3000);
      return;
    }
    setSavingTraining(true);
    setTrainingMsg("");
    try {
      const formData = new FormData();
      formData.append("employee_id", employeeId || "");
      formData.append("programme_name", newTraining.trainingName);
      formData.append("training_date", newTraining.date);
      formData.append("trainer_provider", newTraining.provider);
      formData.append("evidence", evidenceFile);

      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/attended`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setAttendedList((prev) => [{
          id:           data.data?.id || Math.random().toString(36).substr(2, 9),
          trainingName: newTraining.trainingName,
          date:         newTraining.date,
          provider:     newTraining.provider,
          evidenceUrl:  data.data?.evidence_url,
        }, ...prev]);
        setNewTraining({ trainingName: "", date: "", provider: "" });
        setEvidenceFile(null);
        setEvidenceError("");
        if (evidenceInputRef.current) evidenceInputRef.current.value = "";
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

  const openDeleteModal = (recordId: string) => {
    setDeleteTargetId(recordId);
    setShowDeleteModal(true);
  };

  const handleDeleteTraining = async () => {
    if (!deleteTargetId) return;
    const recordId = deleteTargetId;
    try {
      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/training/attended/${recordId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setAttendedList((prev) => prev.filter((t) => t.id !== recordId));
      } else {
        const data = await res.json();
        setTrainingMsg(data.message || "Failed to delete ❌");
        setTimeout(() => setTrainingMsg(""), 3000);
      }
    } catch {
      setTrainingMsg("Backend connection failed ❌");
      setTimeout(() => setTrainingMsg(""), 3000);
    } finally {
      setShowDeleteModal(false);
      setDeleteTargetId(null);
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
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/training/suggestions`, {
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
      const res = await apiFetch(
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
      logger.error("Failed to review suggestion", err);
    }
  };

  const initials = userName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  // ── Pending counts for badges ──
  const pendingSubordinateCount = subordinateSuggestions.filter(s => s.status === "pending").length;
  const reviewedOwnCount        = suggestionList.filter(s => s.status === "approved" || s.status === "rejected").length;

  return (
    <>
      <main style={{ flex: 1, minHeight: '100vh', background: '#F9FAFB', overflow: 'auto' }}>
      <div style={{ maxWidth: '1225px', margin: '0 auto', width: '100%', padding: '24px 32px 40px' }}>

        {/* Header */}
        <div className={styles.headerRow}>
          <div>
            <p className={styles.subtitle}>Track attended trainings, suggest future ones and get AI-powered recommendations</p>
          </div>
        </div>

        {/* Profile strip */}
        <div className={styles.profileStrip}>
          <div className={styles.stripAvatar} style={{
            background: avatarUrl ? "transparent" : undefined,
            overflow: "hidden",
            padding: 0,
          }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile"
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
              />
            ) : (
              initials
            )}
          </div>
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
                onClick={() => { setActiveTab("suggestions"); clearTrainingBadge() }}
  >
        
                🔮 Training Suggestions
                {/* Badge for supervisor — pending subordinate suggestions */}
                {config.canReview && pendingSubordinateCount > 0 && (
                  <span className={styles.tabBadge}>{pendingSubordinateCount}</span>
                )}
                {/* Badge for employee — reviewed (approved/rejected) suggestions */}
                {config.canSuggest && !config.canReview && reviewedOwnCount > 0 && (
                  <span className={styles.tabBadge}>{reviewedOwnCount}</span>
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
                        title="Training date"
                        aria-label="Training date"
                        min={MIN_TRAINING_DATE}
                        max={todayDateString}
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
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Proof of Evidence *</label>
                      <input
                        ref={evidenceInputRef}
                        className={styles.fileInputHidden}
                        type="file"
                        title="Proof of evidence"
                        aria-label="Proof of evidence"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={handleEvidenceChange}
                      />
                      {evidenceFile ? (
                        <div className={styles.fileChosenRow}>
                          <span className={styles.fileChosenName} title={evidenceFile.name}>
                            📎 {evidenceFile.name}
                          </span>
                          <button
                            type="button"
                            className={styles.fileChangeBtn}
                            onClick={() => evidenceInputRef.current?.click()}
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={styles.fileChooseBtn}
                          onClick={() => evidenceInputRef.current?.click()}
                        >
                          📎 Choose File
                        </button>
                      )}
                      <span className={styles.formHint}>
                        Upload your certificate, service letter, or anything that proves you attended this training.
                      </span>
                      {evidenceError && (
                        <span className={styles.formHint} style={{ color: "#991B1B" }}>
                          {evidenceError}
                        </span>
                      )}
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
                        onClick={() => {
                          setAddingTraining(false);
                          setTrainingMsg("");
                          setEvidenceFile(null);
                          setEvidenceError("");
                          if (evidenceInputRef.current) evidenceInputRef.current.value = "";
                        }}
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
                    <th className={styles.th}>Evidence</th>
                    <th className={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {attendedList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={styles.emptyCell}>
                        <div style={{ padding: "32px 16px", textAlign: "center" }}>
                          <div style={{ fontSize: "28px", marginBottom: "8px" }}>📋</div>
                          <div style={{ fontWeight: 600, color: "#374151", fontSize: "14px", marginBottom: "4px" }}>
                            No trainings recorded yet
                          </div>
                          <div style={{ color: "#9CA3AF", fontSize: "13px" }}>
                            Use the "Log Training" button above to add your first record.
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    attendedList.map((t, idx) => (
                      <tr key={t.id || idx} className={idx % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                        <td className={styles.td}>{idx + 1}</td>
                        <td className={styles.td}>{t.trainingName}</td>
                        <td className={styles.td}>{t.date}</td>
                        <td className={styles.td}>{t.provider}</td>
                        <td className={styles.td}>
                          {t.evidenceUrl ? (
                            <a
                              href={t.evidenceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#1D4ED8", fontWeight: 600, fontSize: "13px" }}
                            >
                              View
                            </a>
                          ) : (
                            <span style={{ color: "#9CA3AF", fontSize: "13px" }}>—</span>
                          )}
                        </td>
                        <td className={styles.td}>
                          <button
                            onClick={() => openDeleteModal(t.id)}
                            title="Delete record"
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#EF4444",
                              padding: "4px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "6px",
                              transition: "background 0.15s",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#FEF2F2")}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                              stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6"/>
                            </svg>
                          </button>
                        </td>
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
                    <div className={styles.emptyState} style={{ textAlign: "center", padding: "32px 16px" }}>
                      <div style={{ fontSize: "28px", marginBottom: "8px" }}>💡</div>
                      <div style={{ fontWeight: 600, color: "#374151", fontSize: "14px", marginBottom: "4px" }}>
                        No suggestions submitted yet
                      </div>
                      <div style={{ color: "#9CA3AF", fontSize: "13px" }}>
                        Suggest a training programme using the form above.
                      </div>
                    </div>
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
                    <div className={styles.emptyState} style={{ textAlign: "center", padding: "32px 16px" }}>
                      <div style={{ fontSize: "28px", marginBottom: "8px" }}>✅</div>
                      <div style={{ fontWeight: 600, color: "#374151", fontSize: "14px", marginBottom: "4px" }}>
                        No pending suggestions
                      </div>
                      <div style={{ color: "#9CA3AF", fontSize: "13px" }}>
                        All subordinate training suggestions have been reviewed.
                      </div>
                    </div>
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
              {aiRecommendations === DUMMY_AI && (
                <p style={{ fontSize: "11px", color: "#B45309", background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: "4px", padding: "2px 8px", display: "inline-block", marginTop: "6px" }}>
                  Demo data — real recommendations coming soon
                </p>
              )}
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

      </div>
      </main>

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "#fff", borderRadius: "20px", padding: "32px 28px",
            width: "400px", maxWidth: "calc(100vw - 32px)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          }}>

            <div style={{
              width: "48px", height: "48px", borderRadius: "50%",
              background: "#FEF2F2", display: "flex", alignItems: "center",
              justifyContent: "center", margin: "0 auto 16px",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </div>

            <h3 style={{
              margin: "0 0 4px", fontSize: "17px", fontWeight: 700,
              color: "#111827", textAlign: "center",
            }}>
              Delete Training Record
            </h3>
            <p style={{
              margin: "0 0 24px", fontSize: "13px", color: "#9CA3AF",
              textAlign: "center",
            }}>
              This training record will be permanently removed and cannot be undone.
            </p>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => { setShowDeleteModal(false); setDeleteTargetId(null); }}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px",
                  border: "1.5px solid #E5E7EB", background: "#fff",
                  cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#374151",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteTraining}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px",
                  border: "none", background: "#EF4444",
                  color: "#fff", cursor: "pointer",
                  fontSize: "13px", fontWeight: 700, transition: "background 0.2s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#DC2626")}
                onMouseLeave={e => (e.currentTarget.style.background = "#EF4444")}
              >
                Delete
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}