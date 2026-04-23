"use client";

// src/components/my-templates/my-templates.tsx
// Reusable component — export and use inside any role-based layout.
// Changes from page version:
//  - Moved to src/components/my-templates/ for role-based composition
//  - Named export `MyTemplates` added (default export kept for convenience)
//  - CSS module import path updated to ./my-templates.module.css
//  - empId prop supported; falls back to window.__EMP_ID__ / env var

import { useEffect, useState } from "react";
import {
  FileText, ShieldCheck, Lock, Unlock,
  Info, AlertCircle, Loader2, BookOpen,
  Target, Award,
} from "lucide-react";
import styles from "./my-templates.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

// ─── KPI Scale badge config ───────────────────────────────────────────────────
const KPI_BADGES: Record<string, { bg: string; color: string; border: string; label: string }> = {
  standard: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe", label: "Standard" },
  inverse:  { bg: "#fef3c7", color: "#92400e", border: "#fde68a", label: "Inverse"  },
  manual:   { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0", label: "Manual"   },
};

// ─── Control badge config ─────────────────────────────────────────────────────
const CONTROL_BADGES: Record<string, { bg: string; color: string; border: string; label: string }> = {
  Locked:   { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe", label: "Locked"   },
  Editable: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0", label: "Editable" },
};

// ─── Training area UI colors (derived by ID, never stored in DB) ──────────────
const TRAINING_AREA_UI_COLORS: Record<number, { color: string; bgColor: string; borderColor: string }> = {
  1: { color: "#3b82f6", bgColor: "#eff6ff",  borderColor: "#bfdbfe" },
  2: { color: "#8b5cf6", bgColor: "#f5f3ff",  borderColor: "#ddd6fe" },
  3: { color: "#059669", bgColor: "#ecfdf5",  borderColor: "#a7f3d0" },
  4: { color: "#0891b2", bgColor: "#ecfeff",  borderColor: "#a5f3fc" },
  5: { color: "#dc2626", bgColor: "#fff1f2",  borderColor: "#fecaca" },
  6: { color: "#d97706", bgColor: "#fffbeb",  borderColor: "#fde68a" },
  7: { color: "#7c3aed", bgColor: "#faf5ff",  borderColor: "#e9d5ff" },
  8: { color: "#64748b", bgColor: "#f8fafc",  borderColor: "#e2e8f0" },
};

const FALLBACK_AREA_COLOR = { color: "#64748b", bgColor: "#f8fafc", borderColor: "#e2e8f0" };

function getAreaColors(idOrName: number | string | null) {
  if (idOrName === null) return FALLBACK_AREA_COLOR;
  const numId = Number(idOrName);
  if (!isNaN(numId) && TRAINING_AREA_UI_COLORS[numId]) {
    return TRAINING_AREA_UI_COLORS[numId];
  }
  return FALLBACK_AREA_COLOR;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface MyTemplatesProps {
  /** Pass the employee ID from your auth context / role layout */
  empId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function MyTemplates({ empId: empIdProp }: MyTemplatesProps) {
  // Resolve empId: prop → window global → env var
  const empId =
    empIdProp ||
    (typeof window !== "undefined" ? (window as any).__EMP_ID__ : undefined) ||
    process.env.NEXT_PUBLIC_DEV_EMP_ID ||
    "";

  const [templates, setTemplates] = useState<any[]>([]);
  const [areaNames, setAreaNames] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!empId) {
      setError("Could not determine your employee ID. Please sign in again.");
      setIsLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        const [tmplRes, areasRes] = await Promise.all([
          fetch(`${API_BASE}/my-templates?emp_id=${encodeURIComponent(empId)}`),
          fetch(`${API_BASE}/training-areas`),
        ]);
        if (!tmplRes.ok) throw new Error(`Server error: ${tmplRes.status}`);
        const [tmplData, areasData] = await Promise.all([
          tmplRes.json(),
          areasRes.ok ? areasRes.json() : [],
        ]);
        setTemplates(tmplData);
        const nameMap: Record<number, string> = {};
        (areasData as any[]).forEach((a: any) => { nameMap[a.id] = a.name; });
        setAreaNames(nameMap);
      } catch {
        setError("Unable to connect to the server. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [empId]);

  // ─── Resolve training area display ─────────────────────────────────────────
  const resolveArea = (
    idOrName: number | string | null,
  ): { name: string; color: string; bgColor: string; borderColor: string } | null => {
    if (idOrName === null || idOrName === undefined) return null;
    const numId = Number(idOrName);
    if (!isNaN(numId)) {
      const name   = areaNames[numId] ?? `Area ${numId}`;
      const colors = getAreaColors(numId);
      return { name, ...colors };
    }
    return { name: String(idOrName), ...FALLBACK_AREA_COLOR };
  };

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
                        <col style={{ width: "30%" }} />
                        <col style={{ width: "110px" }} />
                        <col style={{ width: "70px" }} />
                        <col style={{ width: "110px" }} />
                        <col style={{ width: "80px" }} />
                        <col style={{ width: "200px" }} />
                      </colgroup>
                      <thead className={styles.tableHead}>
                        <tr>
                          <th className={styles.th}>Performance Objective</th>
                          <th className={styles.th}>KPI Scale</th>
                          <th className={styles.th}>Weight</th>
                          <th className={styles.th}>Control</th>
                          <th className={styles.th}>Max Score</th>
                          <th className={styles.th}>Training Need</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(cat.objectives || []).map((obj: any, oIdx: number) => {
                          const isLocked     = obj.control === "Locked";
                          const kpiBadge     = KPI_BADGES[obj.kpiScale] ?? KPI_BADGES.standard;
                          const ctrlBadge    = isLocked ? CONTROL_BADGES.Locked : CONTROL_BADGES.Editable;
                          const effectiveMax = obj.kpiMaxScore ?? template.max_score ?? 5;

                          const linkageIds: (number | string)[] =
                            Array.isArray(obj.trainingLinkageIds) && obj.trainingLinkageIds.length > 0
                              ? obj.trainingLinkageIds
                              : obj.trainingLinkageId != null
                              ? [obj.trainingLinkageId]
                              : [];

                          const linkedAreas = linkageIds
                            .map((id) => resolveArea(id))
                            .filter(Boolean) as { name: string; color: string; bgColor: string; borderColor: string }[];

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
                                  display: "inline-flex", alignItems: "center", padding: "3px 10px",
                                  borderRadius: "20px", fontSize: "11px", fontWeight: "700",
                                  background: kpiBadge.bg, color: kpiBadge.color, border: `1px solid ${kpiBadge.border}`,
                                }}>
                                  {kpiBadge.label}
                                </span>
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
                                  background: ctrlBadge.bg, color: ctrlBadge.color, border: `1px solid ${ctrlBadge.border}`,
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

                              {/* Training Linkage */}
                              <td className={styles.tdFixed}>
                                {linkedAreas.length > 0 ? (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                    {linkedAreas.map((area, aIdx) => (
                                      <span key={aIdx} style={{
                                        display: "inline-flex", alignItems: "center", gap: "4px",
                                        padding: "3px 10px", borderRadius: "20px",
                                        fontSize: "11px", fontWeight: "700",
                                        background: area.bgColor,
                                        color: area.color,
                                        border: `1px solid ${area.borderColor}`,
                                      }}>
                                        <BookOpen size={9} />
                                        {area.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span style={{ fontSize: "11px", color: "#cbd5e1" }}>—</span>
                                )}
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

// Default export for convenience
export default MyTemplates;
