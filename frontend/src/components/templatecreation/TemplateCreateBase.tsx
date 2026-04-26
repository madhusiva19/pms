"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import { toast } from "sonner";
import {
  Eye, Lock, Unlock,
  Settings2, Sliders, Plus, Trash2,
  TrendingUp, TrendingDown, SlidersHorizontal, X,
} from "lucide-react";
import {
  computeFreezeDates,
  getTemplatePermissions,
  formatDate,
} from "@/lib/freezeUtils";
import styles from "./TemplateCreateBase.module.css";

// ─── API base URL ─────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

// ─── Domain constants ─────────────────────────────────────────────────────────

const DEFAULT_MAX_SCORE    = 5;
const MAX_SCORE_OPTIONS    = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

// ─── KPI Scale Options ────────────────────────────────────────────────────────

const KPI_SCALE_OPTIONS = [
  {
    value:     "interpolated_financial",
    label:     "Financial Achievement",
    group:     "interpolated",
    hint:      "LL=90%, UL=110% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value:     "interpolated_to_gp",
    label:     "T/O & GP Contribution",
    group:     "interpolated",
    hint:      "LL=4%, UL=15% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value:     "interpolated_sales_ratio",
    label:     "Effective Sales Ratio",
    group:     "interpolated",
    hint:      "LL=20%, UL=100% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value:     "interpolated_gp_margin",
    label:     "Individual GP Margin %",
    group:     "interpolated",
    hint:      "LL=6%, UL=30% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value:     "interpolated_ees_360",
    label:     "EES / 360 Degree Feedback",
    group:     "interpolated",
    hint:      "LL=65%, UL=85% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value:     "interpolated_nps_ccr",
    label:     "NPS / CCR Score",
    group:     "interpolated",
    hint:      "LL=20, UL=50 · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value:     "interpolated_emp_retention",
    label:     "Employee Retention",
    group:     "interpolated",
    hint:      "LL=75%, UL=95% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value:     "interpolated_dpam",
    label:     "Overall DPAM Score",
    group:     "interpolated",
    hint:      "LL=75%, UL=90% · Linear interpolation 1–5",
    isInverse: false,
    badge:     { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    icon:      <TrendingUp size={13} color="#1e40af" />,
  },
  {
    value:     "bracket_statutory",
    label:     "Statutory & Legal Compliance",
    group:     "bracket",
    hint:      "Bands: <24=1 · =24=5 (HQ Finance Guidelines)",
    isInverse: false,
    badge:     { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
    icon:      <SlidersHorizontal size={13} color="#92400e" />,
  },
  {
    value:     "bracket_wip",
    label:     "WIP Score (Days)",
    group:     "bracket",
    hint:      "Inverse bands: ≥9=1 · 7=2 · 5=3 · 3=4 · 1=5",
    isInverse: true,
    badge:     { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
    icon:      <TrendingDown size={13} color="#b45309" />,
  },
  {
    value:     "bracket_ops_dpam",
    label:     "Operations Score / DPAM Ops",
    group:     "bracket",
    hint:      "Bands: ≤11.6=1 · –17.4=2 · –23.2=3 · –27=4 · ≥27=5",
    isInverse: false,
    badge:     { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
    icon:      <SlidersHorizontal size={13} color="#92400e" />,
  },
  {
    value:     "bracket_individual_sales_gp",
    label:     "Individual Sales GP",
    group:     "bracket",
    hint:      "Bands: <100K=1 · –500K=2 · –1M=3 · –5M=4 · >5M=5",
    isInverse: false,
    badge:     { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
    icon:      <SlidersHorizontal size={13} color="#92400e" />,
  },
  {
    value:     "manual",
    label:     "Manual Rating (1–5)",
    group:     "manual",
    hint:      "Appraiser enters 1–5 directly — no formula applied",
    isInverse: false,
    badge:     { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
    icon:      <SlidersHorizontal size={13} color="#166534" />,
  },
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
  name:         string;
  weight:       number;
  mandatory:    boolean;
  objectives:   ObjectiveRow[];
}

interface UserOption {
  id:        string;
  full_name: string;
}

// ── Department now carries code + branch_id so we can display & filter properly
interface DepartmentOption {
  id:        string;  // uuid
  name:      string;
  code:      string | null;
  branch_id: string | null;
}

// ── Branch for filtering — matches branches table: id, code, name, country_id
interface BranchOption {
  id:         string;  // uuid
  name:       string;
  code:       string | null;
  country_id: string | null;  // uuid FK to countries table
}

interface TemplateCreateBaseProps {
  level?: number;
}

// ─── react-select style factories ─────────────────────────────────────────────

function buildBaseSelectStyles(): any {
  return {
    control: (base: any, { isFocused }: { isFocused: boolean }) => ({
      ...base,
      borderRadius: "10px",
      border:       isFocused ? "1.5px solid #3b82f6" : "1px solid #e2e8f0",
      padding:      "2px 4px",
      boxShadow:    isFocused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
      fontSize:     "13px",
      fontWeight:   "500",
      background:   "#fff",
      transition:   "all 0.15s",
      "&:hover":    { borderColor: "#3b82f6" },
    }),
    multiValue:       (base: any) => ({ ...base, backgroundColor: "#eff6ff", borderRadius: "6px" }),
    multiValueLabel:  (base: any) => ({ ...base, color: "#1e40af", fontWeight: "700", fontSize: "12px" }),
    multiValueRemove: (base: any) => ({
      ...base, color: "#93c5fd",
      "&:hover": { backgroundColor: "#dbeafe", color: "#1e40af" },
    }),
    placeholder:  (base: any) => ({ ...base, fontSize: "13px", color: "#94a3b8" }),
    menu:         (base: any) => ({
      ...base, borderRadius: "12px",
      boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
      border: "1px solid #f1f5f9", marginTop: "6px", padding: "4px", zIndex: 9999,
    }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color:           isSelected ? "#fff"     : "#475569",
      padding: "9px 14px", borderRadius: "8px", cursor: "pointer",
      fontSize: "13px", fontWeight: "500",
    }),
    singleValue: (base: any) => ({ ...base, color: "#1e293b", fontWeight: "600" }),
  };
}

function buildTableSelectStyles(): any {
  return {
    control: (base: any) => ({
      ...base,
      border: "none",
      background: "transparent",
      minHeight: "unset",
      boxShadow: "none",
      cursor: "pointer",
      padding: 0,
      "&:hover": {},
    }),
    valueContainer:      (base: any) => ({ ...base, padding: 0 }),
    indicatorsContainer: () => ({ display: "none" }),
    singleValue:         (base: any) => ({ ...base, margin: 0 }),
    menu: (base: any) => ({
      ...base, borderRadius: "12px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      border: "1px solid #f1f5f9", marginTop: "6px", padding: "4px",
      zIndex: 9999, minWidth: "220px",
    }),
    menuList: (base: any) => ({
      ...base, maxHeight: "200px",
      paddingTop: 0, paddingBottom: 0,
    }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color:           isSelected ? "#fff"     : "#475569",
      padding: "8px 12px", borderRadius: "8px",
      cursor: "pointer", fontSize: "12px", fontWeight: "600",
    }),
  };
}

function buildKpiSelectStyles(): any {
  return {
    control: (base: any, { isFocused }: any) => ({
      ...base,
      border:       isFocused ? "1.5px solid #3b82f6" : "1.5px solid #e2e8f0",
      borderRadius: "8px",
      background:   "#fff",
      minHeight:    "36px",
      boxShadow:    isFocused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
      cursor:       "pointer",
      padding:      "0 8px",
      transition:   "border-color 0.15s, box-shadow 0.15s",
      "&:hover":    { borderColor: "#3b82f6" },
    }),
    valueContainer:      (base: any) => ({ ...base, padding: "0 2px" }),
    indicatorsContainer: () => ({ display: "none" }),
    singleValue:         (base: any) => ({ ...base, margin: 0 }),
    placeholder: (base: any) => ({
      ...base, color: "#94a3b8", fontSize: "12px", fontWeight: "500",
    }),
    menu: (base: any) => ({
      ...base, borderRadius: "12px",
      boxShadow: "0 12px 32px rgba(0,0,0,0.14)",
      border: "1px solid #e8edf5",
      marginTop: "4px", padding: "6px",
      zIndex: 9999,
      minWidth: "320px",
    }),
    menuList: (base: any) => ({
      ...base,
      maxHeight: "520px",
      paddingTop: 0, paddingBottom: 0,
      overflowY: "auto",
    }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color:           isSelected ? "#fff"     : "#475569",
      padding: "7px 10px", borderRadius: "7px",
      cursor: "pointer", fontSize: "12px", fontWeight: "600",
    }),
    groupHeading: (base: any) => ({
      ...base,
      fontSize: "10px", fontWeight: "800", letterSpacing: "0.08em",
      padding: "8px 10px 3px", textTransform: "uppercase",
      borderTop: "1px solid #f1f5f9", marginTop: "2px",
      color: "#94a3b8",
    }),
  };
}

// ─── Badge & option sub-components ────────────────────────────────────────────

const KpiScaleOptionRenderer = ({ data, innerProps, isSelected, isFocused }: any) => (
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
      <div style={{
        fontSize: "12px", fontWeight: "700",
        color: isSelected ? "#fff" : "#1e293b",
        display: "flex", alignItems: "center", gap: "6px",
      }}>
        {data.label}
        {data.isInverse && (
          <span style={{
            fontSize: "9px", fontWeight: "700", padding: "1px 5px", borderRadius: "4px",
            background: isSelected ? "rgba(255,255,255,0.25)" : "#fee2e2",
            color: isSelected ? "#fff" : "#dc2626",
            flexShrink: 0,
          }}>
            inverse
          </span>
        )}
      </div>
      <div style={{
        fontSize: "10px",
        color: isSelected ? "rgba(255,255,255,0.72)" : "#94a3b8",
        marginTop: "2px",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {data.hint}
      </div>
    </div>
  </div>
);

const KpiScaleBadge = ({ opt, isDisabled }: { opt: any; isDisabled: boolean }) => (
  <span
    title={isDisabled ? undefined : `Click to change · ${opt.hint}`}
    style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "4px 10px", borderRadius: "20px",
      fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap",
      background: isDisabled ? "#f1f5f9" : opt.badge.bg,
      color:      isDisabled ? "#94a3b8" : opt.badge.color,
      border:     `1px solid ${isDisabled ? "#e2e8f0" : opt.badge.border}`,
      cursor:     isDisabled ? "default" : "pointer",
      userSelect: "none",
      maxWidth:   "none",
    }}
  >
    {!isDisabled && <span style={{ flexShrink: 0 }}>{opt.icon}</span>}
    <span>{opt.label}</span>
    {opt.isInverse && !isDisabled && (
      <span style={{
        fontSize: "9px", fontWeight: "700", padding: "1px 4px", borderRadius: "3px",
        background: "#fee2e2", color: "#dc2626", flexShrink: 0,
      }}>inv</span>
    )}
  </span>
);

const ControlOptionRenderer = ({ data, innerProps, isSelected, isFocused }: any) => (
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

const ControlBadge = ({ opt, isDisabled }: { opt: any; isDisabled: boolean }) => (
  <span
    title={isDisabled ? undefined : "Click to toggle"}
    style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "4px 10px", borderRadius: "20px",
      fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap",
      background: isDisabled ? "#f1f5f9" : opt.badge.bg,
      color:      isDisabled ? "#94a3b8" : opt.badge.color,
      border:     `1px solid ${isDisabled ? "#e2e8f0" : opt.badge.border}`,
      cursor:     isDisabled ? "default" : "pointer",
      userSelect: "none",
    }}
  >
    {opt.value === "Locked" ? <Lock size={10} /> : <Unlock size={10} />}
    {opt.label}
  </span>
);

// ─── Objective factory ────────────────────────────────────────────────────────

function makeDefaultObjective(
  name:        string,
  kpiScale:    string,
  control:     string,
  weight:      number | null = null,
  kpiMaxScore: number | null = null,
): ObjectiveRow {
  return { name, kpiScale, weight, control, mandatory: true, kpiMaxScore };
}

// ─── Initial category seed data ───────────────────────────────────────────────

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
      makeDefaultObjective("360 Feedback (Automated)", "interpolated_ees_360",       "Locked",   5),
      makeDefaultObjective("Dept. Retention",          "interpolated_emp_retention", "Locked",   5),
      makeDefaultObjective("GPTW Score",               "interpolated_financial",     "Locked",   5),
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

const BLANK_OBJECTIVE: ObjectiveRow = {
  name: "", kpiScale: "interpolated_financial", weight: "", control: "Editable",
  mandatory: false, kpiMaxScore: null,
};

// ─── Migration helper ─────────────────────────────────────────────────────────

const LEGACY_SCALE_MAP: Record<string, string> = {
  standard: "interpolated_financial",
  inverse:  "bracket_wip",
};

function migrateLegacyKpiScale(scale: string | undefined): string {
  if (!scale) return "interpolated_financial";
  return LEGACY_SCALE_MAP[scale] ?? scale;
}

function migrateObjective(obj: any): ObjectiveRow {
  return {
    name:        obj.name ?? "",
    kpiScale:    migrateLegacyKpiScale(obj.kpiScale),
    weight:      obj.weight ?? null,
    control:     obj.control ?? "Editable",
    mandatory:   obj.mandatory ?? false,
    kpiMaxScore: obj.kpiMaxScore ?? null,
  };
}

// ─── New Department Modal ─────────────────────────────────────────────────────
// Shows when the user types a new department name in CreatableSelect

interface NewDeptModalProps {
  initialName: string;
  branches:    BranchOption[];
  onConfirm:   (name: string, code: string, branchId: string | null) => Promise<void>;
  onCancel:    () => void;
}

function NewDeptModal({ initialName, branches, onConfirm, onCancel }: NewDeptModalProps) {
  const [name,     setName]     = useState(initialName);
  const [code,     setCode]     = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error("Department name is required"); return; }
    if (!code.trim()) { toast.error("Department code is required (e.g. FIA, FES, COT)"); return; }
    setSaving(true);
    try {
      await onConfirm(name.trim(), code.trim().toUpperCase(), branchId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: "16px", padding: "28px 32px",
        width: "420px", maxWidth: "90vw",
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        border: "1px solid #e2e8f0",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
            Create New Department
          </h3>
          <button
            onClick={onCancel}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Department Name */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
            Department Name <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Forwarding Import Air"
            style={{
              width: "100%", boxSizing: "border-box",
              border: "1px solid #e2e8f0", borderRadius: "8px",
              padding: "9px 12px", fontSize: "13px", fontWeight: "500",
              outline: "none", color: "#1e293b",
            }}
            autoFocus
          />
        </div>

        {/* Department Code */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
            Department Code <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. FIA, FES, COT, BRN"
            maxLength={10}
            style={{
              width: "100%", boxSizing: "border-box",
              border: "1px solid #e2e8f0", borderRadius: "8px",
              padding: "9px 12px", fontSize: "13px", fontWeight: "700",
              outline: "none", color: "#1e40af", letterSpacing: "0.5px",
            }}
          />
          <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#94a3b8" }}>
            Short code used to link financial data (e.g. GP/Revenue from your ERP system)
          </p>
        </div>

        {/* Branch */}
        {branches.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
              Branch <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "none", fontWeight: "500" }}>(optional)</span>
            </label>
            <select
              value={branchId ?? ""}
              onChange={(e) => setBranchId(e.target.value || null)}
              style={{
                width: "100%", boxSizing: "border-box",
                border: "1px solid #e2e8f0", borderRadius: "8px",
                padding: "9px 12px", fontSize: "13px", fontWeight: "500",
                outline: "none", color: branchId ? "#1e293b" : "#94a3b8",
                background: "#fff",
              }}
            >
              <option value="">— No branch —</option>
              {branches.map((b) => {
                // Show: CODE — Name (country_id if present)
                const countryTag = b.country_id ? ` [${b.country_id}]` : "";
                const label = b.code
                  ? `${b.code} — ${b.name}${countryTag}`
                  : `${b.name}${countryTag}`;
                return (
                  <option key={b.id} value={b.id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 18px", borderRadius: "8px",
              border: "1px solid #e2e8f0", background: "#f8fafc",
              color: "#64748b", fontWeight: "700", fontSize: "13px", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: "8px 20px", borderRadius: "8px",
              border: "none", background: saving ? "#94a3b8" : "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "#fff", fontWeight: "700", fontSize: "13px",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Creating…" : "Create Department"}
          </button>
        </div>
      </div>
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

  const freezeDates = useMemo(() => computeFreezeDates(new Date()), []);
  const permissions = useMemo(
    () => getTemplatePermissions(level, freezeDates),
    [level, freezeDates],
  );
  const isReadOnly = isViewMode || (!permissions.canEdit && !!editId);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [templateName,         setTemplateName]         = useState("");
  const [description,          setDescription]          = useState("");
  const [maxScore,             setMaxScore]             = useState<number>(DEFAULT_MAX_SCORE);
  const [categories,           setCategories]           = useState<CategoryRow[]>(INITIAL_CATEGORIES);
  const [roles,                setRoles]                = useState<any[]>([]);
  const [departments,          setDepartments]          = useState<DepartmentOption[]>([]);
  const [branches,             setBranches]             = useState<BranchOption[]>([]);
  const [users,                setUsers]                = useState<UserOption[]>([]);
  const [selectedUser,         setSelectedUser]         = useState<string | null>(null);
  const [selectedRoles,        setSelectedRoles]        = useState<number[]>([]);
  const [selectedDepartments,  setSelectedDepartments]  = useState<string[]>([]);
  const [showCancelConfirm,    setShowCancelConfirm]    = useState(false);
  const [isPageLoading,        setIsPageLoading]        = useState(!!editId);
  const [newObjKey,            setNewObjKey]            = useState<string | null>(null);

  // ── Department modal state ─────────────────────────────────────────────────
  const [deptModal, setDeptModal] = useState<{ open: boolean; initialName: string }>({
    open: false, initialName: "",
  });

  // ── Branch filter for department dropdown ──────────────────────────────────
  // Scopes the department list to a specific branch so admins don't confuse
  // same-named departments (e.g. "Forwarding Import Air" in CMB vs TUP).
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string | null>(null);

  // ── Memoised react-select styles ───────────────────────────────────────────
  const baseSelectStyles  = useMemo(() => buildBaseSelectStyles(), []);
  const tableSelectStyles = useMemo(() => buildTableSelectStyles(), []);
  const kpiSelectStyles   = useMemo(() => buildKpiSelectStyles(), []);

  const kpiScaleGroupedOptions = useMemo(
    () =>
      KPI_SCALE_GROUPS.map((g) => ({
        label:   g.groupLabel,
        options: KPI_SCALE_OPTIONS.filter((o) => o.group === g.groupKey),
      })),
    [],
  );

  // ── Load master data ───────────────────────────────────────────────────────
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [rolesRes, deptsRes, usersRes, branchesRes] = await Promise.all([
          fetch(`${API_BASE}/roles`),
          fetch(`${API_BASE}/departments`),
          fetch(`${API_BASE}/users`),
          fetch(`${API_BASE}/branches`),
        ]);
        if (!rolesRes.ok || !deptsRes.ok || !usersRes.ok) {
          throw new Error("One or more master data requests failed");
        }
        const [rolesData, deptsData, usersData] = await Promise.all([
          rolesRes.json(), deptsRes.json(), usersRes.json(),
        ]);
        setRoles(rolesData);
        setDepartments(deptsData);
        setUsers(usersData);

        // Branches — gracefully skip if table doesn't exist yet (non-200 or empty)
        if (branchesRes.ok) {
          const branchesData: BranchOption[] = await branchesRes.json();
          // Normalise: ensure country_id is present (backend always sends it now)
          setBranches(
            branchesData.map((b) => ({
              id:         String(b.id),
              name:       b.name,
              code:       b.code ?? null,
              country_id: b.country_id ?? null,
            }))
          );
        }
      } catch (err) {
        console.error("Master data load error:", err);
        toast.error("Failed to load roles and departments");
      }
    };
    loadMasterData();
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
        if (!tmpl) {
          toast.error("Template not found");
          router.push("/");
          return;
        }

        setTemplateName(tmpl.name ?? "");
        setDescription(tmpl.description ?? "");
        setMaxScore(tmpl.max_score ?? DEFAULT_MAX_SCORE);
        setCategories(
          (tmpl.categories ?? INITIAL_CATEGORIES).map((cat: any) => ({
            ...cat,
            objectives: (cat.objectives ?? []).map(migrateObjective),
          })),
        );
        setSelectedRoles(tmpl.assignedRolesIds?.map(Number) ?? []);
        setSelectedDepartments(tmpl.assignedDepartmentsIds?.map(String) ?? []);

        const assignedUserUuid = tmpl.assignedEmployeeIds?.[0];
        if (assignedUserUuid) setSelectedUser(String(assignedUserUuid));

        if (isViewMode) toast.info("Viewing Template — Read-only mode");
      } catch (err) {
        console.error("Template load error:", err);
        toast.error("Failed to load template");
      } finally {
        setIsPageLoading(false);
      }
    };
    loadTemplate();
  }, [editId, isViewMode, router]);

  // ── Derived calculations ───────────────────────────────────────────────────

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

  // ── Category / objective mutations ─────────────────────────────────────────

  const updateObjectiveField = useCallback(
    (catIndex: number, objIndex: number, field: string, value: any) =>
      setCategories((prev) =>
        prev.map((cat, ci) =>
          ci !== catIndex ? cat : {
            ...cat,
            objectives: cat.objectives.map((obj, oi) =>
              oi !== objIndex ? obj : { ...obj, [field]: value },
            ),
          },
        ),
      ),
    [],
  );

  const updateCategoryName = useCallback(
    (catIndex: number, name: string) =>
      setCategories((prev) =>
        prev.map((cat, ci) => (ci === catIndex ? { ...cat, name } : cat)),
      ),
    [],
  );

  const addCategory = useCallback(
    () =>
      setCategories((prev) => [
        ...prev,
        { name: "", weight: 0, objectives: [], mandatory: false },
      ]),
    [],
  );

  const removeCategory = useCallback(
    (catIndex: number) =>
      setCategories((prev) => prev.filter((_, ci) => ci !== catIndex)),
    [],
  );

  const addObjective = useCallback(
    (catIndex: number) => {
      setCategories((prev) =>
        prev.map((cat, ci) =>
          ci !== catIndex ? cat : { ...cat, objectives: [...cat.objectives, { ...BLANK_OBJECTIVE }] },
        ),
      );
      setTimeout(() => {
        setCategories((prev) => {
          const newIdx = prev[catIndex]?.objectives.length - 1;
          setNewObjKey(`${catIndex}-${newIdx}`);
          return prev;
        });
      }, 0);
    },
    [],
  );

  const removeObjective = useCallback(
    (catIndex: number, objIndex: number) =>
      setCategories((prev) =>
        prev.map((cat, ci) =>
          ci !== catIndex ? cat : {
            ...cat,
            objectives: cat.objectives.filter((_, oi) => oi !== objIndex),
          },
        ),
      ),
    [],
  );

  // ── Role creation ──────────────────────────────────────────────────────────

  const handleCreateRole = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Role creation failed");
      const created = await res.json();
      setRoles((prev) => [...prev, created]);
      setSelectedRoles((prev) => [...prev, created.id]);
      toast.success(`Role "${name}" created`);
    } catch (err) {
      console.error("Role create error:", err);
      toast.error("Failed to create role");
    }
  };

  // ── Department creation via modal ──────────────────────────────────────────
  // When user types a new dept name in CreatableSelect, open the modal instead
  // of immediately creating, so we can also collect code + branch.

  const handleDeptCreateInit = (inputValue: string) => {
    setDeptModal({ open: true, initialName: inputValue });
  };

  const handleDeptModalConfirm = async (
    name: string,
    code: string,
    branchId: string | null,
  ) => {
    try {
      const res = await fetch(`${API_BASE}/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, branch_id: branchId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Department creation failed");
      }
      const created: DepartmentOption = await res.json();
      setDepartments((prev) => [...prev, created]);
      setSelectedDepartments((prev) => [...prev, String(created.id)]);
      toast.success(`Department "${name}" (${code}) created`);
      setDeptModal({ open: false, initialName: "" });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create department");
      // Keep modal open so user can fix the error
    }
  };

  // ── Build department options for react-select ──────────────────────────────
  // Show "[CODE] Name · BranchCode" so admins can distinguish same-named depts.
  // When a branch filter is active, only show departments from that branch.

  const departmentSelectOptions = useMemo(
    () =>
      departments
        .filter((d) => !selectedBranchFilter || d.branch_id === selectedBranchFilter)
        .map((d) => {
          const branch = branches.find((b) => b.id === d.branch_id);
          const label = [
            d.code ? `[${d.code}]` : null,
            d.name,
            branch ? `· ${branch.code ?? branch.name}` : null,
          ].filter(Boolean).join(" ");
          return { value: String(d.id), label };
        }),
    [departments, branches, selectedBranchFilter],
  );

  // ── Validation ─────────────────────────────────────────────────────────────

  const validateForm = (): boolean => {
    if (!templateName.trim()) { toast.error("Please enter a Template Name"); return false; }
    for (const cat of categories) {
      for (const obj of cat.objectives) {
        if (!obj.name.trim()) { toast.error("All objectives must have a name"); return false; }
        if (!obj.kpiScale)    { toast.error("All objectives must have a KPI Scale"); return false; }
      }
    }
    if (totalWeight !== 100) {
      toast.error(`Total weight must be exactly 100%. Currently ${totalWeight}%`);
      return false;
    }
    return true;
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (isReadOnly)                        { toast.error("This template is in view-only mode."); return; }
    if (!permissions.canEdit && editId)    { toast.error("You don't have permission to edit templates right now."); return; }
    if (!permissions.canCreate && !editId) { toast.error("You don't have permission to create templates right now."); return; }
    if (!validateForm()) return;

    const categoriesWithWeight = categories.map((cat) => ({
      ...cat,
      weight: cat.objectives.reduce((s, obj) => s + (Number(obj.weight) || 0), 0),
    }));

    const payload = {
      name:         templateName.trim(),
      description:  description.trim(),
      max_score:    maxScore,
      categories:   categoriesWithWeight,
      totalWeight,
      lastModified: new Date().toISOString(),
    };

    try {
      let resolvedId: number;

      if (editId) {
        const res = await fetch(`${API_BASE}/templates/${editId}`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json", "X-User-Level": String(level) },
          body:    JSON.stringify(payload),
        });
        if (res.status === 403) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? "Template is currently frozen.");
        }
        if (!res.ok) throw new Error("Update request failed");
        resolvedId = Number(editId);
      } else {
        const res = await fetch(`${API_BASE}/templates`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Create request failed");
        const created = await res.json();
        resolvedId = created.id;
      }

      const assignRes = await fetch(`${API_BASE}/assign-template`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          template_id:    resolvedId,
          role_ids:       selectedRoles,
          department_ids: selectedDepartments,
          user_id:        selectedUser,
        }),
      });
      if (!assignRes.ok) {
        const errBody = await assignRes.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Assignment failed");
      }

      toast.success(editId ? "Template Updated Successfully!" : "Template Created & Assigned Successfully!");
      router.push("/hq-admin/template-management");
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error(err.message ?? "Failed to save template");
    }
  };

  // ── Derived display flags ──────────────────────────────────────────────────

  const isWeightValid    = totalWeight === 100;
  const isWeightExceeded = totalWeight > 100;
  const weightBarPct     = Math.min(totalWeight, 100);

  const graceNoteText = permissions.freezeStatus === "grace"
    ? `Grace period — hard freeze ${formatDate(freezeDates.graceEnd)}`
    : `Objective window closes ${formatDate(freezeDates.objectiveSettingEnd)}`;

  // ── Render ─────────────────────────────────────────────────────────────────

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

      {/* ── Department creation modal ── */}
      {deptModal.open && (
        <NewDeptModal
          initialName={deptModal.initialName}
          branches={branches}
          onConfirm={handleDeptModalConfirm}
          onCancel={() => setDeptModal({ open: false, initialName: "" })}
        />
      )}

      {/* ── Read-only / frozen banner ── */}
      {isReadOnly && (
        <div className={`${styles.readOnlyBanner} ${isViewMode ? styles.readOnlyBannerView : styles.readOnlyBannerFrozen}`}>
          <div className={`${styles.readOnlyBannerIcon} ${isViewMode ? styles.readOnlyBannerIconView : styles.readOnlyBannerIconFrozen}`}>
            {isViewMode ? <Eye size={16} color="#fff" /> : <Lock size={16} color="#fff" />}
          </div>
          <div>
            <div className={`${styles.readOnlyBannerTitle} ${isViewMode ? styles.readOnlyBannerTitleView : styles.readOnlyBannerTitleFrozen}`}>
              {isViewMode ? "View Only Mode" : "Template Frozen — View Only"}
            </div>
            <p className={`${styles.readOnlyBannerText} ${isViewMode ? styles.readOnlyBannerTextView : styles.readOnlyBannerTextFrozen}`}>
              {isViewMode
                ? "You are viewing this template. No changes can be saved."
                : `This template cannot be edited (grace period ended ${formatDate(freezeDates.graceEnd)}).`}
            </p>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
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
                : isReadOnly ? "View Evaluation Template" : "Edit Evaluation Template"}
            </h1>
          </div>
          <p className={styles.pageSubtitle}>
            {isReadOnly
              ? "All fields are read-only."
              : "Design a comprehensive performance evaluation template."}
          </p>
        </div>
        {!isReadOnly && editId && (
          <div className={styles.graceNoteBadge}>{graceNoteText}</div>
        )}
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
              permissions.freezeStatus === "open"
                ? styles.pmsCycleStatusOpen
                : permissions.freezeStatus === "grace"
                ? styles.pmsCycleStatusGrace
                : styles.pmsCycleStatusFrozen
            }`}>
              {permissions.freezeStatus === "open"
                ? "Open"
                : permissions.freezeStatus === "grace"
                ? "Grace Period"
                : "Frozen"}
            </div>
          </div>
        </div>
      )}

      {/* ── Basic Information ── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <div className={styles.sectionHeadingAccent} />
          <h3 className={styles.sectionHeadingTitle}>Basic Information</h3>
        </div>

        <div className={styles.basicInfoGrid}>
          <div>
            <label className={styles.formFieldLabel}>
              Template Name <span className={styles.requiredStar}>*</span>
            </label>
            <input
              className={`${styles.formInput} ${isReadOnly ? styles.formInputReadOnly : ""}`}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Sales Manager Appraisal 2025"
              readOnly={isReadOnly}
              maxLength={120}
            />
            {!isReadOnly && (
              <p className={styles.fieldHint}>
                Use a clear, year-specific name so it's easy to identify later.
              </p>
            )}
          </div>

          <div>
            <label className={styles.formFieldLabel}>
              Assign to Employee
              <span className={styles.optionalTag}>optional</span>
            </label>
            <Select
              instanceId="user-select"
              styles={baseSelectStyles}
              isDisabled={isReadOnly}
              isSearchable
              filterOption={(option: any, inputValue: string) => {
                if (!inputValue) return true;
                return option.label.toLowerCase().includes(inputValue.toLowerCase());
              }}
              options={users.map((u) => ({ value: u.id, label: u.full_name }))}
              value={
                selectedUser !== null
                  ? (() => {
                      const u = users.find((x) => x.id === selectedUser);
                      return u ? { value: u.id, label: u.full_name } : null;
                    })()
                  : null
              }
              onChange={(opt: any) => setSelectedUser(opt ? (opt.value as string) : null)}
              isClearable
              placeholder="Search by name…"
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              menuPosition="fixed"
            />
            {!isReadOnly && (
              <p className={styles.fieldHint}>
                Assigns directly to this individual, regardless of role or department.
              </p>
            )}
          </div>
        </div>

        <div className={styles.descriptionRow}>
          <div className={styles.descriptionLabelRow}>
            <label className={styles.formFieldLabel}>Description</label>
            {!isReadOnly && (
              <span className={`${styles.charCounter} ${description.length > 400 ? styles.charCounterWarn : ""}`}>
                {description.length} / 500
              </span>
            )}
          </div>
          <textarea
            className={`${styles.formTextarea} ${isReadOnly ? styles.formTextareaReadOnly : ""}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the purpose, scope, target audience, or any special notes for this template…"
            readOnly={isReadOnly}
            maxLength={500}
          />
        </div>
      </div>

      {/* ── Add Category button ── */}
      {!isReadOnly && (
        <div className={styles.addCategoryRow}>
          <button className={styles.addCategoryBtn} onClick={addCategory}>
            <Plus size={15} />
            Add Category
          </button>
        </div>
      )}

      {/* ── All categories ── */}
      <div className={styles.categoriesOuterCard}>
        {categories.map((cat, catIndex) => (
          <div key={catIndex} className={styles.categoryBlock}>

            <div className={`${styles.categoryHeader} ${isReadOnly ? styles.categoryHeaderReadOnly : styles.categoryHeaderActive}`}>
              <input
                className={`${styles.categoryNameInput} ${isReadOnly ? styles.categoryNameInputReadOnly : ""}`}
                value={cat.name}
                placeholder="Enter Category Name…"
                readOnly={isReadOnly}
                onChange={(e) => !isReadOnly && updateCategoryName(catIndex, e.target.value)}
              />
              <div className={styles.categoryHeaderRight}>
                <div className={styles.categoryWeightBadge}>
                  <span className={styles.categoryWeightValue}>{categoryWeights[catIndex].toFixed(1)}%</span>
                  <span className={styles.categoryWeightUnit}>weight</span>
                </div>
                {!isReadOnly && (
                  <button
                    className={styles.categoryRemoveBtn}
                    onClick={() => removeCategory(catIndex)}
                    aria-label={`Remove category ${cat.name || catIndex + 1}`}
                  >
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
                <div className={styles.objColMax}>Max Score<span className={styles.objColMaxSub}>null = inherit {maxScore}</span></div>
                {!isReadOnly && <div className={styles.objColAction} />}
              </div>

              {cat.objectives.map((obj, objIndex) => {
                const scaleOption   = resolveKpiOption(obj.kpiScale);
                const controlOption = CONTROL_OPTIONS.find((c) => c.value === (obj.control ?? "Editable")) ?? CONTROL_OPTIONS[1];
                const isNew         = !isReadOnly && newObjKey === `${catIndex}-${objIndex}`;

                return (
                  <div
                    key={objIndex}
                    className={`${styles.objRow} ${obj.control === "Locked" ? styles.objRowLocked : styles.objRowNormal}`}
                  >
                    <div className={styles.objColNum}>
                      <span className={styles.objRowNum}>{catIndex + 1}.{objIndex + 1}</span>
                    </div>

                    <div className={styles.objColName}>
                      <div className={`${styles.inlineInputBox} ${isReadOnly ? styles.inlineInputBoxReadOnly : styles.inlineInputBoxEditable} ${isNew ? styles.inlineInputBoxNew : ""}`}>
                        <input
                          className={`${styles.objectiveNameInput} ${isReadOnly ? styles.objectiveNameInputReadOnly : styles.objectiveNameInputActive}`}
                          value={obj.name ?? ""}
                          readOnly={isReadOnly}
                          placeholder={isReadOnly ? "—" : "Objective name *"}
                          autoFocus={isNew}
                          onFocus={() => setNewObjKey(null)}
                          onChange={(e) => !isReadOnly && updateObjectiveField(catIndex, objIndex, "name", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className={styles.objColWeight}>
                      <div className={`${styles.inlineInputBox} ${styles.inlineInputBoxWeight} ${isReadOnly ? styles.inlineInputBoxReadOnly : styles.inlineInputBoxEditable}`}>
                        <input
                          className={`${styles.weightInput} ${isReadOnly ? styles.weightInputReadOnly : styles.weightInputActive}`}
                          type="number"
                          min="0"
                          max="100"
                          placeholder="0"
                          value={obj.weight ?? ""}
                          readOnly={isReadOnly}
                          onChange={(e) =>
                            !isReadOnly && updateObjectiveField(
                              catIndex, objIndex, "weight",
                              e.target.value === "" ? "" : Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className={styles.objColControl}>
                      {isReadOnly ? (
                        <ControlBadge opt={controlOption} isDisabled={true} />
                      ) : (
                        <Select
                          instanceId={`ctrl-${catIndex}-${objIndex}`}
                          styles={tableSelectStyles}
                          options={CONTROL_OPTIONS as any}
                          isDisabled={false}
                          value={controlOption}
                          onChange={(opt: any) =>
                            updateObjectiveField(catIndex, objIndex, "control", opt?.value ?? "Editable")
                          }
                          isSearchable={false}
                          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                          menuPosition="fixed"
                          components={{ Option: ControlOptionRenderer }}
                          formatOptionLabel={(opt: any, { context }: any) =>
                            context === "value"
                              ? <ControlBadge opt={opt} isDisabled={false} />
                              : <>{opt.label}</>
                          }
                        />
                      )}
                    </div>

                    <div className={styles.objColKpi}>
                      {isReadOnly ? (
                        <span className={styles.kpiReadOnlyText}>{scaleOption.label}</span>
                      ) : (
                        <Select
                          instanceId={`kpi-${catIndex}-${objIndex}`}
                          styles={kpiSelectStyles}
                          options={kpiScaleGroupedOptions}
                          isDisabled={false}
                          value={scaleOption}
                          placeholder="Select KPI scale *"
                          onChange={(opt: any) =>
                            updateObjectiveField(catIndex, objIndex, "kpiScale", opt?.value ?? "interpolated_financial")
                          }
                          components={{ Option: KpiScaleOptionRenderer }}
                          isSearchable={false}
                          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                          menuPosition="fixed"
                          formatGroupLabel={(group: any) => {
                            const groupMeta = KPI_SCALE_GROUPS.find((g) => g.groupLabel === group.label);
                            return (
                              <div style={{
                                fontSize: "10px", fontWeight: "800", letterSpacing: "0.08em",
                                color: groupMeta?.color ?? "#64748b",
                                padding: "6px 8px 2px",
                                textTransform: "uppercase",
                              }}>
                                {group.label}
                              </div>
                            );
                          }}
                          formatOptionLabel={(opt: any, { context }: any) =>
                            context === "value"
                              ? (
                                <span style={{
                                  fontSize: "12px", fontWeight: "600",
                                  color: "#1e293b",
                                  display: "flex", alignItems: "center", gap: "6px",
                                }}>
                                  <span style={{ flexShrink: 0 }}>{opt.icon}</span>
                                  {opt.label}
                                  {opt.isInverse && (
                                    <span style={{
                                      fontSize: "9px", padding: "1px 5px", borderRadius: "4px",
                                      background: "#fee2e2", color: "#dc2626", fontWeight: "700",
                                    }}>inv</span>
                                  )}
                                </span>
                              )
                              : <>{opt.label}</>
                          }
                        />
                      )}
                    </div>

                    <div className={styles.objColMax}>
                      {isReadOnly ? (
                        <span className={styles.maxScoreReadOnly}>
                          {obj.kpiMaxScore ?? `=${maxScore}`}
                        </span>
                      ) : (
                        <select
                          className={`${styles.maxScoreSelect} ${obj.kpiMaxScore ? styles.maxScoreSelectSet : styles.maxScoreSelectUnset}`}
                          value={obj.kpiMaxScore ?? ""}
                          onChange={(e) =>
                            updateObjectiveField(
                              catIndex, objIndex, "kpiMaxScore",
                              e.target.value === "" ? null : Number(e.target.value),
                            )
                          }
                        >
                          <option value="">inherit ({maxScore})</option>
                          {MAX_SCORE_OPTIONS.map((score) => (
                            <option key={score} value={score}>{score}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {!isReadOnly && (
                      <div className={styles.objColAction}>
                        <button
                          className={styles.objectiveDeleteBtn}
                          onClick={() => removeObjective(catIndex, objIndex)}
                          aria-label={`Remove objective ${obj.name || objIndex + 1}`}
                          title="Remove objective"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!isReadOnly && (
              <button
                className={styles.addObjectiveBtn}
                onClick={() => addObjective(catIndex)}
              >
                <Plus size={14} />
                Add Objective to {cat.name || `Category ${catIndex + 1}`}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Weight validation bar ── */}
      <div className={`${styles.weightBar} ${isWeightValid ? styles.weightBarValid : styles.weightBarInvalid}`}>
        <div
          className={`${styles.weightBarProgress} ${
            isWeightValid ? styles.weightBarProgressValid
            : isWeightExceeded ? styles.weightBarProgressExceeded
            : styles.weightBarProgressWarn
          }`}
          style={{ width: `${weightBarPct}%` }}
        />
        <div className={styles.weightBarHeader}>
          <div className={styles.weightBarLeft}>
            <div className={`${styles.weightBadge} ${isWeightValid ? styles.weightBadgeValid : styles.weightBadgeInvalid}`}>
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
          {categories.map((cat, catIndex) => {
            const catWeight = categoryWeights[catIndex];
            const catPct    = totalWeight > 0 ? Math.round((catWeight / totalWeight) * 100) : 0;
            const barHue    = (catIndex * 47) % 360;
            const barColor  = `hsl(${barHue}, 65%, 45%)`;
            return (
              <div key={catIndex} className={styles.weightBreakdownRow}>
                <span className={styles.weightBreakdownLabel}>
                  {cat.name || `Category ${catIndex + 1}`}
                </span>
                <div className={styles.weightBreakdownTrack}>
                  <div
                    className={styles.weightBreakdownFill}
                    style={{ width: `${catPct}%`, background: barColor }}
                  />
                </div>
                <span className={styles.weightBreakdownValue} style={{ color: barColor }}>
                  {catWeight}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── KPI Scale Control Card ── */}
      <div className={styles.sectionCardCompact}>
        <div className={styles.sectionHeading}>
          <div className={`${styles.sectionHeadingAccent} ${styles.sectionHeadingAccentViolet}`} />
          <h4 className={styles.sectionHeadingTitleSm}>KPI Scale &amp; Control Reference</h4>
        </div>

        <div>
          <div className={styles.referenceSubHeading}>
            <div className={`${styles.referenceSubIcon} ${styles.referenceSubIconBlue}`}>
              <Settings2 size={13} color="#3b82f6" />
            </div>
            <span className={styles.referenceSubLabel}>Control Types</span>
          </div>
          <div className={styles.referenceItemsRow}>
            <div className={`${styles.controlReferenceItem} ${styles.controlReferenceItemLocked}`}>
              <Lock size={12} color="#1e40af" />
              <span className={`${styles.controlReferenceLabel} ${styles.controlReferenceLabelLocked}`}>Locked</span>
              <span className={`${styles.controlReferenceDesc} ${styles.controlReferenceLabelLocked}`}>
                Fixed — cannot be changed by appraisee
              </span>
            </div>
            <div className={`${styles.controlReferenceItem} ${styles.controlReferenceItemEditable}`}>
              <Unlock size={12} color="#16a34a" />
              <span className={`${styles.controlReferenceLabel} ${styles.controlReferenceLabelEditable}`}>Editable</span>
              <span className={`${styles.controlReferenceDesc} ${styles.controlReferenceLabelEditable}`}>
                Flexible — appraisee may adjust
              </span>
            </div>
          </div>
        </div>

        <div className={styles.referenceDivider} />

        <div>
          <div className={styles.referenceSubHeading}>
            <div className={`${styles.referenceSubIcon} ${styles.referenceSubIconViolet}`}>
              <Sliders size={13} color="#7c3aed" />
            </div>
            <span className={styles.referenceSubLabel}>KPI Scale Types</span>
          </div>

          <div className={styles.referenceItemsRow}>
            <div className={styles.kpiScaleItem} style={{ background: "#eff6ff", borderColor: "#bfdbfe", borderWidth: "1px", borderStyle: "solid" }}>
              <div className={styles.kpiScaleItemHeader}>
                <TrendingUp size={13} color="#1e40af" />
                <span className={styles.kpiScaleItemLabel} style={{ color: "#1e40af" }}>Interpolated</span>
              </div>
              <p className={styles.kpiScaleItemHint} style={{ color: "#3b82f6" }}>
                Continuous linear scoring between lower &amp; upper limits
              </p>
              <div className={styles.kpiScaleTagRow}>
                {KPI_SCALE_OPTIONS.filter((o) => o.group === "interpolated").map((o) => (
                  <span key={o.value} className={styles.kpiScaleTag} style={{ background: "#dbeafe", color: "#1e40af" }}>
                    {o.label}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.kpiScaleItem} style={{ background: "#fef3c7", borderColor: "#fde68a", borderWidth: "1px", borderStyle: "solid" }}>
              <div className={styles.kpiScaleItemHeader}>
                <SlidersHorizontal size={13} color="#92400e" />
                <span className={styles.kpiScaleItemLabel} style={{ color: "#92400e" }}>Bracket</span>
              </div>
              <p className={styles.kpiScaleItemHint} style={{ color: "#b45309" }}>
                Stepped band ratings — value falls into a defined range
              </p>
              <div className={styles.kpiScaleTagRow}>
                {KPI_SCALE_OPTIONS.filter((o) => o.group === "bracket").map((o) => (
                  <span key={o.value} className={styles.kpiScaleTag} style={{
                    background: "#fde68a", color: "#92400e",
                    display: "inline-flex", alignItems: "center", gap: "3px",
                  }}>
                    {o.label}
                    {o.isInverse && (
                      <span style={{ fontSize: "9px", padding: "0 3px", borderRadius: "3px", background: "#fee2e2", color: "#dc2626" }}>inv</span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.kpiScaleItem} style={{ background: "#f0fdf4", borderColor: "#bbf7d0", borderWidth: "1px", borderStyle: "solid" }}>
              <div className={styles.kpiScaleItemHeader}>
                <SlidersHorizontal size={13} color="#166534" />
                <span className={styles.kpiScaleItemLabel} style={{ color: "#166534" }}>Manual</span>
              </div>
              <p className={styles.kpiScaleItemHint} style={{ color: "#16a34a" }}>
                Appraiser enters 1–5 directly — no formula applied
              </p>
              <div className={styles.kpiScaleTagRow}>
                {KPI_SCALE_OPTIONS.filter((o) => o.group === "manual").map((o) => (
                  <span key={o.value} className={styles.kpiScaleTag} style={{ background: "#bbf7d0", color: "#166534" }}>
                    {o.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Distribution Strategy ── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <div className={styles.sectionHeadingAccent} />
          <h3 className={styles.sectionHeadingTitle}>Distribution Strategy</h3>
          {isReadOnly && <span className={styles.sectionHeadingReadOnly}>(read-only)</span>}
        </div>

        <div className={styles.distributionLogicNote}>
          <div className={styles.distributionLogicIcon}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <p className={styles.distributionLogicText}>
            An employee sees this template if they match <strong>any</strong> of the selected roles, <strong>any</strong> of the selected departments, or are assigned directly by name. A direct employee assignment always takes priority. Departments are shown as <strong>[CODE] Name · Branch</strong> to distinguish departments across branches.
          </p>
        </div>

        {/* Branch filter pills — rendered as a full-width row ABOVE the two-column
            grid so the Roles select and Departments select stay vertically aligned.
            The empty left div mirrors the Roles column width. */}
        {branches.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
            marginBottom: "6px",
          }}>
            <div /> {/* spacer over Roles column */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{
                fontSize: "10px", fontWeight: "700", color: "#94a3b8",
                textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap",
              }}>
                Filter by branch:
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                <button
                  onClick={() => setSelectedBranchFilter(null)}
                  style={{
                    padding: "3px 10px", borderRadius: "20px", fontSize: "11px",
                    fontWeight: "700", cursor: "pointer", border: "1px solid",
                    background:  !selectedBranchFilter ? "#1e40af" : "#f8fafc",
                    color:       !selectedBranchFilter ? "#fff"    : "#64748b",
                    borderColor: !selectedBranchFilter ? "#1e40af" : "#e2e8f0",
                    transition: "all 0.12s",
                  }}
                >
                  All
                </button>
                {branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBranchFilter(
                      selectedBranchFilter === b.id ? null : b.id
                    )}
                    title={b.name}
                    style={{
                      padding: "3px 10px", borderRadius: "20px", fontSize: "11px",
                      fontWeight: "700", cursor: "pointer", border: "1px solid",
                      background:   selectedBranchFilter === b.id ? "#1e40af" : "#f8fafc",
                      color:        selectedBranchFilter === b.id ? "#fff"    : "#64748b",
                      borderColor:  selectedBranchFilter === b.id ? "#1e40af" : "#e2e8f0",
                      transition: "all 0.12s",
                    }}
                  >
                    {b.code ?? b.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className={styles.distributionGrid}>
          <div>
            <label className={styles.formFieldLabel}>Target Roles</label>
            <CreatableSelect
              instanceId="roles-select"
              placeholder="Type to create or select roles…"
              styles={baseSelectStyles}
              isMulti
              isDisabled={isReadOnly}
              options={roles.map((r: any) => ({ value: r.id, label: r.name }))}
              value={roles.filter((r: any) => selectedRoles.includes(r.id)).map((r: any) => ({ value: r.id, label: r.name }))}
              onChange={(opts: any) => setSelectedRoles(opts ? opts.map((o: any) => o.value) : [])}
              onCreateOption={handleCreateRole}
              formatCreateLabel={(val: string) => `Create role: "${val}"`}
            />
            {!isReadOnly && (
              <p className={styles.fieldHint}>All employees with this role will see the template.</p>
            )}
          </div>

          <div>
            <label className={styles.formFieldLabel}>Departments</label>

            {/* We use a plain Select (not CreatableSelect) because department
                creation goes through a modal (to collect code + branch too).
                A "Create new department…" pseudo-option is appended at the bottom. */}
            <Select
              instanceId="depts-select"
              isMulti
              isDisabled={isReadOnly}
              placeholder={isReadOnly ? "—" : "Select departments…"}
              options={[
                ...departmentSelectOptions,
                // "Create" pseudo-option at the bottom when not read-only
                ...(!isReadOnly
                  ? [{ value: "__create__", label: "+ Create new department…" }]
                  : []),
              ]}
              styles={{
                ...baseSelectStyles,
                option: (base: any, { data, isFocused, isSelected }: any) => ({
                  ...base,
                  backgroundColor: isSelected
                    ? "#3b82f6"
                    : (data as any).value === "__create__"
                    ? isFocused ? "#f0fdf4" : "#f8fafc"
                    : isFocused ? "#eff6ff" : "transparent",
                  color: isSelected
                    ? "#fff"
                    : (data as any).value === "__create__"
                    ? "#166534"
                    : "#475569",
                  fontWeight: (data as any).value === "__create__" ? "700" : "500",
                  borderTop: (data as any).value === "__create__" ? "1px solid #e2e8f0" : "none",
                  padding: "9px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px",
                }),
              }}
              value={selectedDepartments
                .filter((id) => departmentSelectOptions.some((o) => o.value === id))
                .map((id) => departmentSelectOptions.find((o) => o.value === id)!)}
              onChange={(opts: any) => {
                if (!opts) { setSelectedDepartments([]); return; }
                const createOpt = opts.find((o: any) => o.value === "__create__");
                if (createOpt) {
                  // Filter out the __create__ pseudo-option, then open modal
                  setSelectedDepartments(
                    opts.filter((o: any) => o.value !== "__create__").map((o: any) => String(o.value))
                  );
                  setDeptModal({ open: true, initialName: "" });
                } else {
                  setSelectedDepartments(opts.map((o: any) => String(o.value)));
                }
              }}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              menuPosition="fixed"
            />
            {!isReadOnly && (
              <p className={styles.fieldHint}>
                All employees in this department will see the template. Department code links to financial data.
              </p>
            )}
          </div>
        </div>

        {/* ── Read-only summary ── */}
        {isReadOnly && (selectedRoles.length > 0 || selectedDepartments.length > 0 || selectedUser) && (
          <div className={styles.assignmentSummary}>
            {selectedUser && (
              <div className={styles.assignmentSummaryRow}>
                <span className={styles.assignmentSummaryLabel}>Direct Employee</span>
                <span className={styles.assignmentSummaryBadge} style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}>
                  {(() => {
                    const u = users.find((x) => x.id === selectedUser);
                    return u ? u.full_name : selectedUser;
                  })()}
                </span>
              </div>
            )}
            {selectedRoles.length > 0 && (
              <div className={styles.assignmentSummaryRow}>
                <span className={styles.assignmentSummaryLabel}>Roles</span>
                <div className={styles.assignmentSummaryTags}>
                  {selectedRoles.map((id) => {
                    const r = roles.find((x: any) => x.id === id);
                    return r ? (
                      <span key={id} className={styles.assignmentSummaryBadge} style={{ background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0" }}>
                        {r.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}
            {selectedDepartments.length > 0 && (
              <div className={styles.assignmentSummaryRow}>
                <span className={styles.assignmentSummaryLabel}>Departments</span>
                <div className={styles.assignmentSummaryTags}>
                  {selectedDepartments.map((id) => {
                    const opt = departmentSelectOptions.find((o) => o.value === id);
                    return opt ? (
                      <span key={id} className={styles.assignmentSummaryBadge} style={{ background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" }}>
                        {opt.label}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Action row ── */}
      <div className={styles.actionRow}>
        <div className={styles.cancelBtnWrapper}>
          <button
            className={styles.cancelBtn}
            onClick={() => isReadOnly
              ? (router.push("/hq-admin/template-management"), window.scrollTo({ top: 0, behavior: "instant" }))
              : setShowCancelConfirm((prev) => !prev)
            }
          >
            {isReadOnly ? "← Back" : "Cancel"}
          </button>

          {showCancelConfirm && !isReadOnly && (
            <div className={styles.cancelConfirmPopover}>
              <p className={styles.cancelConfirmText}>Discard changes and exit?</p>
              <div className={styles.cancelConfirmActions}>
                <button className={styles.cancelConfirmStayBtn} onClick={() => setShowCancelConfirm(false)}>
                  Stay
                </button>
                <button
                  className={styles.cancelConfirmDiscardBtn}
                  onClick={() => {
                    setShowCancelConfirm(false);
                    router.push("/hq-admin/template-management");
                    window.scrollTo({ top: 0, behavior: "instant" });
                  }}
                >
                  Discard
                </button>
              </div>
              <div className={styles.cancelConfirmCaret} />
            </div>
          )}
        </div>

        {!isReadOnly && (
          <button
            className={`${styles.saveBtn} ${isWeightValid ? styles.saveBtnReady : styles.saveBtnBlocked}`}
            onClick={
              isWeightValid
                ? handleSave
                : () => toast.error(`Total weight must be 100%. Currently ${totalWeight}%`)
            }
          >
            {editId ? "Update Template" : "Create Template"}
          </button>
        )}
      </div>
    </div>
  );
}
