/**
 * @file TemplateCreateBase.tsx
 * @description Main component for creating, editing, and viewing PMS evaluation templates.
 *
 * Responsibilities:
 *  - Template form (name, description, categories, weighted objectives)
 *  - Template assignment rules (scope, direct-user, combination)
 *  - Freeze/grace/unfreeze period enforcement
 *  - Variant (branch-specific) edit mode
 
 */

"use client";

import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
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
  X,
  CheckCircle2,
  ArrowLeft,
  Globe,
  Users,
  Building2,
  GitBranch,
  UserCheck,
  FileText,
  Layers,
  MapPin,
  UserCircle,
  LayoutGrid,
  Zap,
  RefreshCw,
} from "lucide-react";
import { formatDate } from "@/lib/freezeUtils";
import styles from "./TemplateCreateBase.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — CONSTANTS
// All magic numbers and repeated string literals live here.
// ─────────────────────────────────────────────────────────────────────────────

/** Base URL for all API requests. Falls back to local dev server. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

// Template form limits
const DEFAULT_MAX_SCORE           = 5;
const DESCRIPTION_WARN_THRESHOLD  = 400;
const DESCRIPTION_MAX_LENGTH      = 500;
const TEMPLATE_NAME_MAX_LENGTH    = 120;
const DEPT_CODE_MAX_LENGTH        = 10;

/** Available max-score options shown in the per-objective dropdown. */
const MAX_SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Designation IDs — must match the `designations` table. */
const DESIGNATION_ID = {
  COUNTRY_ADMIN:     1,
  BRANCH_ADMIN:      2,
  DEPT_ADMIN:        3,
  SUB_DEPT_ADMIN:    4,
} as const;

/** Maps an admin-scope key to its corresponding designation ID. */
const SCOPE_TO_DESIGNATION_ID: Record<string, number> = {
  all_country_admins:  DESIGNATION_ID.COUNTRY_ADMIN,
  all_branch_admins:   DESIGNATION_ID.BRANCH_ADMIN,
  all_dept_admins:     DESIGNATION_ID.DEPT_ADMIN,
  all_sub_dept_admins: DESIGNATION_ID.SUB_DEPT_ADMIN,
};

/** Maps an admin level number to its URL path prefix. */
const ROLE_PREFIX_BY_LEVEL: Record<number, string> = {
  1: "/hq-admin",
  2: "/country-admin",
  3: "/branch-admin",
  4: "/dept-admin",
  5: "/sub-dept-admin",
};

/** Human-readable labels for each admin level. */
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

/** Freeze states that control which edits are permitted. */
type FreezeStatus = "open" | "grace" | "frozen";

/** Dates derived from the active PMS cycle record. */
interface FreezeDates {
  pmsYearStart:          Date;
  objectiveSettingEnd:   Date;
  graceEnd:              Date;
  midYearReview:         Date | null;
  yearEndReview:         Date | null;
}

/** Permissions resolved from the user's admin level and the current freeze status. */
interface TemplatePermissions {
  freezeStatus:     FreezeStatus;
  canEdit:          boolean;
  canCreate:        boolean;
  canDelete:        boolean;
  canEditLocked:    boolean;
  canEditEditable:  boolean;
  canManageAssign:  boolean;
  roleLabel:        string;
}

/** A single KPI objective row inside a category. */
interface ObjectiveRow {
  name:        string;
  kpiScale:    string;
  weight:      number | string | null;
  control:     string;
  mandatory:   boolean;
  kpiMaxScore: number | null;
}

/** A category containing one or more objective rows. */
interface CategoryRow {
  name:       string;
  weight:     number;
  mandatory:  boolean;
  objectives: ObjectiveRow[];
}

/** A user record returned by the /users endpoint. */
interface UserOption {
  id:                  string;
  full_name:           string;
  department_id?:      string;
  branch_id?:          string;
  sub_department_id?:  string;
  designation_id?:     number;
  country_id?:         string;
}

/** A department record. */
interface DepartmentOption {
  id:        string;
  name:      string;
  code:      string | null;
  branch_id: string | null;
}

/** A sub-department record. */
interface SubDepartmentOption {
  id:            string;
  name:          string;
  code:          string | null;
  department_id: string;
}

/** A branch record. */
interface BranchOption {
  id:         string;
  name:       string;
  code:       string | null;
  country_id: string | null;
}

/** A country record. */
interface CountryOption {
  id:   string;
  name: string;
  code: string | null;
}

/**
 * A logical combination rule stored in UI state.
 * Represents one card in the assignment grid.
 * Maps to `template_assignment_combinations` in the DB.
 *
 * Stable key format: `${designation_id}-${dept_name_lower}-${subdept_name_lower}`
 */
interface CombinationRule {
  id:                   string;
  designation_id:       number;
  designation_name:     string;
  department_id:        string;
  department_name:      string;
  sub_department_id:    string;
  sub_department_name:  string;
  /** Branch UUIDs where this combination was found at add-time. Empty = all branches. */
  branch_ids:           string[];
}

/** A global admin quick-assign scope rule. */
interface ScopeRule {
  scope:          string;
  country_id:     string | null;
  designation_id: number;
}

