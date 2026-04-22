"use client";

// components/TemplateCreateBase.tsx
//
// Training linkage — multi-tag per objective (array, not scalar).
// KPI Scale Control Card — below the tables.
// Table layout — fixed structured layout, no horizontal X-axis scroll section below.
// Consistent camelCase naming; no magic numbers; separate CSS file.
// KPI Scales — grouped dropdown: Interpolated (8), Bracket (4, one inverse), Manual (1).

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import { toast } from "sonner";
import {
  BookOpen, ChevronDown, ChevronUp,
  AlertCircle, Eye, Lock, Unlock,
  Settings2, Sliders, Plus, Trash2,
  TrendingUp, TrendingDown, SlidersHorizontal,
  Tag, X,
} from "lucide-react";
import {
  computeFreezeDates,
  getTemplatePermissions,
  formatDate,
} from "@/lib/freezeUtils";
import styles from "./TemplateCreateBase.module.css";

// ─── API base URL ─────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

// ─── Domain constants — named, no magic numbers ───────────────────────────────

const DEFAULT_MAX_SCORE    = 5;
const MAX_SCORE_OPTIONS    = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Training area IDs 1–8 are the PRD-defined defaults (seeded in DB).
 * Any ID above this boundary was created by an admin at runtime.
 */
const PRD_AREA_ID_BOUNDARY = 8;

// ─── KPI Scale Options — grouped (Interpolated / Bracket / Manual) ────────────
// Each entry maps to a specific calculation method from the Excel rating log.

