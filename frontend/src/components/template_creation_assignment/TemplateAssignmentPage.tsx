/**
 * @file TemplateAssignmentPage.tsx
 * @description Standalone page for configuring PMS template distribution / assignment rules.
 *
 * Responsibilities:
 *  - Admin quick-assign (global / country / branch / dept / sub-dept scoped)
 *  - Rule-based combination assignment (Designation → Dept → Sub-Dept → Branches)
 *  - Direct employee assignment
 *  - Active rules grid — all inside one big white panelCard:
 *      • Scope + user rules as horizontal bar cards
 *      • Combination rules as a TABLE GRID (Designation / Dept / Sub-Dept / Branches / Match / Action)
 *        with WHITE branch chips per the reference design
 *  - New Department and Branch creation modals
 */

"use client";

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Select          from "react-select";
import CreatableSelect from "react-select/creatable";
import { toast }       from "sonner";
import {
  ArrowLeft,
  Globe,
  GitBranch,
  Building2,
  Layers,
  Users,
  UserCheck,
  UserCircle,
  LayoutGrid,
  Zap,
  MapPin,
  CheckCircle2,
  X,
  Plus,
  Lock,
  RefreshCw,
  ChevronRight,
  Target,
  Trash2, 
  Sparkles,
} from "lucide-react";
import Sidebar    from "@/components/sidebar/Sidebar";
import Breadcrumb from "@/components/breadcrumb/Breadcrumb";
import styles from "./TemplateAssignmentPage.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE       = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";
const CODE_MAX_LENGTH = 10;

const ROLE_PREFIX_BY_LEVEL: Record<number, string> = {
  1: "/hq-admin",
  2: "/country-admin",
  3: "/branch-admin",
  4: "/dept-admin",
  5: "/sub-dept-admin",
};

const DESIGNATION_ID = {
  COUNTRY_ADMIN:  1,
  BRANCH_ADMIN:   2,
  DEPT_ADMIN:     3,
  SUB_DEPT_ADMIN: 4,
} as const;