/** Props for the main TemplateCreateBase component. */
interface TemplateCreateBaseProps {
  /** Admin level 1–5. Defaults to HQ Admin (1). */
  level?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — PURE HELPER FUNCTIONS
// No side effects; safe to unit-test in isolation.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives freeze-related dates from the active PMS cycle API record.
 * Falls back to sensible defaults when the cycle has not loaded yet.
 */
function buildFreezeDates(activeCycle: Record<string, unknown> | null): FreezeDates {
  const now         = new Date();
  const fallbackYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

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

/**
 * Computes what actions the current user is permitted to perform
 * based on their admin level and the active PMS freeze status.
 */
function computePermissions(level: number, freezeDates: FreezeDates): TemplatePermissions {
  const now = new Date();

  const freezeStatus: FreezeStatus =
    now <= freezeDates.objectiveSettingEnd ? "open"
    : now <= freezeDates.graceEnd         ? "grace"
    : "frozen";

  const isHqAdmin    = level === 1;
  const isNonHqAdmin = level >= 2 && level <= 5;
  const isFrozen     = freezeStatus === "frozen";

  const canEditLocked    = isHqAdmin && !isFrozen;
  const canEditEditable  = (isHqAdmin && !isFrozen) || (isNonHqAdmin && freezeStatus === "open");

  return {
    freezeStatus,
    canEdit:          canEditEditable,
    canCreate:        isHqAdmin && !isFrozen,
    canDelete:        isHqAdmin && !isFrozen,
    canEditLocked,
    canEditEditable,
    canManageAssign:  isHqAdmin,
    roleLabel:        ROLE_LABEL_BY_LEVEL[level] ?? "Administrator",
  };
}

/** Returns the URL path prefix for the given admin level. */
function getRolePrefix(level: number): string {
  return ROLE_PREFIX_BY_LEVEL[level] ?? "/hq-admin";
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — KPI / CONTROL CONFIG ARRAYS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All supported KPI scale options.
 * badge colours are centralised here; never set inline in JSX.
 */
const KPI_SCALE_OPTIONS = [
  {
    value: "interpolated_financial",
    label: "Financial Achievement",
    group: "interpolated",
    hint:      "LL=90%, UL=110% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value: "interpolated_to_gp",
    label: "T/O & GP Contribution",
    group: "interpolated",
    hint:      "LL=4%, UL=15% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value: "interpolated_sales_ratio",
    label: "Effective Sales Ratio",
    group: "interpolated",
    hint:      "LL=20%, UL=100% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value: "interpolated_gp_margin",
    label: "Individual GP Margin %",
    group: "interpolated",
    hint:      "LL=6%, UL=30% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value: "interpolated_ees_360",
    label: "EES / 360 Degree Feedback",
    group: "interpolated",
    hint:      "LL=65%, UL=85% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value: "interpolated_nps_ccr",
    label: "NPS / CCR Score",
    group: "interpolated",
    hint:      "LL=20, UL=50 · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value: "interpolated_emp_retention",
    label: "Employee Retention",
    group: "interpolated",
    hint:      "LL=75%, UL=95% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value: "interpolated_dpam",
    label: "Overall DPAM Score",
    group: "interpolated",
    hint:      "LL=75%, UL=90% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value: "bracket_statutory",
    label: "Statutory & Legal Compliance",
    group: "bracket",
    hint:      "Bands: <24=1 · =24=5",
    isInverse: false,
    badge:     { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
    icon:      <SlidersHorizontal size={13} color="#92400e" />,
  },
  {
    value: "bracket_wip",
    label: "WIP Score (Days)",
    group: "bracket",
    hint:      "Inverse bands: ≥9=1 · 7=2 · 5=3 · 3=4 · 1=5",
    isInverse: true,
    badge:     { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
    icon:      <TrendingDown size={13} color="#b45309" />,
  },
  {
    value: "bracket_ops_dpam",
    label: "Operations Score / DPAM Ops",
    group: "bracket",
    hint:      "Bands: ≤11.6=1 · –17.4=2 · –23.2=3 · –27=4 · ≥27=5",
    isInverse: false,
    badge:     { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
    icon:      <SlidersHorizontal size={13} color="#92400e" />,
  },
  {
    value: "bracket_individual_sales_gp",
    label: "Individual Sales GP",
    group: "bracket",
    hint:      "Bands: <100K=1 · –500K=2 · –1M=3 · –5M=4 · >5M=5",
    isInverse: false,
    badge:     { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
    icon:      <SlidersHorizontal size={13} color="#92400e" />,
  },
  {
    value: "manual",
    label: "Manual Rating (1–5)",
    group: "manual",
    hint:      "Appraiser enters 1–5 directly",
    isInverse: false,
    badge:     { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
    icon:      <SlidersHorizontal size={13} color="#166534" />,
  },
] as const;

/** KPI group headers used to build the grouped Select menu. */
const KPI_SCALE_GROUPS = [
  { groupKey: "interpolated", groupLabel: "INTERPOLATED", color: "#1e40af" },
  { groupKey: "bracket",      groupLabel: "BRACKET",      color: "#92400e" },
  { groupKey: "manual",       groupLabel: "MANUAL",       color: "#166534" },
] as const;

/** Resolves a KPI scale value string to its full config object. */
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
// SECTION 5 — DEFAULT / INITIAL DATA
// ─────────────────────────────────────────────────────────────────────────────

/** Factory for a new objective row with sensible defaults. */
function createDefaultObjective(
  name:        string,
  kpiScale:    string,
  control:     string,
  weight:      number | null = null,
  kpiMaxScore: number | null = null,
): ObjectiveRow {
  return { name, kpiScale, weight, control, mandatory: true, kpiMaxScore };
}

/** Blank objective appended when the user clicks "Add Objective". */
const BLANK_OBJECTIVE: ObjectiveRow = {
  name:        "",
  kpiScale:    "interpolated_financial",
  weight:      "",
  control:     "Editable",
  mandatory:   false,
  kpiMaxScore: null,
};

/**
 * Default categories pre-populated when creating a brand-new template.
 * Weights of 0 indicate they must be set before saving.
 */
const INITIAL_CATEGORIES: CategoryRow[] = [
  {
    name: "Financial Focus", weight: 0, mandatory: true,
    objectives: [
      createDefaultObjective("Revenue Achievement",                        "interpolated_financial",   "Locked",   10),
      createDefaultObjective("GP Achievement",                             "interpolated_financial",   "Locked",   10),
      createDefaultObjective("Achievement of Dept Revenue",                "interpolated_financial",   "Locked",    3.3),
      createDefaultObjective("Achievement of Dept GP (___)",               "interpolated_financial",   "Editable",  3.4),
      createDefaultObjective("Profit Margin % of ___",                     "interpolated_gp_margin",   "Editable",  3.3),
      createDefaultObjective("Achievement of Sales Dept. Target",          "interpolated_financial",   "Editable",  null),
      createDefaultObjective("Effective Sales Ratio of CMB (60 Days)",     "interpolated_sales_ratio", "Editable",  null),
      createDefaultObjective("GP Margin (Ops) Overall",                    "interpolated_gp_margin",   "Editable",  null),
      createDefaultObjective("Optimize Direct Cost",                       "bracket_wip",              "Editable",  null),
      createDefaultObjective("GP Margin %",                                "interpolated_gp_margin",   "Editable",  null),
      createDefaultObjective("GP Contribution %",                          "interpolated_to_gp",       "Editable",  null),
      createDefaultObjective("Turnover Contribution %",                    "interpolated_to_gp",       "Editable",  null),
      createDefaultObjective("Achievement of Individual Sales Target",     "interpolated_financial",   "Editable",  null),
    ],
  },
  {
    name: "Customer Focus", weight: 0, mandatory: true,
    objectives: [
      createDefaultObjective("NPS Index",                        "interpolated_nps_ccr",        "Locked",   10),
      createDefaultObjective("Complaints on service failures",   "bracket_statutory",           "Locked",   10),
      createDefaultObjective("Monthly Idea Generation",          "manual",                      "Editable",  3),
      createDefaultObjective("GP on Personal Done by Individual","bracket_individual_sales_gp", "Editable",  4),
      createDefaultObjective("NO. of Qualified Sales leads",     "interpolated_financial",      "Editable",  3),
      createDefaultObjective("New Customers brought in",         "interpolated_financial",      "Editable",  null),
      createDefaultObjective("Sales quotation success ratio",    "interpolated_sales_ratio",    "Editable",  null),
    ],
  },
  {
    name: "Human Resources Focus", weight: 0, mandatory: true,
    objectives: [
      createDefaultObjective("360 Feedback (Automated)", "interpolated_ees_360",      "Locked", 5),
      createDefaultObjective("Dept. Retention",           "interpolated_emp_retention","Locked", 5),
      createDefaultObjective("GPTW Score",                "interpolated_financial",    "Locked", 5),
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
// SECTION 6 — LEGACY MIGRATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Maps old kpiScale string values stored in the DB to current enum values. */
const LEGACY_SCALE_MAP: Record<string, string> = {
  standard: "interpolated_financial",
  inverse:  "bracket_wip",
};

/**
 * Converts an old kpiScale string to the current value.
 * Returns the value unchanged if it is already up to date.
 */
function migrateLegacyKpiScale(scale: string | undefined): string {
  if (!scale) return "interpolated_financial";
  return LEGACY_SCALE_MAP[scale] ?? scale;
}

/** Migrates a raw objective record from the DB to the current ObjectiveRow shape. */
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
// SECTION 7 — SELECT STYLE BUILDERS
// Centralised style factories keep JSX free of verbose inline style objects.
// ─────────────────────────────────────────────────────────────────────────────

/** Base react-select styles used for most dropdowns on the page. */
function buildBaseSelectStyles(): object {
  return {
    control: (base: object, { isFocused }: { isFocused: boolean }) => ({
      ...base,
      borderRadius: "10px",
      border:       isFocused ? "1.5px solid #3b82f6" : "1px solid #e2e8f0",
      padding:      "2px 4px",
      boxShadow:    isFocused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
      fontSize:     "13px",
      fontWeight:   "500",
      background:   "#fff",
      "&:hover":    { borderColor: "#3b82f6" },
    }),
    multiValue:       (base: object) => ({ ...base, backgroundColor: "#eff6ff", borderRadius: "6px" }),
    multiValueLabel:  (base: object) => ({ ...base, color: "#1e40af", fontWeight: "700", fontSize: "12px" }),
    multiValueRemove: (base: object) => ({
      ...base, color: "#93c5fd",
      "&:hover": { backgroundColor: "#dbeafe", color: "#1e40af" },
    }),
    placeholder:  (base: object) => ({ ...base, fontSize: "13px", color: "#94a3b8" }),
    menu:         (base: object) => ({
      ...base, borderRadius: "12px",
      boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
      border: "1px solid #f1f5f9", marginTop: "6px", padding: "4px", zIndex: 9999,
    }),
    option: (base: object, { isFocused, isSelected }: { isFocused: boolean; isSelected: boolean }) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color:     isSelected ? "#fff" : "#475569",
      padding:   "9px 14px",
      borderRadius: "8px",
      cursor:    "pointer",
      fontSize:  "13px",
      fontWeight: "500",
    }),
    singleValue: (base: object) => ({ ...base, color: "#1e293b", fontWeight: "600" }),
  };
}

/** Compact react-select styles used inside table cells. */
function buildTableSelectStyles(): object {
  return {
    control: (base: object) => ({
      ...base, border: "none", background: "transparent",
      minHeight: "unset", boxShadow: "none", cursor: "pointer", padding: 0,
    }),
    valueContainer:      (base: object) => ({ ...base, padding: 0 }),
    indicatorsContainer: ()             => ({ display: "none" }),
    singleValue:         (base: object) => ({ ...base, margin: 0 }),
    menu: (base: object) => ({
      ...base, borderRadius: "12px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      border: "1px solid #f1f5f9", marginTop: "6px", padding: "4px", zIndex: 9999, minWidth: "220px",
    }),
    menuList: (base: object) => ({ ...base, maxHeight: "200px" }),
    option: (base: object, { isFocused, isSelected }: { isFocused: boolean; isSelected: boolean }) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color:       isSelected ? "#fff" : "#475569",
      padding:     "8px 12px",
      borderRadius: "8px",
      cursor:      "pointer",
      fontSize:    "12px",
      fontWeight:  "600",
    }),
  };
}

/** react-select styles for the KPI scale picker (wider menu, grouped options). */
function buildKpiSelectStyles(): object {
  return {
    control: (base: object, { isFocused }: { isFocused: boolean }) => ({
      ...base,
      border:       isFocused ? "1.5px solid #3b82f6" : "1.5px solid #e2e8f0",
      borderRadius: "8px",
      background:   "#fff",
      minHeight:    "36px",
      boxShadow:    isFocused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
      cursor:       "pointer",
      padding:      "0 8px",
      "&:hover":    { borderColor: "#3b82f6" },
    }),
    valueContainer:      (base: object) => ({ ...base, padding: "0 2px" }),
    indicatorsContainer: ()             => ({ display: "none" }),
    singleValue:         (base: object) => ({ ...base, margin: 0 }),
    placeholder:         (base: object) => ({ ...base, color: "#94a3b8", fontSize: "12px" }),
    menu: (base: object) => ({
      ...base, borderRadius: "12px",
      boxShadow: "0 12px 32px rgba(0,0,0,0.14)",
      border: "1px solid #e8edf5", marginTop: "4px", padding: "6px", zIndex: 9999, minWidth: "320px",
    }),
    menuList: (base: object) => ({ ...base, maxHeight: "520px", overflowY: "auto" }),
    option: (base: object, { isFocused, isSelected }: { isFocused: boolean; isSelected: boolean }) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color:       isSelected ? "#fff" : "#475569",
      padding:     "7px 10px",
      borderRadius: "7px",
      cursor:      "pointer",
      fontSize:    "12px",
      fontWeight:  "600",
    }),
    groupHeading: (base: object) => ({
      ...base, fontSize: "10px", fontWeight: "800", letterSpacing: "0.08em",
      padding: "8px 10px 3px", textTransform: "uppercase",
      borderTop: "1px solid #f1f5f9", color: "#94a3b8",
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — CUSTOM SELECT RENDERERS
// ─────────────────────────────────────────────────────────────────────────────

/** Custom option renderer for the KPI scale grouped dropdown. */
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
      padding:         "7px 12px",
      borderRadius:    "8px",
      cursor:          "pointer",
      margin:          "1px 0",
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#f0f7ff" : "transparent",
      display:         "flex",
      alignItems:      "center",
      gap:             "8px",
    }}
  >
    <span style={{ opacity: isSelected ? 1 : 0.8, flexShrink: 0 }}>{data.icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize:   "12px",
          fontWeight: "700",
          color:      isSelected ? "#fff" : "#1e293b",
          display:    "flex",
          alignItems: "center",
          gap:        "6px",
        }}
      >
        {data.label}
        {data.isInverse && (
          <span
            style={{
              fontSize:   "9px",
              fontWeight: "700",
              padding:    "1px 5px",
              borderRadius: "4px",
              background: isSelected ? "rgba(255,255,255,0.25)" : "#fee2e2",
              color:      isSelected ? "#fff" : "#dc2626",
            }}
          >
            inverse
          </span>
        )}
      </div>
      <div
        style={{
          fontSize:  "10px",
          color:     isSelected ? "rgba(255,255,255,0.72)" : "#94a3b8",
          marginTop: "2px",
        }}
      >
        {data.hint}
      </div>
    </div>
  </div>
);

/** Custom option renderer for the control (Locked / Editable) dropdown. */
const ControlOptionRenderer = ({
  data, innerProps, isSelected, isFocused,
}: {
  data:       { value: string; label: string };
  innerProps: React.HTMLAttributes<HTMLDivElement>;
  isSelected: boolean;
  isFocused:  boolean;
}) => (
  <div
    {...innerProps}
    style={{
      padding:         "8px 12px",
      borderRadius:    "8px",
      cursor:          "pointer",
      margin:          "1px 0",
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#f0f7ff" : "transparent",
      display:         "flex",
      alignItems:      "center",
      gap:             "6px",
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

/** Badge displayed in the table cell for the currently selected control option. */
const ControlBadge = ({
  option,
  isDisabled,
}: {
  option:     (typeof CONTROL_OPTIONS)[number];
  isDisabled: boolean;
}) => (
  <span
    style={{
      display:        "inline-flex",
      alignItems:     "center",
      gap:            "4px",
      padding:        "4px 10px",
      borderRadius:   "20px",
      fontSize:       "11px",
      fontWeight:     "700",
      whiteSpace:     "nowrap",
      background:     isDisabled ? "#f1f5f9" : option.badge.bg,
      color:          isDisabled ? "#94a3b8" : option.badge.color,
      border:         `1px solid ${isDisabled ? "#e2e8f0" : option.badge.border}`,
      cursor:         isDisabled ? "default" : "pointer",
      userSelect:     "none",
    }}
  >
    {option.value === "Locked" ? <Lock size={10} /> : <Unlock size={10} />}
    {option.label}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — SCOPE DISPLAY CONFIG
// ─────────────────────────────────────────────────────────────────────────────

/** Display metadata for each admin quick-assign scope key. */
const SCOPE_DISPLAY: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  all_country_admins:  { label: "All Country Admins",        icon: <Globe size={13} />,     color: "#0891b2" },
  all_branch_admins:   { label: "All Branch Admins",         icon: <GitBranch size={13} />, color: "#16a34a" },
  all_dept_admins:     { label: "All Department Admins",     icon: <Building2 size={13} />, color: "#d97706" },
  all_sub_dept_admins: { label: "All Sub-Department Admins", icon: <Layers size={13} />,    color: "#7c3aed" },
};

/** Config for the admin quick-assign toggle buttons. */
const ADMIN_SCOPE_OPTIONS = [
  {
    scope:          "all_country_admins",
    label:          "All Country Admins",
    designation_id: DESIGNATION_ID.COUNTRY_ADMIN,
    icon:           <Globe size={13} />,
    color:          { bg: "#ecfeff", text: "#0891b2", border: "#a5f3fc" },
  },
  {
    scope:          "all_branch_admins",
    label:          "All Branch Admins",
    designation_id: DESIGNATION_ID.BRANCH_ADMIN,
    icon:           <GitBranch size={13} />,
    color:          { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
  },
  {
    scope:          "all_dept_admins",
    label:          "All Department Admins",
    designation_id: DESIGNATION_ID.DEPT_ADMIN,
    icon:           <Building2 size={13} />,
    color:          { bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
  },
  {
    scope:          "all_sub_dept_admins",
    label:          "All Sub-Department Admins",
    designation_id: DESIGNATION_ID.SUB_DEPT_ADMIN,
    icon:           <Layers size={13} />,
    color:          { bg: "#f5f3ff", text: "#5b21b6", border: "#ddd6fe" },
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — SUB-COMPONENTS
// Each component has a single responsibility and explicit typed props.
// ─────────────────────────────────────────────────────────────────────────────

// ── NewDeptModal ──────────────────────────────────────────────────────────────

interface NewDeptModalProps {
  initialName: string;
  branches:    BranchOption[];
  onConfirm:   (name: string, code: string, branchId: string | null) => Promise<void>;
  onCancel:    () => void;
}

/**
 * Modal dialog for creating a new department record.
 * Validates required fields before calling onConfirm.
 */
function NewDeptModal({ initialName, branches, onConfirm, onCancel }: NewDeptModalProps) {
  const [departmentName, setDepartmentName] = useState(initialName);
  const [departmentCode, setDepartmentCode] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /** Validates and delegates to the parent's onConfirm handler. */
  const handleSubmit = async () => {
    if (!departmentName.trim()) { toast.error("Department name is required"); return; }
    if (!departmentCode.trim()) { toast.error("Department code is required"); return; }

    setIsSaving(true);
    try {
      await onConfirm(departmentName.trim(), departmentCode.trim().toUpperCase(), selectedBranchId);
    } finally {
      setIsSaving(false);
    }
  };

  const textFields = [
    {
      label:       "Department Name",
      value:       departmentName,
      setter:      (v: string) => setDepartmentName(v),
      placeholder: "e.g. Forwarding Import Air",
      required:    true,
      maxLength:   undefined as number | undefined,
    },
    {
      label:       "Department Code",
      value:       departmentCode,
      setter:      (v: string) => setDepartmentCode(v.toUpperCase()),
      placeholder: "e.g. FIA",
      required:    true,
      maxLength:   DEPT_CODE_MAX_LENGTH,
    },
  ];

  return (
    <div
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         9999,
        background:     "rgba(15,23,42,0.45)",
        backdropFilter: "blur(2px)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background:   "#fff",
          borderRadius: "16px",
          padding:      "28px 32px",
          width:        "420px",
          maxWidth:     "90vw",
          boxShadow:    "0 20px 60px rgba(0,0,0,0.18)",
          border:       "1px solid #e2e8f0",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
            Create New Department
          </h3>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
            <X size={18} />
          </button>
        </div>

        {/* Text fields */}
        {textFields.map(({ label, value, setter, placeholder, required, maxLength }) => (
          <div key={label} style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
              {label}
              {required && <span style={{ color: "#ef4444" }}> *</span>}
            </label>
            <input
              value={value}
              onChange={(e) => setter(e.target.value)}
              placeholder={placeholder}
              maxLength={maxLength}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "9px 12px", fontSize: "13px", outline: "none", color: "#1e293b" }}
            />
          </div>
        ))}

        {/* Optional branch picker */}
        {branches.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
              Branch{" "}
              <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "none", fontWeight: "500" }}>(optional)</span>
            </label>
            <select
              value={selectedBranchId ?? ""}
              onChange={(e) => setSelectedBranchId(e.target.value || null)}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "9px 12px", fontSize: "13px", outline: "none", background: "#fff" }}
            >
              <option value="">— No branch —</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.code ? `${branch.code} — ${branch.name}` : branch.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{ padding: "8px 18px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            style={{
              padding:      "8px 20px",
              borderRadius: "8px",
              border:       "none",
              background:   isSaving ? "#94a3b8" : "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color:        "#fff",
              fontWeight:   "700",
              fontSize:     "13px",
              cursor:       isSaving ? "not-allowed" : "pointer",
            }}
          >
            {isSaving ? "Creating…" : "Create Department"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ConfirmDiscardPopover ─────────────────────────────────────────────────────

interface ConfirmDiscardPopoverProps {
  onStay:    () => void;
  onDiscard: () => void;
}

/** Small popover that asks the user to confirm before discarding unsaved changes. */
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

// ── CombinationRuleCard ───────────────────────────────────────────────────────

interface CombinationRuleCardProps {
  rule:           CombinationRule;
  designations:   Array<{ id: number; name: string }>;
  departments:    DepartmentOption[];
  subDepartments: SubDepartmentOption[];
  branches:       BranchOption[];
  matchedCount:   number;
  canRemove:      boolean;
  onRemove:       () => void;
}

/**
 * Displays one combination rule (designation × department × sub-department).
 * All names are resolved at render-time from the master data props so they
 * remain accurate even when master data loads asynchronously.
 */
function CombinationRuleCard({
  rule,
  designations,
  departments,
  subDepartments,
  branches,
  matchedCount,
  canRemove,
  onRemove,
}: CombinationRuleCardProps) {
  const designationName  = designations.find((d) => d.id === rule.designation_id)?.name
    ?? `Designation #${rule.designation_id}`;
  const departmentName   = departments.find((d) => d.id === rule.department_id)?.name
    ?? rule.department_name ?? rule.department_id;
  const subDeptName      = subDepartments.find((s) => s.id === rule.sub_department_id)?.name
    ?? rule.sub_department_name ?? rule.sub_department_id;
  const ruleBranches     = branches.filter((b) => rule.branch_ids.includes(b.id));

  return (
    <div className={`${styles.assignmentRuleCard} ${styles.assignmentRuleCardRule}`}>
      <div className={styles.ruleCardIconRow}>
        <div className={`${styles.ruleCardTypeIcon} ${styles.ruleCardTypeIconRule}`}>
          <LayoutGrid size={18} />
        </div>
        {canRemove && (
          <button className={styles.ruleCardRemoveBtn} onClick={onRemove} title="Remove rule">
            <X size={13} />
          </button>
        )}
      </div>

      <div className={styles.ruleCardBadgeStack}>
        <span className={`${styles.ruleCardBadge} ${styles.badgeDesig}`}>
          <UserCheck size={10} /><span>{designationName}</span>
        </span>
        <span className={`${styles.ruleCardBadge} ${styles.badgeDept}`}>
          <Building2 size={10} /><span>{departmentName}</span>
        </span>
        <span className={`${styles.ruleCardBadge} ${styles.badgeSubdept}`}>
          <Layers size={10} /><span>{subDeptName}</span>
        </span>
      </div>

      {ruleBranches.length > 0 ? (
        <div className={styles.ruleCardBranchRow}>
          {ruleBranches.map((branch) => (
            <span key={branch.id} className={styles.ruleCardBranchChip}>
              <GitBranch size={8} />
              {branch.code ? `${branch.code} — ${branch.name}` : branch.name}
            </span>
          ))}
        </div>
      ) : (
        <span
          className={`${styles.ruleCardBadge} ${styles.badgeBranch}`}
          style={{ alignSelf: "flex-start" }}
        >
          <GitBranch size={10} /><span>All matching branches</span>
        </span>
      )}

      <div style={{ marginTop: "6px", fontSize: "11px", fontWeight: "700", color: "#7c3aed" }}>
        → {matchedCount} user{matchedCount !== 1 ? "s" : ""} matched
      </div>
    </div>
  );
}

// ── ScopeRuleCard ─────────────────────────────────────────────────────────────

interface ScopeRuleCardProps {
  rule:      ScopeRule;
  countries: CountryOption[];
  canRemove: boolean;
  onRemove:  () => void;
}

/** Displays one admin quick-assign scope rule card. */
function ScopeRuleCard({ rule, countries, canRemove, onRemove }: ScopeRuleCardProps) {
  const scopeDef = SCOPE_DISPLAY[rule.scope] ?? { label: rule.scope, icon: <Globe size={13} />, color: "#0891b2" };
  const country  = rule.country_id ? countries.find((c) => c.id === rule.country_id) : null;

  return (
    <div className={`${styles.assignmentRuleCard} ${styles.assignmentRuleCardScope}`}>
      <div className={styles.ruleCardIconRow}>
        <div className={`${styles.ruleCardTypeIcon} ${styles.ruleCardTypeIconScope}`} style={{ color: scopeDef.color }}>
          {scopeDef.icon}
        </div>
        {canRemove && (
          <button className={styles.ruleCardRemoveBtn} onClick={onRemove} title="Remove">
            <X size={13} />
          </button>
        )}
      </div>
      <div className={styles.ruleCardBadgeStack}>
        <span className={`${styles.ruleCardBadge} ${styles.badgeScope}`}>
          <Zap size={10} /><span>{scopeDef.label}</span>
        </span>
        {country && (
          <span className={`${styles.ruleCardBadge} ${styles.badgeCountry}`}>
            <MapPin size={10} /><span>{country.code ?? country.name}</span>
          </span>
        )}
        {!country && !rule.country_id && (
          <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 500 }}>All countries</span>
        )}
      </div>
    </div>
  );
}

// ── UserCard ──────────────────────────────────────────────────────────────────

interface UserCardProps {
  userId:    string;
  users:     UserOption[];
  canRemove: boolean;
  onRemove:  () => void;
}

/** Displays one directly-assigned employee card. */
function UserCard({ userId, users, canRemove, onRemove }: UserCardProps) {
  const user = users.find((u) => u.id === userId);
  return (
    <div className={`${styles.assignmentRuleCard} ${styles.assignmentRuleCardUser}`}>
      <div className={styles.ruleCardIconRow}>
        <div className={`${styles.ruleCardTypeIcon} ${styles.ruleCardTypeIconUser}`}>
          <UserCircle size={18} />
        </div>
        {canRemove && (
          <button className={styles.ruleCardRemoveBtn} onClick={onRemove} title="Remove">
            <X size={13} />
          </button>
        )}
      </div>
      <div className={styles.ruleCardBadgeStack}>
        <span className={`${styles.ruleCardBadge} ${styles.badgeUser}`}>
          <Users size={10} /><span>{user?.full_name ?? userId}</span>
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11 — MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TemplateCreateBase — full-page form for creating, editing, and assigning
 * PMS evaluation templates.
 *
 * @param level - Admin level (1 = HQ Admin, 2–5 = scoped admins). Defaults to 1.
 */
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
  const rolePrefix     = getRolePrefix(level);
  const dashboardPath  = `${rolePrefix}/template-management`;
  const isHqAdmin      = level === 1;
  const isNonHqAdmin   = level >= 2 && level <= 5;

  // ── PMS cycle & freeze state ────────────────────────────────────────────────
  const [activeCycle,         setActiveCycle]         = useState<Record<string, unknown> | null>(null);
  const [unfrozenBranchIds,   setUnfrozenBranchIds]   = useState<string[]>([]);
  const [unfrozenCountryIds,  setUnfrozenCountryIds]  = useState<string[]>([]);
  const [variantScopeLabel,   setVariantScopeLabel]   = useState<string>("");

  const freezeDates  = useMemo(() => buildFreezeDates(activeCycle), [activeCycle]);
  const permissions  = useMemo(() => computePermissions(level, freezeDates), [level, freezeDates]);

  const canEditInUnfreezeMode = (isUnfreezeMode || isVariantMode) && !isViewMode;
  const isReadOnly             = isViewMode || (!permissions.canEdit && !canEditInUnfreezeMode);
  const isEditableOnlyMode     = isNonHqAdmin && permissions.freezeStatus === "open";

  // ── Template form state ─────────────────────────────────────────────────────
  const [savedTemplateId,  setSavedTemplateId]  = useState<number | null>(editId ? Number(editId) : null);
  const [templateName,     setTemplateName]     = useState("");
  const [description,      setDescription]      = useState("");
  const [maxScore,         setMaxScore]         = useState<number>(DEFAULT_MAX_SCORE);
  const [categories,       setCategories]       = useState<CategoryRow[]>(INITIAL_CATEGORIES);
  const [newObjectiveKey,  setNewObjectiveKey]  = useState<string | null>(null);

  const [showTemplateCancelConfirm, setShowTemplateCancelConfirm] = useState(false);
  const [isTemplateSaving,          setIsTemplateSaving]          = useState(false);
  const [isTemplateSaved,           setIsTemplateSaved]           = useState(false);

  // ── Assignment state ────────────────────────────────────────────────────────
  /**
   * Three separate lists correspond to the three assignment card types:
   *  1. adminScopeRules  → ScopeRuleCard   (null-user rows with a scope key)
   *  2. directUserIds    → UserCard         (rows with a user_id)
   *  3. combinationRules → CombinationRuleCard  (template_assignment_combinations)
   */
  const [adminScopeRules,     setAdminScopeRules]     = useState<ScopeRule[]>([]);
  const [directUserIds,       setDirectUserIds]        = useState<string[]>([]);
  const [combinationRules,    setCombinationRules]     = useState<CombinationRule[]>([]);
  const [selectedCountryForCA, setSelectedCountryForCA] = useState<string>("");

  // Rule-builder ephemeral state (not saved to DB directly)
  const [selectedDesignations,          setSelectedDesignations]          = useState<number[]>([]);
  const [selectedDepartmentForAssign,   setSelectedDepartmentForAssign]   = useState<string>("");
  const [selectedSubDepartmentForAssign, setSelectedSubDepartmentForAssign] = useState<string>("");

  const [showAssignCancelConfirm, setShowAssignCancelConfirm] = useState(false);
  const [isAssignSaving,          setIsAssignSaving]          = useState(false);
  const [isAssignSaved,           setIsAssignSaved]           = useState(false);

  /**
   * Snapshot of assignment state at the last successful save.
   * Used to restore state when the user discards changes.
   */
  const assignmentSnapshot = useRef<{
    scopeRules:       ScopeRule[];
    directUserIds:    string[];
    combinationRules: CombinationRule[];
  }>({ scopeRules: [], directUserIds: [], combinationRules: [] });

  /** Guards against duplicate department-creation requests. */
  const isDeptCreatingRef = useRef(false);

  // ── Master data ─────────────────────────────────────────────────────────────
  const [designations,   setDesignations]   = useState<Array<{ id: number; name: string }>>([]);
  const [departments,    setDepartments]    = useState<DepartmentOption[]>([]);
  const [subDepartments, setSubDepartments] = useState<SubDepartmentOption[]>([]);
  const [branches,       setBranches]       = useState<BranchOption[]>([]);
  const [countries,      setCountries]      = useState<CountryOption[]>([]);
  const [users,          setUsers]          = useState<UserOption[]>([]);
  const [isPageLoading,  setIsPageLoading]  = useState(!!editId);
  const [deptModalState, setDeptModalState] = useState<{ isOpen: boolean; initialName: string }>({
    isOpen:      false,
    initialName: "",
  });

  // ── Memoised select styles ──────────────────────────────────────────────────
  const baseSelectStyles  = useMemo(() => buildBaseSelectStyles(),  []);
  const tableSelectStyles = useMemo(() => buildTableSelectStyles(), []);
  const kpiSelectStyles   = useMemo(() => buildKpiSelectStyles(),   []);

  /** Grouped option structure for the KPI scale Select. */
  const kpiScaleGroupedOptions = useMemo(
    () =>
      KPI_SCALE_GROUPS.map((group) => ({
        label:   group.groupLabel,
        options: KPI_SCALE_OPTIONS.filter((option) => option.group === group.groupKey),
      })),
    [],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────────────────────

  /** Fetches all reference / master data needed to populate dropdowns. */
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [
          designationsRes,
          departmentsRes,
          usersRes,
          branchesRes,
          cycleRes,
          countriesRes,
          subDeptsRes,
        ] = await Promise.all([
          fetch(`${API_BASE}/designations`),
          fetch(`${API_BASE}/departments`),
          fetch(`${API_BASE}/users`),
          fetch(`${API_BASE}/branches`),
          fetch(`${API_BASE}/pms-cycles/active`),
          fetch(`${API_BASE}/countries`),
          fetch(`${API_BASE}/sub-departments`),
        ]);

        // Designations
        const designationsData = await designationsRes.json();
        setDesignations(designationsData);

        // Departments — deduplicated by ID
        const departmentsData: DepartmentOption[] = await departmentsRes.json();
        const uniqueDepts = Array.from(
          new Map(departmentsData.map((d) => [String(d.id), d])).values(),
        ) as DepartmentOption[];
        setDepartments(uniqueDepts);

        // Users
        setUsers(await usersRes.json());
        

        // Branches
        if (branchesRes.ok) {
          const branchData: BranchOption[] = await branchesRes.json();
          setBranches(
            branchData.map((b) => ({
              id:         String(b.id),
              name:       b.name,
              code:       b.code ?? null,
              country_id: b.country_id ?? null,
            })),
          );
        }

        // Active PMS cycle
        if (cycleRes.ok) setActiveCycle(await cycleRes.json());

        // Countries
        if (countriesRes.ok) {
          const countryData: CountryOption[] = await countriesRes.json();
          setCountries(countryData.map((c) => ({ id: String(c.id), name: c.name, code: c.code ?? null })));
        }

        // Sub-departments
        if (subDeptsRes.ok) {
          const subDeptData = await subDeptsRes.json();
          setSubDepartments(
            subDeptData.map((s: Record<string, unknown>) => ({
              id:            String(s.id),
              name:          (s.name as string) ?? "",
              code:          (s.code as string) ?? null,
              department_id: String(s.department_id),
            })),
          );
        }
      } catch {
        toast.error("Failed to load master data. Please refresh the page.");
      }
    };

    loadMasterData();
  }, []);

  /**
   * Loads an existing template when the `edit` URL param is present.
   *
   * Assignment reconstruction priority:
   *  - assignedRules (from template_assignment_combinations) is authoritative.
   *  - Scope rules:        rows with a `scope` field.
   *  - Direct-user rules:  rows with `user_id` but no scope / department.
   *  - Combination rules:  rows with designation + department + sub_department;
   *                        grouped by canonical name to collapse branch variants.
   */
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

        // ── Basic fields ──────────────────────────────────────────────────────
        setTemplateName((template.name as string) ?? "");
        setDescription((template.description as string) ?? "");
        setMaxScore((template.max_score as number) ?? DEFAULT_MAX_SCORE);
        setCategories(
          ((template.categories as Array<Record<string, unknown>>) ?? INITIAL_CATEGORIES).map(
            (cat) => ({
              ...cat,
              objectives: ((cat.objectives as Array<Record<string, unknown>>) ?? []).map(
                migrateObjectiveRow,
              ),
            }),
          ) as CategoryRow[],
        );
        setSavedTemplateId(Number(editId));

        if (isUnfreezeMode) {
          setUnfrozenBranchIds(((template.unfrozenBranchIds as string[]) ?? []).map(String));
          setUnfrozenCountryIds(((template.unfrozenCountryIds as string[]) ?? []).map(String));
        }

        // ── Variant content ───────────────────────────────────────────────────
        if (isVariantMode && variantId) {
          try {
            const variantResponse = await fetch(
              `${API_BASE}/templates/${editId}/variants/${variantId}`,
              { headers: { "X-User-Level": "1" } },
            );
            if (variantResponse.ok) {
              const variant = await variantResponse.json();
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
            // Silently fall back to the main template content
          }
        }

        // ── Reconstruct assignment rules ──────────────────────────────────────
        const assignedRules: Array<Record<string, unknown>> =
          (template.assignedRules as Array<Record<string, unknown>>) ?? [];

        // 1. Scope rules
        const scopeRules: ScopeRule[] = assignedRules
          .filter((r) => r.scope)
          .map((r) => ({
            scope:          r.scope as string,
            country_id:     (r.country_id as string) ?? null,
            designation_id: (r.designation_id as number) ?? 0,
          }));
        setAdminScopeRules(scopeRules);

        // 2. Direct-user rules
        const directUserRules  = assignedRules.filter((r) => r.user_id && !r.scope && !r.department_id);
        const resolvedDirectIds = [...new Set<string>(directUserRules.map((r) => String(r.user_id)))];
        setDirectUserIds(resolvedDirectIds);

        // 3. Combination rules — collapsed by canonical dept+subdept name
        const standardRules = assignedRules.filter(
          (r) => !r.scope && !r.user_id && r.department_id && r.sub_department_id,
        );
        const comboMap = new Map<string, CombinationRule>();
        for (const rule of standardRules) {
          const deptNameKey    = ((rule.department_name    ?? rule.department_id    ?? "") as string).trim().toLowerCase();
          const subDeptNameKey = ((rule.sub_department_name ?? rule.sub_department_id ?? "") as string).trim().toLowerCase();
          const comboKey       = `${rule.designation_id}-${deptNameKey}-${subDeptNameKey}`;

          if (!comboMap.has(comboKey)) {
            comboMap.set(comboKey, {
              id:                  comboKey,
              designation_id:      Number(rule.designation_id),
              designation_name:    (rule.designation_name  as string) ?? String(rule.designation_id),
              department_id:       String(rule.department_id),
              department_name:     (rule.department_name   as string) ?? String(rule.department_id),
              sub_department_id:   String(rule.sub_department_id),
              sub_department_name: (rule.sub_department_name as string) ?? String(rule.sub_department_id),
              branch_ids:          rule.branch_id ? [String(rule.branch_id)] : [],
            });
          } else if (rule.branch_id) {
            // Same logical rule in an additional branch — append branch ID
            const existing = comboMap.get(comboKey)!;
            if (!existing.branch_ids.includes(String(rule.branch_id))) {
              existing.branch_ids.push(String(rule.branch_id));
            }
          }
        }
        const resolvedCombos = [...comboMap.values()];
        setCombinationRules(resolvedCombos);

        assignmentSnapshot.current = {
          scopeRules,
          directUserIds: resolvedDirectIds,
          combinationRules: resolvedCombos,
        };

        if (isViewMode)           toast.info("Viewing template — read-only mode.");
        else if (isEditableOnlyMode) toast.info("You can edit Editable objectives only.");
      } catch {
        toast.error("Failed to load template. Please try again.");
      } finally {
        setIsPageLoading(false);
      }
    };

    loadTemplate();
    // editId, isViewMode intentionally excluded — only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED / MEMOISED VALUES
  // ─────────────────────────────────────────────────────────────────────────

  /** Per-category weight totals (sum of objective weights within each category). */
  const categoryWeights = useMemo(
    () =>
      categories.map((cat) =>
        cat.objectives.reduce((sum, obj) => sum + (Number(obj.weight) || 0), 0),
      ),
    [categories],
  );

  /** Total weight across all categories. Must equal 100 before saving. */
  const totalWeight = useMemo(
    () => categoryWeights.reduce((sum, weight) => sum + weight, 0),
    [categoryWeights],
  );

  /** Sub-department Select options filtered to the currently selected department. */
  const subDeptOptions = useMemo(
    () =>
      subDepartments
        .filter((s) => s.department_id === selectedDepartmentForAssign)
        .map((s) => ({
          value: s.id,
          label: s.code ? `[${s.code}] ${s.name}` : s.name,
        })),
    [subDepartments, selectedDepartmentForAssign],
  );

  /**
   * Branches where the currently-selected (dept + sub-dept) combination exists.
   * Used to preview how many branches a new combination rule will cover.
   */
  const matchingBranchesForSubDept = useMemo((): BranchOption[] => {
    if (!selectedSubDepartmentForAssign || !selectedDepartmentForAssign) return [];

    const selectedDept = departments.find((d) => String(d.id) === selectedDepartmentForAssign);
    if (!selectedDept) return [];
    const deptNameLower = selectedDept.name.trim().toLowerCase();

    const selectedSubDept = subDepartments.find((s) => s.id === selectedSubDepartmentForAssign);
    if (!selectedSubDept) return [];
    const subDeptNameLower = selectedSubDept.name.trim().toLowerCase();

    // Find all departments that share the same name (across branches)
    const sameNameDepts = departments.filter(
      (d) => d.name.trim().toLowerCase() === deptNameLower,
    );

    const validBranchIds = new Set<string>();
    for (const dept of sameNameDepts) {
      if (!dept.branch_id) continue;
      const hasMatchingSubDept = subDepartments.some(
        (s) =>
          s.department_id === String(dept.id) &&
          s.name.trim().toLowerCase() === subDeptNameLower,
      );
      if (hasMatchingSubDept) validBranchIds.add(dept.branch_id);
    }

    return branches.filter((b) => validBranchIds.has(b.id));
  }, [
    selectedSubDepartmentForAssign,
    selectedDepartmentForAssign,
    departments,
    subDepartments,
    branches,
  ]);

  /** Whether all required fields for adding a combination rule are filled. */
  const canAddCombination = useMemo(
    () =>
      selectedDesignations.length > 0 &&
      !!selectedDepartmentForAssign &&
      !!selectedSubDepartmentForAssign,
    [selectedDesignations, selectedDepartmentForAssign, selectedSubDepartmentForAssign],
  );

  /** Department Select options with branch context appended to the label. */
  const departmentSelectOptions = useMemo(
    () =>
      departments.map((dept) => {
        const branch = branches.find((b) => b.id === dept.branch_id);
        const label  = [
          dept.code ? `[${dept.code}]` : null,
          dept.name,
          branch ? `· ${branch.code ?? branch.name}` : null,
        ]
          .filter(Boolean)
          .join(" ");
        return { value: String(dept.id), label };
      }),
    [departments, branches],
  );

  /** Live user-match count for each combination rule, computed in memory. */
  const ruleMatchCounts = useMemo(() => {
    const countByRuleId = new Map<string, number>();
    for (const rule of combinationRules) {
      const deptNameLower    = (departments.find((d) => d.id === rule.department_id)?.name ?? rule.department_name).trim().toLowerCase();
      const subDeptNameLower = (subDepartments.find((s) => s.id === rule.sub_department_id)?.name ?? rule.sub_department_name).trim().toLowerCase();

      const count = users.filter((user) => {
        if (user.designation_id !== rule.designation_id) return false;
        if (rule.branch_ids.length > 0 && !rule.branch_ids.includes(user.branch_id ?? "")) return false;
        const userDeptName = (departments.find((d) => d.id === user.department_id)?.name ?? "").trim().toLowerCase();
        if (userDeptName !== deptNameLower) return false;
        if (user.sub_department_id) {
          const userSubDeptName = (subDepartments.find((s) => s.id === user.sub_department_id)?.name ?? "").trim().toLowerCase();
          if (userSubDeptName !== subDeptNameLower) return false;
        }
        return true;
      }).length;

      countByRuleId.set(rule.id, count);
    }
    return countByRuleId;
  }, [combinationRules, users, departments, subDepartments]);

  /**
   * Estimated total unique users matched across all active assignment rules.
   * Displayed as a preview label before saving.
   */
  const totalMatchedUserCount = useMemo(() => {
    const matchedUserIds = new Set<string>();

    // Scope-matched users
    for (const rule of adminScopeRules) {
      const targetDesignationId = SCOPE_TO_DESIGNATION_ID[rule.scope];
      if (!targetDesignationId) continue;
      users.forEach((user) => {
        if (user.designation_id !== targetDesignationId) return;
        if (rule.country_id) {
          const userBranch = branches.find((b) => b.id === user.branch_id);
          if (userBranch?.country_id !== rule.country_id) return;
        }
        matchedUserIds.add(user.id);
      });
    }

    // Combination-rule-matched users
    for (const rule of combinationRules) {
      const deptNameLower    = (departments.find((d) => d.id === rule.department_id)?.name ?? rule.department_name).trim().toLowerCase();
      const subDeptNameLower = (subDepartments.find((s) => s.id === rule.sub_department_id)?.name ?? rule.sub_department_name).trim().toLowerCase();
      users.forEach((user) => {
        if (matchedUserIds.has(user.id)) return;
        if (user.designation_id !== rule.designation_id) return;
        if (rule.branch_ids.length > 0 && !rule.branch_ids.includes(user.branch_id ?? "")) return;
        const userDeptName = (departments.find((d) => d.id === user.department_id)?.name ?? "").trim().toLowerCase();
        if (userDeptName !== deptNameLower) return;
        if (user.sub_department_id) {
          const userSubDeptName = (subDepartments.find((s) => s.id === user.sub_department_id)?.name ?? "").trim().toLowerCase();
          if (userSubDeptName !== subDeptNameLower) return;
        }
        matchedUserIds.add(user.id);
      });
    }

    // Direct-user matches
    directUserIds.forEach((id) => matchedUserIds.add(id));

    return matchedUserIds.size;
  }, [adminScopeRules, combinationRules, directUserIds, users, branches, departments, subDepartments]);

  // ─────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS — Category / Objective mutations
  // ─────────────────────────────────────────────────────────────────────────

  /** Updates a single field on an objective row. */
  const handleUpdateObjectiveField = useCallback(
    (categoryIndex: number, objectiveIndex: number, field: string, value: unknown) =>
      setCategories((prev) =>
        prev.map((cat, ci) =>
          ci !== categoryIndex
            ? cat
            : {
                ...cat,
                objectives: cat.objectives.map((obj, oi) =>
                  oi !== objectiveIndex ? obj : { ...obj, [field]: value },
                ),
              },
        ),
      ),
    [],
  );

  /** Updates the name of a category. */
  const handleUpdateCategoryName = useCallback(
    (categoryIndex: number, name: string) =>
      setCategories((prev) =>
        prev.map((cat, ci) => (ci === categoryIndex ? { ...cat, name } : cat)),
      ),
    [],
  );

  /** Appends a blank category to the list. */
  const handleAddCategory = useCallback(
    () =>
      setCategories((prev) => [
        ...prev,
        { name: "", weight: 0, objectives: [], mandatory: false },
      ]),
    [],
  );

  /** Removes a category by index. */
  const handleRemoveCategory = useCallback(
    (categoryIndex: number) =>
      setCategories((prev) => prev.filter((_, ci) => ci !== categoryIndex)),
    [],
  );

  /** Appends a blank objective to a category and auto-focuses the new name input. */
  const handleAddObjective = useCallback((categoryIndex: number) => {
    setCategories((prev) =>
      prev.map((cat, ci) =>
        ci !== categoryIndex
          ? cat
          : { ...cat, objectives: [...cat.objectives, { ...BLANK_OBJECTIVE }] },
      ),
    );
    // Defer so the DOM has rendered the new row
    setTimeout(() => {
      setCategories((prev) => {
        const newIndex = prev[categoryIndex]?.objectives.length - 1;
        setNewObjectiveKey(`${categoryIndex}-${newIndex}`);
        return prev;
      });
    }, 0);
  }, []);

  /** Removes an objective from a category by index. */
  const handleRemoveObjective = useCallback(
    (categoryIndex: number, objectiveIndex: number) =>
      setCategories((prev) =>
        prev.map((cat, ci) =>
          ci !== categoryIndex
            ? cat
            : { ...cat, objectives: cat.objectives.filter((_, oi) => oi !== objectiveIndex) },
        ),
      ),
    [],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS — Designation creation
  // ─────────────────────────────────────────────────────────────────────────

  /** Creates a new designation via the API and adds it to the selected list. */
  const handleCreateDesignation = async (name: string) => {
    try {
      const response = await fetch(`${API_BASE}/designations`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error("API error");
      const created = await response.json();
      setDesignations((prev) => [...prev, created]);
      setSelectedDesignations((prev) => [...prev, created.id]);
      toast.success(`Designation "${name}" created.`);
    } catch {
      toast.error("Failed to create designation. Please try again.");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS — Department creation modal
  // ─────────────────────────────────────────────────────────────────────────

  /** Confirms department creation from the modal. Guards against duplicate requests. */
  const handleDeptModalConfirm = async (
    name:     string,
    code:     string,
    branchId: string | null,
  ) => {
    if (isDeptCreatingRef.current) return;
    isDeptCreatingRef.current = true;
    try {
      const response = await fetch(`${API_BASE}/departments`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, code, branch_id: branchId }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error((errorBody as { error?: string }).error ?? "Failed to create department.");
      }
      const created: DepartmentOption = await response.json();
      setDepartments((prev) =>
        prev.some((d) => String(d.id) === String(created.id)) ? prev : [...prev, created],
      );
      toast.success(`Department "${name}" (${code}) created.`);
      setDeptModalState({ isOpen: false, initialName: "" });
    } catch (error) {
      toast.error((error as Error).message ?? "Failed to create department.");
    } finally {
      isDeptCreatingRef.current = false;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS — Assignment rules
  // ─────────────────────────────────────────────────────────────────────────

  /** Adds a new combination rule from the three-step builder. */
  const handleAddCombinationRule = () => {
    if (!canAddCombination) return;

    const selectedDept    = departments.find((d) => String(d.id) === selectedDepartmentForAssign);
    const selectedSubDept = subDepartments.find((s) => s.id === selectedSubDepartmentForAssign);
    const selectedDesig   = designations.find((d) => d.id === selectedDesignations[0]);

    if (!selectedDept || !selectedSubDept) {
      toast.error("Invalid department or sub-department selection.");
      return;
    }

    // Build stable ID from canonical names
    const deptNameLower    = selectedDept.name.trim().toLowerCase();
    const subDeptNameLower = selectedSubDept.name.trim().toLowerCase();
    const comboId          = `${selectedDesignations[0]}-${deptNameLower}-${subDeptNameLower}`;

    if (combinationRules.find((c) => c.id === comboId)) {
      toast.info("This combination rule is already added.");
      return;
    }

    const newRule: CombinationRule = {
      id:                  comboId,
      designation_id:      selectedDesignations[0],
      designation_name:    selectedDesig?.name ?? String(selectedDesignations[0]),
      department_id:       selectedDepartmentForAssign,
      department_name:     selectedDept.name,
      sub_department_id:   selectedSubDepartmentForAssign,
      sub_department_name: selectedSubDept.name,
      branch_ids:          matchingBranchesForSubDept.map((b) => b.id),
    };

    setCombinationRules((prev) => [...prev, newRule]);
    setSelectedDepartmentForAssign("");
    setSelectedSubDepartmentForAssign("");

    const branchCount = matchingBranchesForSubDept.length;
    toast.success(
      branchCount > 0
        ? `Rule added — covers ${branchCount} branch${branchCount !== 1 ? "es" : ""}.`
        : "Rule added — will match future employees when they are created.",
    );
  };

  /** Removes all assignment rules and resets builder state. */
  const handleClearAllAssignments = () => {
    setAdminScopeRules([]);
    setDirectUserIds([]);
    setCombinationRules([]);
    setSelectedDesignations([]);
    setSelectedDepartmentForAssign("");
    setSelectedSubDepartmentForAssign("");
    setSelectedCountryForCA("");
    toast.info("All assignment rules cleared. Press 'Save Assignment' to apply.");
  };

  /**
   * Toggles an admin-scope rule on or off.
   * Country-agnostic rules are toggled; country-specific ones are removed separately.
   */
  const handleToggleAdminScope = (scope: string, designationId: number) => {
    const existingRule = adminScopeRules.find(
      (r) => r.scope === scope && r.country_id === null,
    );
    if (existingRule) {
      setAdminScopeRules((prev) =>
        prev.filter((r) => !(r.scope === scope && r.country_id === null)),
      );
    } else {
      setAdminScopeRules((prev) => [...prev, { scope, country_id: null, designation_id: designationId }]);
    }
  };

  /** Adds a country-specific Country Admin scope rule. */
  const handleAddCountrySpecificCA = () => {
    if (!selectedCountryForCA) {
      toast.error("Please select a country first.");
      return;
    }
    if (adminScopeRules.find((r) => r.scope === "all_country_admins" && r.country_id === null)) {
      toast.info("'All Country Admins' is already selected — this covers all countries.");
      return;
    }
    if (
      adminScopeRules.find(
        (r) => r.country_id === selectedCountryForCA && r.scope === "all_country_admins",
      )
    ) {
      toast.info("A rule for this country is already added.");
      return;
    }
    setAdminScopeRules((prev) => [
      ...prev,
      { scope: "all_country_admins", country_id: selectedCountryForCA, designation_id: DESIGNATION_ID.COUNTRY_ADMIN },
    ]);
    setSelectedCountryForCA("");
  };

  /** Removes an admin scope rule by its index in the list. */
  const handleRemoveAdminScopeRule = (index: number) =>
    setAdminScopeRules((prev) => prev.filter((_, i) => i !== index));

  // ─────────────────────────────────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validates the template form before saving.
   * Checks: name presence, all objectives have name + KPI scale, total weight = 100.
   *
   * @returns true if valid, false otherwise (shows a toast on failure).
   */
  const validateTemplateForm = (): boolean => {
    if (!templateName.trim()) {
      toast.error("Please enter a Template Name.");
      return false;
    }
    for (const category of categories) {
      for (const objective of category.objectives) {
        if (!objective.name.trim()) {
          toast.error("All objectives must have a name.");
          return false;
        }
        if (!objective.kpiScale) {
          toast.error("All objectives must have a KPI Scale selected.");
          return false;
        }
      }
    }
    if (totalWeight !== 100) {
      toast.error(`Total weight must be exactly 100%. Currently ${totalWeight}%.`);
      return false;
    }
    return true;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SAVE / DISCARD — Template
  // ─────────────────────────────────────────────────────────────────────────

  /** Persists the template to the API (create or update). */
  const handleSaveTemplate = async () => {
    if (isViewMode) { toast.error("View-only mode — no changes can be saved."); return; }
    if (!permissions.canEdit && !canEditInUnfreezeMode && editId)    { toast.error("You do not have permission to edit this template."); return; }
    if (!permissions.canCreate && !canEditInUnfreezeMode && !editId) { toast.error("You do not have permission to create templates."); return; }
    if (!validateTemplateForm()) return;

    const categoriesWithComputedWeight = categories.map((cat) => ({
      ...cat,
      weight: cat.objectives.reduce((sum, obj) => sum + (Number(obj.weight) || 0), 0),
    }));

    const payload = {
      name:         isHqAdmin ? templateName.trim() : undefined,
      description:  isHqAdmin ? description.trim()  : undefined,
      max_score:    isHqAdmin ? maxScore             : undefined,
      categories:   categoriesWithComputedWeight,
      totalWeight,
      lastModified: new Date().toISOString(),
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
          "Content-Type":  "application/json",
          "X-User-Level":  String(level),
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
          ? isVariantMode
            ? `Variant saved for ${variantScopeLabel}!`
            : "Template updated successfully!"
          : "Template created! Configure assignment below.",
      );
    } catch (error) {
      toast.error((error as Error).message ?? "Failed to save template. Please try again.");
    } finally {
      setIsTemplateSaving(false);
    }
  };

  /** Resets template form to either blank (new) or reloads from the server (edit). */
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

  // ─────────────────────────────────────────────────────────────────────────
  // SAVE / DISCARD — Assignment
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Builds the payload rules array for the /assign-template endpoint.
   *
   * - Scope rules  → sent as-is; backend resolves matching users.
   * - Direct users → one row per user_id.
   * - Combination rules → expanded to one row per matching branch;
   *                       falls back to a branch-agnostic row if none match.
   */
  const buildAssignmentPayloadRules = useCallback((): Array<Record<string, unknown>> => {
    const rules: Array<Record<string, unknown>> = [];

    // Scope rules
    for (const rule of adminScopeRules) {
      rules.push({
        scope:          rule.scope,
        designation_id: rule.designation_id,
        country_id:     rule.country_id,
        user_id:        null,
        department_id:  null,
        branch_id:      null,
        sub_department_id: null,
      });
    }

    // Direct-user rules
    for (const userId of directUserIds) {
      rules.push({
        user_id:        userId,
        scope:          null,
        designation_id: null,
        department_id:  null,
        branch_id:      null,
        sub_department_id: null,
        country_id:     null,
      });
    }

    // Combination rules — expand across all matching branches
    for (const combo of combinationRules) {
      const sourceDept    = departments.find((d) => String(d.id) === combo.department_id);
      const sourceSubDept = subDepartments.find((s) => s.id === combo.sub_department_id);
      const deptNameLower    = (sourceDept?.name ?? combo.department_name).trim().toLowerCase();
      const subDeptNameLower = (sourceSubDept?.name ?? combo.sub_department_name).trim().toLowerCase();

      const sameNameDepts = departments.filter(
        (d) => d.name.trim().toLowerCase() === deptNameLower && d.branch_id,
      );

      let didPushBranchRow = false;
      for (const dept of sameNameDepts) {
        if (combo.branch_ids.length > 0 && !combo.branch_ids.includes(dept.branch_id!)) continue;
        const matchingSubDept = subDepartments.find(
          (s) =>
            s.department_id === String(dept.id) &&
            s.name.trim().toLowerCase() === subDeptNameLower,
        );
        if (!matchingSubDept) continue;

        rules.push({
          designation_id:    combo.designation_id,
          department_id:     String(dept.id),
          branch_id:         dept.branch_id!,
          sub_department_id: matchingSubDept.id,
          user_id:           null,
          country_id:        null,
          scope:             null,
        });
        didPushBranchRow = true;
      }

      // No branch-specific match found — push a branch-agnostic fallback row
      if (!didPushBranchRow) {
        rules.push({
          designation_id:    combo.designation_id,
          department_id:     combo.department_id,
          branch_id:         null,
          sub_department_id: combo.sub_department_id,
          user_id:           null,
          country_id:        null,
          scope:             null,
        });
      }
    }

    return rules;
  }, [adminScopeRules, directUserIds, combinationRules, departments, subDepartments]);

  /** Saves assignment rules to the API. */
  const handleSaveAssignment = async () => {
    if (isViewMode)       { toast.error("View-only mode — no changes can be saved."); return; }
    if (!isHqAdmin)       { toast.error("Only HQ Admins can manage template assignments."); return; }
    if (!savedTemplateId) { toast.error("Please save the template first."); return; }

    const payloadRules = buildAssignmentPayloadRules();
    setIsAssignSaving(true);
    try {
      const response = await fetch(`${API_BASE}/assign-template`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-User-Level": String(level) },
        body:    JSON.stringify({ template_id: savedTemplateId, rules: payloadRules }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error((errorBody as { error?: string }).error ?? "Assignment failed.");
      }

      const result = await response.json();
      assignmentSnapshot.current = {
        scopeRules:       [...adminScopeRules],
        directUserIds:    [...directUserIds],
        combinationRules: [...combinationRules],
      };
      setIsAssignSaved(true);
      setTimeout(() => setIsAssignSaved(false), 3000);

      const assignedCount = result.users_matched ?? result.users_assigned ?? "?";
      toast.success(
        `Assignment saved! ${assignedCount} user${assignedCount !== 1 ? "s" : ""} assigned.`,
      );
    } catch (error) {
      toast.error((error as Error).message ?? "Failed to save assignment. Please try again.");
    } finally {
      setIsAssignSaving(false);
    }
  };

  /** Reverts assignment state to the last saved snapshot. */
  const handleDiscardAssignment = () => {
    setAdminScopeRules([...assignmentSnapshot.current.scopeRules]);
    setDirectUserIds([...assignmentSnapshot.current.directUserIds]);
    setCombinationRules([...assignmentSnapshot.current.combinationRules]);
    setSelectedDepartmentForAssign("");
    setSelectedSubDepartmentForAssign("");
    setShowAssignCancelConfirm(false);
  };

  /** Navigates back to the template management dashboard. */
  const handleBackToDashboard = () => {
    router.push(dashboardPath);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  const isWeightValid    = totalWeight === 100;
  const isWeightExceeded = totalWeight > 100;
  const weightBarPercent = Math.min(totalWeight, 100);

  const totalAssignmentRuleCount =
    adminScopeRules.length + directUserIds.length + combinationRules.length;

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────────────────────────────────

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
    <div className={styles.pageWrapper}>

      {/* ── Department creation modal ─────────────────────────────────────── */}
      {deptModalState.isOpen && (
        <NewDeptModal
          initialName={deptModalState.initialName}
          branches={branches}
          onConfirm={handleDeptModalConfirm}
          onCancel={() => setDeptModalState({ isOpen: false, initialName: "" })}
        />
      )}

      {/* ── Variant mode banner ──────────────────────────────────────────── */}
      {isVariantMode && !isViewMode && (
        <div
          style={{
            display:      "flex",
            alignItems:   "flex-start",
            gap:          "12px",
            padding:      "14px 18px",
            marginBottom: "16px",
            background:   "#eff6ff",
            border:       "1.5px solid #bfdbfe",
            borderRadius: "12px",
            borderLeft:   "4px solid #2563eb",
          }}
        >
          <div
            style={{
              width:          "32px",
              height:         "32px",
              background:     "#dbeafe",
              border:         "1px solid #bfdbfe",
              borderRadius:   "8px",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              flexShrink:     0,
            }}
          >
            <GitBranch size={16} color="#2563eb" />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "800", color: "#1e40af", marginBottom: "4px" }}>
              Branch Variant Edit Mode — {variantScopeLabel}
            </div>
            <p style={{ margin: 0, fontSize: "12px", color: "#3b82f6", lineHeight: 1.5 }}>
              You are editing a <strong>branch-specific variant</strong> of this template.
              Changes apply <strong>only to {variantScopeLabel}</strong> — the main template and
              all other branches remain unchanged.
            </p>
          </div>
        </div>
      )}

      {/* ── Unfreeze mode banner ─────────────────────────────────────────── */}
      {canEditInUnfreezeMode && !isVariantMode && (
        <div
          style={{
            display:      "flex",
            alignItems:   "flex-start",
            gap:          "12px",
            padding:      "14px 18px",
            marginBottom: "16px",
            background:   "#fff7ed",
            border:       "1.5px solid #fed7aa",
            borderRadius: "12px",
            borderLeft:   "4px solid #ea580c",
          }}
        >
          <div
            style={{
              width:          "32px",
              height:         "32px",
              background:     "#ffedd5",
              border:         "1px solid #fed7aa",
              borderRadius:   "8px",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              flexShrink:     0,
            }}
          >
            <Unlock size={16} color="#ea580c" />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "800", color: "#9a3412", marginBottom: "4px" }}>
              Unfreeze Edit Mode — HQ Administrator
            </div>
            <p style={{ margin: 0, fontSize: "12px", color: "#c2410c", lineHeight: 1.5 }}>
              This template is globally frozen but has active unfreeze exceptions.
              Your changes will apply to all versions.
              {unfrozenBranchIds.length > 0 && (
                <><br /><strong>Unfrozen branches: </strong>{unfrozenBranchIds.length}</>
              )}
              {unfrozenCountryIds.length > 0 && (
                <><br /><strong>Unfrozen countries: </strong>{unfrozenCountryIds.length}</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ── Read-only / editable-only banner ────────────────────────────── */}
      {(isReadOnly || isEditableOnlyMode) && (
        <div
          className={`${styles.readOnlyBanner} ${
            isViewMode
              ? styles.readOnlyBannerView
              : permissions.freezeStatus === "frozen"
              ? styles.readOnlyBannerFrozen
              : isEditableOnlyMode
              ? styles.readOnlyBannerLimited
              : styles.readOnlyBannerFrozen
          }`}
        >
          <div
            className={`${styles.readOnlyBannerIcon} ${
              isViewMode
                ? styles.readOnlyBannerIconView
                : isEditableOnlyMode
                ? styles.readOnlyBannerIconLimited
                : styles.readOnlyBannerIconFrozen
            }`}
          >
            {isViewMode
              ? <Eye    size={16} color="#fff" />
              : isEditableOnlyMode
              ? <Unlock size={16} color="#fff" />
              : <Lock   size={16} color="#fff" />}
          </div>
          <div>
            <div
              className={`${styles.readOnlyBannerTitle} ${
                isViewMode
                  ? styles.readOnlyBannerTitleView
                  : isEditableOnlyMode
                  ? styles.readOnlyBannerTitleLimited
                  : styles.readOnlyBannerTitleFrozen
              }`}
            >
              {isViewMode
                ? "View Only Mode"
                : isEditableOnlyMode
                ? `${permissions.roleLabel} — Editable Objectives Only`
                : "Template Frozen — View Only"}
            </div>
            <p
              className={`${styles.readOnlyBannerText} ${
                isViewMode
                  ? styles.readOnlyBannerTextView
                  : isEditableOnlyMode
                  ? styles.readOnlyBannerTextLimited
                  : styles.readOnlyBannerTextFrozen
              }`}
            >
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
            {isViewMode && (
              <div className={styles.viewModeIconWrapper}>
                <Eye size={18} color="#3b82f6" />
              </div>
            )}
            <h1 className={styles.pageTitle}>
              {!editId
                ? "Create Evaluation Template"
                : isViewMode
                ? "View Evaluation Template"
                : isVariantMode
                ? `Edit Variant — ${variantScopeLabel}`
                : isEditableOnlyMode
                ? "Edit Editable Objectives"
                : "Edit Evaluation Template"}
            </h1>
          </div>
          <p className={styles.pageSubtitle}>
            {isViewMode
              ? "All fields are read-only."
              : isEditableOnlyMode
              ? `Editing as ${permissions.roleLabel} — Editable objectives only.`
              : isReadOnly
              ? "All fields are read-only."
              : "Design a comprehensive performance evaluation template."}
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

      {/* ── PMS date chips ───────────────────────────────────────────────── */}
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
            <div
              className={`${styles.pmsCycleChipValue} ${
                permissions.freezeStatus === "open"
                  ? styles.pmsCycleStatusOpen
                  : permissions.freezeStatus === "grace"
                  ? styles.pmsCycleStatusGrace
                  : styles.pmsCycleStatusFrozen
              }`}
            >
              {permissions.freezeStatus === "open"
                ? "Open"
                : permissions.freezeStatus === "grace"
                ? "Grace Period"
                : "Frozen"}
            </div>
          </div>
        </div>
      )}

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

      {/* Basic information card */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <div className={styles.sectionHeadingAccent} />
          <h3 className={styles.sectionHeadingTitle}>Basic Information</h3>
          {isEditableOnlyMode && (
            <span className={styles.sectionHeadingReadOnly}>(locked for your role)</span>
          )}
        </div>

        {/* Template name */}
        <div className={styles.basicInfoSingle}>
          <label className={styles.formFieldLabel}>
            Template Name <span className={styles.requiredStar}>*</span>
          </label>
          <input
            className={`${styles.formInput} ${
              isReadOnly || isEditableOnlyMode ? styles.formInputReadOnly : ""
            }`}
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Sales Manager Appraisal 2025"
            readOnly={isReadOnly || isEditableOnlyMode}
            maxLength={TEMPLATE_NAME_MAX_LENGTH}
          />
          {!isReadOnly && !isEditableOnlyMode && (
            <p className={styles.fieldHint}>Use a clear, year-specific name.</p>
          )}
        </div>

        {/* Description */}
        <div className={styles.descriptionRow}>
          <div className={styles.descriptionLabelRow}>
            <label className={styles.formFieldLabel}>Description</label>
            {!isReadOnly && !isEditableOnlyMode && (
              <span
                className={`${styles.charCounter} ${
                  description.length > DESCRIPTION_WARN_THRESHOLD ? styles.charCounterWarn : ""
                }`}
              >
                {description.length} / {DESCRIPTION_MAX_LENGTH}
              </span>
            )}
          </div>
          <textarea
            className={`${styles.formTextarea} ${
              isReadOnly || isEditableOnlyMode ? styles.formTextareaReadOnly : ""
            }`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the purpose, scope, or target audience…"
            readOnly={isReadOnly || isEditableOnlyMode}
            maxLength={DESCRIPTION_MAX_LENGTH}
          />
        </div>
      </div>

      {/* Add category button */}
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
            <div
              className={`${styles.categoryHeader} ${
                isReadOnly || isEditableOnlyMode
                  ? styles.categoryHeaderReadOnly
                  : styles.categoryHeaderActive
              }`}
            >
              <input
                className={`${styles.categoryNameInput} ${
                  isReadOnly || isEditableOnlyMode ? styles.categoryNameInputReadOnly : ""
                }`}
                value={category.name}
                placeholder="Enter Category Name…"
                readOnly={isReadOnly || isEditableOnlyMode}
                onChange={(e) =>
                  !isReadOnly && !isEditableOnlyMode &&
                  handleUpdateCategoryName(categoryIndex, e.target.value)
                }
              />
              <div className={styles.categoryHeaderRight}>
                <div className={styles.categoryWeightBadge}>
                  <span className={styles.categoryWeightValue}>
                    {categoryWeights[categoryIndex].toFixed(1)}%
                  </span>
                  <span className={styles.categoryWeightUnit}>weight</span>
                </div>
                {!isReadOnly && isHqAdmin && (
                  <button
                    className={styles.categoryRemoveBtn}
                    onClick={() => handleRemoveCategory(categoryIndex)}
                  >
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
                const controlOption =
                  CONTROL_OPTIONS.find((c) => c.value === (objective.control ?? "Editable")) ??
                  CONTROL_OPTIONS[1];
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

                    {/* Row number */}
                    <div className={styles.objColNum}>
                      <span className={styles.objRowNum}>
                        {categoryIndex + 1}.{objectiveIndex + 1}
                      </span>
                      {isLocked && isEditableOnlyMode && (
                        <span title="Locked">
                          <Lock size={10} color="#94a3b8" style={{ marginLeft: "4px" }} />
                        </span>
                      )}
                    </div>

                    {/* Objective name */}
                    <div className={styles.objColName}>
                      <div
                        className={`${styles.inlineInputBox} ${
                          isObjReadOnly
                            ? styles.inlineInputBoxReadOnly
                            : styles.inlineInputBoxEditable
                        } ${isNewRow ? styles.inlineInputBoxNew : ""}`}
                      >
                        <input
                          className={`${styles.objectiveNameInput} ${
                            isObjReadOnly
                              ? styles.objectiveNameInputReadOnly
                              : styles.objectiveNameInputActive
                          }`}
                          value={objective.name ?? ""}
                          readOnly={isObjReadOnly}
                          placeholder={isObjReadOnly ? "—" : "Objective name *"}
                          autoFocus={isNewRow}
                          onFocus={() => setNewObjectiveKey(null)}
                          onChange={(e) =>
                            !isObjReadOnly &&
                            handleUpdateObjectiveField(categoryIndex, objectiveIndex, "name", e.target.value)
                          }
                        />
                      </div>
                    </div>

                    {/* Weight */}
                    <div className={styles.objColWeight}>
                      <div
                        className={`${styles.inlineInputBox} ${styles.inlineInputBoxWeight} ${
                          isObjReadOnly
                            ? styles.inlineInputBoxReadOnly
                            : styles.inlineInputBoxEditable
                        }`}
                      >
                        <input
                          className={`${styles.weightInput} ${
                            isObjReadOnly ? styles.weightInputReadOnly : styles.weightInputActive
                          }`}
                          type="number"
                          min="0"
                          max="100"
                          placeholder="0"
                          value={objective.weight ?? ""}
                          readOnly={isObjReadOnly}
                          onChange={(e) =>
                            !isObjReadOnly &&
                            handleUpdateObjectiveField(
                              categoryIndex,
                              objectiveIndex,
                              "weight",
                              e.target.value === "" ? "" : Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    </div>

                    {/* Control (Locked / Editable) */}
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
                          onChange={(opt) =>
                            handleUpdateObjectiveField(
                              categoryIndex,
                              objectiveIndex,
                              "control",
                              (opt as { value: string } | null)?.value ?? "Editable",
                            )
                          }
                          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                          menuPosition="fixed"
                          components={{ Option: ControlOptionRenderer as never }}
                          formatOptionLabel={(opt, { context }) =>
                            context === "value" ? (
                              <ControlBadge
                                option={opt as (typeof CONTROL_OPTIONS)[number]}
                                isDisabled={false}
                              />
                            ) : (
                              <>{(opt as { label: string }).label}</>
                            )
                          }
                        />
                      )}
                    </div>

                    {/* KPI Scale */}
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
                          onChange={(opt) =>
                            handleUpdateObjectiveField(
                              categoryIndex,
                              objectiveIndex,
                              "kpiScale",
                              (opt as { value: string } | null)?.value ?? "interpolated_financial",
                            )
                          }
                          components={{ Option: KpiScaleOptionRenderer as never }}
                          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                          menuPosition="fixed"
                          formatGroupLabel={(group) => {
                            const groupMeta = KPI_SCALE_GROUPS.find(
                              (g) => g.groupLabel === (group as { label: string }).label,
                            );
                            return (
                              <div
                                style={{
                                  fontSize:      "10px",
                                  fontWeight:    "800",
                                  color:         groupMeta?.color ?? "#64748b",
                                  padding:       "6px 8px 2px",
                                  textTransform: "uppercase",
                                }}
                              >
                                {(group as { label: string }).label}
                              </div>
                            );
                          }}
                          formatOptionLabel={(opt, { context }) =>
                            context === "value" ? (
                              <span
                                style={{
                                  fontSize:   "12px",
                                  fontWeight: "600",
                                  color:      "#1e293b",
                                  display:    "flex",
                                  alignItems: "center",
                                  gap:        "6px",
                                }}
                              >
                                <span style={{ flexShrink: 0 }}>
                                  {(opt as (typeof KPI_SCALE_OPTIONS)[number]).icon}
                                </span>
                                {(opt as { label: string }).label}
                                {(opt as (typeof KPI_SCALE_OPTIONS)[number]).isInverse && (
                                  <span
                                    style={{
                                      fontSize:     "9px",
                                      padding:      "1px 5px",
                                      borderRadius: "4px",
                                      background:   "#fee2e2",
                                      color:        "#dc2626",
                                      fontWeight:   "700",
                                    }}
                                  >
                                    inv
                                  </span>
                                )}
                              </span>
                            ) : (
                              <>{(opt as { label: string }).label}</>
                            )
                          }
                        />
                      )}
                    </div>

                    {/* Max score override */}
                    <div className={styles.objColMax}>
                      {isObjReadOnly ? (
                        <span className={styles.maxScoreReadOnly}>
                          {objective.kpiMaxScore ?? `=${maxScore}`}
                        </span>
                      ) : (
                        <select
                          className={`${styles.maxScoreSelect} ${
                            objective.kpiMaxScore
                              ? styles.maxScoreSelectSet
                              : styles.maxScoreSelectUnset
                          }`}
                          value={objective.kpiMaxScore ?? ""}
                          onChange={(e) =>
                            handleUpdateObjectiveField(
                              categoryIndex,
                              objectiveIndex,
                              "kpiMaxScore",
                              e.target.value === "" ? null : Number(e.target.value),
                            )
                          }
                        >
                          <option value="">inherit ({maxScore})</option>
                          {MAX_SCORE_OPTIONS.map((score) => (
                            <option key={score} value={score}>
                              {score}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Delete objective */}
                    {!isReadOnly && isHqAdmin && (
                      <div className={styles.objColAction}>
                        <button
                          className={styles.objectiveDeleteBtn}
                          onClick={() => handleRemoveObjective(categoryIndex, objectiveIndex)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add objective button */}
            {!isReadOnly && isHqAdmin && (
              <button
                className={styles.addObjectiveBtn}
                onClick={() => handleAddObjective(categoryIndex)}
              >
                <Plus size={14} />
                Add Objective to {category.name || `Category ${categoryIndex + 1}`}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Weight progress bar ─────────────────────────────────────────── */}
      <div
        className={`${styles.weightBar} ${
          isWeightValid ? styles.weightBarValid : styles.weightBarInvalid
        }`}
      >
        <div
          className={`${styles.weightBarProgress} ${
            isWeightValid
              ? styles.weightBarProgressValid
              : isWeightExceeded
              ? styles.weightBarProgressExceeded
              : styles.weightBarProgressWarn
          }`}
          style={{ width: `${weightBarPercent}%` }}
        />
        <div className={styles.weightBarHeader}>
          <div className={styles.weightBarLeft}>
            <div
              className={`${styles.weightBadge} ${
                isWeightValid ? styles.weightBadgeValid : styles.weightBadgeInvalid
              }`}
            >
              {totalWeight}%
            </div>
            <span className={styles.weightBarTitle}>Total Weighted Allocation</span>
          </div>
          <div>
            {totalWeight < 100 && (
              <span className={`${styles.weightBarStatus} ${styles.weightBarStatusNeed}`}>
                ⚠ Needs <strong>{(100 - totalWeight).toFixed(2)}%</strong> more
              </span>
            )}
            {isWeightExceeded && (
              <span className={`${styles.weightBarStatus} ${styles.weightBarStatusExceeded}`}>
                ⚠ Exceeded by <strong>{(totalWeight - 100).toFixed(2)}%</strong>
              </span>
            )}
            {isWeightValid && (
              <span className={`${styles.weightBarStatus} ${styles.weightBarStatusOk}`}>
                Balanced &amp; Ready
              </span>
            )}
          </div>
        </div>
        <div className={styles.weightBreakdownList}>
          {categories.map((cat, catIdx) => {
            const catWeight = categoryWeights[catIdx];
            const catPct    = totalWeight > 0 ? Math.round((catWeight / totalWeight) * 100) : 0;
            const barColour = `hsl(${(catIdx * 47) % 360}, 65%, 45%)`;
            return (
              <div key={catIdx} className={styles.weightBreakdownRow}>
                <span className={styles.weightBreakdownLabel}>
                  {cat.name || `Category ${catIdx + 1}`}
                </span>
                <div className={styles.weightBreakdownTrack}>
                  <div
                    className={styles.weightBreakdownFill}
                    style={{ width: `${catPct}%`, background: barColour }}
                  />
                </div>
                <span className={styles.weightBreakdownValue} style={{ color: barColour }}>
                  {catWeight}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 1 action buttons ─────────────────────────────────────── */}
      {!isReadOnly && (
        <div className={styles.actionRow}>
          <div className={styles.cancelBtnWrapper}>
            <button
              className={styles.cancelBtn}
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
            className={`${styles.saveBtn} ${
              isWeightValid || isEditableOnlyMode
                ? styles.saveBtnReady
                : styles.saveBtnBlocked
            }`}
            onClick={
              isWeightValid || isEditableOnlyMode
                ? handleSaveTemplate
                : () => toast.error(`Total weight must be 100%. Currently ${totalWeight}%.`)
            }
            disabled={isTemplateSaving}
          >
            {isTemplateSaving
              ? "Saving…"
              : isTemplateSaved
              ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <CheckCircle2 size={15} />
                  {editId ? "Updated!" : "Created!"}
                </span>
              )
              : editId
              ? isVariantMode
                ? `Save Variant — ${variantScopeLabel}`
                : isEditableOnlyMode
                ? "Save Editable Objectives"
                : "Update Template"
              : "Create Template"}
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 — TEMPLATE ASSIGNMENT
      ════════════════════════════════════════════════════════════════════ */}
      <div className={styles.sectionDivider} style={{ marginTop: "40px" }}>
        <span className={styles.sectionDividerBadge}>2</span>
        <span className={styles.sectionDividerLabel}>Template Assignment</span>
        <div className={styles.sectionDividerLine} />
      </div>

      <div className={`${styles.sectionHeaderBtn} ${styles.sectionHeaderBtn2}`}>
        <div className={`${styles.sectionHeaderBtnIcon} ${styles.sectionHeaderBtnIcon2}`}>
          <Users size={16} />
        </div>
        <div>
          <div className={styles.sectionHeaderBtnTitle}>Distribution &amp; Assignment Rules</div>
          <div className={styles.sectionHeaderBtnSub}>
            Assign by designation, department, sub-department or directly to employees.
            Only matched employee rows are stored — no empty rule rows in the database.
          </div>
        </div>
      </div>

      <div
        className={`${styles.sectionCard} ${
          !savedTemplateId && !editId ? styles.sectionCardLocked : ""
        }`}
      >
        {/* Locked overlays */}
        {!savedTemplateId && !editId && (
          <div className={styles.sectionLockOverlay}>
            <div className={styles.sectionLockOverlayInner}>
              <Lock size={18} color="#64748b" />
              <span className={styles.sectionLockOverlayText}>
                Save the template above to unlock assignment
              </span>
            </div>
          </div>
        )}
        {!isHqAdmin && (
          <div className={styles.sectionLockOverlay} style={{ borderRadius: "16px" }}>
            <div className={styles.sectionLockOverlayInner}>
              <Lock size={18} color="#64748b" />
              <span className={styles.sectionLockOverlayText}>
                Template assignment is managed by HQ Admin
              </span>
            </div>
          </div>
        )}

        {/* Distribution logic note */}
        <div className={styles.distributionLogicNote}>
          <div className={styles.distributionLogicIcon}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className={styles.distributionLogicText}>
            Use <strong>Admin Quick-Assign</strong> for global admin types,{" "}
            <strong>Rule-Based</strong> for Designation → Department → Sub-Department → Branches,
            or <strong>Direct Employee</strong> for individuals.
          </p>
        </div>

        {isHqAdmin && !isViewMode && (
          <>
            {/* ── Admin Quick-Assign ─────────────────────────────────────── */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "12px", fontWeight: "800", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                <Globe size={14} color="#0891b2" /> Admin Quick-Assign
              </div>

              {/* Scope toggle buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                {ADMIN_SCOPE_OPTIONS.map((opt) => {
                  const isActive = adminScopeRules.some(
                    (r) => r.scope === opt.scope && r.country_id === null,
                  );
                  return (
                    <button
                      key={opt.scope}
                      type="button"
                      onClick={() => handleToggleAdminScope(opt.scope, opt.designation_id)}
                      style={{
                        display:    "inline-flex",
                        alignItems: "center",
                        gap:        "6px",
                        padding:    "7px 14px",
                        borderRadius: "20px",
                        cursor:     "pointer",
                        fontSize:   "12px",
                        fontWeight: "700",
                        border:     isActive ? `2px solid ${opt.color.border}` : "1.5px solid #e2e8f0",
                        background: isActive ? opt.color.bg : "#f8fafc",
                        color:      isActive ? opt.color.text : "#64748b",
                        transition: "all 0.15s",
                        boxShadow:  isActive ? `0 0 0 3px ${opt.color.border}40` : "none",
                      }}
                    >
                      {opt.icon}{opt.label}
                      {isActive && <CheckCircle2 size={11} />}
                    </button>
                  );
                })}
              </div>

              {/* Country-specific CA panel */}
              <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Globe size={12} color="#0891b2" /> Assign Country Admins by Specific Country
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={selectedCountryForCA}
                    onChange={(e) => setSelectedCountryForCA(e.target.value)}
                    disabled={!savedTemplateId && !editId}
                    style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "7px 12px", fontSize: "13px", fontWeight: "500", color: selectedCountryForCA ? "#1e293b" : "#94a3b8", background: "#fff", cursor: "pointer", outline: "none", minWidth: "180px" }}
                  >
                    <option value="">— Select Country —</option>
                    {countries.map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.code ? `${country.code} — ${country.name}` : country.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddCountrySpecificCA}
                    disabled={!selectedCountryForCA || (!savedTemplateId && !editId)}
                    style={{
                      padding:      "7px 16px",
                      borderRadius: "8px",
                      border:       "none",
                      background:   selectedCountryForCA
                        ? "linear-gradient(135deg, #0891b2, #0e7490)"
                        : "#e2e8f0",
                      color:      selectedCountryForCA ? "#fff" : "#94a3b8",
                      fontWeight: "700",
                      fontSize:   "12px",
                      cursor:     selectedCountryForCA ? "pointer" : "not-allowed",
                      transition: "all 0.15s",
                    }}
                  >
                    + Add Country CA
                  </button>
                </div>

                {/* Active country-specific CA chips */}
                {adminScopeRules.filter((r) => r.country_id).length > 0 && (
                  <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {adminScopeRules
                      .filter((r) => r.country_id)
                      .map((rule, idx) => {
                        const country = countries.find((c) => c.id === rule.country_id);
                        return (
                          <span
                            key={idx}
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#ecfeff", color: "#0891b2", border: "1px solid #a5f3fc" }}
                          >
                            CA — {country?.code ?? country?.name ?? rule.country_id}
                            <button
                              type="button"
                              onClick={() => handleRemoveAdminScopeRule(adminScopeRules.indexOf(rule))}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#0891b2", padding: 0, display: "flex", alignItems: "center" }}
                            >
                              <X size={10} />
                            </button>
                          </span>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Direct Employee divider ───────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "0 0 20px" }}>
              <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                Direct Employee
              </span>
              <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
            </div>

            <div className={styles.distributionGrid}>
              <div>
                <label className={styles.formFieldLabel}>
                  Direct Employee Assignment{" "}
                  <span className={styles.optionalTag}>optional</span>
                </label>
                <Select
                  instanceId="user-select"
                  styles={baseSelectStyles}
                  isDisabled={!isHqAdmin || isViewMode || (!savedTemplateId && !editId)}
                  isMulti
                  isSearchable
                  isClearable
                  placeholder="Search by name…"
                  options={
                   Array.from(new Map(users.map((u) => [u.id, u])).values())
                  .sort((a, b) => a.full_name.localeCompare(b.full_name))
                  .map((u) => ({ value: u.id, label: u.full_name }))
                  }

                  value={Array.from(new Map(
                   users
                   .filter((u) => directUserIds.includes(u.id))
                   .map((u) => [u.id, u])
                  ).values()).map((u) => ({ value: u.id, label: u.full_name }))}
                                    onChange={(opts: any) => 
                                    setDirectUserIds(opts ? opts.map((o: any) => o.value as string) : []

                    )
                  }
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  menuPosition="fixed"
                />
              </div>
            </div>

            {/* ── Rule-Based Assignment divider ─────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "20px 0" }}>
              <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                Rule-Based Assignment
              </span>
              <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
            </div>

            {/* ── 3-Step Combination Rule Builder ──────────────────────── */}
            <div style={{ padding: "20px", background: "#f8fafc", borderRadius: "14px", border: "1.5px solid #e2e8f0" }}>

              {/* Step progress indicators */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "18px", flexWrap: "wrap" }}>
                {[
                  {
                    label: "Designation",
                    isDone: selectedDesignations.length > 0,
                    count:  selectedDesignations.length > 0 ? `(${selectedDesignations.length})` : "",
                  },
                  { label: "Department",     isDone: !!selectedDepartmentForAssign,   count: "" },
                  { label: "Sub-Department", isDone: !!selectedSubDepartmentForAssign, count: "" },
                ].map((step, stepIdx) => (
                  <div key={step.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div
                      style={{
                        display:    "inline-flex",
                        alignItems: "center",
                        gap:        "5px",
                        padding:    "4px 12px",
                        borderRadius: "20px",
                        fontSize:   "11px",
                        fontWeight: "700",
                        background: step.isDone
                          ? stepIdx === 0 ? "#eff6ff" : stepIdx === 1 ? "#f0fdf4" : "#fef3c7"
                          : "#f1f5f9",
                        color:  step.isDone
                          ? stepIdx === 0 ? "#1e40af" : stepIdx === 1 ? "#166534" : "#92400e"
                          : "#94a3b8",
                        border: `1.5px solid ${
                          step.isDone
                            ? stepIdx === 0 ? "#bfdbfe" : stepIdx === 1 ? "#bbf7d0" : "#fde68a"
                            : "#e2e8f0"
                        }`,
                      }}
                    >
                      <span
                        style={{
                          width:          "14px",
                          height:         "14px",
                          borderRadius:   "50%",
                          display:        "inline-flex",
                          alignItems:     "center",
                          justifyContent: "center",
                          fontSize:       "9px",
                          fontWeight:     "900",
                          background:     step.isDone ? "currentColor" : "#e2e8f0",
                          color:          step.isDone ? "#fff" : "#94a3b8",
                          opacity:        step.isDone ? 1 : 0.6,
                        }}
                      >
                        {stepIdx + 1}
                      </span>
                      {step.label} {step.count}
                      {step.isDone && <CheckCircle2 size={11} />}
                    </div>
                    {stepIdx < 2 && (
                      <span style={{ color: "#cbd5e1", fontWeight: "700" }}>›</span>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>

                {/* Step 1 — Designation */}
                <div>
                  <label className={styles.formFieldLabel} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ width: "17px", height: "17px", borderRadius: "50%", background: "#eff6ff", color: "#1e40af", fontSize: "9px", fontWeight: "900", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>1</span>
                    Designation <span className={styles.requiredStar}>*</span>
                  </label>
                  <CreatableSelect
                    instanceId="designations-assign-select"
                    placeholder="Type to create or select…"
                    styles={baseSelectStyles}
                    isMulti
                    isDisabled={!isHqAdmin || isViewMode || (!savedTemplateId && !editId)}
                    options={designations.map((d) => ({ value: d.id, label: d.name }))}
                    value={designations
                      .filter((d) => selectedDesignations.includes(d.id))
                      .map((d) => ({ value: d.id, label: d.name }))}
                     onChange={
                      (opts: any) =>
                       setSelectedDesignations(opts ? opts.map((o: any) => o.value) : []
                      )
                    }
                    onCreateOption={handleCreateDesignation}
                    formatCreateLabel={(val) => `Create designation: "${val}"`}
                  />
                </div>

                {/* Step 2 — Department */}
                <div>
                  <label className={styles.formFieldLabel} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ width: "17px", height: "17px", borderRadius: "50%", background: "#f0fdf4", color: "#166534", fontSize: "9px", fontWeight: "900", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>2</span>
                    Department <span className={styles.requiredStar}>*</span>
                  </label>
                  <Select
                    instanceId="dept-single-assign-select"
                    isDisabled={!isHqAdmin || isViewMode || (!savedTemplateId && !editId)}
                    isSearchable
                    isClearable
                    placeholder="Select department…"
                    options={[
                      ...departmentSelectOptions,
                      ...(isHqAdmin && !isViewMode
                        ? [{ value: "__create__", label: "+ Create new department…" }]
                        : []),
                    ]}
                    styles={{
                      ...baseSelectStyles,
                      option: (base: object, { data, isFocused, isSelected }: { data: unknown; isFocused: boolean; isSelected: boolean }) => ({
                        ...base,
                        backgroundColor: isSelected
                          ? "#3b82f6"
                          : (data as { value: string }).value === "__create__"
                          ? isFocused ? "#f0fdf4" : "#f8fafc"
                          : isFocused ? "#eff6ff" : "transparent",
                        color:      isSelected ? "#fff" : (data as { value: string }).value === "__create__" ? "#166534" : "#475569",
                        fontWeight: (data as { value: string }).value === "__create__" ? "700" : "500",
                        borderTop:  (data as { value: string }).value === "__create__" ? "1px solid #e2e8f0" : "none",
                        padding:    "9px 14px",
                        borderRadius: "8px",
                        cursor:     "pointer",
                        fontSize:   "13px",
                      }),
                    }}
                    value={
                      selectedDepartmentForAssign
                        ? (() => {
                            const dept = departments.find(
                              (d) => String(d.id) === selectedDepartmentForAssign,
                            );
                            if (!dept) return null;
                            const branch = branches.find((b) => b.id === dept.branch_id);
                            return {
                              value: String(dept.id),
                              label: [
                                dept.code ? `[${dept.code}]` : null,
                                dept.name,
                                branch ? `· ${branch.code ?? branch.name}` : null,
                              ]
                                .filter(Boolean)
                                .join(" "),
                            };
                          })()
                        : null
                    }
                    onChange={(opt) => {
                      const selected = opt as { value: string } | null;
                      if (selected?.value === "__create__") {
                        setDeptModalState({ isOpen: true, initialName: "" });
                        return;
                      }
                      setSelectedDepartmentForAssign(selected ? selected.value : "");
                      setSelectedSubDepartmentForAssign("");
                    }}
                    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    menuPosition="fixed"
                  />
                </div>

                {/* Step 3 — Sub-Department */}
                <div>
                  <label className={styles.formFieldLabel} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ width: "17px", height: "17px", borderRadius: "50%", background: "#fef3c7", color: "#92400e", fontSize: "9px", fontWeight: "900", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>3</span>
                    Sub-Department <span className={styles.requiredStar}>*</span>
                  </label>
                  <Select
                    instanceId="subdept-assign-select"
                    styles={baseSelectStyles}
                    isDisabled={
                      !selectedDepartmentForAssign ||
                      !isHqAdmin ||
                      isViewMode ||
                      (!savedTemplateId && !editId)
                    }
                    isSearchable
                    isClearable
                    placeholder={
                      selectedDepartmentForAssign
                        ? "Select sub-department…"
                        : "Select a department first"
                    }
                    options={subDeptOptions}
                    value={
                      selectedSubDepartmentForAssign
                        ? subDeptOptions.find((o) => o.value === selectedSubDepartmentForAssign) ?? null
                        : null
                    }
                    onChange={(opt) =>
                      setSelectedSubDepartmentForAssign(
                        (opt as { value: string } | null)?.value ?? "",
                      )
                    }
                    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    menuPosition="fixed"
                    noOptionsMessage={() =>
                      selectedDepartmentForAssign
                        ? "No sub-departments found"
                        : "Select a department first"
                    }
                  />
                </div>
              </div>

              {/* Branch preview panel */}
              {selectedSubDepartmentForAssign && selectedDepartmentForAssign && (
                <div style={{ padding: "16px", background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                  {matchingBranchesForSubDept.length === 0 ? (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 8px" }}>
                          ⚠ No employees currently linked to this sub-department across any branch.
                          You can still save this rule — it will match future employees.
                        </p>
                        {canAddCombination && (
                          <button
                            type="button"
                            onClick={handleAddCombinationRule}
                            style={{ padding: "6px 16px", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontWeight: "700", fontSize: "12px", cursor: "pointer" }}
                          >
                            Add Rule Anyway
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Found in</span>
                          <span style={{ padding: "2px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "800", background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" }}>
                            {matchingBranchesForSubDept.length} branch{matchingBranchesForSubDept.length !== 1 ? "es" : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddCombinationRule}
                          disabled={!canAddCombination}
                          style={{
                            display:    "inline-flex",
                            alignItems: "center",
                            gap:        "6px",
                            padding:    "7px 16px",
                            borderRadius: "8px",
                            border:     "none",
                            background: canAddCombination
                              ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                              : "#e2e8f0",
                            color:      canAddCombination ? "#fff" : "#94a3b8",
                            fontWeight: "700",
                            fontSize:   "12px",
                            cursor:     canAddCombination ? "pointer" : "not-allowed",
                            transition: "all 0.15s",
                          }}
                        >
                          <CheckCircle2 size={13} />
                          Assign to All {matchingBranchesForSubDept.length} Branches
                        </button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {matchingBranchesForSubDept.map((branch) => (
                          <span
                            key={branch.id}
                            style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: "600", background: "#f5f3ff", color: "#5b21b6", border: "1px solid #ddd6fe", display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            <GitBranch size={10} />
                            {branch.code ? `${branch.code} — ${branch.name}` : branch.name}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Active assignment rules grid ──────────────────────────────── */}
        {totalAssignmentRuleCount > 0 && (
          <div style={{ marginTop: "28px" }}>
            <div className={styles.rulesGridHeader}>
              <div className={styles.rulesGridHeaderLeft}>
                <LayoutGrid size={14} color="#3b82f6" />
                <span className={styles.rulesGridTitle}>Active Assignment Rules</span>
                <span className={styles.rulesGridCount}>
                  {totalAssignmentRuleCount} rule{totalAssignmentRuleCount !== 1 ? "s" : ""}
                  {totalMatchedUserCount > 0 && (
                    <span style={{ marginLeft: "8px", fontWeight: "600", color: "#7c3aed" }}>
                      · ~{totalMatchedUserCount} user{totalMatchedUserCount !== 1 ? "s" : ""} matched
                    </span>
                  )}
                </span>
              </div>
              {isHqAdmin && !isViewMode && (
                <button
                  onClick={handleClearAllAssignments}
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "7px", cursor: "pointer", fontSize: "11px", fontWeight: "700", background: "#fff1f2", border: "1px solid #fecaca", color: "#dc2626", transition: "all 0.15s" }}
                  title="Remove all assignment rules and start over"
                >
                  <RefreshCw size={11} /> Clear All &amp; Reassign
                </button>
              )}
            </div>

            <div className={styles.assignmentRulesGrid}>
              {/* Scope rule cards */}
              {adminScopeRules.map((rule, idx) => (
                <ScopeRuleCard
                  key={`scope-${idx}`}
                  rule={rule}
                  countries={countries}
                  canRemove={isHqAdmin && !isViewMode}
                  onRemove={() => handleRemoveAdminScopeRule(idx)}
                />
              ))}
              {/* Direct user cards */}
              {directUserIds.map((userId) => (
                <UserCard
                  key={`user-${userId}`}
                  userId={userId}
                  users={users}
                  canRemove={isHqAdmin && !isViewMode}
                  onRemove={() => setDirectUserIds((prev) => prev.filter((id) => id !== userId))}
                />
              ))}
              {/* Combination rule cards — names resolved from master data */}
              {combinationRules.map((combo) => (
                <CombinationRuleCard
                  key={combo.id}
                  rule={combo}
                  designations={designations}
                  departments={departments}
                  subDepartments={subDepartments}
                  branches={branches}
                  matchedCount={ruleMatchCounts.get(combo.id) ?? 0}
                  canRemove={isHqAdmin && !isViewMode}
                  onRemove={() =>
                    setCombinationRules((prev) => prev.filter((c) => c.id !== combo.id))
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Read-only assignment summary (non-HQ / view mode) ─────────── */}
        {(!isHqAdmin || isViewMode) && totalAssignmentRuleCount > 0 && (
          <div className={styles.assignmentSummary} style={{ marginTop: "20px" }}>
            {adminScopeRules.length > 0 && (
              <div className={styles.assignmentSummaryRow}>
                <span className={styles.assignmentSummaryLabel}>Global</span>
                <div className={styles.assignmentSummaryTags}>
                  {adminScopeRules.map((rule, idx) => {
                    const scopeDef = SCOPE_DISPLAY[rule.scope] ?? { label: rule.scope };
                    return (
                      <span
                        key={idx}
                        className={styles.assignmentSummaryBadge}
                        style={{ background: "#ecfeff", color: "#0891b2", borderColor: "#a5f3fc" }}
                      >
                        {scopeDef.label}
                        {rule.country_id && (
                          <span style={{ opacity: 0.7 }}> · specific country</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {directUserIds.length > 0 && (
              <div className={styles.assignmentSummaryRow}>
                <span className={styles.assignmentSummaryLabel}>Direct</span>
                <div className={styles.assignmentSummaryTags}>
                  {directUserIds.map((userId) => {
                    const user = users.find((u) => u.id === userId);
                    return (
                      <span
                        key={userId}
                        className={styles.assignmentSummaryBadge}
                        style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}
                      >
                        {user ? user.full_name : userId}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {combinationRules.length > 0 && (
              <div className={styles.assignmentSummaryRow}>
                <span className={styles.assignmentSummaryLabel}>Rules</span>
                <div className={styles.assignmentSummaryTags}>
                  {combinationRules.map((combo) => {
                    const designationName  = designations.find((d) => d.id === combo.designation_id)?.name ?? combo.designation_name;
                    const departmentName   = departments.find((d) => d.id === combo.department_id)?.name   ?? combo.department_name;
                    const subDeptName      = subDepartments.find((s) => s.id === combo.sub_department_id)?.name ?? combo.sub_department_name;
                    return (
                      <span
                        key={combo.id}
                        className={styles.assignmentSummaryBadge}
                        style={{ background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" }}
                      >
                        {designationName} · {departmentName} · {subDeptName}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Section 2 action buttons ──────────────────────────────────── */}
        {isHqAdmin && !isViewMode && (
          <div className={styles.actionRow} style={{ marginTop: "24px" }}>
            <div className={styles.cancelBtnWrapper}>
              <button
                className={styles.cancelBtn}
                disabled={!savedTemplateId && !editId}
                onClick={() => setShowAssignCancelConfirm((prev) => !prev)}
              >
                Cancel
              </button>
              {showAssignCancelConfirm && (
                <ConfirmDiscardPopover
                  onStay={() => setShowAssignCancelConfirm(false)}
                  onDiscard={handleDiscardAssignment}
                />
              )}
            </div>
            <button
              className={`${styles.saveBtn} ${
                savedTemplateId || editId ? styles.saveBtnAssign : styles.saveBtnBlocked
              }`}
              onClick={handleSaveAssignment}
              disabled={isAssignSaving || (!savedTemplateId && !editId)}
            >
              {isAssignSaving
                ? "Saving…"
                : isAssignSaved
                ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <CheckCircle2 size={15} />Assigned!
                  </span>
                )
                : totalMatchedUserCount > 0
                ? `Save Assignment (~${totalMatchedUserCount} users)`
                : "Assign Template"}
            </button>
          </div>
        )}
      </div>

      {/* ── Back to dashboard ─────────────────────────────────────────────── */}
      <div className={styles.backRow}>
        <button className={styles.backBtn} onClick={handleBackToDashboard}>
          <ArrowLeft size={15} />Back to Template Dashboard
        </button>
      </div>

    </div>
  );
}