const KPI_SCALE_OPTIONS = [
  // ── INTERPOLATED ── continuous linear scoring between lower & upper limits
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
  // ── BRACKET ── stepped band ratings — value falls into a defined range
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
  // ── MANUAL ── appraiser enters score directly
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

// Grouped structure consumed by react-select formatGroupLabel
const KPI_SCALE_GROUPS = [
  { groupKey: "interpolated", groupLabel: "INTERPOLATED", color: "#1e40af" },
  { groupKey: "bracket",      groupLabel: "BRACKET",      color: "#92400e" },
  { groupKey: "manual",       groupLabel: "MANUAL",       color: "#166534" },
] as const;

// Helper — resolve a kpiScale value string → option object (with fallback)
function resolveKpiOption(value: string | undefined) {
  return (
    KPI_SCALE_OPTIONS.find((o) => o.value === (value ?? "interpolated_financial")) ??
    KPI_SCALE_OPTIONS[0]
  );
}

// ─── Control options ──────────────────────────────────────────────────────────

const CONTROL_OPTIONS = [
  { value: "Locked",   label: "Locked",   badge: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" } },
  { value: "Editable", label: "Editable", badge: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" } },
] as const;

// ─── PRD training area IDs (1–8, matches DB seed) ────────────────────────────

const TRAINING_AREA_ID = {
  JOB_SPECIFIC_SKILLS:  1,
  GUEST_SENSITIVITY:    2,
  TEAMWORK:             3,
  COMMUNICATION_SKILLS: 4,
  COMPLAINT_HANDLING:   5,
  PRODUCT_KNOWLEDGE:    6,
  SERVICE_ORIENTATION:  7,
  OTHER:                8,
} as const;

// ─── UI-only training area colours ────────────────────────────────────────────

const PRD_UI_COLORS: Record<number, AreaColors> = {
  [TRAINING_AREA_ID.JOB_SPECIFIC_SKILLS]:  { color: "#3b82f6", bgColor: "#eff6ff", borderColor: "#bfdbfe" },
  [TRAINING_AREA_ID.GUEST_SENSITIVITY]:    { color: "#8b5cf6", bgColor: "#f5f3ff", borderColor: "#ddd6fe" },
  [TRAINING_AREA_ID.TEAMWORK]:             { color: "#059669", bgColor: "#ecfdf5", borderColor: "#a7f3d0" },
  [TRAINING_AREA_ID.COMMUNICATION_SKILLS]: { color: "#0891b2", bgColor: "#ecfeff", borderColor: "#a5f3fc" },
  [TRAINING_AREA_ID.COMPLAINT_HANDLING]:   { color: "#dc2626", bgColor: "#fff1f2", borderColor: "#fecaca" },
  [TRAINING_AREA_ID.PRODUCT_KNOWLEDGE]:    { color: "#d97706", bgColor: "#fffbeb", borderColor: "#fde68a" },
  [TRAINING_AREA_ID.SERVICE_ORIENTATION]:  { color: "#7c3aed", bgColor: "#faf5ff", borderColor: "#e9d5ff" },
  [TRAINING_AREA_ID.OTHER]:               { color: "#64748b", bgColor: "#f8fafc", borderColor: "#e2e8f0" },
};

const FALLBACK_UI_COLOR: AreaColors = {
  color: "#64748b", bgColor: "#f8fafc", borderColor: "#e2e8f0",
};

function resolveAreaColors(id: number | null): AreaColors {
  if (id === null || id === 0) return FALLBACK_UI_COLOR;
  return PRD_UI_COLORS[id] ?? FALLBACK_UI_COLOR;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AreaColors {
  color:       string;
  bgColor:     string;
  borderColor: string;
}

interface TrainingArea {
  id:          number;
  name:        string;
  color:       string;
  bgColor:     string;
  borderColor: string;
}

interface ObjectiveRow {
  name:               string;
  kpiScale:           string;
  weight:             number | string | null;
  control:            string;
  mandatory:          boolean;
  trainingTags:       string[];
  trainingLinkageIds: Array<number | string>;
  kpiMaxScore:        number | null;
}

interface CategoryRow {
  name:         string;
  weight:       number;
  mandatory:    boolean;
  trainingTags: string[];
  objectives:   ObjectiveRow[];
}

interface TemplateCreateBaseProps {
  level?: number;
}

// ─── Training area option builder ─────────────────────────────────────────────

function buildTrainingAreaOptions(dbAreas: TrainingArea[]) {
  return dbAreas.map((area) => ({
    value:    String(area.id),
    label:    area.name,
    isCustom: area.id > PRD_AREA_ID_BOUNDARY,
  }));
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

function buildTableSelectStyles(isDisabled: boolean): any {
  return {
    control: (base: any) => ({
      ...base,
      borderRadius: "20px", border: "none", padding: "0", minHeight: "28px",
      boxShadow: "none", background: "transparent",
      cursor: isDisabled ? "not-allowed" : "pointer",
      "&:hover": {},
    }),
    valueContainer:      (base: any) => ({ ...base, padding: "0" }),
    indicatorsContainer: (base: any) => ({ ...base, display: isDisabled ? "none" : "flex" }),
    dropdownIndicator:   (base: any) => ({ ...base, padding: "0 4px", color: "#94a3b8" }),
    indicatorSeparator:  () => ({ display: "none" }),
    singleValue:         (base: any) => ({ ...base, margin: 0 }),
    menu: (base: any) => ({
      ...base, borderRadius: "12px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      border: "1px solid #f1f5f9", marginTop: "6px", padding: "4px",
      zIndex: 9999, minWidth: "260px",
    }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color:           isSelected ? "#fff"     : "#475569",
      padding: "8px 12px", borderRadius: "8px",
      cursor: "pointer", fontSize: "12px", fontWeight: "600",
    }),
    groupHeading: (base: any) => ({
      ...base,
      fontSize: "10px", fontWeight: "800", letterSpacing: "0.08em",
      padding: "6px 12px 2px", textTransform: "uppercase",
      borderTop: "1px solid #f1f5f9", marginTop: "4px",
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
  <span style={{
    display: "inline-flex", alignItems: "center", gap: "5px",
    padding: "3px 10px", borderRadius: "20px",
    fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap",
    background: isDisabled ? "#f1f5f9" : opt.badge.bg,
    color:      isDisabled ? "#94a3b8" : opt.badge.color,
    border:     `1px solid ${isDisabled ? "#e2e8f0" : opt.badge.border}`,
    maxWidth:   "175px", overflow: "hidden", textOverflow: "ellipsis",
  }}>
    {!isDisabled && <span style={{ flexShrink: 0 }}>{opt.icon}</span>}
    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{opt.label}</span>
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
  <span style={{
    display: "inline-flex", alignItems: "center", gap: "4px",
    padding: "3px 10px", borderRadius: "20px",
    fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap",
    background: isDisabled ? "#f1f5f9" : opt.badge.bg,
    color:      isDisabled ? "#94a3b8" : opt.badge.color,
    border:     `1px solid ${isDisabled ? "#e2e8f0" : opt.badge.border}`,
  }}>
    {opt.value === "Locked" ? <Lock size={10} /> : <Unlock size={10} />}
    {opt.label}
  </span>
);

const TrainingAreaBadge = ({ area, onRemove }: {
  area: AreaColors & { name: string };
  onRemove?: () => void;
}) => (
  <span
    className={styles.trainingAreaBadge}
    style={{ background: area.bgColor, color: area.color, borderColor: area.borderColor }}
  >
    <Tag size={9} style={{ flexShrink: 0 }} />
    {area.name}
    {onRemove && (
      <button
        className={styles.trainingAreaBadgeRemove}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{ color: area.color }}
        aria-label={`Remove ${area.name}`}
        type="button"
      >
        <X size={9} />
      </button>
    )}
  </span>
);

// ─── MultiLinkageCell ─────────────────────────────────────────────────────────

interface MultiLinkageCellProps {
  linkageIds:          Array<number | string>;
  isReadOnly:          boolean;
  dbTrainingAreas:     TrainingArea[];
  trainingAreaOptions: { value: string; label: string; isCustom: boolean }[];
  onAdd:               (id: number | string) => void;
  onRemove:            (id: number | string) => void;
  onCreateNew:         (inputValue: string) => void;
}

function MultiLinkageCell({
  linkageIds, isReadOnly, dbTrainingAreas, trainingAreaOptions,
  onAdd, onRemove, onCreateNew,
}: MultiLinkageCellProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isExpanded) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isExpanded]);

  const resolveArea = (id: number | string): (AreaColors & { name: string }) | null => {
    const numId  = Number(id);
    const dbArea = isNaN(numId)
      ? dbTrainingAreas.find((a) => a.name === String(id))
      : dbTrainingAreas.find((a) => a.id === numId);
    const name = dbArea?.name ?? (id !== null ? String(id) : null);
    if (!name) return null;
    return { name, ...resolveAreaColors(dbArea?.id ?? null) };
  };

  const alreadySelectedValues = new Set(linkageIds.map(String));
  const availableOptions = trainingAreaOptions.filter(
    (opt) => !alreadySelectedValues.has(opt.value),
  );

  const dropdownSelectStyles: any = {
    control: (base: any, { isFocused }: any) => ({
      ...base,
      borderRadius: "8px",
      border:       isFocused ? "1.5px solid #3b82f6" : "1px solid #e2e8f0",
      minHeight:    "32px",
      boxShadow:    isFocused ? "0 0 0 3px rgba(59,130,246,0.08)" : "none",
      fontSize:     "12px", fontWeight: "500", background: "#fff",
      cursor: "text", transition: "all 0.15s",
    }),
    valueContainer:      (base: any) => ({ ...base, padding: "2px 8px" }),
    dropdownIndicator:   (base: any) => ({ ...base, padding: "0 6px", color: "#94a3b8" }),
    indicatorSeparator:  () => ({ display: "none" }),
    placeholder:         (base: any) => ({ ...base, color: "#94a3b8", fontSize: "12px" }),
    menu: (base: any) => ({
      ...base, borderRadius: "10px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.13)",
      border: "1px solid #e8edf5", marginTop: "4px", padding: "4px", zIndex: 9999, minWidth: "220px",
    }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected ? "#3b82f6" : isFocused ? "#eff6ff" : "transparent",
      color:           isSelected ? "#fff"     : "#475569",
      padding: "7px 10px", borderRadius: "7px",
      cursor: "pointer", fontSize: "12px", fontWeight: "600",
    }),
  };

  if (isReadOnly) {
    return (
      <div className={styles.linkageCellReadOnly}>
        {linkageIds.length === 0 ? (
          <span className={styles.linkageEmptyPlaceholder}>—</span>
        ) : (
          <div className={styles.linkageTagsRow}>
            {linkageIds.map((id) => {
              const area = resolveArea(id);
              return area ? <TrainingAreaBadge key={String(id)} area={area} /> : null;
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={styles.linkageCellWrapper}>
      <div className={styles.linkageTagsRow}>
        {linkageIds.map((id) => {
          const area = resolveArea(id);
          return area ? (
            <TrainingAreaBadge key={String(id)} area={area} onRemove={() => onRemove(id)} />
          ) : null;
        })}
        <button
          className={`${styles.linkageAddTrigger} ${isExpanded ? styles.linkageAddTriggerActive : ""}`}
          onClick={() => setIsExpanded((prev) => !prev)}
          type="button"
          aria-label="Add training linkage"
          title="Link a training area"
        >
          <Tag size={10} />
          <Plus size={9} />
        </button>
      </div>

      {isExpanded && (
        <div className={styles.linkageDropdownWrapper}>
          <CreatableSelect
            autoFocus
            menuIsOpen
            options={availableOptions}
            placeholder="Search or add training area…"
            styles={dropdownSelectStyles}
            isClearable={false}
            value={null}
            onChange={(opt: any) => {
              if (!opt) return;
              const resolvedId = isNaN(Number(opt.value)) ? opt.value : Number(opt.value);
              onAdd(resolvedId);
              setIsExpanded(false);
            }}
            onCreateOption={(inputValue: string) => {
              onCreateNew(inputValue);
              setIsExpanded(false);
            }}
            formatCreateLabel={(inputValue: string) => `Save "${inputValue}" as new area`}
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
            formatOptionLabel={(opt: any, { context }: any) => {
              if (context === "value") return <span>{opt.label}</span>;
              const matchedArea = dbTrainingAreas.find((a) => String(a.id) === opt.value);
              const colors      = matchedArea ? resolveAreaColors(matchedArea.id) : FALLBACK_UI_COLOR;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{
                    width: "8px", height: "8px", borderRadius: "50%",
                    background: colors.color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: "12px", fontWeight: "600" }}>{opt.label}</span>
                  {opt.isCustom && (
                    <span style={{ fontSize: "10px", color: "#94a3b8", marginLeft: "auto" }}>custom</span>
                  )}
                </div>
              );
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Objective factory ────────────────────────────────────────────────────────

function makeDefaultObjective(
  name:               string,
  kpiScale:           string,
  control:            string,
  trainingLinkageIds: Array<number | string> = [],
  kpiMaxScore:        number | null = null,
): ObjectiveRow {
  return {
    name, kpiScale, weight: null, control,
    mandatory: true, trainingTags: [], trainingLinkageIds, kpiMaxScore,
  };
}

// ─── Initial category seed data ───────────────────────────────────────────────

const INITIAL_CATEGORIES: CategoryRow[] = [
  {
    name: "Financial Focus", weight: 0, mandatory: true, trainingTags: [],
    objectives: [
      makeDefaultObjective("Revenue Achievement",                    "interpolated_financial",   "Locked",   [TRAINING_AREA_ID.JOB_SPECIFIC_SKILLS]),
      makeDefaultObjective("GP Achievement",                         "interpolated_financial",   "Locked",   [TRAINING_AREA_ID.JOB_SPECIFIC_SKILLS]),
      makeDefaultObjective("Achievement of Dept Revenue",            "interpolated_financial",   "Locked",   [TRAINING_AREA_ID.JOB_SPECIFIC_SKILLS]),
      makeDefaultObjective("Achievement of Dept GP (___)",           "interpolated_financial",   "Editable"),
      makeDefaultObjective("Profit Margin % of ___",                 "interpolated_gp_margin",   "Editable"),
      makeDefaultObjective("Achievement of Sales Dept. Target",      "interpolated_financial",   "Editable"),
      makeDefaultObjective("Effective Sales Ratio of CMB (60 Days)", "interpolated_sales_ratio", "Editable"),
      makeDefaultObjective("GP Margin (Ops) Overall",                "interpolated_gp_margin",   "Editable"),
      makeDefaultObjective("Optimize Direct Cost",                   "bracket_wip",              "Editable"),
      makeDefaultObjective("GP Margin %",                            "interpolated_gp_margin",   "Editable"),
      makeDefaultObjective("GP Contribution %",                      "interpolated_to_gp",       "Editable"),
      makeDefaultObjective("Turnover Contribution %",                "interpolated_to_gp",       "Editable"),
      makeDefaultObjective("Achievement of Individual Sales Target", "interpolated_financial",   "Editable"),
    ],
  },
  {
    name: "Customer Focus", weight: 0, mandatory: true, trainingTags: [],
    objectives: [
      makeDefaultObjective("NPS Index",                         "interpolated_nps_ccr",           "Locked",   [TRAINING_AREA_ID.GUEST_SENSITIVITY]),
      makeDefaultObjective("Complaints on service failures",    "bracket_statutory",              "Locked",   [TRAINING_AREA_ID.COMPLAINT_HANDLING]),
      makeDefaultObjective("Monthly Idea Generation",           "manual",                         "Editable"),
      makeDefaultObjective("GP on Personal Done by Individual", "bracket_individual_sales_gp",    "Editable"),
      makeDefaultObjective("NO. of Qualified Sales leads",      "interpolated_financial",         "Editable"),
      makeDefaultObjective("New Customers brought in",          "interpolated_financial",         "Editable"),
      makeDefaultObjective("Sales quotation success ratio",     "interpolated_sales_ratio",       "Editable"),
    ],
  },
  {
    name: "Human Resources Focus", weight: 0, mandatory: true, trainingTags: [],
    objectives: [
      makeDefaultObjective("360 Feedback (Automated)", "interpolated_ees_360",      "Locked"),
      makeDefaultObjective("Dept. Retention",          "interpolated_emp_retention","Locked"),
      makeDefaultObjective("GPTW Score",               "interpolated_financial",    "Locked"),
    ],
  },
  {
    name: "Process Focus", weight: 0, mandatory: true, trainingTags: [],
    objectives: [
      makeDefaultObjective("International Audit-Positive Assurance Score-Overall", "bracket_statutory",  "Locked"),
      makeDefaultObjective("DPAM Operations Score",                                "bracket_ops_dpam",   "Editable"),
      makeDefaultObjective("WIP (Total Ops)",                                      "bracket_wip",        "Editable"),
      makeDefaultObjective("Team adherence to cargowise module",                   "interpolated_dpam",  "Editable"),
      makeDefaultObjective("Adherence to Sales Module in CW",                      "interpolated_dpam",  "Editable"),
    ],
  },
  {
    name: "Personal Assessment", weight: 0, mandatory: true, trainingTags: [],
    objectives: [makeDefaultObjective("HOD Evaluation", "manual", "Locked")],
  },
];

const BLANK_OBJECTIVE: ObjectiveRow = {
  name: "", kpiScale: "interpolated_financial", weight: "", control: "Editable",
  mandatory: false, trainingTags: [], trainingLinkageIds: [], kpiMaxScore: null,
};

// ─── Migration helper ─────────────────────────────────────────────────────────
// Converts old scale values (standard / inverse) to new grouped values.

const LEGACY_SCALE_MAP: Record<string, string> = {
  standard: "interpolated_financial",
  inverse:  "bracket_wip",
  // manual stays as-is
};

function migrateLegacyKpiScale(scale: string | undefined): string {
  if (!scale) return "interpolated_financial";
  return LEGACY_SCALE_MAP[scale] ?? scale;
}

function migrateObjectiveLinkage(obj: any): ObjectiveRow {
  let ids: Array<number | string> = [];
  if (Array.isArray(obj.trainingLinkageIds)) {
    ids = obj.trainingLinkageIds;
  } else if (obj.trainingLinkageId !== null && obj.trainingLinkageId !== undefined) {
    ids = [obj.trainingLinkageId];
  }
  return {
    ...obj,
    trainingTags:       obj.trainingTags ?? [],
    trainingLinkageIds: ids,
    kpiMaxScore:        obj.kpiMaxScore ?? null,
    kpiScale:           migrateLegacyKpiScale(obj.kpiScale),
  };
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
  const [templateTrainingTags, setTemplateTrainingTags] = useState<string[]>([]);
  const [dbTrainingAreas,      setDbTrainingAreas]      = useState<TrainingArea[]>([]);
  const [roles,                setRoles]                = useState<any[]>([]);
  const [departments,          setDepartments]          = useState<any[]>([]);
  const [employees,            setEmployees]            = useState<any[]>([]);
  const [selectedEmployee,     setSelectedEmployee]     = useState<string | null>(null);
  const [selectedRoles,        setSelectedRoles]        = useState<number[]>([]);
  const [selectedDepartments,  setSelectedDepartments]  = useState<number[]>([]);
  const [showCancelConfirm,    setShowCancelConfirm]    = useState(false);
  const [isPageLoading,        setIsPageLoading]        = useState(!!editId);
  const [showLinkageSummary,   setShowLinkageSummary]   = useState(false);

  // ── Memoised react-select styles ───────────────────────────────────────────
  const baseSelectStyles    = useMemo(() => buildBaseSelectStyles(), []);
  const tableSelectStyles   = useMemo(() => buildTableSelectStyles(isReadOnly), [isReadOnly]);
  const trainingAreaOptions = useMemo(
    () => buildTrainingAreaOptions(dbTrainingAreas),
    [dbTrainingAreas],
  );

  // ── Grouped options for KPI scale select ───────────────────────────────────
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
        const [rolesRes, deptsRes, empsRes, areasRes] = await Promise.all([
          fetch(`${API_BASE}/roles`),
          fetch(`${API_BASE}/departments`),
          fetch(`${API_BASE}/employees`),
          fetch(`${API_BASE}/training-areas`),
        ]);
        if (!rolesRes.ok || !deptsRes.ok || !empsRes.ok || !areasRes.ok) {
          throw new Error("One or more master data requests failed");
        }
        const [rolesData, deptsData, empsData, areasData] = await Promise.all([
          rolesRes.json(), deptsRes.json(), empsRes.json(), areasRes.json(),
        ]);
        setRoles(rolesData);
        setDepartments(deptsData);
        setEmployees(empsData);
        setDbTrainingAreas(areasData);
      } catch (err) {
        console.error("Master data load error:", err);
        toast.error("Failed to load roles, departments, and training areas");
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
            trainingTags: cat.trainingTags ?? [],
            objectives:   (cat.objectives ?? []).map(migrateObjectiveLinkage),
          })),
        );
        setTemplateTrainingTags(tmpl.trainingTags ?? []);
        setSelectedRoles(tmpl.assignedRolesIds?.map(Number) ?? []);
        setSelectedDepartments(tmpl.assignedDepartmentsIds?.map(Number) ?? []);

        const assignedEmpPk = tmpl.assignedEmployeeIds?.[0];
        if (assignedEmpPk) {
          try {
            const empRes  = await fetch(`${API_BASE}/employees`);
            const empList = await empRes.json();
            const match   = empList.find((emp: any) => emp.id === Number(assignedEmpPk));
            setSelectedEmployee(match?.emp_id ?? null);
          } catch {
            setSelectedEmployee(null);
          }
        }

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

  const trainingLinkageSummary = useMemo(() => {
    type AreaEntry = AreaColors & { name: string; objectives: string[]; totalWeight: number };
    const areaMap       = new Map<string, AreaEntry>();
    let linkedCount     = 0;
    let totalObjectives = 0;

    for (const cat of categories) {
      for (const obj of cat.objectives) {
        totalObjectives++;
        const ids = obj.trainingLinkageIds ?? [];
        if (ids.length === 0) continue;
        linkedCount++;
        for (const linkId of ids) {
          const numId  = Number(linkId);
          const dbArea = isNaN(numId)
            ? dbTrainingAreas.find((a) => a.name === String(linkId))
            : dbTrainingAreas.find((a) => a.id === numId);
          const areaName = dbArea?.name ?? String(linkId);
          const colors   = dbArea ? resolveAreaColors(dbArea.id) : FALLBACK_UI_COLOR;
          if (!areaMap.has(areaName)) {
            areaMap.set(areaName, { name: areaName, ...colors, objectives: [], totalWeight: 0 });
          }
          const entry = areaMap.get(areaName)!;
          if (!entry.objectives.includes(obj.name || "Untitled")) {
            entry.objectives.push(obj.name || "Untitled");
            entry.totalWeight += Number(obj.weight) || 0;
          }
        }
      }
    }

    const linkedPercent = totalObjectives > 0
      ? Math.round((linkedCount / totalObjectives) * 100)
      : 0;

    return { areas: Array.from(areaMap.values()), linkedCount, totalObjectives, linkedPercent };
  }, [categories, dbTrainingAreas]);

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

  const addTrainingLinkage = useCallback(
    (catIndex: number, objIndex: number, id: number | string) =>
      setCategories((prev) =>
        prev.map((cat, ci) =>
          ci !== catIndex ? cat : {
            ...cat,
            objectives: cat.objectives.map((obj, oi) => {
              if (oi !== objIndex) return obj;
              const existing = obj.trainingLinkageIds ?? [];
              const asString = String(id);
              if (existing.some((e) => String(e) === asString)) return obj;
              return { ...obj, trainingLinkageIds: [...existing, id] };
            }),
          },
        ),
      ),
    [],
  );

  const removeTrainingLinkage = useCallback(
    (catIndex: number, objIndex: number, id: number | string) =>
      setCategories((prev) =>
        prev.map((cat, ci) =>
          ci !== catIndex ? cat : {
            ...cat,
            objectives: cat.objectives.map((obj, oi) => {
              if (oi !== objIndex) return obj;
              return {
                ...obj,
                trainingLinkageIds: (obj.trainingLinkageIds ?? []).filter(
                  (e) => String(e) !== String(id),
                ),
              };
            }),
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
        { name: "", weight: 0, objectives: [], trainingTags: [], mandatory: false },
      ]),
    [],
  );

  const removeCategory = useCallback(
    (catIndex: number) =>
      setCategories((prev) => prev.filter((_, ci) => ci !== catIndex)),
    [],
  );

  const addObjective = useCallback(
    (catIndex: number) =>
      setCategories((prev) =>
        prev.map((cat, ci) =>
          ci !== catIndex ? cat : { ...cat, objectives: [...cat.objectives, { ...BLANK_OBJECTIVE }] },
        ),
      ),
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

  // ── Role / department creation ─────────────────────────────────────────────

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

  const handleCreateDepartment = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Department creation failed");
      const created = await res.json();
      setDepartments((prev) => [...prev, created]);
      setSelectedDepartments((prev) => [...prev, created.id]);
      toast.success(`Department "${name}" created`);
    } catch (err) {
      console.error("Department create error:", err);
      toast.error("Failed to create department");
    }
  };

  // ── Training area DB creation ──────────────────────────────────────────────

  const handleCreateTrainingArea = async (
    inputValue: string,
    catIndex:   number,
    objIndex:   number,
  ) => {
    const trimmedName = inputValue.trim();
    if (!trimmedName) return;
    try {
      const res = await fetch(`${API_BASE}/training-areas`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-User-Level": String(level) },
        body:    JSON.stringify({ name: trimmedName }),
      });
      if (!res.ok) throw new Error("Training area creation failed");
      const created: TrainingArea = await res.json();
      setDbTrainingAreas((prev) =>
        prev.find((a) => a.id === created.id) ? prev : [...prev, created],
      );
      addTrainingLinkage(catIndex, objIndex, created.id);
      toast.success(`Training area "${trimmedName}" saved`);
    } catch (err) {
      console.error("Training area create error:", err);
      toast.error("Failed to save training area");
    }
  };

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
      trainingTags: templateTrainingTags,
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
          emp_id:         selectedEmployee,
        }),
      });
      if (!assignRes.ok) {
        const errBody = await assignRes.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Assignment failed");
      }

      toast.success(editId ? "Template Updated Successfully!" : "Template Created & Assigned Successfully!");
      setTimeout(() => router.push("/hq-admin/templates"), 1200);
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
            <label className={styles.formFieldLabel}>Template Name</label>
            <input
              className={`${styles.formInput} ${isReadOnly ? styles.formInputReadOnly : ""}`}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Sales Manager Appraisal 2025"
              readOnly={isReadOnly}
            />
          </div>
          <div>
            <label className={styles.formFieldLabel}>Employee (optional)</label>
            <Select
              instanceId="emp-select"
              styles={baseSelectStyles}
              isDisabled={isReadOnly}
              options={employees.map((emp: any) => ({
                value: emp.emp_id,
                label: `${emp.emp_id} — ${emp.name}`,
              }))}
              value={
                selectedEmployee !== null
                  ? (() => {
                      const emp = employees.find((x: any) => x.emp_id === selectedEmployee);
                      return emp ? { value: emp.emp_id, label: `${emp.emp_id} — ${emp.name}` } : null;
                    })()
                  : null
              }
              onChange={(opt: any) => setSelectedEmployee(opt ? (opt.value as string) : null)}
              isClearable
              placeholder="Select employee…"
            />
          </div>
        </div>

        <label className={styles.formFieldLabel}>Description</label>
        <textarea
          className={`${styles.formTextarea} ${isReadOnly ? styles.formTextareaReadOnly : ""}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe purpose, scope, or notes…"
          readOnly={isReadOnly}
        />
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

            {/* Category header */}
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

            {/* Objectives table */}
            <div className={styles.objectivesTableWrapper}>
              <table className={styles.objectivesTable}>
                <colgroup>
                  <col className={styles.colObjective} />
                  <col className={styles.colWeight} />
                  <col className={styles.colControl} />
                  <col className={styles.colKpiScale} />
                  <col className={styles.colMaxScore} />
                  <col className={styles.colTraining} />
                  {!isReadOnly && <col className={styles.colActions} />}
                </colgroup>
                <thead className={styles.tableHead}>
                  <tr>
                    <th className={styles.tableHeaderCell}>Objective</th>
                    <th className={styles.tableHeaderCell}>Weight%</th>
                    <th className={styles.tableHeaderCell}>Control</th>
                    <th className={styles.tableHeaderCell}>KPI Scale</th>
                    <th className={styles.tableHeaderCell}>
                      Max Score
                      <span className={styles.tableHeaderSubtext}>null = inherit {maxScore}</span>
                    </th>
                    <th className={styles.tableHeaderCell}>
                      Training Linkage
                      <span className={styles.tableHeaderSubtext}>multiple areas supported</span>
                    </th>
                    {!isReadOnly && (
                      <th className={`${styles.tableHeaderCell} ${styles.tableHeaderCellCenter}`}>
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {cat.objectives.map((obj, objIndex) => {
                    const scaleOption   = resolveKpiOption(obj.kpiScale);
                    const controlOption = CONTROL_OPTIONS.find((c) => c.value === (obj.control ?? "Editable")) ?? CONTROL_OPTIONS[1];

                    return (
                      <tr
                        key={objIndex}
                        className={obj.control === "Locked" ? styles.tableRowLocked : styles.tableRowNormal}
                      >
                        {/* Objective name */}
                        <td className={styles.tableCell}>
                          <input
                            className={`${styles.objectiveNameInput} ${isReadOnly ? styles.objectiveNameInputReadOnly : styles.objectiveNameInputActive}`}
                            value={obj.name ?? ""}
                            readOnly={isReadOnly}
                            onChange={(e) => !isReadOnly && updateObjectiveField(catIndex, objIndex, "name", e.target.value)}
                          />
                        </td>

                        {/* Weight */}
                        <td className={styles.tableCell}>
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
                        </td>

                        {/* Control */}
                        <td className={styles.tableCell}>
                          <Select
                            instanceId={`ctrl-${catIndex}-${objIndex}`}
                            styles={tableSelectStyles}
                            options={CONTROL_OPTIONS as any}
                            isDisabled={isReadOnly}
                            value={CONTROL_OPTIONS.find((o) => o.value === (obj.control ?? "Editable"))}
                            onChange={(opt: any) =>
                              !isReadOnly && updateObjectiveField(catIndex, objIndex, "control", opt?.value ?? "Editable")
                            }
                            isSearchable={false}
                            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                            menuPosition="fixed"
                            components={{ Option: ControlOptionRenderer }}
                            formatOptionLabel={(opt: any, { context }: any) =>
                              context === "value"
                                ? <ControlBadge opt={opt} isDisabled={isReadOnly} />
                                : <>{opt.label}</>
                            }
                          />
                        </td>

                        {/* KPI Scale — grouped dropdown */}
                        <td className={styles.tableCell}>
                          <Select
                            instanceId={`kpi-${catIndex}-${objIndex}`}
                            styles={tableSelectStyles}
                            options={kpiScaleGroupedOptions}
                            isDisabled={isReadOnly}
                            value={scaleOption}
                            onChange={(opt: any) =>
                              !isReadOnly && updateObjectiveField(catIndex, objIndex, "kpiScale", opt?.value ?? "interpolated_financial")
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
                                  padding: "4px 4px 2px",
                                }}>
                                  {group.label}
                                </div>
                              );
                            }}
                            formatOptionLabel={(opt: any, { context }: any) =>
                              context === "value"
                                ? <KpiScaleBadge opt={opt} isDisabled={isReadOnly} />
                                : <>{opt.label}</>
                            }
                          />
                        </td>

                        {/* Per-objective Max Score */}
                        <td className={styles.tableCell}>
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
                        </td>

                        {/* Training Linkage — multi-tag cell */}
                        <td className={styles.tableCellLinkage}>
                          <MultiLinkageCell
                            linkageIds={obj.trainingLinkageIds ?? []}
                            isReadOnly={isReadOnly}
                            dbTrainingAreas={dbTrainingAreas}
                            trainingAreaOptions={trainingAreaOptions}
                            onAdd={(id) => addTrainingLinkage(catIndex, objIndex, id)}
                            onRemove={(id) => removeTrainingLinkage(catIndex, objIndex, id)}
                            onCreateNew={(inputValue) =>
                              handleCreateTrainingArea(inputValue, catIndex, objIndex)
                            }
                          />
                        </td>

                        {/* Actions */}
                        {!isReadOnly && (
                          <td className={styles.tableCellCenter}>
                            <button
                              className={styles.objectiveDeleteBtn}
                              onClick={() => removeObjective(catIndex, objIndex)}
                              aria-label={`Remove objective ${obj.name || objIndex + 1}`}
                              title="Remove objective"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add Objective footer */}
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

        {/* Control types */}
        <div>
          <div className={styles.referenceSubHeading}>
            <div className={`${styles.referenceSubIcon} ${styles.referenceSubIconBlue}`}>
              <Settings2 size={13} color="#3b82f6" />
            </div>
            <span className={styles.referenceSubLabel}>Control Types</span>
          </div>
          <div className={styles.referenceItemsRow}>
            <div className={`${styles.controlReferenceItem} ${styles.controlReferenceItemLocked}`}>
              <Lock size={13} color="#1e40af" />
              <span className={`${styles.controlReferenceLabel} ${styles.controlReferenceLabelLocked}`}>Locked</span>
              <span className={`${styles.controlReferenceDesc} ${styles.controlReferenceLabelLocked}`}>
                Fixed — cannot be changed by appraisee
              </span>
            </div>
            <div className={`${styles.controlReferenceItem} ${styles.controlReferenceItemEditable}`}>
              <Unlock size={13} color="#16a34a" />
              <span className={`${styles.controlReferenceLabel} ${styles.controlReferenceLabelEditable}`}>Editable</span>
              <span className={`${styles.controlReferenceDesc} ${styles.controlReferenceLabelEditable}`}>
                Flexible — appraisee may adjust
              </span>
            </div>
          </div>
        </div>

        <div className={styles.referenceDivider} />

        {/* KPI Scale types — grouped */}
        <div>
          <div className={styles.referenceSubHeading}>
            <div className={`${styles.referenceSubIcon} ${styles.referenceSubIconViolet}`}>
              <Sliders size={13} color="#7c3aed" />
            </div>
            <span className={styles.referenceSubLabel}>KPI Scale Types</span>
          </div>

          <div className={styles.referenceItemsRow}>
            {/* INTERPOLATED */}
            <div
              className={styles.kpiScaleItem}
              style={{ background: "#eff6ff", borderColor: "#bfdbfe", borderWidth: "1px", borderStyle: "solid" }}
            >
              <div className={styles.kpiScaleItemHeader}>
                <TrendingUp size={13} color="#1e40af" />
                <div className={styles.kpiScaleItemLabel} style={{ color: "#1e40af" }}>Interpolated</div>
              </div>
              <div className={styles.kpiScaleItemHint} style={{ color: "#1e40af" }}>
                Continuous linear scoring between lower &amp; upper limits (e.g. Financial, NPS, Retention)
              </div>
              <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {KPI_SCALE_OPTIONS.filter((o) => o.group === "interpolated").map((o) => (
                  <span key={o.value} style={{
                    fontSize: "10px", padding: "2px 7px", borderRadius: "10px",
                    background: "#dbeafe", color: "#1e40af", fontWeight: "600",
                  }}>
                    {o.label}
                  </span>
                ))}
              </div>
            </div>

            {/* BRACKET */}
            <div
              className={styles.kpiScaleItem}
              style={{ background: "#fef3c7", borderColor: "#fde68a", borderWidth: "1px", borderStyle: "solid" }}
            >
              <div className={styles.kpiScaleItemHeader}>
                <SlidersHorizontal size={13} color="#92400e" />
                <div className={styles.kpiScaleItemLabel} style={{ color: "#92400e" }}>Bracket</div>
              </div>
              <div className={styles.kpiScaleItemHint} style={{ color: "#92400e" }}>
                Stepped band ratings — value falls into a defined range to get score (e.g. WIP Days, Sales GP)
              </div>
              <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {KPI_SCALE_OPTIONS.filter((o) => o.group === "bracket").map((o) => (
                  <span key={o.value} style={{
                    fontSize: "10px", padding: "2px 7px", borderRadius: "10px",
                    background: "#fde68a", color: "#92400e", fontWeight: "600",
                    display: "inline-flex", alignItems: "center", gap: "4px",
                  }}>
                    {o.label}
                    {o.isInverse && (
                      <span style={{
                        fontSize: "9px", padding: "0px 3px", borderRadius: "3px",
                        background: "#fee2e2", color: "#dc2626",
                      }}>inv</span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            {/* MANUAL */}
            <div
              className={styles.kpiScaleItem}
              style={{ background: "#f0fdf4", borderColor: "#bbf7d0", borderWidth: "1px", borderStyle: "solid" }}
            >
              <div className={styles.kpiScaleItemHeader}>
                <SlidersHorizontal size={13} color="#166534" />
                <div className={styles.kpiScaleItemLabel} style={{ color: "#166534" }}>Manual</div>
              </div>
              <div className={styles.kpiScaleItemHint} style={{ color: "#166534" }}>
                Appraiser enters 1–5 directly — no formula applied
              </div>
              <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {KPI_SCALE_OPTIONS.filter((o) => o.group === "manual").map((o) => (
                  <span key={o.value} style={{
                    fontSize: "10px", padding: "2px 7px", borderRadius: "10px",
                    background: "#bbf7d0", color: "#166534", fontWeight: "600",
                  }}>
                    {o.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Training Linkage Summary panel ── */}
      <div className={styles.linkagePanelWrapper}>
        <button
          className={`${styles.linkagePanelTrigger} ${showLinkageSummary ? styles.linkagePanelTriggerOpen : ""}`}
          onClick={() => setShowLinkageSummary((prev) => !prev)}
        >
          <div className={styles.linkagePanelTriggerLeft}>
            <div className={styles.linkagePanelIconWrapper}>
              <BookOpen size={16} color="#fff" />
            </div>
            <div className={styles.linkagePanelTitleText}>
              <div className={styles.linkagePanelTitle}>Training Linkage Summary</div>
              <div className={styles.linkagePanelSubtitle}>
                {trainingLinkageSummary.linkedCount} / {trainingLinkageSummary.totalObjectives} objectives linked
                &nbsp;·&nbsp;
                {trainingLinkageSummary.areas.length} training area
                {trainingLinkageSummary.areas.length !== 1 ? "s" : ""} covered
              </div>
            </div>
          </div>
          <div className={styles.linkagePanelTriggerRight}>
            <div className={styles.linkageProgressWrapper}>
              <div className={styles.linkageProgressTrack}>
                <div
                  className={`${styles.linkageProgressFill} ${
                    trainingLinkageSummary.linkedCount === trainingLinkageSummary.totalObjectives
                      ? styles.linkageProgressFillComplete
                      : styles.linkageProgressFillPartial
                  }`}
                  style={{ width: `${trainingLinkageSummary.linkedPercent}%` }}
                />
              </div>
              <span className={styles.linkageProgressPct}>{trainingLinkageSummary.linkedPercent}%</span>
            </div>
            {showLinkageSummary
              ? <ChevronUp   size={18} color="#0369a1" />
              : <ChevronDown size={18} color="#0369a1" />}
          </div>
        </button>

        {showLinkageSummary && (
          <div className={styles.linkagePanelBody}>
            {trainingLinkageSummary.areas.length === 0 ? (
              <div className={styles.linkagePanelEmpty}>
                <AlertCircle size={32} color="#cbd5e1" style={{ display: "block", margin: "0 auto 8px" }} />
                No training linkages set yet. Use the Training Linkage column in each objective row.
              </div>
            ) : (
              <div className={styles.linkageAreaGrid}>
                {trainingLinkageSummary.areas.map(({ name, color, bgColor, borderColor, objectives, totalWeight: areaWeight }) => {
                  const areaCount = objectives.length;
                  const areaPct   = trainingLinkageSummary.totalObjectives > 0
                    ? Math.round((areaCount / trainingLinkageSummary.totalObjectives) * 100)
                    : 0;
                  return (
                    <div key={name} className={styles.linkageAreaCard} style={{ background: bgColor, borderColor }}>
                      <div className={styles.linkageAreaHeader}>
                        <div className={styles.linkageAreaHeaderLeft}>
                          <span className={styles.linkageAreaDot} style={{ background: color }} />
                          <span className={styles.linkageAreaName} style={{ color }}>{name}</span>
                          <span className={styles.linkageAreaMeta} style={{ color }}>
                            {areaCount} objective{areaCount !== 1 ? "s" : ""} · {areaWeight}% weight
                          </span>
                        </div>
                        <span className={styles.linkageAreaPct} style={{ color }}>{areaPct}%</span>
                      </div>
                      <div className={styles.linkageAreaBarTrack}>
                        <div
                          className={styles.linkageAreaBarFill}
                          style={{ width: `${areaPct}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)` }}
                        />
                      </div>
                      <div className={styles.linkageAreaChips}>
                        {objectives.map((objName, chipIdx) => (
                          <span
                            key={chipIdx}
                            className={styles.linkageAreaChip}
                            style={{ color, borderColor }}
                          >
                            {objName}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Distribution Strategy ── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <div className={styles.sectionHeadingAccent} />
          <h3 className={styles.sectionHeadingTitle}>Distribution Strategy</h3>
          {isReadOnly && <span className={styles.sectionHeadingReadOnly}>(read-only)</span>}
        </div>
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
          </div>
          <div>
            <label className={styles.formFieldLabel}>Departments</label>
            <CreatableSelect
              instanceId="depts-select"
              isMulti
              isDisabled={isReadOnly}
              placeholder="Type to create or select departments…"
              options={departments.map((d: any) => ({ value: d.id, label: d.name }))}
              styles={baseSelectStyles}
              value={selectedDepartments.map((id) => ({
                value: id,
                label: departments.find((d: any) => d.id === id)?.name ?? "",
              }))}
              onChange={(opts: any) => setSelectedDepartments(opts ? opts.map((o: any) => o.value) : [])}
              onCreateOption={handleCreateDepartment}
              formatCreateLabel={(val: string) => `Create department: "${val}"`}
            />
          </div>
        </div>
      </div>

      {/* ── Action row ── */}
      <div className={styles.actionRow}>
        <div className={styles.cancelBtnWrapper}>
          <button
            className={styles.cancelBtn}
            onClick={() => isReadOnly ? router.back() : setShowCancelConfirm((prev) => !prev)}
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
                  onClick={() => { setShowCancelConfirm(false); router.back(); }}
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

