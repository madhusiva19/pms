/**
 * @file TemplateAssignment.tsx
 * @description Template Assignment section extracted from TemplateCreateBase.
 *
 * Responsibilities:
 *  - Admin quick-assign scope rules (global / country-specific)
 *  - Direct employee assignment
 *  - Rule-based combination assignment (Designation → Department → Sub-Department)
 *  - Active assignment rules grid (ScopeRuleCard, UserCard, CombinationRuleCard)
 *  - Save / Discard assignment actions
 */

"use client";

import {
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import Select              from "react-select";
import CreatableSelect     from "react-select/creatable";
import { toast }           from "sonner";
import {
  Lock,
  Plus,
  X,
  CheckCircle2,
  Globe,
  Users,
  Building2,
  GitBranch,
  UserCheck,
  Layers,
  MapPin,
  UserCircle,
  LayoutGrid,
  Zap,
  RefreshCw,
} from "lucide-react";
import styles from "./TemplateCreateBase.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Base URL for all API requests. Falls back to local dev server. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

/** Designation IDs — must match the `designations` table. */
const DESIGNATION_ID = {
  COUNTRY_ADMIN:    1,
  BRANCH_ADMIN:     2,
  DEPT_ADMIN:       3,
  SUB_DEPT_ADMIN:   4,
} as const;

/** Maps an admin-scope key to its corresponding designation ID. */
const SCOPE_TO_DESIGNATION_ID: Record<string, number> = {
  all_country_admins:  DESIGNATION_ID.COUNTRY_ADMIN,
  all_branch_admins:   DESIGNATION_ID.BRANCH_ADMIN,
  all_dept_admins:     DESIGNATION_ID.DEPT_ADMIN,
  all_sub_dept_admins: DESIGNATION_ID.SUB_DEPT_ADMIN,
};

/** Max character length for department code. */
const DEPT_CODE_MAX_LENGTH = 10;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** A user record returned by the /users endpoint. */
export interface UserOption {
  id:                 string;
  full_name:          string;
  department_id?:     string;
  branch_id?:         string;
  sub_department_id?: string;
  designation_id?:    number;
  country_id?:        string;
}

/** A department record. */
export interface DepartmentOption {
  id:        string;
  name:      string;
  code:      string | null;
  branch_id: string | null;
}

/** A sub-department record. */
export interface SubDepartmentOption {
  id:            string;
  name:          string;
  code:          string | null;
  department_id: string;
}

/** A branch record. */
export interface BranchOption {
  id:         string;
  name:       string;
  code:       string | null;
  country_id: string | null;
}

/** A country record. */
export interface CountryOption {
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
export interface CombinationRule {
  id:                  string;
  designation_id:      number;
  designation_name:    string;
  department_id:       string;
  department_name:     string;
  sub_department_id:   string;
  sub_department_name: string;
  /** Branch UUIDs where this combination was found at add-time. Empty = all branches. */
  branch_ids:          string[];
}

/** A global admin quick-assign scope rule. */
export interface ScopeRule {
  scope:          string;
  country_id:     string | null;
  designation_id: number;
}

/** Snapshot shape used for discard/restore of assignment state. */
export interface AssignmentSnapshot {
  scopeRules:       ScopeRule[];
  directUserIds:    string[];
  combinationRules: CombinationRule[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — PROPS
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateAssignmentProps {
  /** Numeric ID of the already-saved template. Null until the template is saved. */
  savedTemplateId:   number | null;
  /** Whether the page is in view-only mode (no edits allowed). */
  isViewMode:        boolean;
  /** Whether the current user is an HQ Admin (level 1). */
  isHqAdmin:         boolean;
  /** Admin level (1–5). */
  level:             number;

  // ── Master data (owned by TemplateCreateBase, passed as props) ─────────────
  designations:   Array<{ id: number; name: string }>;
  departments:    DepartmentOption[];
  subDepartments: SubDepartmentOption[];
  branches:       BranchOption[];
  countries:      CountryOption[];
  users:          UserOption[];

  // ── Initial assignment state (loaded from the existing template) ───────────
  initialScopeRules:       ScopeRule[];
  initialDirectUserIds:    string[];
  initialCombinationRules: CombinationRule[];

  // ── Callbacks to bubble master-data mutations up to the parent ─────────────
  /** Called when the user creates a new designation via CreatableSelect. */
  onDesignationCreated: (newDesignation: { id: number; name: string }) => void;
  /** Called when the user creates a new department via the modal. */
  onDepartmentCreated:  (newDepartment: DepartmentOption) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — SCOPE / ADMIN CONFIG ARRAYS
// ─────────────────────────────────────────────────────────────────────────────

/** Display metadata for each admin quick-assign scope key. */
const SCOPE_DISPLAY: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
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
// SECTION 5 — SELECT STYLE BUILDERS
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
      color:        isSelected ? "#fff" : "#475569",
      padding:      "9px 14px",
      borderRadius: "8px",
      cursor:       "pointer",
      fontSize:     "13px",
      fontWeight:   "500",
    }),
    singleValue: (base: object) => ({ ...base, color: "#1e293b", fontWeight: "600" }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — SUB-COMPONENTS
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
  const [departmentName,  setDepartmentName]  = useState(initialName);
  const [departmentCode,  setDepartmentCode]  = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [isSaving,        setIsSaving]        = useState(false);

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
          <button
            onClick={onCancel}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Text fields */}
        {textFields.map(({ label, value, setter, placeholder, required, maxLength }) => (
          <div key={label} style={{ marginBottom: "16px" }}>
            <label
              style={{
                display:       "block",
                fontSize:      "11px",
                fontWeight:    "700",
                color:         "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom:  "6px",
              }}
            >
              {label}
              {required && <span style={{ color: "#ef4444" }}> *</span>}
            </label>
            <input
              value={value}
              onChange={(e) => setter(e.target.value)}
              placeholder={placeholder}
              maxLength={maxLength}
              style={{
                width:        "100%",
                boxSizing:    "border-box",
                border:       "1px solid #e2e8f0",
                borderRadius: "8px",
                padding:      "9px 12px",
                fontSize:     "13px",
                outline:      "none",
                color:        "#1e293b",
              }}
            />
          </div>
        ))}

        {/* Optional branch picker */}
        {branches.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display:       "block",
                fontSize:      "11px",
                fontWeight:    "700",
                color:         "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom:  "6px",
              }}
            >
              Branch{" "}
              <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "none", fontWeight: "500" }}>
                (optional)
              </span>
            </label>
            <select
              value={selectedBranchId ?? ""}
              onChange={(e) => setSelectedBranchId(e.target.value || null)}
              style={{
                width:        "100%",
                boxSizing:    "border-box",
                border:       "1px solid #e2e8f0",
                borderRadius: "8px",
                padding:      "9px 12px",
                fontSize:     "13px",
                outline:      "none",
                background:   "#fff",
              }}
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
            style={{
              padding:      "8px 18px",
              borderRadius: "8px",
              border:       "1px solid #e2e8f0",
              background:   "#f8fafc",
              color:        "#64748b",
              fontWeight:   "700",
              fontSize:     "13px",
              cursor:       "pointer",
            }}
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
  const designationName = designations.find((d) => d.id === rule.designation_id)?.name
    ?? `Designation #${rule.designation_id}`;
  const departmentName  = departments.find((d) => d.id === rule.department_id)?.name
    ?? rule.department_name ?? rule.department_id;
  const subDeptName     = subDepartments.find((s) => s.id === rule.sub_department_id)?.name
    ?? rule.sub_department_name ?? rule.sub_department_id;
  const ruleBranches    = branches.filter((b) => rule.branch_ids.includes(b.id));

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
        <div
          className={`${styles.ruleCardTypeIcon} ${styles.ruleCardTypeIconScope}`}
          style={{ color: scopeDef.color }}
        >
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
          <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 500 }}>
            All countries
          </span>
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
// SECTION 7 — MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TemplateAssignment — handles all assignment rule configuration and
 * persistence for a PMS evaluation template.
 *
 * Extracted from TemplateCreateBase to satisfy separation-of-concerns.
 * All master data (users, departments, etc.) is owned by TemplateCreateBase
 * and passed in via props to keep a single source of truth.
 */
