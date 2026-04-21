"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import styles from "./training.module.css";

// ── Types ──────────────────────────────────────────────
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
  submittedBy?: string; // for supervisor view
  submittedByRole?: string;
};

type AIRecommendation = {
  id: string;
  trainingName: string;
  reason: string;
  basedOn: string; // e.g. "Low score in Leadership KPI"
};

interface TrainingPassportProps {
  role: Role;
  sidebarName: string;
  dashboardPath: string;
  userName: string;
  designation: string;
  initialAttended?: TrainingAttended[];
  initialSuggestions?: TrainingSuggestion[];
  initialSubordinateSuggestions?: TrainingSuggestion[]; // for supervisors
  aiRecommendations?: AIRecommendation[];
}

// ── Role config ────────────────────────────────────────
const ROLE_CONFIG: Record<Role, {
  avatarLabel: string;
  roleLabel: string;
  canLog: boolean;        // can log attended trainings
  canSuggest: boolean;    // can suggest future trainings
  canReview: boolean;     // can review subordinate suggestions
  showAI: boolean;        // show AI recommendations
}> = {
  "HQ Admin":       { avatarLabel: "HQ", roleLabel: "hq admin",       canLog: false, canSuggest: false, canReview: true,  showAI: false },
  "Country Admin":  { avatarLabel: "CA", roleLabel: "country admin",   canLog: true,  canSuggest: true,  canReview: true,  showAI: true  },
  "Branch Admin":   { avatarLabel: "BA", roleLabel: "branch admin",    canLog: true,  canSuggest: true,  canReview: true,  showAI: true  },
  "Dept Admin":     { avatarLabel: "DA", roleLabel: "dept admin",      canLog: true,  canSuggest: true,  canReview: true,  showAI: true  },
  "Sub Dept Admin": { avatarLabel: "SD", roleLabel: "sub dept admin",  canLog: true,  canSuggest: true,  canReview: true,  showAI: true  },
  "Employee":       { avatarLabel: "EM", roleLabel: "employee",        canLog: true,  canSuggest: true,  canReview: false, showAI: true  },
};

// ── Status styles ──────────────────────────────────────
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: "#FEF9C3", color: "#92400E", label: "⏳ Pending" },
  approved: { bg: "#DCFCE7", color: "#065F46", label: "✅ Approved" },
  rejected: { bg: "#FEE2E2", color: "#991B1B", label: "❌ Rejected" },
};

// ── Dummy data ─────────────────────────────────────────
const DUMMY_ATTENDED: TrainingAttended[] = [
  { id: "1", trainingName: "Leadership Excellence Program",      date: "2024-11-10", provider: "Dale Carnegie" },
  { id: "2", trainingName: "Advanced Excel for Managers",        date: "2025-01-22", provider: "Internal HR" },
  { id: "3", trainingName: "Customs Compliance & Trade Regulations", date: "2025-03-05", provider: "IATA" },
];

const DUMMY_SUGGESTIONS: TrainingSuggestion[] = [
  { id: "1", trainingName: "Project Management Professional (PMP)", justification: "To better manage cross-functional teams and large-scale logistics projects.", status: "approved", supervisorComment: "Highly recommended. Please enroll in Q3." },
  { id: "2", trainingName: "Digital Transformation in Supply Chain",  justification: "Our operations need modernisation to stay competitive.", status: "pending" },
];

const DUMMY_SUBORDINATE_SUGGESTIONS: TrainingSuggestion[] = [
  { id: "1", trainingName: "Project Management Professional (PMP)", justification: "To better manage cross-functional teams.", status: "pending", submittedBy: "Perera A. K.", submittedByRole: "Branch Admin" },
  { id: "2", trainingName: "Six Sigma Green Belt", justification: "To improve process quality in air exports.", status: "pending", submittedBy: "Silva R.", submittedByRole: "Dept Admin" },
];

const DUMMY_AI: AIRecommendation[] = [
  { id: "1", trainingName: "Strategic Leadership & Decision Making", reason: "Leadership KPI scored below target (2.8/5) in last appraisal.", basedOn: "PMS Score" },
  { id: "2", trainingName: "Freight Forwarding & Customs Clearance Advanced", reason: "Supervisor identified gaps in regulatory compliance knowledge.", basedOn: "Supervisor Input" },
  { id: "3", trainingName: "Data Analytics for Operations Managers",  reason: "Self-suggested interest in digital tools aligns with company roadmap.", basedOn: "Self Suggestion" },
];

