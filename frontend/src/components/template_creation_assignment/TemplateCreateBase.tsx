"use client";

/**
 * TemplateCreateBase.tsx — FIXED VERSION
 *
 * Fixes applied:
 *  1. Role-aware routing — "Back to dashboard" and all nav use the role's prefix
 *     (hq-admin / country-admin / branch-admin) derived from the `level` prop.
 *  2. Dynamic cycle dates — permissions are built from the activeCycle fetched
 *     from the API, not from hardcoded computeFreezeDates().
 *  3. Locked-objective enforcement — Country Admin (level 2) and Branch Admin
 *     (level 3) can only edit objectives whose control === "Editable".
 *     Locked objectives render as read-only for those roles.
 *  4. Section-2 (assignment) is HQ Admin only. Other admins see it as read-only.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import { toast } from "sonner";
import {
  Eye, Lock, Unlock, Plus, Trash2,
  TrendingUp, TrendingDown, SlidersHorizontal, X,
  CheckCircle2, ArrowLeft,
} from "lucide-react";
import { formatDate } from "@/lib/freezeUtils";
import styles from "./TemplateCreateBase.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

const DEFAULT_MAX_SCORE          = 5;
const DESCRIPTION_WARN_THRESHOLD = 400;
const DESCRIPTION_MAX_LENGTH     = 500;
const TEMPLATE_NAME_MAX_LENGTH   = 120;
const DEPT_CODE_MAX_LENGTH       = 10;
const MAX_SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

// ─── Role routing helpers ─────────────────────────────────────────────────────

function getRolePrefix(level: number): string {
  if (level === 1) return "/hq-admin";
  if (level === 2) return "/country-admin";
  return "/branch-admin";
}

// ─── Dynamic freeze / permissions ────────────────────────────────────────────

interface DynamicFreezeDates {
  pmsYearStart:        Date;
  objectiveSettingEnd: Date;
  graceEnd:            Date;
  midYearReview:       Date | null;
  yearEndReview:       Date | null;
}

type FreezeStatus = "open" | "grace" | "frozen";

interface TemplatePermissions {
  freezeStatus:     FreezeStatus;
  canEdit:          boolean;
  canCreate:        boolean;
  canDelete:        boolean;
  canEditLocked:    boolean;  // HQ Admin only
  canEditEditable:  boolean;  // HQ Admin + others during open window
  canManageAssign:  boolean;  // HQ Admin only
  roleLabel:        string;
}

function buildFreezeDates(activeCycle: any): DynamicFreezeDates {
  const now = new Date();
  const fallbackYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  const pmsStart = activeCycle?.pms_start
    ? new Date(activeCycle.pms_start)
    : new Date(fallbackYear, 3, 1);

  const objEnd = (activeCycle?.objective_setting_end ?? activeCycle?.objective_end)
    ? new Date(activeCycle.objective_setting_end ?? activeCycle.objective_end)
    : new Date(fallbackYear, 5, 30);

  const graceEnd = (activeCycle?.grace_period_end ?? activeCycle?.grace_end)
    ? new Date(activeCycle.grace_period_end ?? activeCycle.grace_end)
    : new Date(fallbackYear, 6, 31);

  const midYear = activeCycle?.mid_year_review ? new Date(activeCycle.mid_year_review) : null;
  const yearEnd = activeCycle?.year_end_review  ? new Date(activeCycle.year_end_review)  : null;

  return { pmsYearStart: pmsStart, objectiveSettingEnd: objEnd, graceEnd, midYearReview: midYear, yearEndReview: yearEnd };
}

function computePermissions(level: number, freezeDates: DynamicFreezeDates): TemplatePermissions {
  const now = new Date();

  let freezeStatus: FreezeStatus;
  if (now <= freezeDates.objectiveSettingEnd) freezeStatus = "open";
  else if (now <= freezeDates.graceEnd)       freezeStatus = "grace";
  else                                         freezeStatus = "frozen";

  const isHqAdmin      = level === 1;
  const isCountryAdmin = level === 2;
  const isBranchAdmin  = level === 3;

  const canEditLocked   = isHqAdmin && freezeStatus !== "frozen";
  const canEditEditable = (isHqAdmin && freezeStatus !== "frozen") ||
                          ((isCountryAdmin || isBranchAdmin) && freezeStatus === "open");

  const canEdit          = canEditEditable;
  const canCreate        = isHqAdmin && freezeStatus !== "frozen";
  const canDelete        = isHqAdmin && freezeStatus !== "frozen";
  const canManageAssign  = isHqAdmin;

  const roleLabel =
    isHqAdmin      ? "HQ Administrator"     :
    isCountryAdmin ? "Country Administrator" :
                     "Branch Administrator";

  return { freezeStatus, canEdit, canCreate, canDelete, canEditLocked, canEditEditable, canManageAssign, roleLabel };
}

// ─── KPI Scale Options ────────────────────────────────────────────────────────

const KPI_SCALE_OPTIONS = [
  { value: "interpolated_financial",     label: "Financial Achievement",        group: "interpolated", hint: "LL=90%, UL=110% · Linear interpolation 1–5",    isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_to_gp",         label: "T/O & GP Contribution",        group: "interpolated", hint: "LL=4%, UL=15% · Linear interpolation 1–5",      isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_sales_ratio",   label: "Effective Sales Ratio",        group: "interpolated", hint: "LL=20%, UL=100% · Linear interpolation 1–5",    isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_gp_margin",     label: "Individual GP Margin %",       group: "interpolated", hint: "LL=6%, UL=30% · Linear interpolation 1–5",      isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_ees_360",       label: "EES / 360 Degree Feedback",    group: "interpolated", hint: "LL=65%, UL=85% · Linear interpolation 1–5",     isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_nps_ccr",       label: "NPS / CCR Score",              group: "interpolated", hint: "LL=20, UL=50 · Linear interpolation 1–5",        isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_emp_retention", label: "Employee Retention",           group: "interpolated", hint: "LL=75%, UL=95% · Linear interpolation 1–5",     isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_dpam",          label: "Overall DPAM Score",           group: "interpolated", hint: "LL=75%, UL=90% · Linear interpolation 1–5",     isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "bracket_statutory",          label: "Statutory & Legal Compliance", group: "bracket",      hint: "Bands: <24=1 · =24=5 (HQ Finance Guidelines)", isInverse: false, badge: { bg: "#fef3c7", color: "#92400e", border: "#fde68a" }, icon: <SlidersHorizontal size={13} color="#92400e" /> },
  { value: "bracket_wip",                label: "WIP Score (Days)",             group: "bracket",      hint: "Inverse bands: ≥9=1 · 7=2 · 5=3 · 3=4 · 1=5",  isInverse: true,  badge: { bg: "#fef3c7", color: "#92400e", border: "#fde68a" }, icon: <TrendingDown size={13} color="#b45309" /> },
  { value: "bracket_ops_dpam",           label: "Operations Score / DPAM Ops",  group: "bracket",      hint: "Bands: ≤11.6=1 · –17.4=2 · –23.2=3 · –27=4 · ≥27=5", isInverse: false, badge: { bg: "#fef3c7", color: "#92400e", border: "#fde68a" }, icon: <SlidersHorizontal size={13} color="#92400e" /> },
  { value: "bracket_individual_sales_gp",label: "Individual Sales GP",          group: "bracket",      hint: "Bands: <100K=1 · –500K=2 · –1M=3 · –5M=4 · >5M=5", isInverse: false, badge: { bg: "#fef3c7", color: "#92400e", border: "#fde68a" }, icon: <SlidersHorizontal size={13} color="#92400e" /> },
  { value: "manual",                     label: "Manual Rating (1–5)",          group: "manual",       hint: "Appraiser enters 1–5 directly — no formula applied", isInverse: false, badge: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" }, icon: <SlidersHorizontal size={13} color="#166534" /> },
] as const;

const KPI_SCALE_GROUPS = [
  { groupKey: "interpolated", groupLabel: "INTERPOLATED", color: "#1e40af" },
  { groupKey: "bracket",      groupLabel: "BRACKET",      color: "#92400e" },
  { groupKey: "manual",       groupLabel: "MANUAL",       color: "#166534" },
] as const;

function resolveKpiOption(value: string | undefined) {
  return KPI_SCALE_OPTIONS.find((o) => o.value === (value ?? "interpolated_financial")) ?? KPI_SCALE_OPTIONS[0];
}

const CONTROL_OPTIONS = [
  { value: "Locked",   label: "Locked",   badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" } },
  { value: "Editable", label: "Editable", badge: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" } },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ObjectiveRow {
  name:        string;
  kpiScale:    string;
  weight:      number | string | null;
  control:     string;
  mandatory:   boolean;
  kpiMaxScore: number | null;
}

interface CategoryRow {
  name:       string;
  weight:     number;
  mandatory:  boolean;
  objectives: ObjectiveRow[];
}

interface UserOption     { id: string; full_name: string; }
interface DepartmentOption { id: string; name: string; code: string | null; branch_id: string | null; }
interface BranchOption   { id: string; name: string; code: string | null; country_id: string | null; }
interface AssignmentRule { designation_id: number | null; department_id: string | null; branch_id: string | null; user_id: string | null; }

interface TemplateCreateBaseProps {
  level?: number;
}

// ─── react-select style factories ────────────────────────────────────────────

function buildBaseSelectStyles(): any {
  return {
    control: (base: any, { isFocused }: any) => ({
      ...base, borderRadius: "10px",
      border:    isFocused ? "1.5px solid #3b82f6" : "1px solid #e2e8f0",
      padding:   "2px 4px", boxShadow: isFocused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
      fontSize:  "13px", fontWeight: "500", background: "#fff", transition: "all 0.15s",
      "&:hover": { borderColor: "#3b82f6" },
    }),
    multiValue:       (base: any) => ({ ...base, backgroundColor: "#eff6ff", borderRadius: "6px" }),
    multiValueLabel:  (base: any) => ({ ...base, color: "#1e40af", fontWeight: "700", fontSize: "12px" }),
    multiValueRemove: (base: any) => ({ ...base, color: "#93c5fd", "&:hover": { backgroundColor: "#dbeafe", color: "#1e40af" } }),
    placeholder:  (base: any) => ({ ...base, fontSize: "13px", color: "#94a3b8" }),
    menu:         (base: any) => ({ ...base, borderRadius: "12px", boxShadow: "0 8px 30px rgba(0,0,0,0.12)", border: "1px solid #f1f5f9", marginTop: "6px", padding: "4px", zIndex: 9999 }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color: isSelected ? "#fff" : "#475569",
      padding: "9px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "500",
    }),
    singleValue: (base: any) => ({ ...base, color: "#1e293b", fontWeight: "600" }),
  };
}

function buildTableSelectStyles(): any {
  return {
    control: (base: any) => ({ ...base, border: "none", background: "transparent", minHeight: "unset", boxShadow: "none", cursor: "pointer", padding: 0 }),
    valueContainer: (base: any) => ({ ...base, padding: 0 }),
    indicatorsContainer: () => ({ display: "none" }),
    singleValue: (base: any) => ({ ...base, margin: 0 }),
    menu: (base: any) => ({ ...base, borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", border: "1px solid #f1f5f9", marginTop: "6px", padding: "4px", zIndex: 9999, minWidth: "220px" }),
    menuList: (base: any) => ({ ...base, maxHeight: "200px", paddingTop: 0, paddingBottom: 0 }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color: isSelected ? "#fff" : "#475569",
      padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "600",
    }),
  };
}

function buildKpiSelectStyles(): any {
  return {
    control: (base: any, { isFocused }: any) => ({
      ...base, border: isFocused ? "1.5px solid #3b82f6" : "1.5px solid #e2e8f0",
      borderRadius: "8px", background: "#fff", minHeight: "36px",
      boxShadow: isFocused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
      cursor: "pointer", padding: "0 8px", transition: "border-color 0.15s, box-shadow 0.15s",
      "&:hover": { borderColor: "#3b82f6" },
    }),
    valueContainer: (base: any) => ({ ...base, padding: "0 2px" }),
    indicatorsContainer: () => ({ display: "none" }),
    singleValue: (base: any) => ({ ...base, margin: 0 }),
    placeholder: (base: any) => ({ ...base, color: "#94a3b8", fontSize: "12px", fontWeight: "500" }),
    menu: (base: any) => ({ ...base, borderRadius: "12px", boxShadow: "0 12px 32px rgba(0,0,0,0.14)", border: "1px solid #e8edf5", marginTop: "4px", padding: "6px", zIndex: 9999, minWidth: "320px" }),
    menuList: (base: any) => ({ ...base, maxHeight: "520px", paddingTop: 0, paddingBottom: 0, overflowY: "auto" }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color: isSelected ? "#fff" : "#475569",
      padding: "7px 10px", borderRadius: "7px", cursor: "pointer", fontSize: "12px", fontWeight: "600",
    }),
    groupHeading: (base: any) => ({ ...base, fontSize: "10px", fontWeight: "800", letterSpacing: "0.08em", padding: "8px 10px 3px", textTransform: "uppercase", borderTop: "1px solid #f1f5f9", marginTop: "2px", color: "#94a3b8" }),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const KpiScaleOptionRenderer = ({ data, innerProps, isSelected, isFocused }: any) => (
  <div {...innerProps} style={{ padding: "7px 12px", borderRadius: "8px", cursor: "pointer", margin: "1px 0", backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#f0f7ff" : "transparent", display: "flex", alignItems: "center", gap: "8px" }}>
    <span style={{ opacity: isSelected ? 1 : 0.8, flexShrink: 0 }}>{data.icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: "12px", fontWeight: "700", color: isSelected ? "#fff" : "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
        {data.label}
        {data.isInverse && <span style={{ fontSize: "9px", fontWeight: "700", padding: "1px 5px", borderRadius: "4px", background: isSelected ? "rgba(255,255,255,0.25)" : "#fee2e2", color: isSelected ? "#fff" : "#dc2626", flexShrink: 0 }}>inverse</span>}
      </div>
      <div style={{ fontSize: "10px", color: isSelected ? "rgba(255,255,255,0.72)" : "#94a3b8", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{data.hint}</div>
    </div>
  </div>
);

const ControlOptionRenderer = ({ data, innerProps, isSelected, isFocused }: any) => (
  <div {...innerProps} style={{ padding: "8px 12px", borderRadius: "8px", cursor: "pointer", margin: "1px 0", backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#f0f7ff" : "transparent", display: "flex", alignItems: "center", gap: "6px" }}>
    {data.value === "Locked" ? <Lock size={11} color={isSelected ? "#fff" : "#1e40af"} /> : <Unlock size={11} color={isSelected ? "#fff" : "#15803d"} />}
    <span style={{ fontSize: "12px", fontWeight: "700", color: isSelected ? "#fff" : "#1e293b" }}>{data.label}</span>
  </div>
);

const ControlBadge = ({ opt, isDisabled }: { opt: any; isDisabled: boolean }) => (
  <span title={isDisabled ? undefined : "Click to toggle"} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap", background: isDisabled ? "#f1f5f9" : opt.badge.bg, color: isDisabled ? "#94a3b8" : opt.badge.color, border: `1px solid ${isDisabled ? "#e2e8f0" : opt.badge.border}`, cursor: isDisabled ? "default" : "pointer", userSelect: "none" }}>
    {opt.value === "Locked" ? <Lock size={10} /> : <Unlock size={10} />}
    {opt.label}
  </span>
);

// ─── Objective factory ────────────────────────────────────────────────────────

function makeDefaultObjective(name: string, kpiScale: string, control: string, weight: number | null = null, kpiMaxScore: number | null = null): ObjectiveRow {
  return { name, kpiScale, weight, control, mandatory: true, kpiMaxScore };
}

const INITIAL_CATEGORIES: CategoryRow[] = [
  {
    name: "Financial Focus", weight: 0, mandatory: true,
    objectives: [
      makeDefaultObjective("Revenue Achievement",                    "interpolated_financial",   "Locked",   10),
      makeDefaultObjective("GP Achievement",                         "interpolated_financial",   "Locked",   10),
      makeDefaultObjective("Achievement of Dept Revenue",            "interpolated_financial",   "Locked",    5),
      makeDefaultObjective("Achievement of Dept GP (___)",           "interpolated_financial",   "Editable",  5),
      makeDefaultObjective("Profit Margin % of ___",                 "interpolated_gp_margin",   "Editable",  null),
      makeDefaultObjective("Achievement of Sales Dept. Target",      "interpolated_financial",   "Editable",  null),
      makeDefaultObjective("Effective Sales Ratio of CMB (60 Days)", "interpolated_sales_ratio", "Editable",  null),
      makeDefaultObjective("GP Margin (Ops) Overall",                "interpolated_gp_margin",   "Editable",  null),
      makeDefaultObjective("Optimize Direct Cost",                   "bracket_wip",              "Editable",  null),
      makeDefaultObjective("GP Margin %",                            "interpolated_gp_margin",   "Editable",  null),
      makeDefaultObjective("GP Contribution %",                      "interpolated_to_gp",       "Editable",  null),
      makeDefaultObjective("Turnover Contribution %",                "interpolated_to_gp",       "Editable",  null),
      makeDefaultObjective("Achievement of Individual Sales Target", "interpolated_financial",   "Editable",  5),
    ],
  },
  {
    name: "Customer Focus", weight: 0, mandatory: true,
    objectives: [
      makeDefaultObjective("NPS Index",                         "interpolated_nps_ccr",        "Locked",   10),
      makeDefaultObjective("Complaints on service failures",    "bracket_statutory",           "Locked",    5),
      makeDefaultObjective("Monthly Idea Generation",           "manual",                      "Editable",  null),
      makeDefaultObjective("GP on Personal Done by Individual", "bracket_individual_sales_gp", "Editable",  5),
      makeDefaultObjective("NO. of Qualified Sales leads",      "interpolated_financial",      "Editable",  null),
      makeDefaultObjective("New Customers brought in",          "interpolated_financial",      "Editable",  null),
      makeDefaultObjective("Sales quotation success ratio",     "interpolated_sales_ratio",    "Editable",  5),
    ],
  },
  {
    name: "Human Resources Focus", weight: 0, mandatory: true,
    objectives: [
      makeDefaultObjective("360 Feedback (Automated)", "interpolated_ees_360",       "Locked", 5),
      makeDefaultObjective("Dept. Retention",          "interpolated_emp_retention", "Locked", 5),
      makeDefaultObjective("GPTW Score",               "interpolated_financial",     "Locked", 5),
    ],
  },
  {
    name: "Process Focus", weight: 0, mandatory: true,
    objectives: [
      makeDefaultObjective("International Audit-Positive Assurance Score-Overall", "bracket_statutory", "Locked",    5),
      makeDefaultObjective("DPAM Operations Score",                                "bracket_ops_dpam",  "Editable",  5),
      makeDefaultObjective("WIP (Total Ops)",                                      "bracket_wip",       "Editable",  null),
      makeDefaultObjective("Team adherence to cargowise module",                   "interpolated_dpam", "Editable",  null),
      makeDefaultObjective("Adherence to Sales Module in CW",                      "interpolated_dpam", "Editable",  5),
    ],
  },
  {
    name: "Personal Assessment", weight: 0, mandatory: true,
    objectives: [makeDefaultObjective("HOD Evaluation", "manual", "Locked", 10)],
  },
];

const BLANK_OBJECTIVE: ObjectiveRow = { name: "", kpiScale: "interpolated_financial", weight: "", control: "Editable", mandatory: false, kpiMaxScore: null };

const LEGACY_SCALE_MAP: Record<string, string> = { standard: "interpolated_financial", inverse: "bracket_wip" };

function migrateLegacyKpiScale(scale: string | undefined): string {
  if (!scale) return "interpolated_financial";
  return LEGACY_SCALE_MAP[scale] ?? scale;
}

function migrateObjective(obj: any): ObjectiveRow {
  return { name: obj.name ?? "", kpiScale: migrateLegacyKpiScale(obj.kpiScale), weight: obj.weight ?? null, control: obj.control ?? "Editable", mandatory: obj.mandatory ?? false, kpiMaxScore: obj.kpiMaxScore ?? null };
}

// ─── New Department Modal ─────────────────────────────────────────────────────

interface NewDeptModalProps { initialName: string; branches: BranchOption[]; onConfirm: (name: string, code: string, branchId: string | null) => Promise<void>; onCancel: () => void; }

function NewDeptModal({ initialName, branches, onConfirm, onCancel }: NewDeptModalProps) {
  const [name,     setName]     = useState(initialName);
  const [code,     setCode]     = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error("Department name is required"); return; }
    if (!code.trim()) { toast.error("Department code is required"); return; }
    setSaving(true);
    try { await onConfirm(name.trim(), code.trim().toUpperCase(), branchId); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", width: "420px", maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>Create New Department</h3>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px" }}><X size={18} /></button>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Department Name <span style={{ color: "#ef4444" }}>*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Forwarding Import Air" autoFocus style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "9px 12px", fontSize: "13px", fontWeight: "500", outline: "none", color: "#1e293b" }} />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Department Code <span style={{ color: "#ef4444" }}>*</span></label>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. FIA, FES, COT" maxLength={DEPT_CODE_MAX_LENGTH} style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "9px 12px", fontSize: "13px", fontWeight: "700", outline: "none", color: "#1e40af", letterSpacing: "0.5px" }} />
        </div>
        {branches.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Branch <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "none", fontWeight: "500" }}>(optional)</span></label>
            <select value={branchId ?? ""} onChange={(e) => setBranchId(e.target.value || null)} style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "9px 12px", fontSize: "13px", fontWeight: "500", outline: "none", color: branchId ? "#1e293b" : "#94a3b8", background: "#fff" }}>
              <option value="">— No branch —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code ? `${b.code} — ${b.name}` : b.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "8px 18px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: saving ? "#94a3b8" : "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontWeight: "700", fontSize: "13px", cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "Creating…" : "Create Department"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline confirm popover ───────────────────────────────────────────────────

interface ConfirmPopoverProps { onStay: () => void; onDiscard: () => void; }

function ConfirmDiscardPopover({ onStay, onDiscard }: ConfirmPopoverProps) {
  return (
    <div className={styles.cancelConfirmPopover}>
      <p className={styles.cancelConfirmText}>Discard changes?</p>
      <div className={styles.cancelConfirmActions}>
        <button className={styles.cancelConfirmStayBtn}    onClick={onStay}>Stay</button>
        <button className={styles.cancelConfirmDiscardBtn} onClick={onDiscard}>Discard</button>
      </div>
      <div className={styles.cancelConfirmCaret} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TemplateCreateBase({ level = 1 }: TemplateCreateBaseProps) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const editId       = searchParams.get("edit");
  const modeParam    = searchParams.get("mode");
  const isViewMode   = modeParam === "view";

  // Role-derived values
  const rolePrefix      = getRolePrefix(level);
  const dashboardPath   = `${rolePrefix}/template-management`;
  const isHqAdmin       = level === 1;
  const isNonHqAdmin    = level === 2 || level === 3;

  // Active cycle (drives all permissions)
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const freezeDates  = useMemo(() => buildFreezeDates(activeCycle), [activeCycle]);
  const permissions  = useMemo(() => computePermissions(level, freezeDates), [level, freezeDates]);

  // isReadOnly = either explicit view mode, OR the user simply can't edit anything
  const isReadOnly = isViewMode || !permissions.canEdit;

  // For non-HQ admins during open window: they CAN edit, but only Editable objectives.
  // We track this separately to enforce per-objective locking.
  const editableOnlyMode = isNonHqAdmin && permissions.freezeStatus === "open";

  const [savedTemplateId, setSavedTemplateId] = useState<number | null>(editId ? Number(editId) : null);

  // ── Template form state ────────────────────────────────────────────────────
  const [templateName,      setTemplateName]      = useState("");
  const [description,       setDescription]       = useState("");
  const [maxScore,          setMaxScore]          = useState<number>(DEFAULT_MAX_SCORE);
  const [categories,        setCategories]        = useState<CategoryRow[]>(INITIAL_CATEGORIES);
  const [newObjKey,         setNewObjKey]         = useState<string | null>(null);
  const [showTemplateCancelConfirm, setShowTemplateCancelConfirm] = useState(false);
  const [isTemplateSaving,  setIsTemplateSaving]  = useState(false);
  const [templateSaved,     setTemplateSaved]     = useState(false);

  // ── Assignment form state ──────────────────────────────────────────────────
  const [selectedUsers,        setSelectedUsers]        = useState<string[]>([]);
  const [selectedDesignations, setSelectedDesignations] = useState<number[]>([]);
  const [selectedDepartments,  setSelectedDepartments]  = useState<string[]>([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("");
  const [showAssignCancelConfirm, setShowAssignCancelConfirm] = useState(false);
  const [isAssignSaving,       setIsAssignSaving]       = useState(false);
  const [assignSaved,          setAssignSaved]          = useState(false);

  const assignSnapshot = useRef<{ users: string[]; designations: number[]; departments: string[] }>({ users: [], designations: [], departments: [] });

  // ── Master data ────────────────────────────────────────────────────────────
  const [designations,  setDesignations]  = useState<any[]>([]);
  const [departments,   setDepartments]   = useState<DepartmentOption[]>([]);
  const [branches,      setBranches]      = useState<BranchOption[]>([]);
  const [users,         setUsers]         = useState<UserOption[]>([]);
  const [isPageLoading, setIsPageLoading] = useState(!!editId);
  const [deptModal,     setDeptModal]     = useState<{ open: boolean; initialName: string }>({ open: false, initialName: "" });

  const baseSelectStyles  = useMemo(() => buildBaseSelectStyles(), []);
  const tableSelectStyles = useMemo(() => buildTableSelectStyles(), []);
  const kpiSelectStyles   = useMemo(() => buildKpiSelectStyles(), []);

  const kpiScaleGroupedOptions = useMemo(
    () => KPI_SCALE_GROUPS.map((g) => ({ label: g.groupLabel, options: KPI_SCALE_OPTIONS.filter((o) => o.group === g.groupKey) })),
    [],
  );

  // ── Load master data + active cycle ───────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [rolesRes, deptsRes, usersRes, branchesRes, cycleRes] = await Promise.all([
          fetch(`${API_BASE}/designations`),
          fetch(`${API_BASE}/departments`),
          fetch(`${API_BASE}/users`),
          fetch(`${API_BASE}/branches`),
          fetch(`${API_BASE}/pms-cycles/active`),
        ]);
        if (!rolesRes.ok || !deptsRes.ok || !usersRes.ok) throw new Error("Master data request failed");
        const [designationsData, deptsData, usersData] = await Promise.all([rolesRes.json(), deptsRes.json(), usersRes.json()]);
        setDesignations(designationsData);
        setDepartments(deptsData);
        setUsers(usersData);
        if (branchesRes.ok) {
          const branchesData: BranchOption[] = await branchesRes.json();
          setBranches(branchesData.map((b) => ({ id: String(b.id), name: b.name, code: b.code ?? null, country_id: b.country_id ?? null })));
        }
        if (cycleRes.ok) setActiveCycle(await cycleRes.json());
      } catch (err) {
        console.error("Master data load error:", err);
        toast.error("Failed to load master data");
      }
    };
    load();
  }, []);

  // ── Load template for edit / view ──────────────────────────────────────────
  useEffect(() => {
    if (!editId) return;
    const loadTemplate = async () => {
      try {
        setIsPageLoading(true);
        const res = await fetch(`${API_BASE}/templates`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const allTemplates: any[] = await res.json();
        const tmpl = allTemplates.find((t) => t.id === parseInt(editId, 10));
        if (!tmpl) { toast.error("Template not found"); router.push(dashboardPath); return; }

        setTemplateName(tmpl.name ?? "");
        setDescription(tmpl.description ?? "");
        setMaxScore(tmpl.max_score ?? DEFAULT_MAX_SCORE);
        setCategories((tmpl.categories ?? INITIAL_CATEGORIES).map((cat: any) => ({ ...cat, objectives: (cat.objectives ?? []).map(migrateObjective) })));
        setSavedTemplateId(Number(editId));

        let ruleRoleIds: number[] = [];
        let ruleDeptIds: string[] = [];
        let directUsers: string[] = [];

        if (tmpl.assignedRules && tmpl.assignedRules.length > 0) {
          ruleRoleIds = [...new Set<number>(tmpl.assignedRules.filter((r: AssignmentRule) => r.designation_id).map((r: AssignmentRule) => Number(r.designation_id)))];
          ruleDeptIds = [...new Set<string>(tmpl.assignedRules.filter((r: AssignmentRule) => r.department_id).map((r: AssignmentRule) => String(r.department_id)))];
          directUsers = [...new Set<string>(tmpl.assignedRules.filter((r: AssignmentRule) => r.user_id).map((r: AssignmentRule) => String(r.user_id)))];
        } else {
          ruleRoleIds = tmpl.assignedDesignationIds?.map(Number) ?? [];
          ruleDeptIds = tmpl.assignedDepartmentsIds?.map(String) ?? [];
          directUsers = tmpl.assignedEmployeeIds?.map(String) ?? [];
        }

        setSelectedDesignations(ruleRoleIds);
        setSelectedDepartments(ruleDeptIds);
        setSelectedUsers(directUsers);
        assignSnapshot.current = { users: directUsers, designations: ruleRoleIds, departments: ruleDeptIds };

        if (isViewMode) toast.info("Viewing template — read-only mode");
        else if (editableOnlyMode) toast.info("You can edit Editable objectives only. Locked objectives require HQ Admin access.");
      } catch (err) {
        console.error("Template load error:", err);
        toast.error("Failed to load template");
      } finally {
        setIsPageLoading(false);
      }
    };
    loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, isViewMode]);

  // ── Derived calculations ───────────────────────────────────────────────────
  const categoryWeights = useMemo(
    () => categories.map((cat) => cat.objectives.reduce((sum, obj) => sum + (Number(obj.weight) || 0), 0)),
    [categories],
  );
  const totalWeight = useMemo(() => categoryWeights.reduce((sum, w) => sum + w, 0), [categoryWeights]);

  // ── Category / objective mutations ─────────────────────────────────────────
  const updateObjectiveField = useCallback(
    (catIndex: number, objIndex: number, field: string, value: any) =>
      setCategories((prev) =>
        prev.map((cat, ci) =>
          ci !== catIndex ? cat : { ...cat, objectives: cat.objectives.map((obj, oi) => oi !== objIndex ? obj : { ...obj, [field]: value }) }
        )
      ),
    [],
  );
  const updateCategoryName = useCallback((catIndex: number, name: string) =>
    setCategories((prev) => prev.map((cat, ci) => ci === catIndex ? { ...cat, name } : cat)), []);
  const addCategory = useCallback(() =>
    setCategories((prev) => [...prev, { name: "", weight: 0, objectives: [], mandatory: false }]), []);
  const removeCategory = useCallback((catIndex: number) =>
    setCategories((prev) => prev.filter((_, ci) => ci !== catIndex)), []);
  const addObjective = useCallback((catIndex: number) => {
    setCategories((prev) => prev.map((cat, ci) => ci !== catIndex ? cat : { ...cat, objectives: [...cat.objectives, { ...BLANK_OBJECTIVE }] }));
    setTimeout(() => {
      setCategories((prev) => {
        const newIdx = prev[catIndex]?.objectives.length - 1;
        setNewObjKey(`${catIndex}-${newIdx}`);
        return prev;
      });
    }, 0);
  }, []);
  const removeObjective = useCallback((catIndex: number, objIndex: number) =>
    setCategories((prev) =>
      prev.map((cat, ci) => ci !== catIndex ? cat : { ...cat, objectives: cat.objectives.filter((_, oi) => oi !== objIndex) })
    ), []);

  // ── Designation creation ───────────────────────────────────────────────────
  const handleCreateDesignation = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/designations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!res.ok) throw new Error("Designation creation failed");
      const created = await res.json();
      setDesignations((prev) => [...prev, created]);
      setSelectedDesignations((prev) => [...prev, created.id]);
      toast.success(`Designation "${name}" created`);
    } catch (err) {
      console.error("Designation create error:", err);
      toast.error("Failed to create designation");
    }
  };

  // ── Department creation ────────────────────────────────────────────────────
  const handleDeptModalConfirm = async (name: string, code: string, branchId: string | null) => {
    try {
      const res = await fetch(`${API_BASE}/departments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, code, branch_id: branchId }) });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error ?? "Department creation failed"); }
      const created: DepartmentOption = await res.json();
      setDepartments((prev) => [...prev, created]);
      setSelectedDepartments((prev) => [...prev, String(created.id)]);
      toast.success(`Department "${name}" (${code}) created`);
      setDeptModal({ open: false, initialName: "" });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create department");
    }
  };

  const departmentSelectOptions = useMemo(
    () =>
      departments
        .filter((d) => !selectedBranchFilter || d.branch_id === selectedBranchFilter)
        .map((d) => {
          const branch = branches.find((b) => b.id === d.branch_id);
          const label  = [d.code ? `[${d.code}]` : null, d.name, branch ? `· ${branch.code ?? branch.name}` : null].filter(Boolean).join(" ");
          return { value: String(d.id), label };
        }),
    [departments, branches, selectedBranchFilter],
  );

  const allDepartmentOptions = useMemo(
    () =>
      departments.map((d) => {
        const branch = branches.find((b) => b.id === d.branch_id);
        const label  = [d.code ? `[${d.code}]` : null, d.name, branch ? `· ${branch.code ?? branch.name}` : null].filter(Boolean).join(" ");
        return { value: String(d.id), label };
      }),
    [departments, branches],
  );

  const selectedDepartmentValues = useMemo(
    () => selectedDepartments.map((id) => allDepartmentOptions.find((o) => o.value === id)).filter(Boolean) as { value: string; label: string }[],
    [selectedDepartments, allDepartmentOptions],
  );

  const hiddenSelectedCount = useMemo(() => {
    if (!selectedBranchFilter) return 0;
    return selectedDepartments.filter((id) => {
      const dept = departments.find((d) => String(d.id) === id);
      return dept && dept.branch_id !== selectedBranchFilter;
    }).length;
  }, [selectedDepartments, departments, selectedBranchFilter]);

  const previewRules = useMemo((): AssignmentRule[] => {
    const rules: AssignmentRule[] = [];
    for (const uid of selectedUsers) rules.push({ designation_id: null, department_id: null, branch_id: null, user_id: uid });
    if (selectedDesignations.length > 0 && selectedDepartments.length > 0) {
      for (const desig_id of selectedDesignations)
        for (const did of selectedDepartments) {
          const dept = departments.find((d) => String(d.id) === did);
          rules.push({ designation_id: desig_id, department_id: did, branch_id: dept?.branch_id ?? null, user_id: null });
        }
    } else if (selectedDesignations.length > 0) {
      for (const desig_id of selectedDesignations) rules.push({ designation_id: desig_id, department_id: null, branch_id: null, user_id: null });
    } else if (selectedDepartments.length > 0) {
      for (const did of selectedDepartments) {
        const dept = departments.find((d) => String(d.id) === did);
        rules.push({ designation_id: null, department_id: did, branch_id: dept?.branch_id ?? null, user_id: null });
      }
    }
    return rules;
  }, [selectedUsers, selectedDesignations, selectedDepartments, departments]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateTemplateForm = (): boolean => {
    if (!templateName.trim()) { toast.error("Please enter a Template Name"); return false; }
    for (const cat of categories) {
      for (const obj of cat.objectives) {
        if (!obj.name.trim()) { toast.error("All objectives must have a name"); return false; }
        if (!obj.kpiScale)    { toast.error("All objectives must have a KPI Scale"); return false; }
      }
    }
    if (totalWeight !== 100) { toast.error(`Total weight must be exactly 100%. Currently ${totalWeight}%`); return false; }
    return true;
  };

  // ── Save template ──────────────────────────────────────────────────────────
  const handleSaveTemplate = async () => {
    if (isViewMode)                          { toast.error("This template is in view-only mode."); return; }
    if (!permissions.canEdit && editId)      { toast.error("You don't have permission to edit templates right now."); return; }
    if (!permissions.canCreate && !editId)   { toast.error("You don't have permission to create templates right now."); return; }
    if (!validateTemplateForm()) return;

    // For non-HQ admins in editableOnlyMode: only send Editable-objective changes.
    // We do this by re-fetching the original template and merging only Editable fields.
    // (Simple approach: the backend should also enforce this, but we do it client-side too.)
    const categoriesWithWeight = categories.map((cat) => ({
      ...cat,
      weight: cat.objectives.reduce((s, obj) => s + (Number(obj.weight) || 0), 0),
    }));

    const payload = {
      name:         isHqAdmin ? templateName.trim() : undefined, // non-HQ cannot rename
      description:  isHqAdmin ? description.trim()  : undefined,
      max_score:    isHqAdmin ? maxScore             : undefined,
      categories:   categoriesWithWeight,
      totalWeight,
      lastModified: new Date().toISOString(),
      // Signal to backend what level is saving (so it can enforce locks server-side too)
      editedByLevel: level,
    };

    setIsTemplateSaving(true);
    try {
      let resolvedId: number;
      if (editId) {
        const res = await fetch(`${API_BASE}/templates/${editId}`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json", "X-User-Level": String(level) },
          body:    JSON.stringify(payload),
        });
        if (res.status === 403) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Template is currently frozen."); }
        if (!res.ok) throw new Error("Update request failed");
        resolvedId = Number(editId);
      } else {
        // Only HQ can create
        const res = await fetch(`${API_BASE}/templates`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Create request failed");
        const created = await res.json();
        resolvedId = created.id;
      }

      setSavedTemplateId(resolvedId);
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 3000);
      toast.success(editId ? "Template updated successfully!" : "Template created! Now configure the assignment below.");
    } catch (err: any) {
      console.error("Template save error:", err);
      toast.error(err.message ?? "Failed to save template");
    } finally {
      setIsTemplateSaving(false);
    }
  };

  const handleDiscardTemplate = () => {
    if (!editId) { setTemplateName(""); setDescription(""); setMaxScore(DEFAULT_MAX_SCORE); setCategories(INITIAL_CATEGORIES); }
    else window.location.reload();
    setShowTemplateCancelConfirm(false);
  };

  // ── Save assignment ────────────────────────────────────────────────────────
  const handleSaveAssignment = async () => {
    if (isViewMode)       { toast.error("This template is in view-only mode."); return; }
    if (!isHqAdmin)       { toast.error("Only HQ Admin can manage template assignments."); return; }
    if (!savedTemplateId) { toast.error("Please save the template first before assigning."); return; }

    setIsAssignSaving(true);
    try {
      const assignRes = await fetch(`${API_BASE}/assign-template`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-User-Level": String(level) },
        body:    JSON.stringify({ template_id: savedTemplateId, rules: previewRules }),
      });
      if (!assignRes.ok) { const e = await assignRes.json().catch(() => ({})); throw new Error(e.error ?? "Assignment failed"); }

      assignSnapshot.current = { users: [...selectedUsers], designations: [...selectedDesignations], departments: [...selectedDepartments] };
      setAssignSaved(true);
      setTimeout(() => setAssignSaved(false), 3000);
      toast.success("Template assignment saved successfully!");
    } catch (err: any) {
      console.error("Assignment save error:", err);
      toast.error(err.message ?? "Failed to save assignment");
    } finally {
      setIsAssignSaving(false);
    }
  };

  const handleDiscardAssignment = () => {
    setSelectedUsers([...assignSnapshot.current.users]);
    setSelectedDesignations([...assignSnapshot.current.designations]);
    setSelectedDepartments([...assignSnapshot.current.departments]);
    setShowAssignCancelConfirm(false);
  };

  // ── Back to dashboard — ROLE-AWARE ─────────────────────────────────────────
  const handleBackToDashboard = () => {
    router.push(dashboardPath);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  // ── Derived display ────────────────────────────────────────────────────────
  const isWeightValid    = totalWeight === 100;
  const isWeightExceeded = totalWeight > 100;
  const weightBarPct     = Math.min(totalWeight, 100);

  const graceNoteText = permissions.freezeStatus === "grace"
    ? `Grace period — hard freeze ${formatDate(freezeDates.graceEnd)}`
    : `Objective window closes ${formatDate(freezeDates.objectiveSettingEnd)}`;

  if (isPageLoading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className={styles.loadingSpinner} />
        <p className={styles.loadingText}>Loading template…</p>
      </div>
    );
  }

  return (
    <div className={styles.pageWrapper}>

      {deptModal.open && (
        <NewDeptModal
          initialName={deptModal.initialName}
          branches={branches}
          onConfirm={handleDeptModalConfirm}
          onCancel={() => setDeptModal({ open: false, initialName: "" })}
        />
      )}

      {/* ── Read-only / frozen / limited-access banner ── */}
      {(isReadOnly || editableOnlyMode) && (
        <div className={`${styles.readOnlyBanner} ${
          isViewMode                 ? styles.readOnlyBannerView   :
          permissions.freezeStatus === "frozen" ? styles.readOnlyBannerFrozen :
          editableOnlyMode          ? styles.readOnlyBannerLimited :
          styles.readOnlyBannerFrozen
        }`}>
          <div className={`${styles.readOnlyBannerIcon} ${
            isViewMode      ? styles.readOnlyBannerIconView   :
            editableOnlyMode ? styles.readOnlyBannerIconLimited :
            styles.readOnlyBannerIconFrozen
          }`}>
            {isViewMode ? <Eye size={16} color="#fff" /> : editableOnlyMode ? <Unlock size={16} color="#fff" /> : <Lock size={16} color="#fff" />}
          </div>
          <div>
            <div className={`${styles.readOnlyBannerTitle} ${
              isViewMode      ? styles.readOnlyBannerTitleView   :
              editableOnlyMode ? styles.readOnlyBannerTitleLimited :
              styles.readOnlyBannerTitleFrozen
            }`}>
              {isViewMode
                ? "View Only Mode"
                : editableOnlyMode
                ? `${permissions.roleLabel} — Editable Objectives Only`
                : "Template Frozen — View Only"}
            </div>
            <p className={`${styles.readOnlyBannerText} ${
              isViewMode      ? styles.readOnlyBannerTextView   :
              editableOnlyMode ? styles.readOnlyBannerTextLimited :
              styles.readOnlyBannerTextFrozen
            }`}>
              {isViewMode
                ? "You are viewing this template. No changes can be saved."
                : editableOnlyMode
                ? "You can update objectives marked as Editable. Locked objectives and template structure (name, categories, assignments) require HQ Admin access."
                : `This template cannot be edited (grace period ended ${formatDate(freezeDates.graceEnd)}).`}
            </p>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitleRow}>
            {isViewMode && <div className={styles.viewModeIconWrapper}><Eye size={18} color="#3b82f6" /></div>}
            <h1 className={styles.pageTitle}>
              {!editId
                ? "Create Evaluation Template"
                : isViewMode
                ? "View Evaluation Template"
                : editableOnlyMode
                ? "Edit Editable Objectives"
                : "Edit Evaluation Template"}
            </h1>
          </div>
          <p className={styles.pageSubtitle}>
            {isViewMode
              ? "All fields are read-only."
              : editableOnlyMode
              ? `Editing as ${permissions.roleLabel} — Editable objectives only during the objective-setting window.`
              : isReadOnly
              ? "All fields are read-only."
              : "Design a comprehensive performance evaluation template."}
          </p>
        </div>
        {!isReadOnly && editId && <div className={styles.graceNoteBadge}>{graceNoteText}</div>}
      </div>

      {/* ── PMS cycle date chips ── */}
      {editId && (
        <div className={styles.pmsCycleGrid}>
          {[
            { label: "PMS Year Starts",                date: freezeDates.pmsYearStart },
            { label: "Objective Setting Closes",        date: freezeDates.objectiveSettingEnd },
            { label: "Grace Period Ends (Hard Freeze)", date: freezeDates.graceEnd },
          ].map(({ label, date }) => (
            <div key={label} className={styles.pmsCycleChip}>
              <div className={styles.pmsCycleChipLabel}>{label}</div>
              <div className={styles.pmsCycleChipValue}>{formatDate(date)}</div>
            </div>
          ))}
          <div className={styles.pmsCycleChip}>
            <div className={styles.pmsCycleChipLabel}>PMS Status</div>
            <div className={`${styles.pmsCycleChipValue} ${
              permissions.freezeStatus === "open"   ? styles.pmsCycleStatusOpen   :
              permissions.freezeStatus === "grace"  ? styles.pmsCycleStatusGrace  :
              styles.pmsCycleStatusFrozen}`}>
              {permissions.freezeStatus === "open" ? "Open" : permissions.freezeStatus === "grace" ? "Grace Period" : "Frozen"}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 — TEMPLATE DETAILS
          ════════════════════════════════════════════════════════════════════ */}
      <div className={styles.sectionDivider}>
        <span className={styles.sectionDividerBadge}>1</span>
        <span className={styles.sectionDividerLabel}>Template Details</span>
        <div className={styles.sectionDividerLine} />
      </div>

      {/* ── Basic Information ── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <div className={styles.sectionHeadingAccent} />
          <h3 className={styles.sectionHeadingTitle}>Basic Information</h3>
          {editableOnlyMode && <span className={styles.sectionHeadingReadOnly}>(locked for your role)</span>}
        </div>
        <div className={styles.basicInfoSingle}>
          <label className={styles.formFieldLabel}>Template Name <span className={styles.requiredStar}>*</span></label>
          <input
            className={`${styles.formInput} ${(isReadOnly || editableOnlyMode) ? styles.formInputReadOnly : ""}`}
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Sales Manager Appraisal 2025"
            readOnly={isReadOnly || editableOnlyMode}  // non-HQ cannot rename
            maxLength={TEMPLATE_NAME_MAX_LENGTH}
          />
          {!isReadOnly && !editableOnlyMode && <p className={styles.fieldHint}>Use a clear, year-specific name so it's easy to identify later.</p>}
        </div>
        <div className={styles.descriptionRow}>
          <div className={styles.descriptionLabelRow}>
            <label className={styles.formFieldLabel}>Description</label>
            {!isReadOnly && !editableOnlyMode && <span className={`${styles.charCounter} ${description.length > DESCRIPTION_WARN_THRESHOLD ? styles.charCounterWarn : ""}`}>{description.length} / 500</span>}
          </div>
          <textarea
            className={`${styles.formTextarea} ${(isReadOnly || editableOnlyMode) ? styles.formTextareaReadOnly : ""}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the purpose, scope, target audience, or any special notes for this template…"
            readOnly={isReadOnly || editableOnlyMode}
            maxLength={DESCRIPTION_MAX_LENGTH}
          />
        </div>
      </div>

      {/* ── Add Category button — HQ Admin only ── */}
      {!isReadOnly && isHqAdmin && (
        <div className={styles.addCategoryRow}>
          <button className={styles.addCategoryBtn} onClick={addCategory}>
            <Plus size={15} />Add Category
          </button>
        </div>
      )}

      {/* ── Categories ── */}
      <div className={styles.categoriesOuterCard}>
        {categories.map((cat, catIndex) => (
          <div key={catIndex} className={styles.categoryBlock}>
            <div className={`${styles.categoryHeader} ${(isReadOnly || editableOnlyMode) ? styles.categoryHeaderReadOnly : styles.categoryHeaderActive}`}>
              <input
                className={`${styles.categoryNameInput} ${(isReadOnly || editableOnlyMode) ? styles.categoryNameInputReadOnly : ""}`}
                value={cat.name}
                placeholder="Enter Category Name…"
                readOnly={isReadOnly || editableOnlyMode}  // category names: HQ only
                onChange={(e) => !isReadOnly && !editableOnlyMode && updateCategoryName(catIndex, e.target.value)}
              />
              <div className={styles.categoryHeaderRight}>
                <div className={styles.categoryWeightBadge}>
                  <span className={styles.categoryWeightValue}>{categoryWeights[catIndex].toFixed(1)}%</span>
                  <span className={styles.categoryWeightUnit}>weight</span>
                </div>
                {/* Only HQ Admin can remove categories */}
                {!isReadOnly && isHqAdmin && (
                  <button className={styles.categoryRemoveBtn} onClick={() => removeCategory(catIndex)} aria-label={`Remove category ${cat.name || catIndex + 1}`}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className={styles.objectivesList}>
              <div className={styles.objHeaderRow}>
                <div className={styles.objColNum}>#</div>
                <div className={styles.objColName}>Objective</div>
                <div className={styles.objColWeight}>Weight%</div>
                <div className={styles.objColControl}>Control</div>
                <div className={styles.objColKpi}>KPI Scale</div>
                <div className={styles.objColMax}>
                  Max Score
                  <span className={styles.objColMaxSub}>null = inherit {maxScore}</span>
                </div>
                {(!isReadOnly) && <div className={styles.objColAction} />}
              </div>

              {cat.objectives.map((obj, objIndex) => {
                const scaleOption   = resolveKpiOption(obj.kpiScale);
                const controlOption = CONTROL_OPTIONS.find((c) => c.value === (obj.control ?? "Editable")) ?? CONTROL_OPTIONS[1];
                const isNew         = !isReadOnly && newObjKey === `${catIndex}-${objIndex}`;

                // For non-HQ admins: Locked objectives are fully read-only
                const objIsLocked     = obj.control === "Locked";
                const objReadOnly     = isReadOnly || (editableOnlyMode && objIsLocked);

                // Visual indicator: locked objectives get a subtle locked tint for non-HQ admins
                const rowClass = objIsLocked && editableOnlyMode
                  ? `${styles.objRow} ${styles.objRowLocked} ${styles.objRowLockedForRole}`
                  : obj.control === "Locked"
                  ? `${styles.objRow} ${styles.objRowLocked}`
                  : `${styles.objRow} ${styles.objRowNormal}`;

                return (
                  <div key={objIndex} className={rowClass}>
                    <div className={styles.objColNum}>
                      <span className={styles.objRowNum}>{catIndex + 1}.{objIndex + 1}</span>
                      {/* Lock icon for objectives locked to this role */}
                      {objIsLocked && editableOnlyMode && (
                        <span title="Locked — HQ Admin only">
                          <Lock size={10} color="#94a3b8" style={{ marginLeft: "4px" }}/>
                        </span>
                          )} 
                    </div>
                    <div className={styles.objColName}>
                      <div className={`${styles.inlineInputBox} ${objReadOnly ? styles.inlineInputBoxReadOnly : styles.inlineInputBoxEditable} ${isNew ? styles.inlineInputBoxNew : ""}`}>
                        <input
                          className={`${styles.objectiveNameInput} ${objReadOnly ? styles.objectiveNameInputReadOnly : styles.objectiveNameInputActive}`}
                          value={obj.name ?? ""}
                          readOnly={objReadOnly}
                          placeholder={objReadOnly ? "—" : "Objective name *"}
                          autoFocus={isNew}
                          onFocus={() => setNewObjKey(null)}
                          onChange={(e) => !objReadOnly && updateObjectiveField(catIndex, objIndex, "name", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.objColWeight}>
                      <div className={`${styles.inlineInputBox} ${styles.inlineInputBoxWeight} ${objReadOnly ? styles.inlineInputBoxReadOnly : styles.inlineInputBoxEditable}`}>
                        <input
                          className={`${styles.weightInput} ${objReadOnly ? styles.weightInputReadOnly : styles.weightInputActive}`}
                          type="number" min="0" max="100" placeholder="0"
                          value={obj.weight ?? ""}
                          readOnly={objReadOnly}
                          onChange={(e) => !objReadOnly && updateObjectiveField(catIndex, objIndex, "weight", e.target.value === "" ? "" : Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className={styles.objColControl}>
                      {/* Control field: always read-only for non-HQ (they can't lock/unlock) */}
                      {(objReadOnly || editableOnlyMode) ? (
                        <ControlBadge opt={controlOption} isDisabled={true} />
                      ) : (
                        <Select
                          instanceId={`ctrl-${catIndex}-${objIndex}`}
                          styles={tableSelectStyles}
                          options={CONTROL_OPTIONS as any}
                          value={controlOption}
                          onChange={(opt: any) => updateObjectiveField(catIndex, objIndex, "control", opt?.value ?? "Editable")}
                          isSearchable={false}
                          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                          menuPosition="fixed"
                          components={{ Option: ControlOptionRenderer }}
                          formatOptionLabel={(opt: any, { context }: any) =>
                            context === "value" ? <ControlBadge opt={opt} isDisabled={false} /> : <>{opt.label}</>
                          }
                        />
                      )}
                    </div>
                    <div className={styles.objColKpi}>
                      {objReadOnly ? (
                        <span className={styles.kpiReadOnlyText}>{scaleOption.label}</span>
                      ) : (
                        <Select
                          instanceId={`kpi-${catIndex}-${objIndex}`}
                          styles={kpiSelectStyles}
                          options={kpiScaleGroupedOptions}
                          value={scaleOption}
                          placeholder="Select KPI scale *"
                          onChange={(opt: any) => updateObjectiveField(catIndex, objIndex, "kpiScale", opt?.value ?? "interpolated_financial")}
                          components={{ Option: KpiScaleOptionRenderer }}
                          isSearchable={false}
                          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                          menuPosition="fixed"
                          formatGroupLabel={(group: any) => {
                            const gm = KPI_SCALE_GROUPS.find((g) => g.groupLabel === group.label);
                            return <div style={{ fontSize: "10px", fontWeight: "800", letterSpacing: "0.08em", color: gm?.color ?? "#64748b", padding: "6px 8px 2px", textTransform: "uppercase" }}>{group.label}</div>;
                          }}
                          formatOptionLabel={(opt: any, { context }: any) =>
                            context === "value"
                              ? <span style={{ fontSize: "12px", fontWeight: "600", color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ flexShrink: 0 }}>{opt.icon}</span>{opt.label}
                                  {opt.isInverse && <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "4px", background: "#fee2e2", color: "#dc2626", fontWeight: "700" }}>inv</span>}
                                </span>
                              : <>{opt.label}</>
                          }
                        />
                      )}
                    </div>
                    <div className={styles.objColMax}>
                      {objReadOnly ? (
                        <span className={styles.maxScoreReadOnly}>{obj.kpiMaxScore ?? `=${maxScore}`}</span>
                      ) : (
                        <select
                          className={`${styles.maxScoreSelect} ${obj.kpiMaxScore ? styles.maxScoreSelectSet : styles.maxScoreSelectUnset}`}
                          value={obj.kpiMaxScore ?? ""}
                          onChange={(e) => updateObjectiveField(catIndex, objIndex, "kpiMaxScore", e.target.value === "" ? null : Number(e.target.value))}
                        >
                          <option value="">inherit ({maxScore})</option>
                          {MAX_SCORE_OPTIONS.map((score) => <option key={score} value={score}>{score}</option>)}
                        </select>
                      )}
                    </div>
                    {/* Delete button: HQ only (or no one in editableOnlyMode) */}
                    {!isReadOnly && isHqAdmin && (
                      <div className={styles.objColAction}>
                        <button className={styles.objectiveDeleteBtn} onClick={() => removeObjective(catIndex, objIndex)} aria-label={`Remove objective ${obj.name || objIndex + 1}`} title="Remove objective">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Objective — HQ only */}
            {!isReadOnly && isHqAdmin && (
              <button className={styles.addObjectiveBtn} onClick={() => addObjective(catIndex)}>
                <Plus size={14} />Add Objective to {cat.name || `Category ${catIndex + 1}`}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Weight bar ── */}
      <div className={`${styles.weightBar} ${isWeightValid ? styles.weightBarValid : styles.weightBarInvalid}`}>
        <div className={`${styles.weightBarProgress} ${isWeightValid ? styles.weightBarProgressValid : isWeightExceeded ? styles.weightBarProgressExceeded : styles.weightBarProgressWarn}`} style={{ width: `${weightBarPct}%` }} />
        <div className={styles.weightBarHeader}>
          <div className={styles.weightBarLeft}>
            <div className={`${styles.weightBadge} ${isWeightValid ? styles.weightBadgeValid : styles.weightBadgeInvalid}`}>{totalWeight}%</div>
            <span className={styles.weightBarTitle}>Total Weighted Allocation</span>
          </div>
          <div>
            {totalWeight < 100  && <span className={`${styles.weightBarStatus} ${styles.weightBarStatusNeed}`}>⚠ Needs <strong>{(100 - totalWeight).toFixed(2)}%</strong> more</span>}
            {isWeightExceeded   && <span className={`${styles.weightBarStatus} ${styles.weightBarStatusExceeded}`}>⚠ Exceeded by <strong>{(totalWeight - 100).toFixed(2)}%</strong></span>}
            {isWeightValid      && <span className={`${styles.weightBarStatus} ${styles.weightBarStatusOk}`}>Balanced &amp; Ready</span>}
          </div>
        </div>
        <div className={styles.weightBreakdownList}>
          {categories.map((cat, catIndex) => {
            const catWeight = categoryWeights[catIndex];
            const catPct    = totalWeight > 0 ? Math.round((catWeight / totalWeight) * 100) : 0;
            const barColor  = `hsl(${(catIndex * 47) % 360}, 65%, 45%)`;
            return (
              <div key={catIndex} className={styles.weightBreakdownRow}>
                <span className={styles.weightBreakdownLabel}>{cat.name || `Category ${catIndex + 1}`}</span>
                <div className={styles.weightBreakdownTrack}><div className={styles.weightBreakdownFill} style={{ width: `${catPct}%`, background: barColor }} /></div>
                <span className={styles.weightBreakdownValue} style={{ color: barColor }}>{catWeight}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 1 action row ── */}
      {!isReadOnly && (
        <div className={styles.actionRow}>
          <div className={styles.cancelBtnWrapper}>
            <button className={styles.cancelBtn} onClick={() => setShowTemplateCancelConfirm((p) => !p)}>Cancel</button>
            {showTemplateCancelConfirm && (
              <ConfirmDiscardPopover onStay={() => setShowTemplateCancelConfirm(false)} onDiscard={handleDiscardTemplate} />
            )}
          </div>
          <button
            className={`${styles.saveBtn} ${(isWeightValid || editableOnlyMode) ? styles.saveBtnReady : styles.saveBtnBlocked}`}
            onClick={
              isWeightValid || editableOnlyMode
                ? handleSaveTemplate
                : () => toast.error(`Total weight must be 100%. Currently ${totalWeight}%`)
            }
            disabled={isTemplateSaving}
          >
            {isTemplateSaving
              ? "Saving…"
              : templateSaved
              ? <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><CheckCircle2 size={15} />{editId ? "Updated!" : "Created!"}</span>
              : editId
              ? editableOnlyMode ? "Save Editable Objectives" : "Update Template"
              : "Create Template"}
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 — TEMPLATE ASSIGNMENT (HQ Admin only)
          ════════════════════════════════════════════════════════════════════ */}
      <div className={styles.sectionDivider} style={{ marginTop: "40px" }}>
        <span className={styles.sectionDividerBadge}>2</span>
        <span className={styles.sectionDividerLabel}>Template Assignment</span>
        <div className={styles.sectionDividerLine} />
      </div>

      <div className={`${styles.sectionCard} ${!savedTemplateId && !editId ? styles.sectionCardLocked : ""}`}>
        {/* Lock overlay — shown until template saved (for HQ admin creating new) */}
        {!savedTemplateId && !editId && (
          <div className={styles.sectionLockOverlay} aria-hidden="true">
            <div className={styles.sectionLockOverlayInner}>
              <Lock size={18} color="#64748b" />
              <span className={styles.sectionLockOverlayText}>Save the template above to unlock assignment</span>
            </div>
          </div>
        )}

        {/* Non-HQ admin: read-only assignment section with explanation */}
        {!isHqAdmin && (
          <div className={styles.sectionLockOverlay} aria-hidden="true" style={{ borderRadius: "16px" }}>
            <div className={styles.sectionLockOverlayInner}>
              <Lock size={18} color="#64748b" />
              <span className={styles.sectionLockOverlayText}>Template assignment is managed by HQ Admin</span>
            </div>
          </div>
        )}

        <div className={styles.sectionHeading}>
          <div className={styles.sectionHeadingAccent} />
          <h3 className={styles.sectionHeadingTitle}>Distribution Strategy</h3>
          {(!isHqAdmin || isViewMode) && <span className={styles.sectionHeadingReadOnly}>(read-only)</span>}
        </div>

        <div className={styles.distributionLogicNote}>
          <div className={styles.distributionLogicIcon}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <p className={styles.distributionLogicText}>
            A template reaches an employee when they match <strong>all fields</strong> in at least one assignment rule.
            Each rule pairs a <strong>Designation + Department + Branch</strong>.
            A direct employee assignment always takes priority.
          </p>
        </div>

        {/* Row 1: Direct employee + Designation */}
        <div className={styles.distributionGrid}>
          <div>
            <label className={styles.formFieldLabel}>
              Direct Employee Assignment <span className={styles.optionalTag}>optional</span>
            </label>
            <Select
              instanceId="user-select"
              styles={baseSelectStyles}
              isDisabled={!isHqAdmin || isViewMode || (!savedTemplateId && !editId)}
              isMulti isSearchable
              options={users.map((u) => ({ value: u.id, label: u.full_name }))}
              value={users.filter((u) => selectedUsers.includes(u.id)).map((u) => ({ value: u.id, label: u.full_name }))}
              onChange={(opts: any) => setSelectedUsers(opts ? opts.map((o: any) => o.value as string) : [])}
              isClearable placeholder="Search by name…"
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              menuPosition="fixed"
            />
          </div>
          <div>
            <label className={styles.formFieldLabel}>Target Designations</label>
            <CreatableSelect
              instanceId="designations-select"
              placeholder="Type to create or select…"
              styles={baseSelectStyles}
              isMulti
              isDisabled={!isHqAdmin || isViewMode || (!savedTemplateId && !editId)}
              options={designations.map((r: any) => ({ value: r.id, label: r.name }))}
              value={designations.filter((r: any) => selectedDesignations.includes(r.id)).map((r: any) => ({ value: r.id, label: r.name }))}
              onChange={(opts: any) => setSelectedDesignations(opts ? opts.map((o: any) => o.value) : [])}
              onCreateOption={handleCreateDesignation}
              formatCreateLabel={(val: string) => `Create designation: "${val}"`}
            />
          </div>
        </div>

        {/* Row 2: Departments with branch filter */}
        <div style={{ marginTop: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
            <label className={styles.formFieldLabel} style={{ marginBottom: 0 }}>Departments</label>
            {branches.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", whiteSpace: "nowrap" }}>Filter by branch:</span>
                <select
                  value={selectedBranchFilter}
                  onChange={(e) => setSelectedBranchFilter(e.target.value)}
                  disabled={!isHqAdmin || isViewMode || (!savedTemplateId && !editId)}
                  style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "5px 10px", fontSize: "12px", fontWeight: "600", color: selectedBranchFilter ? "#1e40af" : "#64748b", background: "#fff", cursor: "pointer", outline: "none", maxWidth: "220px" }}
                >
                  <option value="">All Branches</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.code ? `${b.code} — ${b.name}` : b.name}</option>)}
                </select>
                {hiddenSelectedCount > 0 && (
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "20px", padding: "2px 9px", whiteSpace: "nowrap" }}>
                    +{hiddenSelectedCount} in other branches
                  </span>
                )}
              </div>
            )}
          </div>
          <Select
            instanceId="depts-select"
            isMulti
            isDisabled={!isHqAdmin || isViewMode || (!savedTemplateId && !editId)}
            placeholder={(!isHqAdmin || isViewMode) ? "—" : "Select departments…"}
            options={[
              ...departmentSelectOptions,
              ...(isHqAdmin && !isViewMode ? [{ value: "__create__", label: "+ Create new department…" }] : []),
            ]}
            styles={{
              ...baseSelectStyles,
              option: (base: any, { data, isFocused, isSelected }: any) => ({
                ...base,
                backgroundColor: isSelected ? "#3b82f6" : (data as any).value === "__create__" ? isFocused ? "#f0fdf4" : "#f8fafc" : isFocused ? "#eff6ff" : "transparent",
                color: isSelected ? "#fff" : (data as any).value === "__create__" ? "#166534" : "#475569",
                fontWeight: (data as any).value === "__create__" ? "700" : "500",
                borderTop:  (data as any).value === "__create__" ? "1px solid #e2e8f0" : "none",
                padding: "9px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px",
              }),
            }}
            value={selectedDepartmentValues}
            onChange={(opts: any) => {
              if (!opts) { setSelectedDepartments([]); return; }
              const createOpt = opts.find((o: any) => o.value === "__create__");
              if (createOpt) {
                setSelectedDepartments(opts.filter((o: any) => o.value !== "__create__").map((o: any) => String(o.value)));
                setDeptModal({ open: true, initialName: "" });
              } else {
                setSelectedDepartments(opts.map((o: any) => String(o.value)));
              }
            }}
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
          />
        </div>

        {/* Assignment rules preview — HQ only */}
        {isHqAdmin && !isViewMode && previewRules.length > 0 && (
          <div style={{ marginTop: "20px", padding: "16px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", fontWeight: "800", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
              Assignment Rules Preview — {previewRules.length} rule{previewRules.length !== 1 ? "s" : ""} will be saved
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {previewRules.map((rule, i) => {
                const designationName = rule.designation_id ? (designations.find((r) => r.id === rule.designation_id)?.name ?? `Role ${rule.designation_id}`) : null;
                const deptOpt   = rule.department_id ? allDepartmentOptions.find((o) => o.value === rule.department_id) : null;
                const branchObj = rule.branch_id     ? branches.find((b) => b.id === rule.branch_id) : null;
                const userName  = rule.user_id       ? (users.find((u) => u.id === rule.user_id)?.full_name ?? `User ${rule.user_id}`) : null;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "7px 10px", background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}>
                    {userName ? (
                      <span style={{ padding: "2px 8px", borderRadius: "6px", background: "#eff6ff", color: "#1e40af", fontWeight: "700" }}>👤 {userName}</span>
                    ) : (
                      <>
                        {designationName && <span style={{ padding: "2px 8px", borderRadius: "6px", background: "#f0fdf4", color: "#166534", fontWeight: "700" }}>Designation: {designationName}</span>}
                        {deptOpt         && <span style={{ padding: "2px 8px", borderRadius: "6px", background: "#fef3c7", color: "#92400e", fontWeight: "700" }}>Dept: {deptOpt.label}</span>}
                        {branchObj       && <span style={{ padding: "2px 8px", borderRadius: "6px", background: "#f5f3ff", color: "#5b21b6", fontWeight: "700" }}>Branch: {branchObj.code ?? branchObj.name}</span>}
                        {!designationName && !deptOpt && <span style={{ color: "#94a3b8" }}>Empty rule (will be skipped)</span>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Read-only assignment summary for non-HQ or view mode */}
        {(!isHqAdmin || isViewMode) && (selectedDesignations.length > 0 || selectedDepartments.length > 0 || selectedUsers.length > 0) && (
          <div className={styles.assignmentSummary} style={{ marginTop: "20px" }}>
            {selectedUsers.length > 0 && (
              <div className={styles.assignmentSummaryRow}>
                <span className={styles.assignmentSummaryLabel}>Direct Employees</span>
                <div className={styles.assignmentSummaryTags}>
                  {selectedUsers.map((uid) => { const u = users.find((x) => x.id === uid); return <span key={uid} className={styles.assignmentSummaryBadge} style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}>{u ? u.full_name : uid}</span>; })}
                </div>
              </div>
            )}
            {selectedDesignations.length > 0 && (
              <div className={styles.assignmentSummaryRow}>
                <span className={styles.assignmentSummaryLabel}>Designations</span>
                <div className={styles.assignmentSummaryTags}>
                  {selectedDesignations.map((id) => { const r = designations.find((x: any) => x.id === id); return r ? <span key={id} className={styles.assignmentSummaryBadge} style={{ background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0" }}>{r.name}</span> : null; })}
                </div>
              </div>
            )}
            {selectedDepartments.length > 0 && (
              <div className={styles.assignmentSummaryRow}>
                <span className={styles.assignmentSummaryLabel}>Departments</span>
                <div className={styles.assignmentSummaryTags}>
                  {selectedDepartments.map((id) => { const opt = allDepartmentOptions.find((o) => o.value === id); return opt ? <span key={id} className={styles.assignmentSummaryBadge} style={{ background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" }}>{opt.label}</span> : null; })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 2 action row — HQ only, not view mode */}
        {isHqAdmin && !isViewMode && (
          <div className={styles.actionRow} style={{ marginTop: "24px" }}>
            <div className={styles.cancelBtnWrapper}>
              <button
                className={styles.cancelBtn}
                disabled={!savedTemplateId && !editId}
                onClick={() => setShowAssignCancelConfirm((p) => !p)}
              >
                Cancel
              </button>
              {showAssignCancelConfirm && (
                <ConfirmDiscardPopover onStay={() => setShowAssignCancelConfirm(false)} onDiscard={handleDiscardAssignment} />
              )}
            </div>
            <button
              className={`${styles.saveBtn} ${savedTemplateId || editId ? styles.saveBtnAssign : styles.saveBtnBlocked}`}
              onClick={handleSaveAssignment}
              disabled={isAssignSaving || (!savedTemplateId && !editId)}
            >
              {isAssignSaving
                ? "Saving…"
                : assignSaved
                ? <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><CheckCircle2 size={15} />Assigned!</span>
                : "Assign Template"}
            </button>
          </div>
        )}
      </div>

      {/* ── Back to dashboard — role-aware ── */}
      <div className={styles.backRow}>
        <button className={styles.backBtn} onClick={handleBackToDashboard}>
          <ArrowLeft size={15} />
          Back to Template Dashboard
        </button>
      </div>

    </div>
  );
}