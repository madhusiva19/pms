"use client";

import { useEffect, useState } from "react";
import {
  FileText, ShieldCheck, Lock, Unlock,
  Info, AlertCircle, Loader2, BookOpen,
  Target, Award, TrendingUp, TrendingDown, SlidersHorizontal,
} from "lucide-react";
import styles from "./my-templates.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

// ─── KPI Scale config ─────────

interface KpiBadge {
  bg:        string;
  color:     string;
  border:    string;
  label:     string;
  group:     "interpolated" | "bracket" | "manual";
  icon:      React.ReactNode;
  hint:      string;
  isInverse?: boolean;
}

const KPI_BADGES: Record<string, KpiBadge> = {
  // ── INTERPOLATED ──────────────────────────────────────────────────────────
  interpolated_financial: {
    bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe",
    label: "Financial Achievement",
    group: "interpolated",
    icon: <TrendingUp size={10} />,
    hint: "LL=90%, UL=110%",
  },
  interpolated_to_gp: {
    bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe",
    label: "T/O & GP Contribution",
    group: "interpolated",
    icon: <TrendingUp size={10} />,
    hint: "LL=4%, UL=15%",
  },
  interpolated_sales_ratio: {
    bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe",
    label: "Effective Sales Ratio",
    group: "interpolated",
    icon: <TrendingUp size={10} />,
    hint: "LL=20%, UL=100%",
  },
  interpolated_gp_margin: {
    bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe",
    label: "Individual GP Margin %",
    group: "interpolated",
    icon: <TrendingUp size={10} />,
    hint: "LL=6%, UL=30%",
  },
  interpolated_ees_360: {
    bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe",
    label: "EES / 360 Degree Feedback",
    group: "interpolated",
    icon: <TrendingUp size={10} />,
    hint: "LL=65%, UL=85%",
  },
  interpolated_nps_ccr: {
    bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe",
    label: "NPS / CCR Score",
    group: "interpolated",
    icon: <TrendingUp size={10} />,
    hint: "LL=20, UL=50",
  },
  interpolated_emp_retention: {
    bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe",
    label: "Employee Retention",
    group: "interpolated",
    icon: <TrendingUp size={10} />,
    hint: "LL=75%, UL=95%",
  },
  interpolated_dpam: {
    bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe",
    label: "Overall DPAM Score",
    group: "interpolated",
    icon: <TrendingUp size={10} />,
    hint: "LL=75%, UL=90%",
  },

  // ── BRACKET ───────────────────────────────────────────────────────────────
  bracket_statutory: {
    bg: "#fef3c7", color: "#92400e", border: "#fde68a",
    label: "Statutory & Legal Compliance",
    group: "bracket",
    icon: <SlidersHorizontal size={10} />,
    hint: "Bands: <24=1 · =24=5",
  },
  bracket_wip: {
    bg: "#fef3c7", color: "#92400e", border: "#fde68a",
    label: "WIP Score (Days)",
    group: "bracket",
    icon: <TrendingDown size={10} />,
    hint: "≥9=1 · 7=2 · 5=3 · 3=4 · 1=5",
    isInverse: true,
  },
  bracket_ops_dpam: {
    bg: "#fef3c7", color: "#92400e", border: "#fde68a",
    label: "Operations Score / DPAM Ops",
    group: "bracket",
    icon: <SlidersHorizontal size={10} />,
    hint: "Banded score 1–5",
  },
  bracket_individual_sales_gp: {
    bg: "#fef3c7", color: "#92400e", border: "#fde68a",
    label: "Individual Sales GP",
    group: "bracket",
    icon: <SlidersHorizontal size={10} />,
    hint: "<100K=1 · –500K=2 · –1M=3 · –5M=4 · >5M=5",
  },

  // ── MANUAL ────────────────────────────────────────────────────────────────
  manual: {
    bg: "#f0fdf4", color: "#166534", border: "#bbf7d0",
    label: "Manual Rating (1–5)",
    group: "manual",
    icon: <SlidersHorizontal size={10} />,
    hint: "Appraiser enters directly",
  },

  // ── LEGACY — backward compat with templates  ────────
  standard: {
    bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe",
    label: "Financial Achievement",
    group: "interpolated",
    icon: <TrendingUp size={10} />,
    hint: "LL=90%, UL=110%",
  },
  inverse: {
    bg: "#fef3c7", color: "#92400e", border: "#fde68a",
    label: "WIP Score (Days)",
    group: "bracket",
    icon: <TrendingDown size={10} />,
    hint: "Inverse banded",
    isInverse: true,
  },
};