// ── Component ──────────────────────────────────────────
export default function TrainingPassport({
  role,
  sidebarName,
  dashboardPath,
  userName,
  designation,
  initialAttended = DUMMY_ATTENDED,
  initialSuggestions = DUMMY_SUGGESTIONS,
  initialSubordinateSuggestions = DUMMY_SUBORDINATE_SUGGESTIONS,
  aiRecommendations = DUMMY_AI,
}: TrainingPassportProps) {
  const router = useRouter();
  const config = ROLE_CONFIG[role];

  const [activeTab, setActiveTab] = useState<"attended" | "suggestions">("attended");

  // Attended state
  const [attendedList, setAttendedList] = useState<TrainingAttended[]>(initialAttended);
  const [newTraining, setNewTraining] = useState({ trainingName: "", date: "", provider: "" });
  const [addingTraining, setAddingTraining] = useState(false);

  // Suggestions state
  const [suggestionList, setSuggestionList] = useState<TrainingSuggestion[]>(initialSuggestions);
  const [subordinateSuggestions, setSubordinateSuggestions] = useState<TrainingSuggestion[]>(initialSubordinateSuggestions);
  const [newSuggestion, setNewSuggestion] = useState({ trainingName: "", justification: "" });
  const [addingSuggestion, setAddingSuggestion] = useState(false);
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({});

  // ── Handlers ──
  const handleAddTraining = () => {
    if (!newTraining.trainingName || !newTraining.date || !newTraining.provider) return;
    setAttendedList((prev) => [
      { id: Math.random().toString(36).substr(2, 9), ...newTraining },
      ...prev,
    ]);
    setNewTraining({ trainingName: "", date: "", provider: "" });
    setAddingTraining(false);
  };

  const handleAddSuggestion = () => {
    if (!newSuggestion.trainingName || !newSuggestion.justification) return;
    setSuggestionList((prev) => [
      { id: Math.random().toString(36).substr(2, 9), ...newSuggestion, status: "pending" },
      ...prev,
    ]);
    setNewSuggestion({ trainingName: "", justification: "" });
    setAddingSuggestion(false);
  };

  const handleReview = (id: string, action: "approved" | "rejected") => {
    setSubordinateSuggestions((prev) =>
      prev.map((s) => s.id === id ? { ...s, status: action, supervisorComment: reviewComment[id] || "" } : s)
    );
  };

  const initials = userName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className={styles.shell}>

      {/* ══════════ SIDEBAR ══════════ */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Image src="/dgl-logo.png" alt="DGL Logo" width={160} height={56} className={styles.brandLogoImg} priority />
        </div>

        <nav className={styles.sideNav}>
          {role !== "Employee" && (
            <button type="button" className={styles.sideItem} onClick={() => router.push(dashboardPath)}>
              <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
                <rect x="3"  y="3"  width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
                <rect x="14" y="3"  width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
                <rect x="3"  y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
              </svg>
              <span className={styles.sideLabel}>Dashboard</span>
            </button>
          )}

          <button type="button" className={styles.sideItem}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M7 3h7l3 3v15H7V3Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M14 3v4h4"           stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M9 12h6"             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M9 16h6"             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>Template Management</span>
          </button>

          <button type="button" className={styles.sideItem}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M8 18c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M12 13a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 12 13Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M19 18c0-1.8-1.2-3.3-2.8-3.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>My Team</span>
          </button>

          <button type="button" className={styles.sideItem}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M5 20V4"    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M5 20h15"   stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M9 20v-7"   stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M13 20v-11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M17 20v-4"  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>Reports</span>
          </button>

          <button type="button" className={styles.sideItem} onClick={() => router.push(`/${role.toLowerCase().replace(/ /g, "-")}/profile`)}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M20 21a8 8 0 0 0-16 0"                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>My Profile</span>
          </button>

          {/* Training Passport — Active */}
          <button type="button" className={`${styles.sideItem} ${styles.active}`}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M9 7h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className={styles.sideLabel}>Training Passport</span>
          </button>

          <button type="button" className={styles.sideItem} onClick={() => router.push(`/${role.toLowerCase().replace(/ /g, "-")}/notifications`)}>
            <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0"                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={styles.sideLabel}>Notifications</span>
          </button>
        </nav>

        <div className={styles.sideFooter}>
          <div className={styles.profileRow}>
            <div className={styles.avatarCircle}>{config.avatarLabel}</div>
            <div className={styles.profileText}>
              <div className={styles.profileName}>{sidebarName}</div>
              <div className={styles.profileRole}>{config.roleLabel}</div>
            </div>
          </div>
          <button className={styles.logoutBtn} type="button" onClick={() => router.push("/login")}>Logout</button>
        </div>
      </aside>

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
            {(config.canLog || config.canReview) && (
              <button
                type="button"
                className={activeTab === "attended" ? styles.tabActive : styles.tabInactive}
                onClick={() => setActiveTab("attended")}
              >
                📋 Trainings Attended
              </button>
            )}
            {(config.canSuggest || config.canReview) && (
              <button
                type="button"
                className={activeTab === "suggestions" ? styles.tabActive : styles.tabInactive}
                onClick={() => setActiveTab("suggestions")}
              >
                🔮 Training Suggestions
              </button>
            )}
          </div>
        )}

        {/* ══ TAB: Attended ══ */}
        {activeTab === "attended" && (
          <div className={styles.section}>

            {/* Add form */}
            {config.canLog && (
              <div className={styles.addBox}>
                {!addingTraining ? (
                  <button type="button" className={styles.addBtn} onClick={() => setAddingTraining(true)}>
                    + Add Training Attended
                  </button>
                ) : (
                  <div className={styles.formGrid}>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Training Name</label>
                      <input
                        className={styles.formInput}
                        placeholder="e.g. Leadership Excellence Program"
                        value={newTraining.trainingName}
                        onChange={(e) => setNewTraining((p) => ({ ...p, trainingName: e.target.value }))}
                      />
                    </div>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Date</label>
                      <input
                        className={styles.formInput}
                        type="date"
                        value={newTraining.date}
                        onChange={(e) => setNewTraining((p) => ({ ...p, date: e.target.value }))}
                      />
                    </div>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Provider</label>
                      <input
                        className={styles.formInput}
                        placeholder="e.g. IATA, Internal HR"
                        value={newTraining.provider}
                        onChange={(e) => setNewTraining((p) => ({ ...p, provider: e.target.value }))}
                      />
                    </div>
                    <div className={styles.formActions}>
                      <button type="button" className={styles.saveBtn} onClick={handleAddTraining}>Save</button>
                      <button type="button" className={styles.cancelBtn} onClick={() => setAddingTraining(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Table */}
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
                      <tr key={t.id} className={idx % 2 === 0 ? styles.rowEven : styles.rowOdd}>
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

            {/* Self suggestions — for roles that can suggest */}
            {config.canSuggest && (
              <>
                <h3 className={styles.sectionSubTitle}>My Suggestions</h3>

                {!addingSuggestion ? (
                  <button type="button" className={styles.addBtn} onClick={() => setAddingSuggestion(true)} style={{ marginBottom: "16px" }}>
                    + Add Suggestion
                  </button>
                ) : (
                  <div className={styles.addBox}>
                    <div className={styles.formGrid}>
                      <div className={styles.formField} style={{ gridColumn: "1 / -1" }}>
                        <label className={styles.formLabel}>Training Name</label>
                        <input
                          className={styles.formInput}
                          placeholder="e.g. PMP Certification"
                          value={newSuggestion.trainingName}
                          onChange={(e) => setNewSuggestion((p) => ({ ...p, trainingName: e.target.value }))}
                        />
                      </div>
                      <div className={styles.formField} style={{ gridColumn: "1 / -1" }}>
                        <label className={styles.formLabel}>Justification</label>
                        <textarea
                          className={styles.formTextarea}
                          placeholder="Why do you need this training?"
                          value={newSuggestion.justification}
                          onChange={(e) => setNewSuggestion((p) => ({ ...p, justification: e.target.value }))}
                        />
                      </div>
                      <div className={styles.formActions}>
                        <button type="button" className={styles.saveBtn} onClick={handleAddSuggestion}>Submit</button>
                        <button type="button" className={styles.cancelBtn} onClick={() => setAddingSuggestion(false)}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                <div className={styles.cardList}>
                  {suggestionList.length === 0 ? (
                    <div className={styles.emptyState}>No suggestions submitted yet.</div>
                  ) : (
                    suggestionList.map((s) => {
                      const st = STATUS_STYLE[s.status];
                      return (
                        <div key={s.id} className={styles.suggCard}>
                          <div className={styles.suggTop}>
                            <p className={styles.suggName}>{s.trainingName}</p>
                            <span style={{ padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
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

            {/* Subordinate suggestions — for roles that can review */}
            {config.canReview && (
              <>
                <h3 className={styles.sectionSubTitle} style={{ marginTop: config.canSuggest ? "32px" : "0" }}>
                  Subordinate Suggestions — Pending Review
                </h3>
                <div className={styles.cardList}>
                  {subordinateSuggestions.filter((s) => s.status === "pending").length === 0 ? (
                    <div className={styles.emptyState}>No pending suggestions to review.</div>
                  ) : (
                    subordinateSuggestions.filter((s) => s.status === "pending").map((s) => (
                      <div key={s.id} className={styles.suggCard}>
                        <div className={styles.suggTop}>
                          <p className={styles.suggName}>{s.trainingName}</p>
                          <span style={{ fontSize: "12px", color: "#6B7280" }}>{s.submittedBy} · {s.submittedByRole}</span>
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

        {/* ══ AI Recommendations — always visible ══ */}
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