const SCOPE_TO_DESIGNATION_ID: Record<string, number> = {
  all_country_admins:  DESIGNATION_ID.COUNTRY_ADMIN,
  all_branch_admins:   DESIGNATION_ID.BRANCH_ADMIN,
  all_dept_admins:     DESIGNATION_ID.DEPT_ADMIN,
  all_sub_dept_admins: DESIGNATION_ID.SUB_DEPT_ADMIN,
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface UserOption {
  id:                 string;
  full_name:          string;
  department_id?:     string;
  branch_id?:         string;
  sub_department_id?: string;
  designation_id?:    number;
  country_id?:        string;
}

export interface DepartmentOption {
  id:        string;
  name:      string;
  code:      string | null;
  branch_id: string | null;
}

export interface SubDepartmentOption {
  id:            string;
  name:          string;
  code:          string | null;
  department_id: string;
}

export interface BranchOption {
  id:         string;
  name:       string;
  code:       string | null;
  country_id: string | null;
}

export interface CountryOption {
  id:   string;
  name: string;
  code: string | null;
}

export interface CombinationRule {
  id:                  string;
  designation_id:      number;
  designation_name:    string;
  department_id:       string;
  department_name:     string;
  sub_department_id:   string;
  sub_department_name: string;
  branch_ids:          string[];
}

export interface ScopeRule {
  scope:          string;
  country_id:     string | null;
  branch_id:      string | null;
  designation_id: number;
}

interface AssignmentSnapshot {
  scopeRules:       ScopeRule[];
  directUserIds:    string[];
  combinationRules: CombinationRule[];
}

interface TemplateAssignmentPageProps {
  level?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — SCOPE CONFIG
// ─────────────────────────────────────────────────────────────────────────────

/** Display metadata for each scope type. */
const SCOPE_DISPLAY: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  all_country_admins:  { label: "All Country Admins",        icon: <Globe size={13} />,     color: "#0891b2" },
  all_branch_admins:   { label: "All Branch Admins",         icon: <GitBranch size={13} />, color: "#16a34a" },
  all_dept_admins:     { label: "All Department Admins",     icon: <Building2 size={13} />, color: "#d97706" },
  all_sub_dept_admins: { label: "All Sub-Department Admins", icon: <Layers size={13} />,    color: "#7c3aed" },
};

const ADMIN_SCOPE_OPTIONS = [
  {
    scope: "all_country_admins", label: "All Country Admins",
    designation_id: DESIGNATION_ID.COUNTRY_ADMIN,
    icon: <Globe size={14} />,
    color: { bg: "#ecfeff", text: "#0891b2", border: "#a5f3fc", glow: "rgba(8,145,178,0.18)" },
  },
  {
    scope: "all_branch_admins", label: "All Branch Admins",
    designation_id: DESIGNATION_ID.BRANCH_ADMIN,
    icon: <GitBranch size={14} />,
    color: { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0", glow: "rgba(22,163,74,0.18)" },
  },
  {
    scope: "all_dept_admins", label: "All Dept Admins",
    designation_id: DESIGNATION_ID.DEPT_ADMIN,
    icon: <Building2 size={14} />,
    color: { bg: "#fef3c7", text: "#92400e", border: "#fde68a", glow: "rgba(217,119,6,0.18)" },
  },
  {
    scope: "all_sub_dept_admins", label: "All Sub-Dept Admins",
    designation_id: DESIGNATION_ID.SUB_DEPT_ADMIN,
    icon: <Layers size={14} />,
    color: { bg: "#f5f3ff", text: "#5b21b6", border: "#ddd6fe", glow: "rgba(124,58,237,0.18)" },
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — SELECT STYLES
// ─────────────────────────────────────────────────────────────────────────────

function buildSelectStyles(): object {
  return {
    control: (base: object, { isFocused }: { isFocused: boolean }) => ({
      ...base,
      borderRadius: "10px",
      border:     isFocused ? "1.5px solid #2563eb" : "1.5px solid #e2e8f0",
      padding:    "2px 4px",
      boxShadow:  isFocused ? "0 0 0 3px rgba(37,99,235,0.10)" : "none",
      fontSize:   "13px", fontWeight: "500", background: "#fff", minHeight: "42px",
      "&:hover":  { borderColor: "#2563eb" },
    }),
    multiValue:       (base: object) => ({ ...base, backgroundColor: "#eff6ff", borderRadius: "6px" }),
    multiValueLabel:  (base: object) => ({ ...base, color: "#1e40af", fontWeight: "700", fontSize: "12px" }),
    multiValueRemove: (base: object) => ({ ...base, color: "#93c5fd", "&:hover": { backgroundColor: "#dbeafe", color: "#1e40af" } }),
    placeholder:      (base: object) => ({ ...base, fontSize: "13px", color: "#94a3b8" }),
    menu:             (base: object) => ({ ...base, borderRadius: "12px", boxShadow: "0 8px 30px rgba(0,0,0,0.12)", border: "1px solid #f1f5f9", marginTop: "6px", padding: "4px", zIndex: 9999 }),
    option: (base: object, { isFocused, isSelected }: { isFocused: boolean; isSelected: boolean }) => ({
      ...base,
      backgroundColor: isSelected ? "#2563eb" : isFocused ? "#eff6ff" : "transparent",
      color: isSelected ? "#fff" : "#334155", padding: "10px 14px", borderRadius: "8px",
      cursor: "pointer", fontSize: "13px", fontWeight: isSelected ? "700" : "500",
    }),
    singleValue: (base: object) => ({ ...base, color: "#0f172a", fontWeight: "600" }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// ── NewDepartmentModal ────────────────────────────────────────────────────────

interface NewDepartmentModalProps {
  initialName: string;
  branches:    BranchOption[];
  onConfirm:   (name: string, code: string, branchId: string | null) => Promise<void>;
  onCancel:    () => void;
}

function NewDepartmentModal({ initialName, branches, onConfirm, onCancel }: NewDepartmentModalProps) {
  const [deptName, setDeptName] = useState(initialName);
  const [deptCode, setDeptCode] = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (!deptName.trim()) { toast.error("Department name is required."); return; }
    if (!deptCode.trim()) { toast.error("Department code is required."); return; }
    setIsSaving(true);
    try {
      await onConfirm(deptName.trim(), deptCode.trim().toUpperCase(), branchId);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            <div className={styles.modalIconWrap} style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
              <Building2 size={18} color="#2563eb" />
            </div>
            <div>
              <h3 className={styles.modalTitle}>Create New Department</h3>
              <p className={styles.modalSubtitle}>Add a department to use in assignment rules</p>
            </div>
          </div>
          <button className={styles.modalCloseBtn} onClick={onCancel} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Department Name <span className={styles.requiredStar}>*</span></label>
            <input className={styles.modalInput} value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="e.g. Forwarding Import Air" />
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>
              Department Code <span className={styles.requiredStar}>*</span>
              <span className={styles.modalLabelNote}>(max {CODE_MAX_LENGTH} chars)</span>
            </label>
            <input className={styles.modalInput} value={deptCode} onChange={(e) => setDeptCode(e.target.value.toUpperCase())} placeholder="e.g. FIA" maxLength={CODE_MAX_LENGTH} />
          </div>
          {branches.length > 0 && (
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Branch <span className={styles.modalLabelNote}>(optional)</span></label>
              <select className={styles.modalSelect} value={branchId ?? ""} onChange={(e) => setBranchId(e.target.value || null)}>
                <option value="">— No branch —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.code ? `${b.code} — ${b.name}` : b.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.modalCancelBtn}  onClick={onCancel}>Cancel</button>
          <button className={styles.modalConfirmBtn} onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Creating…" : "Create Department"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NewBranchModal ────────────────────────────────────────────────────────────

interface NewBranchModalProps {
  countries: CountryOption[];
  onConfirm: (name: string, code: string, countryId: string | null) => Promise<void>;
  onCancel:  () => void;
}

function NewBranchModal({ countries, onConfirm, onCancel }: NewBranchModalProps) {
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [countryId,  setCountryId]  = useState<string | null>(null);
  const [isSaving,   setIsSaving]   = useState(false);

  const handleSubmit = async () => {
    if (!branchName.trim()) { toast.error("Branch name is required."); return; }
    if (!branchCode.trim()) { toast.error("Branch code is required."); return; }
    setIsSaving(true);
    try {
      await onConfirm(branchName.trim(), branchCode.trim().toUpperCase(), countryId);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            <div className={styles.modalIconWrap} style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <GitBranch size={18} color="#16a34a" />
            </div>
            <div>
              <h3 className={styles.modalTitle}>Create New Branch</h3>
              <p className={styles.modalSubtitle}>Add a branch for assignment scoping</p>
            </div>
          </div>
          <button className={styles.modalCloseBtn} onClick={onCancel} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Branch Name <span className={styles.requiredStar}>*</span></label>
            <input className={styles.modalInput} value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="e.g. Colombo Branch" />
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>
              Branch Code <span className={styles.requiredStar}>*</span>
              <span className={styles.modalLabelNote}>(max {CODE_MAX_LENGTH} chars)</span>
            </label>
            <input className={styles.modalInput} value={branchCode} onChange={(e) => setBranchCode(e.target.value.toUpperCase())} placeholder="e.g. CMB" maxLength={CODE_MAX_LENGTH} />
          </div>
          {countries.length > 0 && (
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Country <span className={styles.modalLabelNote}>(optional)</span></label>
              <select className={styles.modalSelect} value={countryId ?? ""} onChange={(e) => setCountryId(e.target.value || null)}>
                <option value="">— No country —</option>
                {countries.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} — ${c.name}` : c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.modalCancelBtn}  onClick={onCancel}>Cancel</button>
          <button className={styles.modalConfirmBtn} onClick={handleSubmit} disabled={isSaving}
            style={{ background: "linear-gradient(135deg,#16a34a,#0d9488)" }}>
            {isSaving ? "Creating…" : "Create Branch"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ScopeRuleBar — horizontal bar card ────────────────────────────────────────

interface ScopeRuleBarProps {
  rule:      ScopeRule;
  countries: CountryOption[];
  branches:  BranchOption[];
  canRemove: boolean;
  onRemove:  () => void;
}

function ScopeRuleBar({ rule, countries, branches, canRemove, onRemove }: ScopeRuleBarProps) {
  const scopeDef = SCOPE_DISPLAY[rule.scope] ?? { label: rule.scope, icon: <Globe size={13} />, color: "#0891b2" };
  const country  = rule.country_id ? countries.find((c) => c.id === rule.country_id) : null;
  const branch   = rule.branch_id  ? branches.find((b)  => b.id  === rule.branch_id)  : null;

  return (
    <div className={styles.ruleBar}>
      <div className={styles.ruleBarStripe} style={{ background: scopeDef.color }} />
      <div className={styles.ruleBarIcon} style={{ background: `${scopeDef.color}18`, color: scopeDef.color }}>
        <Globe size={15} />
      </div>
      <div className={styles.ruleBarContent}>
        <span className={styles.ruleBarScopeLabel} style={{ color: scopeDef.color }}>{scopeDef.label}</span>
        <div className={styles.ruleBarBadges}>
          {country && <span className={`${styles.badge} ${styles.badgeCountry}`}><MapPin size={9} />{country.code ?? country.name}</span>}
          {branch  && <span className={`${styles.badge} ${styles.badgeBranch}`}><GitBranch size={9} />{branch.code ?? branch.name}</span>}
          {!country && !branch && <span className={styles.ruleBarAllNote}>All locations</span>}
        </div>
      </div>
      {canRemove && (
        <button className={styles.ruleBarRemove} onClick={onRemove} aria-label="Remove rule">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ── UserBar — horizontal bar card for directly assigned users ─────────────────

interface UserBarProps {
  userId:    string;
  users:     UserOption[];
  canRemove: boolean;
  onRemove:  () => void;
}

function UserBar({ userId, users, canRemove, onRemove }: UserBarProps) {
  const user = users.find((u) => u.id === userId);

  return (
    <div className={styles.ruleBar} style={{ borderColor: "#bbf7d0" }}>
      <div className={styles.ruleBarStripe} style={{ background: "#16a34a" }} />
      <div className={styles.userBarAvatar}>
        <UserCircle size={20} color="#16a34a" />
      </div>
      <div className={styles.ruleBarContent}>
        <span className={styles.userBarName}>{user?.full_name ?? userId}</span>
        <span className={styles.userBarLabel}>Direct assignment</span>
      </div>
      {canRemove && (
        <button className={styles.ruleBarRemove} onClick={onRemove} aria-label="Remove user">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function TemplateAssignmentPage({ level = 1 }: TemplateAssignmentPageProps) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const templateId   = searchParams.get("templateId");

  const rolePrefix = ROLE_PREFIX_BY_LEVEL[level] ?? "/hq-admin";
  const isHqAdmin  = level === 1;

  // ── Master data ─────────────────────────────────────────────────────────────
  const [designations,   setDesignations]   = useState<Array<{ id: number; name: string }>>([]);
  const [departments,    setDepartments]    = useState<DepartmentOption[]>([]);
  const [subDepartments, setSubDepartments] = useState<SubDepartmentOption[]>([]);
  const [branches,       setBranches]       = useState<BranchOption[]>([]);
  const [countries,      setCountries]      = useState<CountryOption[]>([]);
  const [users,          setUsers]          = useState<UserOption[]>([]);
  const [templateName,   setTemplateName]   = useState<string>("");
  const [isLoading,      setIsLoading]      = useState(true);

  // ── Assignment state ─────────────────────────────────────────────────────────
  const [adminScopeRules,  setAdminScopeRules]  = useState<ScopeRule[]>([]);
  const [directUserIds,    setDirectUserIds]    = useState<string[]>([]);
  const [combinationRules, setCombinationRules] = useState<CombinationRule[]>([]);

  const [selectedCountryForCA,  setSelectedCountryForCA]  = useState<string>("");
  const [selectedBranchForBA,   setSelectedBranchForBA]   = useState<string>("");
  const [selectedCountryForDA,  setSelectedCountryForDA]  = useState<string>("");
  const [selectedBranchForDA,   setSelectedBranchForDA]   = useState<string>("");
  const [selectedCountryForSDA, setSelectedCountryForSDA] = useState<string>("");
  const [selectedBranchForSDA,  setSelectedBranchForSDA]  = useState<string>("");

  const [selectedDesignationIds,         setSelectedDesignationIds]         = useState<number[]>([]);
  const [selectedDepartmentForAssign,    setSelectedDepartmentForAssign]    = useState<string>("");
  const [selectedSubDepartmentForAssign, setSelectedSubDepartmentForAssign] = useState<string>("");

  const [isAssignSaving, setIsAssignSaving] = useState(false);
  const [isAssignSaved,  setIsAssignSaved]  = useState(false);

  const [showDeptModal,   setShowDeptModal]   = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);

  const assignmentSnapshot = useRef<AssignmentSnapshot>({
    scopeRules: [], directUserIds: [], combinationRules: [],
  });

  const isCreatingRef = useRef(false);

  const selectStyles = useMemo(() => buildSelectStyles(), []);

  // ─────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!templateId) { setIsLoading(false); return; }

    const loadAll = async () => {
      try {
        setIsLoading(true);
        const [desigRes, deptRes, userRes, branchRes, countryRes, subDeptRes, templateRes] =
          await Promise.all([
            fetch(`${API_BASE}/designations`),
            fetch(`${API_BASE}/departments`),
            fetch(`${API_BASE}/users`),
            fetch(`${API_BASE}/branches`),
            fetch(`${API_BASE}/countries`),
            fetch(`${API_BASE}/sub-departments`),
            fetch(`${API_BASE}/templates`),
          ]);

        if (desigRes.ok)  setDesignations(await desigRes.json());

        if (deptRes.ok) {
          const raw: DepartmentOption[] = await deptRes.json();
          setDepartments(Array.from(new Map(raw.map((d) => [String(d.id), d])).values()));
        }

        if (userRes.ok) setUsers(await userRes.json());

        if (branchRes.ok) {
          const raw: BranchOption[] = await branchRes.json();
          setBranches(raw.map((b) => ({ id: String(b.id), name: b.name, code: b.code ?? null, country_id: b.country_id ?? null })));
        }

        if (countryRes.ok) {
          const raw: CountryOption[] = await countryRes.json();
          setCountries(raw.map((c) => ({ id: String(c.id), name: c.name, code: c.code ?? null })));
        }

        if (subDeptRes.ok) {
          const raw = await subDeptRes.json();
          setSubDepartments(raw.map((s: Record<string, unknown>) => ({
            id:            String(s.id),
            name:          (s.name as string) ?? "",
            code:          (s.code as string) ?? null,
            department_id: String(s.department_id),
          })));
        }

        if (templateRes.ok) {
          const allTemplates: Array<Record<string, unknown>> = await templateRes.json();
          const template = allTemplates.find((t) => String(t.id) === templateId);
          if (template) {
            setTemplateName((template.name as string) ?? `Template #${templateId}`);
            reconstructAssignmentState(template);
          }
        }
      } catch {
        toast.error("Failed to load data. Please refresh.");
      } finally {
        setIsLoading(false);
      }
    };

    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const reconstructAssignmentState = (template: Record<string, unknown>) => {
    const assignedRules: Array<Record<string, unknown>> =
      (template.assignedRules as Array<Record<string, unknown>>) ?? [];

    const scopeRules: ScopeRule[] = assignedRules
      .filter((r) => r.scope)
      .map((r) => ({
        scope:          r.scope as string,
        country_id:     (r.country_id as string) ?? null,
        branch_id:      (r.branch_id  as string) ?? null,
        designation_id: (r.designation_id as number) ?? 0,
      }));
    setAdminScopeRules(scopeRules);

    const directUserRules = assignedRules.filter((r) => r.user_id && !r.scope && !r.department_id);
    const directIds = [...new Set(directUserRules.map((r) => String(r.user_id)))];
    setDirectUserIds(directIds);

    const standardRules = assignedRules.filter(
      (r) => !r.scope && !r.user_id && r.department_id && r.sub_department_id,
    );
    const comboMap = new Map<string, CombinationRule>();
    for (const rule of standardRules) {
      const deptKey    = ((rule.department_name    ?? rule.department_id    ?? "") as string).trim().toLowerCase();
      const subDeptKey = ((rule.sub_department_name ?? rule.sub_department_id ?? "") as string).trim().toLowerCase();
      const key        = `${rule.designation_id}-${deptKey}-${subDeptKey}`;
      if (!comboMap.has(key)) {
        comboMap.set(key, {
          id:                  key,
          designation_id:      Number(rule.designation_id),
          designation_name:    (rule.designation_name as string) ?? String(rule.designation_id),
          department_id:       String(rule.department_id),
          department_name:     (rule.department_name  as string) ?? String(rule.department_id),
          sub_department_id:   String(rule.sub_department_id),
          sub_department_name: (rule.sub_department_name as string) ?? String(rule.sub_department_id),
          branch_ids:          rule.branch_id ? [String(rule.branch_id)] : [],
        });
      } else if (rule.branch_id) {
        const existing = comboMap.get(key)!;
        if (!existing.branch_ids.includes(String(rule.branch_id)))
          existing.branch_ids.push(String(rule.branch_id));
      }
    }
    const comboList = [...comboMap.values()];
    setCombinationRules(comboList);

    assignmentSnapshot.current = { scopeRules, directUserIds: directIds, combinationRules: comboList };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED / MEMOISED VALUES
  // ─────────────────────────────────────────────────────────────────────────

  const subDeptOptions = useMemo(
    () => subDepartments
      .filter((s) => s.department_id === selectedDepartmentForAssign)
      .map((s) => ({ value: s.id, label: s.code ? `[${s.code}] ${s.name}` : s.name })),
    [subDepartments, selectedDepartmentForAssign],
  );

  const matchingBranches = useMemo((): BranchOption[] => {
    if (!selectedSubDepartmentForAssign || !selectedDepartmentForAssign) return [];
    const selectedDept    = departments.find((d) => String(d.id) === selectedDepartmentForAssign);
    const selectedSubDept = subDepartments.find((s) => s.id === selectedSubDepartmentForAssign);
    if (!selectedDept || !selectedSubDept) return [];
    const deptNameLower    = selectedDept.name.trim().toLowerCase();
    const subDeptNameLower = selectedSubDept.name.trim().toLowerCase();
    const sameNameDepts    = departments.filter((d) => d.name.trim().toLowerCase() === deptNameLower);
    const validBranchIds   = new Set<string>();
    for (const dept of sameNameDepts) {
      if (!dept.branch_id) continue;
      const hasSubDept = subDepartments.some(
        (s) => s.department_id === String(dept.id) && s.name.trim().toLowerCase() === subDeptNameLower,
      );
      if (hasSubDept) validBranchIds.add(dept.branch_id);
    }
    return branches.filter((b) => validBranchIds.has(b.id));
  }, [selectedSubDepartmentForAssign, selectedDepartmentForAssign, departments, subDepartments, branches]);

  const canAddCombination = useMemo(
    () => selectedDesignationIds.length > 0 && !!selectedDepartmentForAssign && !!selectedSubDepartmentForAssign,
    [selectedDesignationIds, selectedDepartmentForAssign, selectedSubDepartmentForAssign],
  );

  const departmentSelectOptions = useMemo(
    () => departments.map((dept) => {
      const branch = branches.find((b) => b.id === dept.branch_id);
      const label  = [dept.code ? `[${dept.code}]` : null, dept.name, branch ? `· ${branch.code ?? branch.name}` : null]
        .filter(Boolean).join(" ");
      return { value: String(dept.id), label };
    }),
    [departments, branches],
  );

  const ruleMatchCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const rule of combinationRules) {
      const deptName    = (departments.find((d) => d.id === rule.department_id)?.name ?? rule.department_name).trim().toLowerCase();
      const subDeptName = (subDepartments.find((s) => s.id === rule.sub_department_id)?.name ?? rule.sub_department_name).trim().toLowerCase();
      const count = users.filter((u) => {
        if (u.designation_id !== rule.designation_id) return false;
        if (rule.branch_ids.length > 0 && !rule.branch_ids.includes(u.branch_id ?? "")) return false;
        const uDeptName = (departments.find((d) => d.id === u.department_id)?.name ?? "").trim().toLowerCase();
        if (uDeptName !== deptName) return false;
        if (u.sub_department_id) {
          const uSubName = (subDepartments.find((s) => s.id === u.sub_department_id)?.name ?? "").trim().toLowerCase();
          if (uSubName !== subDeptName) return false;
        }
        return true;
      }).length;
      map.set(rule.id, count);
    }
    return map;
  }, [combinationRules, users, departments, subDepartments]);

  const totalMatchedCount = useMemo(() => {
    const ids = new Set<string>();
    for (const rule of adminScopeRules) {
      const targetDesig = SCOPE_TO_DESIGNATION_ID[rule.scope];
      if (!targetDesig) continue;
      users.forEach((u) => {
        if (u.designation_id !== targetDesig) return;
        if (rule.country_id && String(u.country_id ?? "") !== rule.country_id) return;
        if (rule.branch_id  && String(u.branch_id  ?? "") !== rule.branch_id)  return;
        ids.add(u.id);
      });
    }
    for (const rule of combinationRules) {
      const deptName    = (departments.find((d) => d.id === rule.department_id)?.name ?? rule.department_name).trim().toLowerCase();
      const subDeptName = (subDepartments.find((s) => s.id === rule.sub_department_id)?.name ?? rule.sub_department_name).trim().toLowerCase();
      users.forEach((u) => {
        if (ids.has(u.id)) return;
        if (u.designation_id !== rule.designation_id) return;
        if (rule.branch_ids.length > 0 && !rule.branch_ids.includes(u.branch_id ?? "")) return;
        const uDeptName = (departments.find((d) => d.id === u.department_id)?.name ?? "").trim().toLowerCase();
        if (uDeptName !== deptName) return;
        if (u.sub_department_id) {
          const uSubName = (subDepartments.find((s) => s.id === u.sub_department_id)?.name ?? "").trim().toLowerCase();
          if (uSubName !== subDeptName) return;
        }
        ids.add(u.id);
      });
    }
    directUserIds.forEach((id) => ids.add(id));
    return ids.size;
  }, [adminScopeRules, combinationRules, directUserIds, users, departments, subDepartments]);

  const totalRuleCount = adminScopeRules.length + directUserIds.length + combinationRules.length;

  // ─────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleCreateDesignation = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/designations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("API error");
      const created = await res.json();
      setDesignations((prev) => [...prev, created]);
      setSelectedDesignationIds((prev) => [...prev, created.id]);
      toast.success(`Designation "${name}" created.`);
    } catch {
      toast.error("Failed to create designation.");
    }
  };

  const handleDeptModalConfirm = async (name: string, code: string, branchId: string | null) => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    try {
      const res = await fetch(`${API_BASE}/departments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, branch_id: branchId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create department.");
      }
      const created: DepartmentOption = await res.json();
      setDepartments((prev) =>
        prev.some((d) => String(d.id) === String(created.id)) ? prev : [...prev, created],
      );
      toast.success(`Department "${name}" (${code}) created.`);
      setShowDeptModal(false);
    } catch (error) {
      toast.error((error as Error).message ?? "Failed to create department.");
    } finally {
      isCreatingRef.current = false;
    }
  };

  const handleBranchModalConfirm = async (name: string, code: string, countryId: string | null) => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    try {
      const res = await fetch(`${API_BASE}/branches`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, country_id: countryId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create branch.");
      }
      const created: BranchOption = await res.json();
      setBranches((prev) =>
        prev.some((b) => String(b.id) === String(created.id)) ? prev : [...prev, created],
      );
      toast.success(`Branch "${name}" (${code}) created.`);
      setShowBranchModal(false);
    } catch (error) {
      toast.error((error as Error).message ?? "Failed to create branch.");
    } finally {
      isCreatingRef.current = false;
    }
  };

  const handleAddCombinationRule = useCallback(() => {
    if (!canAddCombination) return;
    const selectedDept    = departments.find((d) => String(d.id) === selectedDepartmentForAssign);
    const selectedSubDept = subDepartments.find((s) => s.id === selectedSubDepartmentForAssign);
    const selectedDesig   = designations.find((d) => d.id === selectedDesignationIds[0]);
    if (!selectedDept || !selectedSubDept) { toast.error("Invalid selection."); return; }

    const deptNameLower    = selectedDept.name.trim().toLowerCase();
    const subDeptNameLower = selectedSubDept.name.trim().toLowerCase();
    const comboId          = `${selectedDesignationIds[0]}-${deptNameLower}-${subDeptNameLower}`;

    if (combinationRules.find((c) => c.id === comboId)) { toast.info("This combination rule already exists."); return; }

    const newRule: CombinationRule = {
      id:                  comboId,
      designation_id:      selectedDesignationIds[0],
      designation_name:    selectedDesig?.name ?? String(selectedDesignationIds[0]),
      department_id:       selectedDepartmentForAssign,
      department_name:     selectedDept.name,
      sub_department_id:   selectedSubDepartmentForAssign,
      sub_department_name: selectedSubDept.name,
      branch_ids:          matchingBranches.map((b) => b.id),
    };
    setCombinationRules((prev) => [...prev, newRule]);
    setSelectedDepartmentForAssign("");
    setSelectedSubDepartmentForAssign("");

    const count = matchingBranches.length;
    toast.success(count > 0
      ? `Rule added — covers ${count} branch${count !== 1 ? "es" : ""}.`
      : "Rule added — will match future employees.");
  }, [
    canAddCombination, departments, subDepartments, designations,
    selectedDesignationIds, selectedDepartmentForAssign, selectedSubDepartmentForAssign,
    combinationRules, matchingBranches,
  ]);

  const handleToggleAdminScope = useCallback((scope: string, designationId: number) => {
    const existing = adminScopeRules.find(
      (r) => r.scope === scope && r.country_id === null && r.branch_id === null,
    );
    if (existing) {
      setAdminScopeRules((prev) =>
        prev.filter((r) => !(r.scope === scope && r.country_id === null && r.branch_id === null)),
      );
    } else {
      setAdminScopeRules((prev) => [
        ...prev,
        { scope, country_id: null, branch_id: null, designation_id: designationId },
      ]);
    }
  }, [adminScopeRules]);

  const handleAddScopedRule = useCallback((
    scope: string, designationId: number,
    filterKey: "country_id" | "branch_id", filterValue: string,
    scopeLabel: string,
  ) => {
    if (!filterValue) { toast.error(`Please select a ${scopeLabel} first.`); return; }
    const globalExists = adminScopeRules.find((r) => r.scope === scope && r.country_id === null && r.branch_id === null);
    if (globalExists) { toast.info(`Global "${scope}" already covers all ${scopeLabel}s.`); return; }
    const dupExists = adminScopeRules.find((r) => r.scope === scope && r[filterKey] === filterValue);
    if (dupExists) { toast.info(`A rule for this ${scopeLabel} already exists.`); return; }
    setAdminScopeRules((prev) => [
      ...prev,
      { scope, country_id: filterKey === "country_id" ? filterValue : null, branch_id: filterKey === "branch_id" ? filterValue : null, designation_id: designationId },
    ]);
  }, [adminScopeRules]);

  const handleRemoveAdminScopeRule = useCallback(
    (index: number) => setAdminScopeRules((prev) => prev.filter((_, i) => i !== index)),
    [],
  );

  const handleClearAllRules = useCallback(() => {
    setAdminScopeRules([]);
    setDirectUserIds([]);
    setCombinationRules([]);
    setSelectedDesignationIds([]);
    setSelectedDepartmentForAssign("");
    setSelectedSubDepartmentForAssign("");
    setSelectedCountryForCA("");
    setSelectedBranchForBA("");
    setSelectedCountryForDA("");
    setSelectedBranchForDA("");
    setSelectedCountryForSDA("");
    setSelectedBranchForSDA("");
    toast.info("All rules cleared.");
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // SAVE
  // ─────────────────────────────────────────────────────────────────────────

  const buildPayloadRules = useCallback((): Array<Record<string, unknown>> => {
    const rules: Array<Record<string, unknown>> = [];

    for (const rule of adminScopeRules) {
      rules.push({
        scope: rule.scope, designation_id: rule.designation_id,
        country_id: rule.country_id, branch_id: rule.branch_id,
        user_id: null, department_id: null, sub_department_id: null,
      });
    }

    for (const userId of directUserIds) {
      rules.push({
        user_id: userId, scope: null, designation_id: null,
        department_id: null, branch_id: null, sub_department_id: null, country_id: null,
      });
    }

    for (const combo of combinationRules) {
      const sourceDept    = departments.find((d) => String(d.id) === combo.department_id);
      const sourceSubDept = subDepartments.find((s) => s.id === combo.sub_department_id);
      const deptNameLower    = (sourceDept?.name    ?? combo.department_name).trim().toLowerCase();
      const subDeptNameLower = (sourceSubDept?.name ?? combo.sub_department_name).trim().toLowerCase();
      const sameNameDepts    = departments.filter((d) => d.name.trim().toLowerCase() === deptNameLower && d.branch_id);

      let pushedBranchRow = false;
      for (const dept of sameNameDepts) {
        if (combo.branch_ids.length > 0 && !combo.branch_ids.includes(dept.branch_id!)) continue;
        const matchingSubDept = subDepartments.find(
          (s) => s.department_id === String(dept.id) && s.name.trim().toLowerCase() === subDeptNameLower,
        );
        if (!matchingSubDept) continue;
        rules.push({
          designation_id: combo.designation_id, department_id: String(dept.id),
          branch_id: dept.branch_id!, sub_department_id: matchingSubDept.id,
          user_id: null, country_id: null, scope: null,
        });
        pushedBranchRow = true;
      }
      if (!pushedBranchRow) {
        rules.push({
          designation_id: combo.designation_id, department_id: combo.department_id,
          branch_id: null, sub_department_id: combo.sub_department_id,
          user_id: null, country_id: null, scope: null,
        });
      }
    }
    return rules;
  }, [adminScopeRules, directUserIds, combinationRules, departments, subDepartments]);

  const handleSaveAssignment = async () => {
    if (!isHqAdmin)  { toast.error("Only HQ Admins can manage template assignments."); return; }
    if (!templateId) { toast.error("No template ID found. Please go back and try again."); return; }

    const payloadRules = buildPayloadRules();
    setIsAssignSaving(true);
    try {
      const res = await fetch(`${API_BASE}/assign-template`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-User-Level": String(level) },
        body:    JSON.stringify({ template_id: Number(templateId), rules: payloadRules }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Assignment failed.");
      }
      const result = await res.json();
      assignmentSnapshot.current = {
        scopeRules:       [...adminScopeRules],
        directUserIds:    [...directUserIds],
        combinationRules: [...combinationRules],
      };
      setIsAssignSaved(true);
      setTimeout(() => setIsAssignSaved(false), 3000);
      const count = result.users_matched ?? "?";
      toast.success(`Assignment saved! ${count} user${count !== 1 ? "s" : ""} assigned.`);
    } catch (error) {
      toast.error((error as Error).message ?? "Failed to save assignment.");
    } finally {
      setIsAssignSaving(false);
    }
  };

  const handleDiscardChanges = useCallback(() => {
    setAdminScopeRules([...assignmentSnapshot.current.scopeRules]);
    setDirectUserIds([...assignmentSnapshot.current.directUserIds]);
    setCombinationRules([...assignmentSnapshot.current.combinationRules]);
    setSelectedDepartmentForAssign("");
    setSelectedSubDepartmentForAssign("");
    toast.info("Changes discarded.");
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className={styles.loadingSpinner} />
        <p className={styles.loadingText}>Loading assignment data…</p>
      </div>
    );
  }

  if (!templateId) {
    return (
      <div className={styles.errorWrapper}>
        <p className={styles.errorText}>No template ID provided.</p>
        <button className={styles.navBtn} onClick={() => router.push(`${rolePrefix}/template-management`)}>
          <ArrowLeft size={15} /> Back to Template Management
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.dashShell}>
      <main className={styles.mainContent}>
        <Breadcrumb />
        <div className={styles.pageWrapper}>

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleBlock}>
          <h1 className={styles.pageTitle}>Template Assignment</h1>
          <p className={styles.pageSubtitle}>
            Configure distribution for{" "}
            <strong style={{ color: "#0f172a" }}>{templateName || `Template #${templateId}`}</strong>
          </p>
        </div>

        <div className={styles.headerStats}>
          <div className={`${styles.statChip} ${styles.statChipBlue}`}>
            <span className={styles.statChipCount}>{totalRuleCount}</span>
            <span className={styles.statChipLabel}>Rules</span>
          </div>
          <div className={`${styles.statChip} ${styles.statChipViolet}`}>
            <span className={styles.statChipCount}>{adminScopeRules.length}</span>
            <span className={styles.statChipLabel}>Scope</span>
          </div>
          <div className={`${styles.statChip} ${styles.statChipGreen}`}>
            <span className={styles.statChipCount}>~{totalMatchedCount}</span>
            <span className={styles.statChipLabel}>Users</span>
          </div>
        </div>
      </div>

      {!isHqAdmin && (
        <div className={styles.noPermissionBanner}>
          <Lock size={15} color="#92400e" />
          <span>Template assignment is managed by HQ Admin only. You are in view-only mode.</span>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          PANEL A — ADMIN QUICK-ASSIGN
      ════════════════════════════════════════════════════════════════════ */}
      <section className={styles.panelCard}>
        <div className={styles.panelHeader}>
          <div className={styles.panelHeaderLeft}>
            <div className={styles.panelIcon} style={{ background: "#ecfeff", color: "#0891b2" }}>
              <Globe size={18} />
            </div>
            <div>
              <h2 className={styles.panelTitle}>Admin Quick-Assign</h2>
              <p className={styles.panelSubtitle}>
                Assign to all admins of a given type — globally or scoped to a country / branch.
              </p>
            </div>
          </div>
        </div>
        <div className={styles.panelDivider} />
        <div className={styles.panelBody}>

          <div className={styles.quickAssignLabel}>Global Assignment</div>
          <div className={styles.scopeToggleRow}>
            {ADMIN_SCOPE_OPTIONS.map((opt) => {
              const isActive = adminScopeRules.some(
                (r) => r.scope === opt.scope && r.country_id === null && r.branch_id === null,
              );
              return (
                <button
                  key={opt.scope}
                  type="button"
                  disabled={!isHqAdmin}
                  onClick={() => handleToggleAdminScope(opt.scope, opt.designation_id)}
                  className={`${styles.scopeToggleBtn} ${isActive ? styles.scopeToggleBtnActive : ""}`}
                  style={isActive ? { background: opt.color.bg, color: opt.color.text, borderColor: opt.color.border, boxShadow: `0 0 0 3px ${opt.color.glow}` } : {}}
                >
                  <span className={styles.scopeToggleIconWrap}>{opt.icon}</span>
                  {opt.label}
                  {isActive && <CheckCircle2 size={12} />}
                </button>
              );
            })}
          </div>

          {/* Row 1: Country Admins + Branch Admins */}
          <div className={styles.scopeSpecificGrid}>

            <div className={styles.scopeSpecificCard} style={{ borderTop: "3px solid #0ea5e9" }}>
              <div className={styles.scopeSpecificTitle}>
                <Globe size={12} color="#0891b2" /> Country Admins — by Country
              </div>
              <div className={styles.scopeSpecificRow}>
                <select
                  className={styles.scopeSpecificSelect}
                  value={selectedCountryForCA}
                  onChange={(e) => setSelectedCountryForCA(e.target.value)}
                  disabled={!isHqAdmin}
                >
                  <option value="">— Select Country —</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>{c.code ? `${c.code} — ${c.name}` : c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedCountryForCA || !isHqAdmin}
                  onClick={() => {
                    handleAddScopedRule("all_country_admins", DESIGNATION_ID.COUNTRY_ADMIN, "country_id", selectedCountryForCA, "country");
                    setSelectedCountryForCA("");
                  }}
                  className={`${styles.scopeAddBtn} ${selectedCountryForCA ? styles.scopeAddBtnActive : ""}`}
                >
                  + Add
                </button>
              </div>
              {adminScopeRules.filter((r) => r.country_id && r.scope === "all_country_admins").length > 0 && (
                <div className={styles.scopeChipRow}>
                  {adminScopeRules.filter((r) => r.country_id && r.scope === "all_country_admins").map((rule, idx) => {
                    const country = countries.find((c) => c.id === rule.country_id);
                    return (
                      <span key={idx} className={styles.scopeActiveChip}>
                        <Globe size={9} />
                        CA — {country?.code ?? country?.name ?? rule.country_id}
                        {isHqAdmin && (
                          <button className={styles.scopeChipRemove} onClick={() => handleRemoveAdminScopeRule(adminScopeRules.indexOf(rule))} aria-label="Remove">
                            <X size={9} />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.scopeSpecificCard} style={{ borderTop: "3px solid #22c55e" }}>
              <div className={styles.scopeSpecificTitle}>
                <GitBranch size={12} color="#16a34a" /> Branch Admins — by Branch
              </div>
              <div className={styles.scopeSpecificRow}>
                <select
                  className={styles.scopeSpecificSelect}
                  value={selectedBranchForBA}
                  onChange={(e) => setSelectedBranchForBA(e.target.value)}
                  disabled={!isHqAdmin}
                >
                  <option value="">— Select Branch —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.code ? `${b.code} — ${b.name}` : b.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedBranchForBA || !isHqAdmin}
                  onClick={() => {
                    handleAddScopedRule("all_branch_admins", DESIGNATION_ID.BRANCH_ADMIN, "branch_id", selectedBranchForBA, "branch");
                    setSelectedBranchForBA("");
                  }}
                  className={`${styles.scopeAddBtn} ${selectedBranchForBA ? styles.scopeAddBtnActive : ""}`}
                >
                  + Add
                </button>
              </div>
              {adminScopeRules.filter((r) => r.branch_id && r.scope === "all_branch_admins").length > 0 && (
                <div className={styles.scopeChipRow}>
                  {adminScopeRules.filter((r) => r.branch_id && r.scope === "all_branch_admins").map((rule, idx) => {
                    const branch = branches.find((b) => b.id === rule.branch_id);
                    return (
                      <span key={idx} className={styles.scopeActiveChip} style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>
                        <GitBranch size={9} />
                        BA — {branch?.code ?? branch?.name ?? rule.branch_id}
                        {isHqAdmin && (
                          <button className={styles.scopeChipRemove} onClick={() => handleRemoveAdminScopeRule(adminScopeRules.indexOf(rule))} aria-label="Remove">
                            <X size={9} />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Dept Admins + Sub-Dept Admins */}
          <div className={styles.scopeSpecificGrid}>

            <div className={styles.scopeSpecificCard} style={{ borderTop: "3px solid #f59e0b" }}>
              <div className={styles.scopeSpecificTitle}>
                <Building2 size={12} color="#d97706" /> Department Admins — by Branch
              </div>
              <div className={styles.scopeSpecificRow}>
                <select
                  className={styles.scopeSpecificSelect}
                  value={selectedBranchForDA}
                  onChange={(e) => setSelectedBranchForDA(e.target.value)}
                  disabled={!isHqAdmin}
                >
                  <option value="">— Select Branch —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.code ? `${b.code} — ${b.name}` : b.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedBranchForDA || !isHqAdmin}
                  onClick={() => {
                    handleAddScopedRule("all_dept_admins", DESIGNATION_ID.DEPT_ADMIN, "branch_id", selectedBranchForDA, "branch");
                    setSelectedBranchForDA("");
                  }}
                  className={`${styles.scopeAddBtn} ${selectedBranchForDA ? styles.scopeAddBtnActive : ""}`}
                >
                  + Add
                </button>
              </div>
              {adminScopeRules.filter((r) => r.branch_id && r.scope === "all_dept_admins").length > 0 && (
                <div className={styles.scopeChipRow}>
                  {adminScopeRules.filter((r) => r.branch_id && r.scope === "all_dept_admins").map((rule, idx) => {
                    const branch = branches.find((b) => b.id === rule.branch_id);
                    return (
                      <span key={idx} className={styles.scopeActiveChip} style={{ background: "#fef9e7", color: "#d97706", border: "1px solid #fde68a" }}>
                        <Building2 size={9} />
                        DA — {branch?.code ?? branch?.name ?? rule.branch_id}
                        {isHqAdmin && (
                          <button className={styles.scopeChipRemove} onClick={() => handleRemoveAdminScopeRule(adminScopeRules.indexOf(rule))} aria-label="Remove">
                            <X size={9} />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.scopeSpecificCard} style={{ borderTop: "3px solid #7c3aed" }}>
              <div className={styles.scopeSpecificTitle}>
                <Layers size={12} color="#7c3aed" /> Sub-Dept Admins — by Branch
              </div>
              <div className={styles.scopeSpecificRow}>
                <select
                  className={styles.scopeSpecificSelect}
                  value={selectedBranchForSDA}
                  onChange={(e) => setSelectedBranchForSDA(e.target.value)}
                  disabled={!isHqAdmin}
                >
                  <option value="">— Select Branch —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.code ? `${b.code} — ${b.name}` : b.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedBranchForSDA || !isHqAdmin}
                  onClick={() => {
                    handleAddScopedRule("all_sub_dept_admins", DESIGNATION_ID.SUB_DEPT_ADMIN, "branch_id", selectedBranchForSDA, "branch");
                    setSelectedBranchForSDA("");
                  }}
                  className={`${styles.scopeAddBtn} ${selectedBranchForSDA ? styles.scopeAddBtnActive : ""}`}
                >
                  + Add
                </button>
              </div>
              {adminScopeRules.filter((r) => r.branch_id && r.scope === "all_sub_dept_admins").length > 0 && (
                <div className={styles.scopeChipRow}>
                  {adminScopeRules.filter((r) => r.branch_id && r.scope === "all_sub_dept_admins").map((rule, idx) => {
                    const branch = branches.find((b) => b.id === rule.branch_id);
                    return (
                      <span key={idx} className={styles.scopeActiveChip} style={{ background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe" }}>
                        <Layers size={9} />
                        SDA — {branch?.code ?? branch?.name ?? rule.branch_id}
                        {isHqAdmin && (
                          <button className={styles.scopeChipRemove} onClick={() => handleRemoveAdminScopeRule(adminScopeRules.indexOf(rule))} aria-label="Remove">
                            <X size={9} />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PANEL B — RULE-BASED ASSIGNMENT
      ════════════════════════════════════════════════════════════════════ */}
      <section className={styles.panelCard}>
        <div className={styles.panelHeader}>
          <div className={styles.panelHeaderLeft}>
            <div className={styles.panelIcon} style={{ background: "#eff6ff", color: "#4f46e5" }}>
              <LayoutGrid size={18} />
            </div>
            <div>
              <h2 className={styles.panelTitle}>Org-Based Assignment</h2>
              <p className={styles.panelSubtitle}>
                Designate employees by Designation → Department → Sub-Department → Branches.
              </p>
            </div>
          </div>
        </div>
        <div className={styles.panelDivider} />
        <div className={styles.panelBody}>
          {isHqAdmin && (
            <>
              <div className={styles.stepIndicatorRow}>
                 {[
                    { num: 1, label: "Designation", done: selectedDesignationIds.length > 0,    doneClass: styles.stepBadgeDoneDesig },
                    { num: 2, label: "Department",  done: !!selectedDepartmentForAssign,        doneClass: styles.stepBadgeDoneDept  },
                    { num: 3, label: "Sub-Dept",    done: !!selectedSubDepartmentForAssign,     doneClass: styles.stepBadgeDoneSub   },
                             ].map((step, idx) => (
                           <div key={step.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                         <div className={`${styles.stepBadge} ${step.done ? step.doneClass : ""}`}>
                      {step.done ? <CheckCircle2 size={11} /> : <span>{step.num}</span>}
                      {step.label}
                    </div>
                    {idx < 2 && <ChevronRight size={12} color="#cbd5e1" />}
                  </div>
                ))}
              </div>

              <div className={styles.builderGrid}>

                {/* Step 1 — Designation */}
                <div className={styles.builderField}>
                  <label className={styles.builderLabel}>
                    <span className={styles.builderStep}>1</span>
                    Designation <span className={styles.requiredStar}>*</span>
                  </label>
                  <CreatableSelect
                    instanceId="assign-desig"
                    isMulti
                    isSearchable
                    placeholder="Search or create…"
                    styles={selectStyles}
                    options={designations.map((d) => ({ value: d.id, label: d.name }))}
                    value={designations.filter((d) => selectedDesignationIds.includes(d.id)).map((d) => ({ value: d.id, label: d.name }))}
                    onChange={(opts: any) => setSelectedDesignationIds(opts ? opts.map((o: any) => o.value) : [])}
                    onCreateOption={handleCreateDesignation}
                    formatCreateLabel={(val) => `Create "${val}"`}
                    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    menuPosition="fixed"
                  />
                </div>

                {/* Step 2 — Department */}
                <div className={styles.builderField}>
                  <label className={styles.builderLabel}>
                    <span className={styles.builderStep} style={{ background: "#f0fdf4", color: "#166534" }}>2</span>
                    Department <span className={styles.requiredStar}>*</span>
                  </label>
                  <Select
                    instanceId="assign-dept"
                    isSearchable isClearable
                    placeholder="Select department…"
                    styles={{
                      ...selectStyles,
                      option: (base: object, { data, isFocused, isSelected }: any) => ({
                        ...base,
                        backgroundColor: isSelected ? "#2563eb" : (data as any).value === "__create__" ? isFocused ? "#f0fdf4" : "#f8fafc" : isFocused ? "#eff6ff" : "transparent",
                        color:     isSelected ? "#fff" : (data as any).value === "__create__" ? "#166534" : "#334155",
                        fontWeight:(data as any).value === "__create__" ? "700" : isSelected ? "700" : "500",
                        borderTop: (data as any).value === "__create__" ? "1px solid #e2e8f0" : "none",
                        padding: "10px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px",
                      }),
                    }}
                    options={[...departmentSelectOptions, { value: "__create__", label: "+ Create new department…" }]}
                    value={selectedDepartmentForAssign
                      ? (() => {
                          const dept   = departments.find((d) => String(d.id) === selectedDepartmentForAssign);
                          const branch = branches.find((b) => b.id === dept?.branch_id);
                          return dept ? {
                            value: String(dept.id),
                            label: [dept.code ? `[${dept.code}]` : null, dept.name, branch ? `· ${branch.code ?? branch.name}` : null].filter(Boolean).join(" "),
                          } : null;
                        })()
                      : null}
                    onChange={(opt: any) => {
                      if (opt?.value === "__create__") { setShowDeptModal(true); return; }
                      setSelectedDepartmentForAssign(opt ? opt.value : "");
                      setSelectedSubDepartmentForAssign("");
                    }}
                    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    menuPosition="fixed"
                  />
                </div>

                {/* Step 3 — Sub-Department */}
                <div className={styles.builderField}>
                  <label className={styles.builderLabel}>
                    <span className={styles.builderStep} style={{ background: "#fef3c7", color: "#92400e" }}>3</span>
                    Sub-Department <span className={styles.requiredStar}>*</span>
                  </label>
                  <Select
                    instanceId="assign-subdept"
                    isSearchable isClearable
                    isDisabled={!selectedDepartmentForAssign}
                    placeholder={selectedDepartmentForAssign ? "Select sub-department…" : "Select a department first"}
                    styles={selectStyles}
                    options={subDeptOptions}
                    value={selectedSubDepartmentForAssign
                      ? subDeptOptions.find((o) => o.value === selectedSubDepartmentForAssign) ?? null
                      : null}
                    onChange={(opt: any) => setSelectedSubDepartmentForAssign(opt ? opt.value : "")}
                    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    menuPosition="fixed"
                    noOptionsMessage={() => selectedDepartmentForAssign ? "No sub-departments found" : "Select a department first"}
                  />
                </div>
              </div>

              {selectedSubDepartmentForAssign && selectedDepartmentForAssign && (
                <div className={styles.branchPreviewPanel}>
                  {matchingBranches.length === 0 ? (
                    <div className={styles.branchPreviewEmpty}>
                      <p className={styles.branchPreviewEmptyText}>
                        No branches currently linked to this sub-department.
                        The rule will still match future employees when created.
                      </p>
                      {canAddCombination && (
                        <button className={styles.addRuleBtn} onClick={handleAddCombinationRule}>
                          Add Rule Anyway
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className={styles.branchPreviewHeader}>
                        <div className={styles.branchPreviewInfo}>
                          <span className={styles.branchPreviewLabel}>Matching branches</span>
                          <span className={styles.branchPreviewCount}>{matchingBranches.length}</span>
                        </div>
                        <button
                          className={styles.addRuleBtn}
                          disabled={!canAddCombination}
                          onClick={handleAddCombinationRule}
                        >
                          <CheckCircle2 size={13} />
                          Confirm Assignment to All {matchingBranches.length} Branch{matchingBranches.length !== 1 ? "es" : ""}
                        </button>
                      </div>
                      <div className={styles.branchChipList}>
                        {matchingBranches.map((branch) => (
                          <span key={branch.id} className={styles.branchPreviewChip}>
                            <GitBranch size={10} />
                            {branch.code ? `${branch.code} — ${branch.name}` : branch.name}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PANEL C — DIRECT EMPLOYEE ASSIGNMENT
      ════════════════════════════════════════════════════════════════════ */}
      <section className={styles.panelCard}>
        <div className={styles.panelHeader}>
          <div className={styles.panelHeaderLeft}>
            <div className={styles.panelIcon} style={{ background: "#f0fdf4", color: "#16a34a" }}>
              <Users size={18} />
            </div>
            <div>
              <h2 className={styles.panelTitle}>Direct Employee Assignment</h2>
              <p className={styles.panelSubtitle}>
                Assign the template directly to specific individuals regardless of role or department.
              </p>
            </div>
          </div>
        </div>
        <div className={styles.panelDivider} />
        <div className={styles.panelBody}>
          <div className={styles.directEmployeeField}>
            <label className={styles.builderLabel}>
              Search Employees
              <span className={styles.optionalTag}>optional</span>
            </label>
            <Select
              instanceId="assign-users"
              isMulti isSearchable isClearable
              isDisabled={!isHqAdmin}
              placeholder="Search by name…"
              styles={selectStyles}
              options={
                Array.from(new Map(users.map((u) => [u.id, u])).values())
                  .sort((a, b) => a.full_name.localeCompare(b.full_name))
                  .map((u) => ({ value: u.id, label: u.full_name }))
              }
              value={
                Array.from(new Map(users.filter((u) => directUserIds.includes(u.id)).map((u) => [u.id, u])).values())
                  .map((u) => ({ value: u.id, label: u.full_name }))
              }
              onChange={(opts: any) => setDirectUserIds(opts ? opts.map((o: any) => String(o.value)) : [])}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              menuPosition="fixed"
            />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PANEL D — CREATE DEPT / BRANCH SHORTCUTS
      ════════════════════════════════════════════════════════════════════ */}
      {isHqAdmin && (
        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div className={styles.panelHeaderLeft}>
              <div className={styles.panelIcon} style={{ background: "#fef3c7", color: "#92400e" }}>
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className={styles.panelTitle}>Create Departments &amp; Branches</h2>
                <p className={styles.panelSubtitle}>
                  Add new departments or branches before building assignment rules.
                </p>
              </div>
            </div>
          </div>
          <div className={styles.panelDivider} />
          <div className={styles.panelBody}>
            <div className={styles.createActionsRow}>
              <button className={styles.createActionBtn} onClick={() => setShowDeptModal(true)}>
                <div className={styles.createActionIcon} style={{ background: "#eff6ff", color: "#2563eb" }}>
                  <Building2 size={20} />
                </div>
                <div>
                  <div className={styles.createActionTitle}>New Department</div>
                  <div className={styles.createActionSub}>Add a department with code and optional branch link</div>
                </div>
                <Plus size={15} color="#94a3b8" style={{ marginLeft: "auto", flexShrink: 0 }} />
              </button>
              <button className={styles.createActionBtn} onClick={() => setShowBranchModal(true)}>
                <div className={styles.createActionIcon} style={{ background: "#f0fdf4", color: "#16a34a" }}>
                  <GitBranch size={20} />
                </div>
                <div>
                  <div className={styles.createActionTitle}>New Branch</div>
                  <div className={styles.createActionSub}>Add a branch with code and optional country link</div>
                </div>
                <Plus size={15} color="#94a3b8" style={{ marginLeft: "auto", flexShrink: 0 }} />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          ACTIVE ASSIGNMENT RULES — big white panelCard
          ┌─────────────────────────────────────────────────────────────┐
          │ Header: "Active Assignment Rules"  N rules  ~M users        │
          │                                              [Clear All]    │
          ├─────────────────────────────────────────────────────────────┤
          │ Scope & Direct Rules (horizontal bar cards)                 │
          ├─────────────────────────────────────────────────────────────┤
          │ Combination Rules TABLE                                     │
          │  Designation | Department | Sub-Dept | Branches | ✓ | ×    │
          └─────────────────────────────────────────────────────────────┘
      ════════════════════════════════════════════════════════════════════ */}
      {totalRuleCount > 0 && (
        <section className={styles.panelCard} style={{ marginTop: "4px" }}>

          {/* Card header */}
          <div className={styles.panelHeader}>
            <div className={styles.panelHeaderLeft}>
              <div className={styles.panelIcon} style={{ background: "#eff6ff", color: "#4f46e5" }}>
                <Target size={18} />
              </div>
              <div>
                <h2 className={styles.panelTitle} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  Active Assignment Rules
                  <span className={styles.activeRulesCountBadge}>{totalRuleCount} rule{totalRuleCount !== 1 ? "s" : ""}</span>
                  {totalMatchedCount > 0 && (
                    <span className={styles.activeRulesMatchBadge}>~{totalMatchedCount} user{totalMatchedCount !== 1 ? "s" : ""} matched</span>
                  )}
                </h2>
                <p className={styles.panelSubtitle}>All configured assignment rules for this template.</p>
              </div>
            </div>
            {isHqAdmin && (
              <button className={styles.clearAllBtn} onClick={handleClearAllRules}>
                <RefreshCw size={11} /> Clear All
              </button>
            )}
          </div>

          <div className={styles.panelDivider} />

          <div className={styles.panelBody}>

            {/* ── Scope & Direct Rules — horizontal bar cards ───────────────── */}
            {(adminScopeRules.length > 0 || directUserIds.length > 0) && (
              <div className={styles.ruleBarsSection}>
                <p className={styles.ruleBarsLabel}>Scope &amp; Direct Rules</p>
                <div className={styles.ruleBarsList}>
                  {adminScopeRules.map((rule, idx) => (
                    <ScopeRuleBar
                      key={`scope-${idx}`}
                      rule={rule}
                      countries={countries}
                      branches={branches}
                      canRemove={isHqAdmin}
                      onRemove={() => handleRemoveAdminScopeRule(idx)}
                    />
                  ))}
                  {directUserIds.map((userId) => (
                    <UserBar
                      key={`user-${userId}`}
                      userId={userId}
                      users={users}
                      canRemove={isHqAdmin}
                      onRemove={() => setDirectUserIds((prev) => prev.filter((id) => id !== userId))}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Combination Rules — TABLE GRID ────────────────────────────── */}
            {combinationRules.length > 0 && (
              <div className={styles.comboTableSection}>
                {(adminScopeRules.length > 0 || directUserIds.length > 0) && (
                  <p className={styles.ruleBarsLabel} style={{ marginTop: "4px" }}>Combination Rules</p>
                )}
                {!(adminScopeRules.length > 0 || directUserIds.length > 0) && (
                  <p className={styles.ruleBarsLabel}>Combination Rules</p>
                )}

                {/* Table wrapper */}
                <div className={styles.comboTableWrap}>
                  <table className={styles.comboTable}>
                    <thead>
                      <tr>
                        <th className={styles.comboColDesig}>
                          <UserCheck size={13} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
                          Designation
                        </th>
                        <th className={styles.comboColDept}>
                          <Building2 size={13} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
                          Department
                        </th>
                        <th className={styles.comboColSub}>
                          <Layers size={13} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
                          Sub-Department
                        </th>
                        <th className={styles.comboColBranch}>
                          <GitBranch size={13} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
                          Branches
                        </th>
                        <th className={styles.comboColMatch}>
                          <Users size={13} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
                          Users
                        </th>
                        <th className={styles.comboColAction}>
                          <Trash2 size={13} style={{ verticalAlign: "-2px", opacity: 3.45 }} />
                       </th>
                      </tr>
                    </thead>
                    <tbody>
                      {combinationRules.map((combo) => {
                        const designationName = designations.find((d) => d.id === combo.designation_id)?.name ?? combo.designation_name;
                        const departmentName  = departments.find((d) => d.id === combo.department_id)?.name   ?? combo.department_name;
                        const subDeptName     = subDepartments.find((s) => s.id === combo.sub_department_id)?.name ?? combo.sub_department_name;
                        const ruleBranches    = branches.filter((b) => combo.branch_ids.includes(b.id));
                        const matchCount      = ruleMatchCounts.get(combo.id) ?? 0;

                        return (
                          <tr key={combo.id} className={styles.comboTableRow}>
                            {/* Designation */}
                            <td className={styles.comboTd}>
                              <span className={`${styles.comboPill} ${styles.comboPillDesig}`}>
                                <UserCheck size={11} />
                                {designationName}
                              </span>
                            </td>

                            {/* Department */}
                            <td className={styles.comboTd}>
                              <span className={`${styles.comboPill} ${styles.comboPillDept}`}>
                                <Building2 size={11} />
                                {departmentName}
                              </span>
                            </td>

                            {/* Sub-Department */}
                            <td className={styles.comboTd}>
                              <span className={`${styles.comboPill} ${styles.comboPillSub}`}>
                                <Layers size={11} />
                                {subDeptName}
                              </span>
                            </td>

                            {/* Branches — WHITE chips with border, each removable */}
                            <td className={styles.comboTd}>
                              {ruleBranches.length === 0 ? (
                                <span className={styles.comboAllBranchNote}>
                                  <GitBranch size={10} /> All matching branches
                                </span>
                              ) : (
                                <div className={styles.comboBranchSet}>
                                  {ruleBranches.map((branch) => (
                                    <span key={branch.id} className={styles.comboBranchChip}>
                                      <GitBranch size={10} />
                                      {branch.code ? `${branch.code} — ${branch.name}` : branch.name}
                                      {isHqAdmin && (
                                        <button
                                          className={styles.comboBranchChipRemove}
                                          onClick={() =>
                                            setCombinationRules((prev) =>
                                              prev.map((r) =>
                                                r.id !== combo.id ? r : { ...r, branch_ids: r.branch_ids.filter((id) => id !== branch.id) },
                                              ),
                                            )
                                          }
                                          aria-label={`Remove branch ${branch.name}`}
                                          title="Remove branch"
                                        >
                                          <X size={9} />
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>

                            {/* Match count */}
                            <td className={styles.comboTdCenter}>
                              <span className={styles.comboMatchBadge}>
                                <CheckCircle2 size={11} />
                                {matchCount}
                              </span>
                            </td>

                            {/* Remove row */}
                            <td className={styles.comboTdCenter}>
                              {isHqAdmin && (
                                <button
                                 className={styles.comboRemoveBtn}
                                 onClick={() => setCombinationRules((prev) => prev.filter((c) => c.id !== combo.id))}
                                 aria-label="Remove rule"
                                 >
                                 <Trash2 size={13} />
                               </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  
                </div>
              </div>
            )}

          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          BOTTOM ACTIONS
      ════════════════════════════════════════════════════════════════════ */}
      <div className={styles.bottomActionsWrapper}>
        {isHqAdmin && (
          <div className={styles.actionBar}>
            <div className={styles.actionBarLeft}>
              {totalRuleCount > 0
                ? `${totalRuleCount} rule${totalRuleCount !== 1 ? "s" : ""} configured`
                : "No rules configured yet"}
            </div>
            <div className={styles.actionBarRight}>
              <button className={styles.discardBtn} onClick={handleDiscardChanges}>
                Discard Changes
              </button>
              <button
                className={`${styles.saveBtn} ${totalRuleCount > 0 ? styles.saveBtnActive : styles.saveBtnBlocked}`}
                onClick={handleSaveAssignment}
                disabled={isAssignSaving}
              >
                {isAssignSaving
                  ? "Saving…"
                  : isAssignSaved
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><CheckCircle2 size={15} /> Saved!</span>
                  : totalMatchedCount > 0
                  ? `Save Assignment (~${totalMatchedCount} users)`
                  : "Save Assignment"}
              </button>
            </div>
          </div>
        )}

        <div className={styles.navBtnsRow}>
          <button className={styles.navBtn} onClick={() => router.push(`${rolePrefix}/template-management`)}>
            <ArrowLeft size={15} />
            Back to Template Dashboard
          </button>
          <button
            className={`${styles.navBtn} ${styles.navBtnPrimary}`}
            onClick={() => router.push(
              `${rolePrefix}/template-management/template-creation${templateId ? `?edit=${templateId}` : ""}`,
            )}
          >
            <LayoutGrid size={15} />
            Back to Template Creation
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showDeptModal && (
        <NewDepartmentModal
          initialName=""
          branches={branches}
          onConfirm={handleDeptModalConfirm}
          onCancel={() => setShowDeptModal(false)}
        />
      )}
      {showBranchModal && (
        <NewBranchModal
          countries={countries}
          onConfirm={handleBranchModalConfirm}
          onCancel={() => setShowBranchModal(false)}
        />
      )}
        </div>
      </main>
    </div>    

  );
}