const unknownBadge = (scale: string): KpiBadge => ({
  bg: "#f8fafc", color: "#64748b", border: "#e2e8f0",
  label: scale,
  group: "manual",
  icon: <SlidersHorizontal size={10} />,
  hint: "",
});

// ─── Control badge config ─────────────────────────────────────────────────────
const CONTROL_BADGES: Record<string, { bg: string; color: string; border: string; label: string }> = {
  Locked:   { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe", label: "Locked"   },
  Editable: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0", label: "Editable" },
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface MyTemplatesProps {

  userId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function MyTemplates({ userId: userIdProp }: MyTemplatesProps) {

  const userId =
    userIdProp ||
    process.env.NEXT_PUBLIC_DEV_USER_ID ||
    "";

  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setError("Could not determine your user ID. Please sign in again.");
      setIsLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(
          `${API_BASE}/my-templates?user_id=${encodeURIComponent(userId)}`
        );
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const tmplData = await res.json();
        setTemplates(tmplData);
      } catch {
        setError("Unable to connect to the server. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [userId]);

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={styles.centered}>
        <Loader2 size={40} color="#3b82f6" className={styles.spinner} />
        <p style={{ color: "#64748b", fontWeight: "500" }}>Fetching your assignments…</p>
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <AlertCircle size={48} color="#ef4444" style={{ margin: "0 auto 16px" }} />
        <h2 style={{ color: "#1e293b" }}>Something went wrong</h2>
        <p style={{ color: "#64748b" }}>{error}</p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.wrapper}>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerIconWrapper}>
            <ShieldCheck size={24} color="#3b82f6" />
          </div>
          <div>
            <h1 className={styles.title}>My Performance Criteria</h1>
            <p className={styles.subtitle}>
              These evaluation structures are currently active for your role and department.
            </p>
          </div>
        </div>
      </header>

      {/* Empty state */}
      {templates.length === 0 ? (
        <div className={styles.emptyState}>
          <Info size={48} color="#cbd5e1" style={{ margin: "0 auto 16px" }} />
          <h3 style={{ color: "#475569" }}>No Templates Assigned</h3>
          <p style={{ color: "#94a3b8" }}>
            Contact your administrator if you believe this is an error.
          </p>
        </div>
      ) : (
        templates.map((template) => (
          <div key={template.id} className={styles.templateSection}>

            {/* Template info card */}
            <div className={styles.infoCard}>
              <div className={styles.infoCardLeft}>
                <div className={styles.infoIcon}>
                  <FileText size={24} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
                    <h2 className={styles.infoCardTitle}>{template.name}</h2>
                    <span className={styles.statusPill} style={{ background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" }}>
                      Active
                    </span>
                  </div>
                  <p className={styles.infoCardDesc}>
                    {template.description || "General evaluation criteria for organizational success."}
                  </p>
                  <div className={styles.infoCardMeta}>
                    <div className={styles.infoCardMetaItem}>
                      <Target size={12} color="#3b82f6" />
                      <span>Total Weight: <strong>{template.total_weight}%</strong></span>
                    </div>
                    <div className={styles.infoCardMetaItem}>
                      <Award size={12} color="#d97706" />
                      <span>Default Max Score: <strong>{template.max_score ?? 5}</strong></span>
                    </div>
                    <div className={styles.infoCardMetaItem}>
                      <BookOpen size={12} color="#8b5cf6" />
                      <span><strong>{(template.categories ?? []).length}</strong> Categories</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance categories */}
            {(template.categories || []).map((cat: any, cIdx: number) => (
              <div key={cIdx} className={styles.categoryCard}>

                {/* Category header */}
                <div className={styles.categoryHeader}>
                  <h3 className={styles.categoryTitle}>{cat.name}</h3>
                  <span className={styles.categoryWeightBadge}>{cat.weight}% Weight</span>
                </div>

                {/* Objectives table */}
                <div className={styles.tableCard}>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table} style={{ tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: "28%" }} />
                        <col style={{ width: "32%" }} />
                        <col style={{ width: "70px" }} />
                        <col style={{ width: "90px" }} />
                        <col style={{ width: "90px" }} />
                      </colgroup>
                      <thead className={styles.tableHead}>
                        <tr>
                          <th className={styles.th}>Performance Objective</th>
                          <th className={styles.th}>KPI Scale</th>
                          <th className={styles.th}>Weight</th>
                          <th className={styles.th}>Control</th>
                          <th className={styles.th}>Max Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(cat.objectives || []).map((obj: any, oIdx: number) => {
                          const isLocked     = obj.control === "Locked";
                          const kpiBadge     = KPI_BADGES[obj.kpiScale] ?? unknownBadge(obj.kpiScale ?? "—");
                          const ctrlBadge    = isLocked ? CONTROL_BADGES.Locked : CONTROL_BADGES.Editable;
                          const effectiveMax = obj.kpiMaxScore ?? template.max_score ?? 5;

                          return (
                            <tr key={oIdx} style={{ background: isLocked ? "#f5f9ff" : "#fff" }}>

                              {/* Objective name */}
                              <td className={styles.tdName}>
                                <div style={{ fontWeight: "600", color: "#1e293b", fontSize: "13px", lineHeight: "1.4", wordBreak: "break-word" }}>
                                  {obj.name}
                                </div>
                              </td>

                              {/* KPI Scale */}
                              <td className={styles.tdFixed}>
                                <span style={{
                                  display:      "inline-flex",
                                  alignItems:   "center",
                                  gap:          "5px",
                                  padding:      "3px 10px",
                                  borderRadius: "20px",
                                  fontSize:     "11px",
                                  fontWeight:   "700",
                                  background:   kpiBadge.bg,
                                  color:        kpiBadge.color,
                                  border:       `1px solid ${kpiBadge.border}`,
                                  maxWidth:     "100%",
                                  overflow:     "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace:   "nowrap",
                                }}>
                                  {kpiBadge.icon}
                                  {kpiBadge.label}
                                  {kpiBadge.isInverse && (
                                    <span style={{
                                      fontSize: "9px", padding: "0 4px", borderRadius: "3px",
                                      background: "#fee2e2", color: "#dc2626", flexShrink: 0,
                                    }}>
                                      inv
                                    </span>
                                  )}
                                </span>
                                {kpiBadge.hint && (
                                  <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "3px", paddingLeft: "2px" }}>
                                    {kpiBadge.hint}
                                  </div>
                                )}
                              </td>

                              {/* Weight */}
                              <td className={styles.tdFixed}>
                                <span style={{ fontWeight: "700", color: "#1e293b", fontSize: "13px" }}>
                                  {obj.weight ?? 0}%
                                </span>
                              </td>

                              {/* Control */}
                              <td className={styles.tdFixed}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: "4px",
                                  padding: "3px 10px", borderRadius: "20px",
                                  fontSize: "11px", fontWeight: "700",
                                  background: ctrlBadge.bg, color: ctrlBadge.color,
                                  border: `1px solid ${ctrlBadge.border}`,
                                }}>
                                  {isLocked ? <Lock size={9} /> : <Unlock size={9} />}
                                  {ctrlBadge.label}
                                </span>
                              </td>

                              {/* Max Score */}
                              <td className={styles.tdFixed}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: "4px",
                                  padding: "3px 10px", borderRadius: "20px",
                                  fontSize: "11px", fontWeight: "700",
                                  background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a",
                                }}>
                                  <Award size={9} />
                                  {effectiveMax}
                                  {obj.kpiMaxScore === null && (
                                    <span style={{ opacity: 0.6, fontSize: "9px" }}>(default)</span>
                                  )}
                                </span>
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

export default MyTemplates;