export default function TemplateAssignment({
  savedTemplateId,
  isViewMode,
  isHqAdmin,
  level,
  designations,
  departments,
  subDepartments,
  branches,
  countries,
  users,
  initialScopeRules,
  initialDirectUserIds,
  initialCombinationRules,
  onDesignationCreated,
  onDepartmentCreated,
}: TemplateAssignmentProps) {

  // ── Assignment state ────────────────────────────────────────────────────────
  /**
   * Three separate lists correspond to the three assignment card types:
   *  1. adminScopeRules  → ScopeRuleCard   (null-user rows with a scope key)
   *  2. directUserIds    → UserCard         (rows with a user_id)
   *  3. combinationRules → CombinationRuleCard  (template_assignment_combinations)
   */
  const [adminScopeRules,              setAdminScopeRules]              = useState<ScopeRule[]>(initialScopeRules);
  const [directUserIds,                setDirectUserIds]                 = useState<string[]>(initialDirectUserIds);
  const [combinationRules,             setCombinationRules]              = useState<CombinationRule[]>(initialCombinationRules);
  const [selectedCountryForCA,         setSelectedCountryForCA]          = useState<string>("");

  // Rule-builder ephemeral state (not persisted to DB directly)
  const [selectedDesignations,          setSelectedDesignations]          = useState<number[]>([]);
  const [selectedDepartmentForAssign,   setSelectedDepartmentForAssign]   = useState<string>("");
  const [selectedSubDepartmentForAssign, setSelectedSubDepartmentForAssign] = useState<string>("");

  const [showAssignCancelConfirm, setShowAssignCancelConfirm] = useState(false);
  const [isAssignSaving,          setIsAssignSaving]          = useState(false);
  const [isAssignSaved,           setIsAssignSaved]           = useState(false);

  const [deptModalState, setDeptModalState] = useState<{ isOpen: boolean; initialName: string }>({
    isOpen:      false,
    initialName: "",
  });

  /**
   * Snapshot of assignment state at the last successful save.
   * Used to restore state when the user discards changes.
   */
  const assignmentSnapshot = useRef<AssignmentSnapshot>({
    scopeRules:       initialScopeRules,
    directUserIds:    initialDirectUserIds,
    combinationRules: initialCombinationRules,
  });

  /** Guards against duplicate department-creation requests. */
  const isDeptCreatingRef = useRef(false);

  // ── Memoised select styles ──────────────────────────────────────────────────
  const baseSelectStyles = useMemo(() => buildBaseSelectStyles(), []);

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED / MEMOISED VALUES
  // ─────────────────────────────────────────────────────────────────────────

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

  /** Total number of active assignment rules across all three types. */
  const totalAssignmentRuleCount =
    adminScopeRules.length + directUserIds.length + combinationRules.length;

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
      onDesignationCreated(created);
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
      onDepartmentCreated(created);
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
  const handleAddCombinationRule = useCallback(() => {
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
  }, [
    canAddCombination,
    departments,
    subDepartments,
    designations,
    selectedDesignations,
    selectedDepartmentForAssign,
    selectedSubDepartmentForAssign,
    combinationRules,
    matchingBranchesForSubDept,
  ]);

  /** Removes all assignment rules and resets builder state. */
  const handleClearAllAssignments = useCallback(() => {
    setAdminScopeRules([]);
    setDirectUserIds([]);
    setCombinationRules([]);
    setSelectedDesignations([]);
    setSelectedDepartmentForAssign("");
    setSelectedSubDepartmentForAssign("");
    setSelectedCountryForCA("");
    toast.info("All assignment rules cleared. Press 'Save Assignment' to apply.");
  }, []);

  /**
   * Toggles an admin-scope rule on or off.
   * Country-agnostic rules are toggled; country-specific ones are removed separately.
   */
  const handleToggleAdminScope = useCallback((scope: string, designationId: number) => {
    const existingRule = adminScopeRules.find(
      (r) => r.scope === scope && r.country_id === null,
    );
    if (existingRule) {
      setAdminScopeRules((prev) =>
        prev.filter((r) => !(r.scope === scope && r.country_id === null)),
      );
    } else {
      setAdminScopeRules((prev) => [
        ...prev,
        { scope, country_id: null, designation_id: designationId },
      ]);
    }
  }, [adminScopeRules]);

  /** Adds a country-specific Country Admin scope rule. */
  const handleAddCountrySpecificCA = useCallback(() => {
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
      {
        scope:          "all_country_admins",
        country_id:     selectedCountryForCA,
        designation_id: DESIGNATION_ID.COUNTRY_ADMIN,
      },
    ]);
    setSelectedCountryForCA("");
  }, [selectedCountryForCA, adminScopeRules]);

  /** Removes an admin scope rule by its index in the list. */
  const handleRemoveAdminScopeRule = useCallback(
    (index: number) => setAdminScopeRules((prev) => prev.filter((_, i) => i !== index)),
    [],
  );

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
        scope:             rule.scope,
        designation_id:    rule.designation_id,
        country_id:        rule.country_id,
        user_id:           null,
        department_id:     null,
        branch_id:         null,
        sub_department_id: null,
      });
    }

    // Direct-user rules
    for (const userId of directUserIds) {
      rules.push({
        user_id:           userId,
        scope:             null,
        designation_id:    null,
        department_id:     null,
        branch_id:         null,
        sub_department_id: null,
        country_id:        null,
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
  const handleDiscardAssignment = useCallback(() => {
    setAdminScopeRules([...assignmentSnapshot.current.scopeRules]);
    setDirectUserIds([...assignmentSnapshot.current.directUserIds]);
    setCombinationRules([...assignmentSnapshot.current.combinationRules]);
    setSelectedDepartmentForAssign("");
    setSelectedSubDepartmentForAssign("");
    setShowAssignCancelConfirm(false);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Department creation modal ─────────────────────────────────────── */}
      {deptModalState.isOpen && (
        <NewDeptModal
          initialName={deptModalState.initialName}
          branches={branches}
          onConfirm={handleDeptModalConfirm}
          onCancel={() => setDeptModalState({ isOpen: false, initialName: "" })}
        />
      )}

      <div
        className={`${styles.sectionCard} ${
          !savedTemplateId ? styles.sectionCardLocked : ""
        }`}
      >
        {/* ── Locked overlay — template not yet saved ──────────────────────── */}
        {!savedTemplateId && (
          <div className={styles.sectionLockOverlay}>
            <div className={styles.sectionLockOverlayInner}>
              <Lock size={18} color="#64748b" />
              <span className={styles.sectionLockOverlayText}>
                Save the template above to unlock assignment
              </span>
            </div>
          </div>
        )}

        {/* ── Locked overlay — non-HQ admin ───────────────────────────────── */}
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

        {/* ── Distribution logic note ──────────────────────────────────────── */}
        <div className={styles.distributionLogicNote}>
          <div className={styles.distributionLogicIcon}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8"  x2="12"   y2="12"   />
              <line x1="12" y1="16" x2="12.01" y2="16"   />
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
            {/* ── Admin Quick-Assign ─────────────────────────────────────────── */}
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize:      "12px",
                  fontWeight:    "800",
                  color:         "#0f172a",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom:  "10px",
                  display:       "flex",
                  alignItems:    "center",
                  gap:           "6px",
                }}
              >
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
                        display:      "inline-flex",
                        alignItems:   "center",
                        gap:          "6px",
                        padding:      "7px 14px",
                        borderRadius: "20px",
                        cursor:       "pointer",
                        fontSize:     "12px",
                        fontWeight:   "700",
                        border:       isActive ? `2px solid ${opt.color.border}` : "1.5px solid #e2e8f0",
                        background:   isActive ? opt.color.bg : "#f8fafc",
                        color:        isActive ? opt.color.text : "#64748b",
                        transition:   "all 0.15s",
                        boxShadow:    isActive ? `0 0 0 3px ${opt.color.border}40` : "none",
                      }}
                    >
                      {opt.icon}{opt.label}
                      {isActive && <CheckCircle2 size={11} />}
                    </button>
                  );
                })}
              </div>

              {/* Country-specific CA panel */}
              <div
                style={{
                  padding:      "12px 14px",
                  background:   "#f8fafc",
                  borderRadius: "10px",
                  border:       "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    fontSize:     "11px",
                    fontWeight:   "700",
                    color:        "#64748b",
                    marginBottom: "8px",
                    display:      "flex",
                    alignItems:   "center",
                    gap:          "6px",
                  }}
                >
                  <Globe size={12} color="#0891b2" /> Assign Country Admins by Specific Country
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={selectedCountryForCA}
                    onChange={(e) => setSelectedCountryForCA(e.target.value)}
                    disabled={!savedTemplateId}
                    style={{
                      border:       "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding:      "7px 12px",
                      fontSize:     "13px",
                      fontWeight:   "500",
                      color:        selectedCountryForCA ? "#1e293b" : "#94a3b8",
                      background:   "#fff",
                      cursor:       "pointer",
                      outline:      "none",
                      minWidth:     "180px",
                    }}
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
                    disabled={!selectedCountryForCA || !savedTemplateId}
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
                            style={{
                              display:      "inline-flex",
                              alignItems:   "center",
                              gap:          "6px",
                              padding:      "4px 10px",
                              borderRadius: "20px",
                              fontSize:     "11px",
                              fontWeight:   "700",
                              background:   "#ecfeff",
                              color:        "#0891b2",
                              border:       "1px solid #a5f3fc",
                            }}
                          >
                            CA — {country?.code ?? country?.name ?? rule.country_id}
                            <button
                              type="button"
                              onClick={() => handleRemoveAdminScopeRule(adminScopeRules.indexOf(rule))}
                              style={{
                                background: "none",
                                border:     "none",
                                cursor:     "pointer",
                                color:      "#0891b2",
                                padding:    0,
                                display:    "flex",
                                alignItems: "center",
                              }}
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

            {/* ── Direct Employee divider ───────────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "0 0 20px" }}>
              <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
              <span
                style={{
                  fontSize:      "11px",
                  fontWeight:    "700",
                  color:         "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  whiteSpace:    "nowrap",
                }}
              >
                Direct Employee
              </span>
              <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
            </div>

            {/* ── Direct employee picker ────────────────────────────────────── */}
            <div className={styles.distributionGrid}>
              <div>
                <label className={styles.formFieldLabel}>
                  Direct Employee Assignment{" "}
                  <span className={styles.optionalTag}>optional</span>
                </label>
                <Select
                  instanceId="user-select"
                  styles={baseSelectStyles}
                  isDisabled={!isHqAdmin || isViewMode || !savedTemplateId}
                  isMulti
                  isSearchable
                  isClearable
                  placeholder="Search by name…"
                  options={
                    Array.from(new Map(users.map((u) => [u.id, u])).values())
                      .sort((a, b) => a.full_name.localeCompare(b.full_name))
                      .map((u) => ({ value: u.id, label: u.full_name }))
                  }
                  value={
                    Array.from(new Map(
                      users
                        .filter((u) => directUserIds.includes(u.id))
                        .map((u) => [u.id, u]),
                    ).values()).map((u) => ({ value: u.id, label: u.full_name }))
                  }
                  onChange={(opts: any) =>
                    setDirectUserIds(opts ? opts.map((o: any) => o.value as string) : [])
                  }
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  menuPosition="fixed"
                />
              </div>
            </div>

            {/* ── Rule-Based Assignment divider ─────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "20px 0" }}>
              <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
              <span
                style={{
                  fontSize:      "11px",
                  fontWeight:    "700",
                  color:         "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  whiteSpace:    "nowrap",
                }}
              >
                Rule-Based Assignment
              </span>
              <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
            </div>

            {/* ── 3-Step Combination Rule Builder ──────────────────────────── */}
            <div
              style={{
                padding:      "20px",
                background:   "#f8fafc",
                borderRadius: "14px",
                border:       "1.5px solid #e2e8f0",
              }}
            >
              {/* Step progress indicators */}
              <div
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          "6px",
                  marginBottom: "18px",
                  flexWrap:     "wrap",
                }}
              >
                {[
                  {
                    label: "Designation",
                    isDone: selectedDesignations.length > 0,
                    count:  selectedDesignations.length > 0 ? `(${selectedDesignations.length})` : "",
                  },
                  { label: "Department",     isDone: !!selectedDepartmentForAssign,    count: "" },
                  { label: "Sub-Department", isDone: !!selectedSubDepartmentForAssign, count: "" },
                ].map((step, stepIdx) => (
                  <div key={step.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div
                      style={{
                        display:      "inline-flex",
                        alignItems:   "center",
                        gap:          "5px",
                        padding:      "4px 12px",
                        borderRadius: "20px",
                        fontSize:     "11px",
                        fontWeight:   "700",
                        background:   step.isDone
                          ? stepIdx === 0 ? "#eff6ff" : stepIdx === 1 ? "#f0fdf4" : "#fef3c7"
                          : "#f1f5f9",
                        color: step.isDone
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

              <div
                style={{
                  display:             "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap:                 "12px",
                  marginBottom:        "16px",
                }}
              >
                {/* Step 1 — Designation */}
                <div>
                  <label
                    className={styles.formFieldLabel}
                    style={{ display: "flex", alignItems: "center", gap: "5px" }}
                  >
                    <span
                      style={{
                        width:          "17px",
                        height:         "17px",
                        borderRadius:   "50%",
                        background:     "#eff6ff",
                        color:          "#1e40af",
                        fontSize:       "9px",
                        fontWeight:     "900",
                        display:        "inline-flex",
                        alignItems:     "center",
                        justifyContent: "center",
                        flexShrink:     0,
                      }}
                    >
                      1
                    </span>
                    Designation <span className={styles.requiredStar}>*</span>
                  </label>
                  <CreatableSelect
                    instanceId="designations-assign-select"
                    placeholder="Type to create or select…"
                    styles={baseSelectStyles}
                    isMulti
                    isDisabled={!isHqAdmin || isViewMode || !savedTemplateId}
                    options={designations.map((d) => ({ value: d.id, label: d.name }))}
                    value={designations
                      .filter((d) => selectedDesignations.includes(d.id))
                      .map((d) => ({ value: d.id, label: d.name }))}
                    onChange={(opts: any) =>
                      setSelectedDesignations(opts ? opts.map((o: any) => o.value) : [])
                    }
                    onCreateOption={handleCreateDesignation}
                    formatCreateLabel={(val) => `Create designation: "${val}"`}
                  />
                </div>

                {/* Step 2 — Department */}
                <div>
                  <label
                    className={styles.formFieldLabel}
                    style={{ display: "flex", alignItems: "center", gap: "5px" }}
                  >
                    <span
                      style={{
                        width:          "17px",
                        height:         "17px",
                        borderRadius:   "50%",
                        background:     "#f0fdf4",
                        color:          "#166534",
                        fontSize:       "9px",
                        fontWeight:     "900",
                        display:        "inline-flex",
                        alignItems:     "center",
                        justifyContent: "center",
                        flexShrink:     0,
                      }}
                    >
                      2
                    </span>
                    Department <span className={styles.requiredStar}>*</span>
                  </label>
                  <Select
                    instanceId="dept-single-assign-select"
                    isDisabled={!isHqAdmin || isViewMode || !savedTemplateId}
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
                      option: (
                        base: object,
                        { data, isFocused, isSelected }: { data: unknown; isFocused: boolean; isSelected: boolean },
                      ) => ({
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
                  <label
                    className={styles.formFieldLabel}
                    style={{ display: "flex", alignItems: "center", gap: "5px" }}
                  >
                    <span
                      style={{
                        width:          "17px",
                        height:         "17px",
                        borderRadius:   "50%",
                        background:     "#fef3c7",
                        color:          "#92400e",
                        fontSize:       "9px",
                        fontWeight:     "900",
                        display:        "inline-flex",
                        alignItems:     "center",
                        justifyContent: "center",
                        flexShrink:     0,
                      }}
                    >
                      3
                    </span>
                    Sub-Department <span className={styles.requiredStar}>*</span>
                  </label>
                  <Select
                    instanceId="subdept-assign-select"
                    styles={baseSelectStyles}
                    isDisabled={
                      !selectedDepartmentForAssign ||
                      !isHqAdmin ||
                      isViewMode ||
                      !savedTemplateId
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
                <div
                  style={{
                    padding:      "16px",
                    background:   "#fff",
                    borderRadius: "10px",
                    border:       "1px solid #e2e8f0",
                  }}
                >
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
                            style={{
                              padding:      "6px 16px",
                              borderRadius: "8px",
                              border:       "none",
                              background:   "linear-gradient(135deg, #2563eb, #1d4ed8)",
                              color:        "#fff",
                              fontWeight:   "700",
                              fontSize:     "12px",
                              cursor:       "pointer",
                            }}
                          >
                            Add Rule Anyway
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display:       "flex",
                          alignItems:    "center",
                          justifyContent: "space-between",
                          marginBottom:  "12px",
                          flexWrap:      "wrap",
                          gap:           "8px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>
                            Found in
                          </span>
                          <span
                            style={{
                              padding:      "2px 10px",
                              borderRadius: "20px",
                              fontSize:     "12px",
                              fontWeight:   "800",
                              background:   "#eff6ff",
                              color:        "#1e40af",
                              border:       "1px solid #bfdbfe",
                            }}
                          >
                            {matchingBranchesForSubDept.length} branch{matchingBranchesForSubDept.length !== 1 ? "es" : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddCombinationRule}
                          disabled={!canAddCombination}
                          style={{
                            display:      "inline-flex",
                            alignItems:   "center",
                            gap:          "6px",
                            padding:      "7px 16px",
                            borderRadius: "8px",
                            border:       "none",
                            background:   canAddCombination
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
                            style={{
                              padding:      "4px 12px",
                              borderRadius: "20px",
                              fontSize:     "11px",
                              fontWeight:   "600",
                              background:   "#f5f3ff",
                              color:        "#5b21b6",
                              border:       "1px solid #ddd6fe",
                              display:      "inline-flex",
                              alignItems:   "center",
                              gap:          "4px",
                            }}
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

        {/* ── Active assignment rules grid ──────────────────────────────────── */}
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
                  style={{
                    display:      "inline-flex",
                    alignItems:   "center",
                    gap:          "5px",
                    padding:      "5px 12px",
                    borderRadius: "7px",
                    cursor:       "pointer",
                    fontSize:     "11px",
                    fontWeight:   "700",
                    background:   "#fff1f2",
                    border:       "1px solid #fecaca",
                    color:        "#dc2626",
                    transition:   "all 0.15s",
                  }}
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

        {/* ── Read-only assignment summary (non-HQ / view mode) ────────────── */}
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
                    const designationName = designations.find((d) => d.id === combo.designation_id)?.name ?? combo.designation_name;
                    const departmentName  = departments.find((d) => d.id === combo.department_id)?.name   ?? combo.department_name;
                    const subDeptName     = subDepartments.find((s) => s.id === combo.sub_department_id)?.name ?? combo.sub_department_name;
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

        {/* ── Section 2 action buttons ──────────────────────────────────────── */}
        {isHqAdmin && !isViewMode && (
          <div className={styles.actionRow} style={{ marginTop: "24px" }}>
            <div className={styles.cancelBtnWrapper}>
              <button
                className={styles.cancelBtn}
                disabled={!savedTemplateId}
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
                savedTemplateId ? styles.saveBtnAssign : styles.saveBtnBlocked
              }`}
              onClick={handleSaveAssignment}
              disabled={isAssignSaving || !savedTemplateId}
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
    </>
  );
}
