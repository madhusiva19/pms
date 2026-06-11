/**
 * @file TemplateCreateBase.tsx
 * @description Main component for creating, editing and viewing PMS evaluation templates.
 *
 * Responsibilities:
 *  - Template form (name, description, categories, weighted objectives)
 *  - Freeze / grace / unfreeze period enforcement
 *  - Variant (branch-specific) edit mode
 *  - Section 2: Distribution Strategy card — navigates to the standalone
 *    Template Assignment page once the template has been saved.
 
 */

"use client";

import {
  useState,
  useMemo,
  useEffect,
  useCallback,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Select    from "react-select";
import { toast } from "sonner";
import {
  Eye,
  Lock,
  Unlock,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  SlidersHorizontal,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  GitBranch,
  FileText,
  Users,
  UserCheck,
  Building2,
  Zap,
  ClipboardList,
  Flag,
  Target,
  Clock,
  BarChart2,
  Star,
  CalendarDays,
} from "lucide-react";
import { formatDate } from "@/lib/freezeUtils";
import Sidebar    from "@/components/sidebar/Sidebar";
import Breadcrumb from "@/components/breadcrumb/Breadcrumb";
import styles       from "./TemplateCreateBase.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

const DEFAULT_MAX_SCORE           = 5;
const DESCRIPTION_WARN_THRESHOLD  = 400;
const DESCRIPTION_MAX_LENGTH      = 500;
const TEMPLATE_NAME_MAX_LENGTH    = 120;

const MAX_SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const ROLE_PREFIX_BY_LEVEL: Record<number, string> = {
  1: "/hq-admin",
  2: "/country-admin",
  3: "/branch-admin",
  4: "/dept-admin",
  5: "/sub-dept-admin",
};

const ROLE_LABEL_BY_LEVEL: Record<number, string> = {
  1: "HQ Administrator",
  2: "Country Administrator",
  3: "Branch Administrator",
  4: "Department Administrator",
  5: "Sub-Department Administrator",
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — TYPES
// ─────────────────────────────────────────────────────────────────────────────

type FreezeStatus = "open" | "grace" | "frozen";

interface FreezeDates {
  pmsYearStart:        Date;
  objectiveSettingEnd: Date;
  graceEnd:            Date;
  midYearReview:       Date | null;
  yearEndReview:       Date | null;
}

interface TemplatePermissions {
  freezeStatus:    FreezeStatus;
  canEdit:         boolean;
  canCreate:       boolean;
  canDelete:       boolean;
  canEditLocked:   boolean;
  canEditEditable: boolean;
  canManageAssign: boolean;
  roleLabel:       string;
}

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

interface TemplateCreateBaseProps {
  /** Admin level 1–5. Defaults to HQ Admin (1). */
  level?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — PURE HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Derives freeze-related dates from the active PMS cycle API record. */
// CHANGE THIS LINE ONLY
function buildFreezeDates(activeCycle: any): FreezeDates {
  const now          = new Date();
  const fallbackYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  // No active cycle — backend returned source: "none"
  if (!activeCycle?.id && activeCycle?.source === "none") {
    const pastDate = new Date(2000, 0, 1);
    return {
      pmsYearStart:        new Date(fallbackYear, 3, 1),
      objectiveSettingEnd: pastDate,
      graceEnd:            pastDate,
      midYearReview:       null,
      yearEndReview:       null,
    };
  }

  const pmsYearStart = activeCycle?.pms_start
    ? new Date(activeCycle.pms_start as string)
    : new Date(fallbackYear, 3, 1);

  const objectiveSettingEnd =
    activeCycle?.objective_setting_end ?? activeCycle?.objective_end
      ? new Date((activeCycle.objective_setting_end ?? activeCycle.objective_end) as string)
      : new Date(fallbackYear, 5, 30);

  const graceEnd =
    activeCycle?.grace_period_end ?? activeCycle?.grace_end
      ? new Date((activeCycle.grace_period_end ?? activeCycle.grace_end) as string)
      : new Date(fallbackYear, 6, 31);

  return {
    pmsYearStart,
    objectiveSettingEnd,
    graceEnd,
    midYearReview: activeCycle?.mid_year_review
      ? new Date(activeCycle.mid_year_review as string)
      : null,
    yearEndReview: activeCycle?.year_end_review
      ? new Date(activeCycle.year_end_review as string)
      : null,
  };
}

/** Computes what actions the current user is permitted to perform. */
function computePermissions(level: number, freezeDates: FreezeDates): TemplatePermissions {
  const now = new Date();

  const freezeStatus: FreezeStatus =
    now <= freezeDates.objectiveSettingEnd ? "open"
    : now <= freezeDates.graceEnd         ? "grace"
    : "frozen";

  const isHqAdmin    = level === 1;
  const isNonHqAdmin = level >= 2 && level <= 5;
  const isFrozen     = freezeStatus === "frozen";

  const canEditLocked   = isHqAdmin && !isFrozen;
  const canEditEditable = (isHqAdmin && !isFrozen) || (isNonHqAdmin && freezeStatus === "open");

  return {
    freezeStatus,
    canEdit:         canEditEditable,
    canCreate:       isHqAdmin && !isFrozen,
    canDelete:       isHqAdmin && !isFrozen,
    canEditLocked,
    canEditEditable,
    canManageAssign: isHqAdmin,
    roleLabel:       ROLE_LABEL_BY_LEVEL[level] ?? "Administrator",
  };
}

function getRolePrefix(level: number): string {
  return ROLE_PREFIX_BY_LEVEL[level] ?? "/hq-admin";
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — KPI / CONTROL CONFIG ARRAYS
// ─────────────────────────────────────────────────────────────────────────────

const KPI_SCALE_OPTIONS = [
  { value: "interpolated_financial",     label: "Financial Achievement",          group: "interpolated", hint: "LL=90%, UL=110% · Linear interpolation 1–5",  isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_to_gp",         label: "T/O & GP Contribution",          group: "interpolated", hint: "LL=4%, UL=15% · Linear interpolation 1–5",    isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_sales_ratio",   label: "Effective Sales Ratio",          group: "interpolated", hint: "LL=20%, UL=100% · Linear interpolation 1–5",  isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_gp_margin",     label: "Individual GP Margin %",         group: "interpolated", hint: "LL=6%, UL=30% · Linear interpolation 1–5",    isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_ees_360",       label: "EES / 360 Degree Feedback",      group: "interpolated", hint: "LL=65%, UL=85% · Linear interpolation 1–5",   isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_nps_ccr",       label: "NPS / CCR Score",                group: "interpolated", hint: "LL=20, UL=50 · Linear interpolation 1–5",     isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_emp_retention", label: "Employee Retention",             group: "interpolated", hint: "LL=75%, UL=95% · Linear interpolation 1–5",   isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "interpolated_dpam",          label: "Overall DPAM Score",             group: "interpolated", hint: "LL=75%, UL=90% · Linear interpolation 1–5",   isInverse: false, badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" }, icon: <TrendingUp size={13} color="#1e40af" /> },
  { value: "bracket_statutory",          label: "Statutory & Legal Compliance",   group: "bracket",      hint: "Bands: <24=1 · =24=5",                         isInverse: false, badge: { bg: "#fef3c7", color: "#92400e", border: "#fde68a" }, icon: <SlidersHorizontal size={13} color="#92400e" /> },
  { value: "bracket_wip",                label: "WIP Score (Days)",               group: "bracket",      hint: "Inverse bands: ≥9=1 · 7=2 · 5=3 · 3=4 · 1=5", isInverse: true,  badge: { bg: "#fef3c7", color: "#92400e", border: "#fde68a" }, icon: <TrendingDown size={13} color="#b45309" /> },
  { value: "bracket_ops_dpam",           label: "Operations Score / DPAM Ops",    group: "bracket",      hint: "Bands: ≤11.6=1 · –17.4=2 · –23.2=3 · –27=4 · ≥27=5", isInverse: false, badge: { bg: "#fef3c7", color: "#92400e", border: "#fde68a" }, icon: <SlidersHorizontal size={13} color="#92400e" /> },
  { value: "bracket_individual_sales_gp",label: "Individual Sales GP",            group: "bracket",      hint: "Bands: <100K=1 · –500K=2 · –1M=3 · –5M=4 · >5M=5", isInverse: false, badge: { bg: "#fef3c7", color: "#92400e", border: "#fde68a" }, icon: <SlidersHorizontal size={13} color="#92400e" /> },
  { value: "manual",                     label: "Manual Rating (1–5)",            group: "manual",       hint: "Appraiser enters 1–5 directly",                isInverse: false, badge: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" }, icon: <SlidersHorizontal size={13} color="#166534" /> },
] as const;

const KPI_SCALE_GROUPS = [
  { groupKey: "interpolated", groupLabel: "INTERPOLATED", color: "#1e40af" },
  { groupKey: "bracket",      groupLabel: "BRACKET",      color: "#92400e" },
  { groupKey: "manual",       groupLabel: "MANUAL",       color: "#166534" },
] as const;

function resolveKpiOption(value: string | undefined) {
  return (
    KPI_SCALE_OPTIONS.find((o) => o.value === (value ?? "interpolated_financial")) ??
    KPI_SCALE_OPTIONS[0]
  );
}

const CONTROL_OPTIONS = [
  { value: "Locked",   label: "Locked",   badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" } },
  { value: "Editable", label: "Editable", badge: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" } },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — PMS DATE CHIP CONFIG
// Maps each date slot to an icon, colour theme, and label.
// ─────────────────────────────────────────────────────────────────────────────

const PMS_DATE_CHIPS = [
  {
    key:       "pmsYearStart",
    label:     "Cycle Start",
    icon:      Flag,
    iconBg:    "#ede9fe",
    iconColor: "#7c3aed",
    activeBg:  null, 
  },
  {
    key:       "objectiveSettingEnd",
    label:     "Objective Setting",
    icon:      Target,
    iconBg:    "#dbeafe",
    iconColor: "#2563eb",
    activeBg:  "#3b82f6", 
  },
  {
    key:       "graceEnd",
    label:     "Grace Period",
    icon:      Clock,
    iconBg:    "#fef3c7",
    iconColor: "#d97706",
    activeBg:  null,
  },
  {
    key:       "midYearReview",
    label:     "Mid-Year Review",
    icon:      BarChart2,
    iconBg:    "#ffe4e6",
    iconColor: "#e11d48",
    activeBg:  null,
  },
  {
    key:       "yearEndReview",
    label:     "Year-End Review",
    icon:      Star,
    iconBg:    "#f3e8ff",
    iconColor: "#9333ea",
    activeBg:  null,
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — DEFAULT / INITIAL DATA
// ─────────────────────────────────────────────────────────────────────────────

function createDefaultObjective(
  name:        string,
  kpiScale:    string,
  control:     string,
  weight:      number | null = null,
  kpiMaxScore: number | null = null,
): ObjectiveRow {
  return { name, kpiScale, weight, control, mandatory: true, kpiMaxScore };
}

const BLANK_OBJECTIVE: ObjectiveRow = {
  name: "", kpiScale: "interpolated_financial", weight: "", control: "Editable", mandatory: false, kpiMaxScore: null,
};

const INITIAL_CATEGORIES: CategoryRow[] = [
  {
    name: "Financial Focus", weight: 0, mandatory: true,
    objectives: [
      createDefaultObjective("Revenue Achievement",                    "interpolated_financial",   "Locked",   10),
      createDefaultObjective("GP Achievement",                         "interpolated_financial",   "Locked",   10),
      createDefaultObjective("Achievement of Dept Revenue",            "interpolated_financial",   "Locked",    3.3),
      createDefaultObjective("Achievement of Dept GP (___)",           "interpolated_financial",   "Editable",  3.4),
      createDefaultObjective("Profit Margin % of ___",                 "interpolated_gp_margin",   "Editable",  3.3),
      createDefaultObjective("Achievement of Sales Dept. Target",      "interpolated_financial",   "Editable",  null),
      createDefaultObjective("Effective Sales Ratio of CMB (60 Days)", "interpolated_sales_ratio", "Editable",  null),
      createDefaultObjective("GP Margin (Ops) Overall",                "interpolated_gp_margin",   "Editable",  null),
      createDefaultObjective("Optimize Direct Cost",                   "bracket_wip",              "Editable",  null),
      createDefaultObjective("GP Margin %",                            "interpolated_gp_margin",   "Editable",  null),
      createDefaultObjective("GP Contribution %",                      "interpolated_to_gp",       "Editable",  null),
      createDefaultObjective("Turnover Contribution %",                "interpolated_to_gp",       "Editable",  null),
      createDefaultObjective("Achievement of Individual Sales Target", "interpolated_financial",   "Editable",  null),
    ],
  },
  {
    name: "Customer Focus", weight: 0, mandatory: true,
    objectives: [
      createDefaultObjective("NPS Index",                         "interpolated_nps_ccr",        "Locked",   10),
      createDefaultObjective("Complaints on service failures",    "bracket_statutory",           "Locked",   10),
      createDefaultObjective("Monthly Idea Generation",           "manual",                      "Editable",  3),
      createDefaultObjective("GP on Personal Done by Individual", "bracket_individual_sales_gp", "Editable",  4),
      createDefaultObjective("NO. of Qualified Sales leads",      "interpolated_financial",      "Editable",  3),
      createDefaultObjective("New Customers brought in",          "interpolated_financial",      "Editable",  null),
      createDefaultObjective("Sales quotation success ratio",     "interpolated_sales_ratio",    "Editable",  null),
    ],
  },
  {
    name: "Human Resources Focus", weight: 0, mandatory: true,
    objectives: [
      createDefaultObjective("360 Feedback (Automated)", "interpolated_ees_360",       "Locked", 5),
      createDefaultObjective("Dept. Retention",           "interpolated_emp_retention", "Locked", 5),
      createDefaultObjective("GPTW Score",                "interpolated_financial",     "Locked", 5),
    ],
  },
  {
    name: "Process Focus", weight: 0, mandatory: true,
    objectives: [
      createDefaultObjective("International Audit-Positive Assurance Score-Overall", "bracket_statutory", "Locked",   10),
      createDefaultObjective("DPAM Operations Score",                                "bracket_ops_dpam",  "Editable",  5),
      createDefaultObjective("WIP (Total Ops)",                                      "bracket_wip",       "Editable",  5),
      createDefaultObjective("Team adherence to cargowise module",                   "interpolated_dpam", "Editable",  null),
      createDefaultObjective("Adherence to Sales Module in CW",                      "interpolated_dpam", "Editable",  null),
    ],
  },
  {
    name: "Personal Assessment", weight: 0, mandatory: true,
    objectives: [
      createDefaultObjective("HOD Evaluation", "manual", "Locked", 5),
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — LEGACY MIGRATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const LEGACY_SCALE_MAP: Record<string, string> = {
  standard: "interpolated_financial",
  inverse:  "bracket_wip",
};

function migrateLegacyKpiScale(scale: string | undefined): string {
  if (!scale) return "interpolated_financial";
  return LEGACY_SCALE_MAP[scale] ?? scale;
}

function migrateObjectiveRow(rawObjective: Record<string, unknown>): ObjectiveRow {
  return {
    name:        (rawObjective.name as string)        ?? "",
    kpiScale:    migrateLegacyKpiScale(rawObjective.kpiScale as string | undefined),
    weight:      (rawObjective.weight as number)      ?? null,
    control:     (rawObjective.control as string)     ?? "Editable",
    mandatory:   (rawObjective.mandatory as boolean)  ?? false,
    kpiMaxScore: (rawObjective.kpiMaxScore as number) ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — SELECT STYLE BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildBaseSelectStyles(): object {
  return {
    control: (base: object, { isFocused }: { isFocused: boolean }) => ({
      ...base, borderRadius: "10px",
      border:    isFocused ? "1.5px solid #3b82f6" : "1px solid #e2e8f0",
      padding:   "2px 4px",
      boxShadow: isFocused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
      fontSize:  "13px", fontWeight: "500", background: "#fff",
      "&:hover": { borderColor: "#3b82f6" },
    }),
    multiValue:       (base: object) => ({ ...base, backgroundColor: "#eff6ff", borderRadius: "6px" }),
    multiValueLabel:  (base: object) => ({ ...base, color: "#1e40af", fontWeight: "700", fontSize: "12px" }),
    multiValueRemove: (base: object) => ({ ...base, color: "#93c5fd", "&:hover": { backgroundColor: "#dbeafe", color: "#1e40af" } }),
    placeholder:  (base: object) => ({ ...base, fontSize: "13px", color: "#94a3b8" }),
    menu:         (base: object) => ({ ...base, borderRadius: "12px", boxShadow: "0 8px 30px rgba(0,0,0,0.12)", border: "1px solid #f1f5f9", marginTop: "6px", padding: "4px", zIndex: 9999 }),
    option: (base: object, { isFocused, isSelected }: { isFocused: boolean; isSelected: boolean }) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color: isSelected ? "#fff" : "#475569", padding: "9px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "500",
    }),
    singleValue: (base: object) => ({ ...base, color: "#1e293b", fontWeight: "600" }),
  };
}

function buildTableSelectStyles(): object {
  return {
    control: (base: object) => ({ ...base, border: "none", background: "transparent", minHeight: "unset", boxShadow: "none", cursor: "pointer", padding: 0 }),
    valueContainer:      (base: object) => ({ ...base, padding: 0 }),
    indicatorsContainer: ()             => ({ display: "none" }),
    singleValue:         (base: object) => ({ ...base, margin: 0 }),
    menu: (base: object) => ({ ...base, borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", border: "1px solid #f1f5f9", marginTop: "6px", padding: "4px", zIndex: 9999, minWidth: "220px" }),
    menuList: (base: object) => ({ ...base, maxHeight: "200px" }),
    option: (base: object, { isFocused, isSelected }: { isFocused: boolean; isSelected: boolean }) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color: isSelected ? "#fff" : "#475569", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "600",
    }),
  };
}

function buildKpiSelectStyles(): object {
  return {
    control: (base: object, { isFocused }: { isFocused: boolean }) => ({
      ...base, border: isFocused ? "1.5px solid #3b82f6" : "1.5px solid #e2e8f0",
      borderRadius: "8px", background: "#fff", minHeight: "36px",
      boxShadow: isFocused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
      cursor: "pointer", padding: "0 8px", "&:hover": { borderColor: "#3b82f6" },
    }),
    valueContainer:      (base: object) => ({ ...base, padding: "0 2px" }),
    indicatorsContainer: ()             => ({ display: "none" }),
    singleValue:         (base: object) => ({ ...base, margin: 0 }),
    placeholder:         (base: object) => ({ ...base, color: "#94a3b8", fontSize: "12px" }),
    menu: (base: object) => ({ ...base, borderRadius: "12px", boxShadow: "0 12px 32px rgba(0,0,0,0.14)", border: "1px solid #e8edf5", marginTop: "4px", padding: "6px", zIndex: 9999, minWidth: "320px" }),
    menuList: (base: object) => ({ ...base, maxHeight: "520px", overflowY: "auto" }),
    option: (base: object, { isFocused, isSelected }: { isFocused: boolean; isSelected: boolean }) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color: isSelected ? "#fff" : "#475569", padding: "7px 10px", borderRadius: "7px", cursor: "pointer", fontSize: "12px", fontWeight: "600",
    }),
    groupHeading: (base: object) => ({ ...base, fontSize: "10px", fontWeight: "800", letterSpacing: "0.08em", padding: "8px 10px 3px", textTransform: "uppercase", borderTop: "1px solid #f1f5f9", color: "#94a3b8" }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — CUSTOM SELECT RENDERERS
// ─────────────────────────────────────────────────────────────────────────────

const KpiScaleOptionRenderer = ({
  data, innerProps, isSelected, isFocused,
}: {
  data: (typeof KPI_SCALE_OPTIONS)[number];
  innerProps: React.HTMLAttributes<HTMLDivElement>;
  isSelected: boolean;
  isFocused:  boolean;
}) => (
  <div
    {...innerProps}
    style={{
      padding: "7px 12px", borderRadius: "8px", cursor: "pointer", margin: "1px 0",
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#f0f7ff" : "transparent",
      display: "flex", alignItems: "center", gap: "8px",
    }}
  >
    <span style={{ opacity: isSelected ? 1 : 0.8, flexShrink: 0 }}>{data.icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: "12px", fontWeight: "700", color: isSelected ? "#fff" : "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
        {data.label}
        {data.isInverse && (
          <span style={{ fontSize: "9px", fontWeight: "700", padding: "1px 5px", borderRadius: "4px", background: isSelected ? "rgba(255,255,255,0.25)" : "#fee2e2", color: isSelected ? "#fff" : "#dc2626" }}>
            inverse
          </span>
        )}
      </div>
      <div style={{ fontSize: "10px", color: isSelected ? "rgba(255,255,255,0.72)" : "#94a3b8", marginTop: "2px" }}>
        {data.hint}
      </div>
    </div>
  </div>
);

const ControlOptionRenderer = ({
  data, innerProps, isSelected, isFocused,
}: {
  data: { value: string; label: string };
  innerProps: React.HTMLAttributes<HTMLDivElement>;
  isSelected: boolean;
  isFocused:  boolean;
}) => (
  <div
    {...innerProps}
    style={{
      padding: "8px 12px", borderRadius: "8px", cursor: "pointer", margin: "1px 0",
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#f0f7ff" : "transparent",
      display: "flex", alignItems: "center", gap: "6px",
    }}
  >
    {data.value === "Locked"
      ? <Lock   size={11} color={isSelected ? "#fff" : "#1e40af"} />
      : <Unlock size={11} color={isSelected ? "#fff" : "#15803d"} />}
    <span style={{ fontSize: "12px", fontWeight: "700", color: isSelected ? "#fff" : "#1e293b" }}>
      {data.label}
    </span>
  </div>
);

const ControlBadge = ({
  option,
  isDisabled,
}: {
  option:     (typeof CONTROL_OPTIONS)[number];
  isDisabled: boolean;
}) => (
  <span
    style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700",
      whiteSpace: "nowrap",
      background: isDisabled ? "#f1f5f9" : option.badge.bg,
      color:      isDisabled ? "#94a3b8" : option.badge.color,
      border:     `1px solid ${isDisabled ? "#e2e8f0" : option.badge.border}`,
      cursor:     isDisabled ? "default" : "pointer",
      userSelect: "none",
    }}
  >
    {option.value === "Locked" ? <Lock size={10} /> : <Unlock size={10} />}
    {option.label}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

interface ConfirmDiscardPopoverProps {
  onStay:    () => void;
  onDiscard: () => void;
}

function ConfirmDiscardPopover({ onStay, onDiscard }: ConfirmDiscardPopoverProps) {
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

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11 — PMS DATE CHIPS COMPONENT
// Colourful icon-based date cards modelled on the reference design.
// Shown in edit mode AND view mode whenever editId is present.
// ─────────────────────────────────────────────────────────────────────────────

function PmsDateChips({ freezeDates }: { freezeDates: FreezeDates }) {
  const now = new Date();
  const isInObjectiveSetting =
    now >= freezeDates.pmsYearStart && now <= freezeDates.objectiveSettingEnd;

  const dateMap: Record<string, Date | null> = {
    pmsYearStart:        freezeDates.pmsYearStart,
    objectiveSettingEnd: freezeDates.objectiveSettingEnd,
    graceEnd:            freezeDates.graceEnd,
    midYearReview:       freezeDates.midYearReview,
    yearEndReview:       freezeDates.yearEndReview,
  };

  return (
    <div className={styles.pmsDateGrid}>
      {PMS_DATE_CHIPS.map((chip) => {
        const date      = dateMap[chip.key];
        if (!date) return null;

        const isActive  = chip.key === "objectiveSettingEnd" && isInObjectiveSetting;
        const IconComp  = chip.icon;

        return (
          <div
            key={chip.key}
            className={`${styles.pmsDateCard} ${isActive ? styles.pmsDateCardActive : ""}`}
          >
            <div
              className={styles.pmsDateIconWrap}
              style={isActive
                ? { background: "rgba(255,255,255,0.25)" }
                : { background: chip.iconBg }}
            >
              <IconComp
                size={20}
                color={isActive ? "#fff" : chip.iconColor}
              />
            </div>
            <p className={`${styles.pmsDateLabel} ${isActive ? styles.pmsDateLabelActive : ""}`}>
              {chip.label.toUpperCase()}
            </p>
            <p className={`${styles.pmsDateValue} ${isActive ? styles.pmsDateValueActive : ""}`}>
              {formatDate(date)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12 — MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function TemplateCreateBase({ level = 1 }: TemplateCreateBaseProps) {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // ── URL params ──────────────────────────────────────────────────────────────
  const editId         = searchParams.get("edit");
  const modeParam      = searchParams.get("mode");
  const variantIdParam = searchParams.get("variantId");

  const isViewMode     = modeParam === "view";
  const isUnfreezeMode = searchParams.get("unfreezeMode") === "1" && level === 1;
  const isVariantMode  = !!variantIdParam && level === 1;
  const variantId      = variantIdParam ? Number(variantIdParam) : null;

  // ── Derived routing helpers ─────────────────────────────────────────────────
  const rolePrefix         = getRolePrefix(level);
  const dashboardPath      = `${rolePrefix}/template-management`;
  const assignmentBasePath = `${rolePrefix}/template-management/template-assignment`;
  const isHqAdmin          = level === 1;
  const isNonHqAdmin       = level >= 2 && level <= 5;

  // ── PMS cycle & freeze state ────────────────────────────────────────────────
  const [activeCycle,        setActiveCycle]        = useState<Record<string, unknown> | null>(null);
  const [unfrozenBranchIds,  setUnfrozenBranchIds]  = useState<string[]>([]);
  const [unfrozenCountryIds, setUnfrozenCountryIds] = useState<string[]>([]);
  const [variantScopeLabel,  setVariantScopeLabel]  = useState<string>("");

  const freezeDates = useMemo(() => buildFreezeDates(activeCycle), [activeCycle]);
  const permissions = useMemo(() => computePermissions(level, freezeDates), [level, freezeDates]);

  const canEditInUnfreezeMode = (isUnfreezeMode || isVariantMode) && !isViewMode;
  const isReadOnly             = isViewMode || (!permissions.canEdit && !canEditInUnfreezeMode);
  const isEditableOnlyMode     = isNonHqAdmin && permissions.freezeStatus === "open";

  // ── Template form state ─────────────────────────────────────────────────────
  const [savedTemplateId,           setSavedTemplateId]           = useState<number | null>(editId ? Number(editId) : null);
  const [templateName,              setTemplateName]              = useState("");
  const [description,               setDescription]               = useState("");
  const [maxScore,                  setMaxScore]                  = useState<number>(DEFAULT_MAX_SCORE);
  const [categories,                setCategories]                = useState<CategoryRow[]>(INITIAL_CATEGORIES);
  const [newObjectiveKey,           setNewObjectiveKey]           = useState<string | null>(null);
  const [showTemplateCancelConfirm, setShowTemplateCancelConfirm] = useState(false);
  const [isTemplateSaving,          setIsTemplateSaving]          = useState(false);
  const [isTemplateSaved,           setIsTemplateSaved]           = useState(false);
  const [isPageLoading,             setIsPageLoading]             = useState(!!editId);

  // ── Memoised select styles ──────────────────────────────────────────────────
  const baseSelectStyles  = useMemo(() => buildBaseSelectStyles(),  []);
  const tableSelectStyles = useMemo(() => buildTableSelectStyles(), []);
  const kpiSelectStyles   = useMemo(() => buildKpiSelectStyles(),   []);

  const kpiScaleGroupedOptions = useMemo(
    () => KPI_SCALE_GROUPS.map((group) => ({
      label:   group.groupLabel,
      options: KPI_SCALE_OPTIONS.filter((option) => option.group === group.groupKey),
    })),
    [],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadCycle = async () => {
      try {
        const res = await fetch(`${API_BASE}/pms-cycles/active`);
        if (res.ok) setActiveCycle(await res.json());
      } catch {
        // Non-critical — freeze defaults apply
      }
    };
    loadCycle();
  }, []);

  useEffect(() => {
    if (!editId) return;

    const loadTemplate = async () => {
      try {
        setIsPageLoading(true);
        const response = await fetch(`${API_BASE}/templates`);
        if (!response.ok) throw new Error(`Server returned ${response.status}`);

        const allTemplates: Array<Record<string, unknown>> = await response.json();
        const template = allTemplates.find((t) => t.id === parseInt(editId, 10));
        if (!template) {
          toast.error("Template not found.");
          router.push(dashboardPath);
          return;
        }

        setTemplateName((template.name as string) ?? "");
        setDescription((template.description as string) ?? "");
        setMaxScore((template.max_score as number) ?? DEFAULT_MAX_SCORE);
        setCategories(
          ((template.categories as Array<Record<string, unknown>>) ?? INITIAL_CATEGORIES).map(
            (cat) => ({
              ...cat,
              objectives: ((cat.objectives as Array<Record<string, unknown>>) ?? []).map(migrateObjectiveRow),
            }),
          ) as CategoryRow[],
        );
        setSavedTemplateId(Number(editId));

        if (isUnfreezeMode) {
          setUnfrozenBranchIds(((template.unfrozenBranchIds as string[]) ?? []).map(String));
          setUnfrozenCountryIds(((template.unfrozenCountryIds as string[]) ?? []).map(String));
        }

        if (isVariantMode && variantId) {
          try {
            const variantRes = await fetch(
              `${API_BASE}/templates/${editId}/variants/${variantId}`,
              { headers: { "X-User-Level": "1" } },
            );
            if (variantRes.ok) {
              const variant = await variantRes.json();
              setCategories(
                ((variant.categories ?? template.categories ?? INITIAL_CATEGORIES) as Array<Record<string, unknown>>).map(
                  (cat) => ({
                    ...cat,
                    objectives: ((cat.objectives as Array<Record<string, unknown>>) ?? []).map(migrateObjectiveRow),
                  }),
                ) as CategoryRow[],
              );
              if (variant.max_score)   setMaxScore(variant.max_score);
              if (variant.description) setDescription(variant.description);

              const branchLabel  = variant.branch_id
                ? ((template.assignedBranches as Array<{ id: unknown; name: string }> | undefined)?.find(
                    (b) => b.id === variant.branch_id,
                  )?.name ?? variant.branch_id)
                : null;
              const countryLabel = variant.country_id
                ? ((template.assignedCountries as Array<{ id: unknown; name: string }> | undefined)?.find(
                    (c) => c.id === variant.country_id,
                  )?.name ?? variant.country_id)
                : null;
              setVariantScopeLabel((branchLabel ?? countryLabel ?? "Unknown scope") as string);
            }
          } catch {
            // Fall back to main template content silently
          }
        }

        if (isViewMode)              toast.info("Viewing template — read-only mode.");
        else if (isEditableOnlyMode) toast.info("You can edit Editable objectives only.");
      } catch {
        toast.error("Failed to load template. Please try again.");
      } finally {
        setIsPageLoading(false);
      }
    };

    loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED / MEMOISED VALUES
  // ─────────────────────────────────────────────────────────────────────────

  const categoryWeights = useMemo(
    () => categories.map((cat) =>
      cat.objectives.reduce((sum, obj) => sum + (Number(obj.weight) || 0), 0),
    ),
    [categories],
  );

  const totalWeight = useMemo(
    () => categoryWeights.reduce((sum, w) => sum + w, 0),
    [categoryWeights],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS — Category / Objective mutations
  // ─────────────────────────────────────────────────────────────────────────

  const handleUpdateObjectiveField = useCallback(
    (categoryIndex: number, objectiveIndex: number, field: string, value: unknown) =>
      setCategories((prev) =>
        prev.map((cat, ci) =>
          ci !== categoryIndex ? cat : {
            ...cat,
            objectives: cat.objectives.map((obj, oi) =>
              oi !== objectiveIndex ? obj : { ...obj, [field]: value },
            ),
          },
        ),
      ),
    [],
  );

  const handleUpdateCategoryName = useCallback(
    (categoryIndex: number, name: string) =>
      setCategories((prev) =>
        prev.map((cat, ci) => (ci === categoryIndex ? { ...cat, name } : cat)),
      ),
    [],
  );

  const handleAddCategory = useCallback(
    () => setCategories((prev) => [...prev, { name: "", weight: 0, objectives: [], mandatory: false }]),
    [],
  );

  const handleRemoveCategory = useCallback(
    (categoryIndex: number) =>
      setCategories((prev) => prev.filter((_, ci) => ci !== categoryIndex)),
    [],
  );

  const handleAddObjective = useCallback((categoryIndex: number) => {
    setCategories((prev) =>
      prev.map((cat, ci) =>
        ci !== categoryIndex ? cat : { ...cat, objectives: [...cat.objectives, { ...BLANK_OBJECTIVE }] },
      ),
    );
    setTimeout(() => {
      setCategories((prev) => {
        const newIndex = prev[categoryIndex]?.objectives.length - 1;
        setNewObjectiveKey(`${categoryIndex}-${newIndex}`);
        return prev;
      });
    }, 0);
  }, []);

  const handleRemoveObjective = useCallback(
    (categoryIndex: number, objectiveIndex: number) =>
      setCategories((prev) =>
        prev.map((cat, ci) =>
          ci !== categoryIndex ? cat : {
            ...cat,
            objectives: cat.objectives.filter((_, oi) => oi !== objectiveIndex),
          },
        ),
      ),
    [],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────────────────────────────────

  const validateTemplateForm = (): boolean => {
    if (!templateName.trim()) { toast.error("Please enter a Template Name."); return false; }
    for (const category of categories) {
      for (const objective of category.objectives) {
        if (!objective.name.trim())  { toast.error("All objectives must have a name."); return false; }
        if (!objective.kpiScale)     { toast.error("All objectives must have a KPI Scale selected."); return false; }
      }
    }
    if (totalWeight !== 100) { toast.error(`Total weight must be exactly 100%. Currently ${totalWeight}%.`); return false; }
    return true;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SAVE / DISCARD
  // ─────────────────────────────────────────────────────────────────────────

  const handleSaveTemplate = async () => {
    if (isViewMode)                                                    { toast.error("View-only mode — no changes can be saved."); return; }
    if (!permissions.canEdit && !canEditInUnfreezeMode && editId)      { toast.error("You do not have permission to edit this template."); return; }
    if (!permissions.canCreate && !canEditInUnfreezeMode && !editId)   { toast.error("You do not have permission to create templates."); return; }
    if (!validateTemplateForm()) return;

    const categoriesWithWeight = categories.map((cat) => ({
      ...cat,
      weight: cat.objectives.reduce((sum, obj) => sum + (Number(obj.weight) || 0), 0),
    }));

    const payload = {
      name:          isHqAdmin ? templateName.trim() : undefined,
      description:   isHqAdmin ? description.trim()  : undefined,
      max_score:     isHqAdmin ? maxScore             : undefined,
      categories:    categoriesWithWeight,
      totalWeight,
      lastModified:  new Date().toISOString(),
      editedByLevel: level,
    };

    setIsTemplateSaving(true);
    try {
      let resolvedTemplateId: number;

      if (editId) {
        const saveUrl = isVariantMode
          ? `${API_BASE}/templates/${editId}/variants/${variantId}`
          : `${API_BASE}/templates/${editId}`;

        const requestHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          "X-User-Level": String(level),
        };
        if (isUnfreezeMode && !isVariantMode) requestHeaders["X-Unfreeze-Mode"] = "1";

        const response = await fetch(saveUrl, {
          method:  "PUT",
          headers: requestHeaders,
          body:    JSON.stringify(payload),
        });
        if (response.status === 403) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error((errorBody as { error?: string }).error ?? "This template is frozen.");
        }
        if (!response.ok) throw new Error("Failed to update template.");
        resolvedTemplateId = Number(editId);
      } else {
        const response = await fetch(`${API_BASE}/templates`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("Failed to create template.");
        resolvedTemplateId = (await response.json()).id;
      }

      setSavedTemplateId(resolvedTemplateId);
      setIsTemplateSaved(true);
      setTimeout(() => setIsTemplateSaved(false), 3000);

      toast.success(
        editId
          ? isVariantMode ? `Variant saved for ${variantScopeLabel}!` : "Template updated successfully!"
          : "Template created! Configure distribution below.",
      );
    } catch (error) {
      toast.error((error as Error).message ?? "Failed to save template. Please try again.");
    } finally {
      setIsTemplateSaving(false);
    }
  };

  const handleDiscardTemplate = () => {
    if (!editId) {
      setTemplateName("");
      setDescription("");
      setMaxScore(DEFAULT_MAX_SCORE);
      setCategories(INITIAL_CATEGORIES);
    } else {
      window.location.reload();
    }
    setShowTemplateCancelConfirm(false);
  };

  const handleBackToDashboard = () => {
    router.push(dashboardPath);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  /** Navigate to the standalone Template Assignment page. */
  const handleGoToAssignment = () => {
    if (!savedTemplateId) return;
    router.push(`${assignmentBasePath}?templateId=${savedTemplateId}`);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  const isWeightValid    = totalWeight === 100;
  const isWeightExceeded = totalWeight > 100;
  const weightBarPercent = Math.min(totalWeight, 100);

  // Show the PMS date chips whenever we're in edit or view mode (editId present)
  const showDateChips = !!editId;

  if (isPageLoading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className={styles.loadingSpinner} />
        <p className={styles.loadingText}>Loading template…</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.dashShell}>
      <Sidebar />
      <main className={styles.mainContent}>
        <Breadcrumb />
        <div className={styles.pageWrapper}>

      {/* ── Variant mode banner ──────────────────────────────────────────── */}
      {isVariantMode && !isViewMode && (
        <div className={styles.variantBanner}>
          <div className={styles.variantBannerIcon}>
            <GitBranch size={16} color="#2563eb" />
          </div>
          <div>
            <div className={styles.variantBannerTitle}>
              Branch Variant Edit Mode — {variantScopeLabel}
            </div>
            <p className={styles.variantBannerText}>
              You are editing a <strong>branch-specific variant</strong> of this template.
              Changes apply <strong>only to {variantScopeLabel}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* ── Unfreeze mode banner ─────────────────────────────────────────── */}
      {canEditInUnfreezeMode && !isVariantMode && (
        <div className={styles.unfreezeBanner}>
          <div className={styles.unfreezeBannerIcon}>
            <Unlock size={16} color="#ea580c" />
          </div>
          <div>
            <div className={styles.unfreezeBannerTitle}>Unfreeze Edit Mode — HQ Administrator</div>
            <p className={styles.unfreezeBannerText}>
              This template is globally frozen but has active unfreeze exceptions.
              {unfrozenBranchIds.length  > 0 && <><br /><strong>Unfrozen branches: </strong>{unfrozenBranchIds.length}</>}
              {unfrozenCountryIds.length > 0 && <><br /><strong>Unfrozen countries: </strong>{unfrozenCountryIds.length}</>}
            </p>
          </div>
        </div>
      )}

      {/* ── Read-only / editable-only banner ────────────────────────────── */}
      {(isReadOnly || isEditableOnlyMode) && (
        <div
          className={`${styles.readOnlyBanner} ${
            isViewMode                               ? styles.readOnlyBannerView
            : permissions.freezeStatus === "frozen" ? styles.readOnlyBannerFrozen
            : isEditableOnlyMode                    ? styles.readOnlyBannerLimited
            : styles.readOnlyBannerFrozen
          }`}
        >
          <div
            className={`${styles.readOnlyBannerIcon} ${
              isViewMode           ? styles.readOnlyBannerIconView
              : isEditableOnlyMode ? styles.readOnlyBannerIconLimited
              : styles.readOnlyBannerIconFrozen
            }`}
          >
            {isViewMode ? <Eye size={16} color="#fff" /> : isEditableOnlyMode ? <Unlock size={16} color="#fff" /> : <Lock size={16} color="#fff" />}
          </div>
          <div>
            <div className={`${styles.readOnlyBannerTitle} ${isViewMode ? styles.readOnlyBannerTitleView : isEditableOnlyMode ? styles.readOnlyBannerTitleLimited : styles.readOnlyBannerTitleFrozen}`}>
              {isViewMode ? "View Only Mode" : isEditableOnlyMode ? `${permissions.roleLabel} — Editable Objectives Only` : "Template Frozen — View Only"}
            </div>
            <p className={`${styles.readOnlyBannerText} ${isViewMode ? styles.readOnlyBannerTextView : isEditableOnlyMode ? styles.readOnlyBannerTextLimited : styles.readOnlyBannerTextFrozen}`}>
              {isViewMode
                ? "You are viewing this template. No changes can be saved."
                : isEditableOnlyMode
                ? "You can update objectives marked as Editable. Locked objectives require HQ Admin access."
                : `This template cannot be edited (grace period ended ${formatDate(freezeDates.graceEnd)}).`}
            </p>
          </div>
        </div>
      )}

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitleRow}>
            
            <h1 className={styles.pageTitle}>
              {!editId               ? "Create Evaluation Template"
               : isViewMode         ? "View Evaluation Template"
               : isVariantMode      ? `Edit Variant — ${variantScopeLabel}`
               : isEditableOnlyMode ? "Edit Editable Objectives"
               :                      "Edit Evaluation Template"}
            </h1>
          </div>
          <p className={styles.pageSubtitle}>
            {isViewMode             ? "All fields are read-only."
             : isEditableOnlyMode   ? `Editing as ${permissions.roleLabel} — Editable objectives only.`
             : isReadOnly           ? "All fields are read-only."
             :                        "Design a comprehensive performance evaluation template."}
          </p>
        </div>
        {!isReadOnly && editId && (
          <div className={styles.graceNoteBadge}>
            {permissions.freezeStatus === "grace"
              ? `Grace period — hard freeze ${formatDate(freezeDates.graceEnd)}`
              : `Objective window closes ${formatDate(freezeDates.objectiveSettingEnd)}`}
          </div>
        )}
      </div>

      {/* ── PMS date chips — shown in both edit and view mode ────────────── */}
      {showDateChips && <PmsDateChips freezeDates={freezeDates} />}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 — TEMPLATE CREATION
      ════════════════════════════════════════════════════════════════════ */}
      <div className={styles.sectionDivider}>
        <span className={styles.sectionDividerBadge}>1</span>
        <span className={styles.sectionDividerLabel}>Template Creation</span>
        <div className={styles.sectionDividerLine} />
      </div>

      <div className={`${styles.sectionHeaderBtn} ${styles.sectionHeaderBtn1}`}>
        <div className={`${styles.sectionHeaderBtnIcon} ${styles.sectionHeaderBtnIcon1}`}>
          <FileText size={16} />
        </div>
        <div>
          <div className={styles.sectionHeaderBtnTitle}>Template Details &amp; KPI Structure</div>
          <div className={styles.sectionHeaderBtnSub}>
            Define the name, description, categories and weighted objectives.
          </div>
        </div>
      </div>

      {/* ── Basic Information Card — compact ─────────────────────────────── */}
      <div className={styles.basicInfoCard}>

        <div className={styles.basicInfoCardHeader}>
          <div className={styles.basicInfoCardHeaderLeft}>
            <div className={styles.basicInfoCardHeaderAccent} />
            <div>
              <h3 className={styles.basicInfoCardTitle}>Basic Information</h3>
              <p className={styles.basicInfoCardSubtitle}>
                Template identity and default scoring configuration.
              </p>
            </div>
          </div>
          {isEditableOnlyMode && (
            <span className={styles.basicInfoLockedChip}>
              <Lock size={10} />
              Locked for your role
            </span>
          )}
        </div>

        <div className={styles.basicInfoCardDivider} />

        {/* Template Name — full-width row */}
        <div className={styles.basicInfoFieldRow}>
          <label className={styles.basicInfoLabel}>
            Template Name <span className={styles.requiredStar}>*</span>
          </label>
          <div className={`${styles.basicInfoInputWrap} ${isReadOnly || isEditableOnlyMode ? styles.basicInfoInputWrapReadOnly : ""}`}>
            <input
              className={styles.basicInfoInput}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Sales Manager Appraisal 2025"
              readOnly={isReadOnly || isEditableOnlyMode}
              maxLength={TEMPLATE_NAME_MAX_LENGTH}
            />
          </div>
        </div>

        {/* Description — full-width textarea row */}
        <div className={styles.basicInfoFieldRow}>
          <div className={styles.basicInfoDescLabelRow}>
            <label className={styles.basicInfoLabel}>Description</label>
            {!isReadOnly && !isEditableOnlyMode && (
              <span className={`${styles.basicInfoCharCount} ${description.length > DESCRIPTION_WARN_THRESHOLD ? styles.basicInfoCharCountWarn : ""}`}>
                {description.length} / {DESCRIPTION_MAX_LENGTH}
              </span>
            )}
          </div>
          <div className={`${styles.basicInfoInputWrap} ${styles.basicInfoInputWrapTextarea} ${isReadOnly || isEditableOnlyMode ? styles.basicInfoInputWrapReadOnly : ""}`}>
            <textarea
              className={styles.basicInfoTextarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the purpose, scope, or target audience of this template…"
              readOnly={isReadOnly || isEditableOnlyMode}
              maxLength={DESCRIPTION_MAX_LENGTH}
            />
          </div>
        </div>

      </div>

      {/* ── Add category button ─────────────────────────────────────────── */}
      {!isReadOnly && isHqAdmin && (
        <div className={styles.addCategoryRow}>
          <button className={styles.addCategoryBtn} onClick={handleAddCategory}>
            <Plus size={15} />Add Category
          </button>
        </div>
      )}

      {/* ── Categories & objectives ─────────────────────────────────────── */}
      <div className={styles.categoriesOuterCard}>
        {categories.map((category, categoryIndex) => (
          <div key={categoryIndex} className={styles.categoryBlock}>

            {/* Category header */}
            <div className={`${styles.categoryHeader} ${isReadOnly || isEditableOnlyMode ? styles.categoryHeaderReadOnly : styles.categoryHeaderActive}`}>
              <input
                className={`${styles.categoryNameInput} ${isReadOnly || isEditableOnlyMode ? styles.categoryNameInputReadOnly : ""}`}
                value={category.name}
                placeholder="Enter Category Name…"
                readOnly={isReadOnly || isEditableOnlyMode}
                onChange={(e) => !isReadOnly && !isEditableOnlyMode && handleUpdateCategoryName(categoryIndex, e.target.value)}
              />
              <div className={styles.categoryHeaderRight}>
                <div className={styles.categoryWeightBadge}>
                  <span className={styles.categoryWeightValue}>{categoryWeights[categoryIndex].toFixed(1)}%</span>
                  <span className={styles.categoryWeightUnit}>weight</span>
                </div>
                {!isReadOnly && isHqAdmin && (
                  <button className={styles.categoryRemoveBtn} onClick={() => handleRemoveCategory(categoryIndex)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Objectives table */}
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
                {!isReadOnly && <div className={styles.objColAction} />}
              </div>

              {category.objectives.map((objective, objectiveIndex) => {
                const scaleOption   = resolveKpiOption(objective.kpiScale);
                const controlOption = CONTROL_OPTIONS.find((c) => c.value === (objective.control ?? "Editable")) ?? CONTROL_OPTIONS[1];
                const isNewRow      = !isReadOnly && newObjectiveKey === `${categoryIndex}-${objectiveIndex}`;
                const isLocked      = objective.control === "Locked";
                const isObjReadOnly = isReadOnly || (isEditableOnlyMode && isLocked);

                const rowClassName = isLocked && isEditableOnlyMode
                  ? `${styles.objRow} ${styles.objRowLocked} ${styles.objRowLockedForRole}`
                  : isLocked
                  ? `${styles.objRow} ${styles.objRowLocked}`
                  : `${styles.objRow} ${styles.objRowNormal}`;

                return (
                  <div key={objectiveIndex} className={rowClassName}>
                    <div className={styles.objColNum}>
                      <span className={styles.objRowNum}>{categoryIndex + 1}.{objectiveIndex + 1}</span>
                      {isLocked && isEditableOnlyMode && <span title="Locked"><Lock size={10} color="#94a3b8" style={{ marginLeft: "4px" }} /></span>}
                    </div>

                    <div className={styles.objColName}>
                      <div className={`${styles.inlineInputBox} ${isObjReadOnly ? styles.inlineInputBoxReadOnly : styles.inlineInputBoxEditable} ${isNewRow ? styles.inlineInputBoxNew : ""}`}>
                        <input
                          className={`${styles.objectiveNameInput} ${isObjReadOnly ? styles.objectiveNameInputReadOnly : styles.objectiveNameInputActive}`}
                          value={objective.name ?? ""}
                          readOnly={isObjReadOnly}
                          placeholder={isObjReadOnly ? "—" : "Objective name *"}
                          autoFocus={isNewRow}
                          onFocus={() => setNewObjectiveKey(null)}
                          onChange={(e) => !isObjReadOnly && handleUpdateObjectiveField(categoryIndex, objectiveIndex, "name", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className={styles.objColWeight}>
                      <div className={`${styles.inlineInputBox} ${styles.inlineInputBoxWeight} ${isObjReadOnly ? styles.inlineInputBoxReadOnly : styles.inlineInputBoxEditable}`}>
                        <input
                          className={`${styles.weightInput} ${isObjReadOnly ? styles.weightInputReadOnly : styles.weightInputActive}`}
                          type="number" min="0" max="100" placeholder="0"
                          value={objective.weight ?? ""}
                          readOnly={isObjReadOnly}
                          onChange={(e) => !isObjReadOnly && handleUpdateObjectiveField(categoryIndex, objectiveIndex, "weight", e.target.value === "" ? "" : Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className={styles.objColControl}>
                      {isObjReadOnly || isEditableOnlyMode ? (
                        <ControlBadge option={controlOption} isDisabled />
                      ) : (
                        <Select
                          instanceId={`ctrl-${categoryIndex}-${objectiveIndex}`}
                          styles={tableSelectStyles}
                          options={CONTROL_OPTIONS as any}
                          value={controlOption}
                          isSearchable={false}
                          onChange={(opt) => handleUpdateObjectiveField(categoryIndex, objectiveIndex, "control", (opt as { value: string } | null)?.value ?? "Editable")}
                          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                          menuPosition="fixed"
                          components={{ Option: ControlOptionRenderer as never }}
                          formatOptionLabel={(opt, { context }) =>
                            context === "value"
                              ? <ControlBadge option={opt as (typeof CONTROL_OPTIONS)[number]} isDisabled={false} />
                              : <>{(opt as { label: string }).label}</>
                          }
                        />
                      )}
                    </div>

                    <div className={styles.objColKpi}>
                      {isObjReadOnly ? (
                        <span className={styles.kpiReadOnlyText}>{scaleOption.label}</span>
                      ) : (
                        <Select
                          instanceId={`kpi-${categoryIndex}-${objectiveIndex}`}
                          styles={kpiSelectStyles}
                          options={kpiScaleGroupedOptions as never}
                          value={scaleOption}
                          isSearchable={false}
                          placeholder="Select KPI scale *"
                          onChange={(opt) => handleUpdateObjectiveField(categoryIndex, objectiveIndex, "kpiScale", (opt as { value: string } | null)?.value ?? "interpolated_financial")}
                          components={{ Option: KpiScaleOptionRenderer as never }}
                          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                          menuPosition="fixed"
                          formatGroupLabel={(group) => {
                            const groupMeta = KPI_SCALE_GROUPS.find((g) => g.groupLabel === (group as { label: string }).label);
                            return (
                              <div style={{ fontSize: "10px", fontWeight: "800", color: groupMeta?.color ?? "#64748b", padding: "6px 8px 2px", textTransform: "uppercase" }}>
                                {(group as { label: string }).label}
                              </div>
                            );
                          }}
                          formatOptionLabel={(opt, { context }) =>
                            context === "value" ? (
                              <span style={{ fontSize: "12px", fontWeight: "600", color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ flexShrink: 0 }}>{(opt as (typeof KPI_SCALE_OPTIONS)[number]).icon}</span>
                                {(opt as { label: string }).label}
                                {(opt as (typeof KPI_SCALE_OPTIONS)[number]).isInverse && (
                                  <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "4px", background: "#fee2e2", color: "#dc2626", fontWeight: "700" }}>inv</span>
                                )}
                              </span>
                            ) : <>{(opt as { label: string }).label}</>
                          }
                        />
                      )}
                    </div>

                    <div className={styles.objColMax}>
                      {isObjReadOnly ? (
                        <span className={styles.maxScoreReadOnly}>{objective.kpiMaxScore ?? `=${maxScore}`}</span>
                      ) : (
                        <select
                          className={`${styles.maxScoreSelect} ${objective.kpiMaxScore ? styles.maxScoreSelectSet : styles.maxScoreSelectUnset}`}
                          value={objective.kpiMaxScore ?? ""}
                          onChange={(e) => handleUpdateObjectiveField(categoryIndex, objectiveIndex, "kpiMaxScore", e.target.value === "" ? null : Number(e.target.value))}
                        >
                          <option value="">inherit ({maxScore})</option>
                          {MAX_SCORE_OPTIONS.map((score) => <option key={score} value={score}>{score}</option>)}
                        </select>
                      )}
                    </div>

                    {!isReadOnly && isHqAdmin && (
                      <div className={styles.objColAction}>
                        <button className={styles.objectiveDeleteBtn} onClick={() => handleRemoveObjective(categoryIndex, objectiveIndex)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!isReadOnly && isHqAdmin && (
              <button className={styles.addObjectiveBtn} onClick={() => handleAddObjective(categoryIndex)}>
                <Plus size={14} />
                Add Objective to {category.name || `Category ${categoryIndex + 1}`}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Weight progress bar ─────────────────────────────────────────── */}
      <div className={`${styles.weightBar} ${isWeightValid ? styles.weightBarValid : styles.weightBarInvalid}`}>
        <div
          className={`${styles.weightBarProgress} ${isWeightValid ? styles.weightBarProgressValid : isWeightExceeded ? styles.weightBarProgressExceeded : styles.weightBarProgressWarn}`}
          style={{ width: `${weightBarPercent}%` }}
        />
        <div className={styles.weightBarHeader}>
          <div className={styles.weightBarLeft}>
            <div className={`${styles.weightBadge} ${isWeightValid ? styles.weightBadgeValid : styles.weightBadgeInvalid}`}>{totalWeight}%</div>
            <span className={styles.weightBarTitle}>Total Weighted Allocation</span>
          </div>
          <div>
            {totalWeight < 100   && <span className={`${styles.weightBarStatus} ${styles.weightBarStatusNeed}`}>⚠ Needs <strong>{(100 - totalWeight).toFixed(2)}%</strong> more</span>}
            {isWeightExceeded    && <span className={`${styles.weightBarStatus} ${styles.weightBarStatusExceeded}`}>⚠ Exceeded by <strong>{(totalWeight - 100).toFixed(2)}%</strong></span>}
            {isWeightValid       && <span className={`${styles.weightBarStatus} ${styles.weightBarStatusOk}`}>Balanced &amp; Ready</span>}
          </div>
        </div>
        <div className={styles.weightBreakdownList}>
          {categories.map((cat, catIdx) => {
            const catWeight = categoryWeights[catIdx];
            const catPct    = totalWeight > 0 ? Math.round((catWeight / totalWeight) * 100) : 0;
            const barColour = `hsl(${(catIdx * 47) % 360}, 65%, 45%)`;
            return (
              <div key={catIdx} className={styles.weightBreakdownRow}>
                <span className={styles.weightBreakdownLabel}>{cat.name || `Category ${catIdx + 1}`}</span>
                <div className={styles.weightBreakdownTrack}>
                  <div className={styles.weightBreakdownFill} style={{ width: `${catPct}%`, background: barColour }} />
                </div>
                <span className={styles.weightBreakdownValue} style={{ color: barColour }}>{catWeight}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 1 action buttons ─────────────────────────────────────── */}
      {!isReadOnly && (
  <div className={styles.stickyFooter}>
    <div className={styles.stickyFooterLeft}>
      <span className={styles.stickyFooterDot}
        style={{ background: isWeightValid ? "#10b981" : "#3b82f6" }}
      />
      {categories.length} categor{categories.length === 1 ? "y" : "ies"} ·{" "}
      {categories.reduce((s, c) => s + c.objectives.length, 0)} objectives ·{" "}
      {totalWeight}% allocated
    </div>

    <div className={styles.stickyFooterRight}>
      <div className={styles.cancelBtnWrapper}>
        <button
          className={styles.cancelBtnPill}
          onClick={() => setShowTemplateCancelConfirm((prev) => !prev)}
        >
          Cancel
        </button>
        {showTemplateCancelConfirm && (
          <ConfirmDiscardPopover
            onStay={() => setShowTemplateCancelConfirm(false)}
            onDiscard={handleDiscardTemplate}
          />
        )}
      </div>

      <button
          className={styles.editStyleBtn}
          onClick={
          isWeightValid || isEditableOnlyMode
          ? handleSaveTemplate
          : () => toast.error(`Total weight must be 100%. Currently ${totalWeight}%.`)
                   }
                   disabled={isTemplateSaving}
                   >
          {isTemplateSaving ? "Saving…"
          : isTemplateSaved
          ? <><CheckCircle2 size={15} />{editId ? "Updated!" : "Created!"}</>
          : editId
            ? isVariantMode        ? `Save Variant — ${variantScopeLabel}`
          : isEditableOnlyMode ? "Save Editable Objectives"
          :                      "Update Template"
          : <><FileText size={14} />Create Template</>}
             </button>
           </div>
       </div>
   )}
      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 — DISTRIBUTION STRATEGY
          Teaser card that unlocks once the template is saved.
      ════════════════════════════════════════════════════════════════════ */}
      <div className={styles.sectionDivider} style={{ marginTop: "40px" }}>
        <span className={styles.sectionDividerBadge}>2</span>
        <span className={styles.sectionDividerLabel}>Distribution Strategy</span>
        <div className={styles.sectionDividerLine} />
      </div>

      <div className={`${styles.assignmentTeaserCard} ${!savedTemplateId ? styles.assignmentTeaserCardLocked : ""}`}>

        {/* Left: icon + description */}
        <div className={styles.assignmentTeaserLeft}>
          <div className={`${styles.assignmentTeaserIconWrap} ${savedTemplateId ? styles.assignmentTeaserIconWrapUnlocked : styles.assignmentTeaserIconWrapLocked}`}>
            {savedTemplateId ? <Users size={26} /> : <Lock size={26} />}
          </div>
          <div className={styles.assignmentTeaserContent}>
            <h3 className={styles.assignmentTeaserTitle}>
              {savedTemplateId ? "Configure Distribution Strategy" : "Unlock Distribution Strategy"}
            </h3>
            <p className={styles.assignmentTeaserDesc}>
              {savedTemplateId
                ? "Define who receives this template — by designation, department, sub-department, branch, or assign directly to specific employees."
                : "Save the template above first. Once created, you can distribute it to employees by designation, department, sub-department, or directly."}
            </p>

            {/* Colourful feature mini-cards */}
            <div className={styles.assignmentTeaserFeatures}>
              {[
                { label: "Designation Rules",     icon: UserCheck,     iconBg: "#eff6ff", iconColor: "#2563eb" },
                { label: "Dept & Sub-Dept",        icon: Building2,     iconBg: "#fef3c7", iconColor: "#d97706" },
                { label: "Branch Preview",         icon: GitBranch,     iconBg: "#f0fdf4", iconColor: "#16a34a" },
                { label: "Direct Assignment",      icon: Users,         iconBg: "#f0fdf4", iconColor: "#0d9488" },
                { label: "Admin Quick-Assign",     icon: Zap,           iconBg: "#f5f3ff", iconColor: "#7c3aed" },
              ].map(({ label, icon: Icon, iconBg, iconColor }) => (
                <div
                  key={label}
                  className={`${styles.assignmentTeaserFeatureCard} ${!savedTemplateId ? styles.assignmentTeaserFeatureCardLocked : ""}`}
                >
                  <div className={styles.assignmentTeaserFeatureIcon} style={{ background: savedTemplateId ? iconBg : "#f1f5f9" }}>
                    <Icon size={13} color={savedTemplateId ? iconColor : "#94a3b8"} />
                  </div>
                  <span className={styles.assignmentTeaserFeatureLabel} style={{ color: savedTemplateId ? "#334155" : "#94a3b8" }}>
                    {label}
                  </span>
                  {savedTemplateId && <CheckCircle2 size={10} color={iconColor} style={{ marginLeft: "auto", flexShrink: 0 }} />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: CTA */}
        <div className={styles.assignmentTeaserRight}>
          {savedTemplateId ? (
            <button className={styles.assignmentTeaserBtn} onClick={handleGoToAssignment}>
              <ClipboardList size={16} />
              Template Assignment
              <ArrowRight size={15} />
            </button>
          ) : (
            <div className={styles.assignmentTeaserLockNote}>
              <Lock size={13} color="#94a3b8" />
              <span>Save template to unlock</span>
            </div>
          )}
        </div>

      </div>

      {/* ── Back to dashboard ─────────────────────────────────────────────── */}
      <div className={styles.backRow}>
        <button className={styles.backBtn} onClick={handleBackToDashboard}>
          <ArrowLeft size={15} />Back to Template Dashboard
        </button>
      </div>
     </div>
    </main>
  </div> 

  );
}