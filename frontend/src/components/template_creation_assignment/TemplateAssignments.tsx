/* components/TemplateAssignment.tsx*/

"use client";

import { useState, useMemo } from "react";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import { toast } from "sonner";
import { Lock, CheckCircle2, Users } from "lucide-react";
import styles from "./TemplateCreateBase.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

interface UserOption {
  id:        string;
  full_name: string;
}

interface DepartmentOption {
  id:        string;
  name:      string;
  code:      string | null;
  branch_id: string | null;
}

interface BranchOption {
  id:         string;
  name:       string;
  code:       string | null;
  country_id: string | null;
}

// ─── New Department Modal ─────────────────────────────────────────────────────

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
            Create New Department
          </h3>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px" }}>
            ✕
          </button>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
            Department Name <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Forwarding Import Air"
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "9px 12px", fontSize: "13px", fontWeight: "500", outline: "none", color: "#1e293b" }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
            Department Code <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. FIA, FES, COT, BRN"
            maxLength={10}
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "9px 12px", fontSize: "13px", fontWeight: "700", outline: "none", color: "#1e40af", letterSpacing: "0.5px" }}
          />
          <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#94a3b8" }}>
            Short code used to link financial data (e.g. GP/Revenue from your ERP system)
          </p>
        </div>

        {branches.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
              Branch <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "none", fontWeight: "500" }}>(optional)</span>
            </label>
            <select
              value={branchId ?? ""}
              onChange={(e) => setBranchId(e.target.value || null)}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "9px 12px", fontSize: "13px", fontWeight: "500", outline: "none", color: branchId ? "#1e293b" : "#94a3b8", background: "#fff" }}
            >
              <option value="">— No branch —</option>
              {branches.map((b) => {
                const countryTag = b.country_id ? ` [${b.country_id}]` : "";
                const label = b.code ? `${b.code} — ${b.name}${countryTag}` : `${b.name}${countryTag}`;
                return <option key={b.id} value={b.id}>{label}</option>;
              })}
            </select>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{ padding: "8px 18px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: saving ? "#94a3b8" : "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontWeight: "700", fontSize: "13px", cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "Creating…" : "Create Department"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── react-select style factory ───────────────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TemplateAssignmentsProps {
  savedTemplateId:           number | null;
  isReadOnly:                boolean;
  users:                     UserOption[];
  // ── "roles" prop is now "designations" but kept as "roles" for the
  //    parent (TemplateCreateBase) to avoid touching unrelated code there.
  //    Internally we rename it for clarity.
  roles:                     any[];
  departments:               DepartmentOption[];
  branches:                  BranchOption[];
  selectedUsers:             string[];
  selectedRoles:             number[];          // carries selected designation IDs
  selectedDepartments:       string[];
  setSelectedUsers:          (v: string[]) => void;
  setSelectedRoles:          (v: number[]) => void;   // sets designation IDs
  setSelectedDepartments:    (v: string[]) => void;
  setRoles:                  (fn: (prev: any[]) => any[]) => void;
  setDepartments:            (fn: (prev: DepartmentOption[]) => DepartmentOption[]) => void;
  assignmentSaved:           boolean;
  setAssignmentSaved:        (v: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TemplateAssignments({
  savedTemplateId,
  isReadOnly,
  users,
  roles: designations,              // ← renamed internally; parent still passes "roles"
  departments,
  branches,
  selectedUsers,
  selectedRoles:       selectedDesignationIds,   // carries designation IDs
  selectedDepartments,
  setSelectedUsers,
  setSelectedRoles:    setSelectedDesignationIds,
  setSelectedDepartments,
  setRoles:            setDesignations,
  setDepartments,
  assignmentSaved,
  setAssignmentSaved,
}: TemplateAssignmentsProps) {

  const baseSelectStyles = useMemo(() => buildBaseSelectStyles(), []);

  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string | null>(null);
  const [deptModal, setDeptModal] = useState<{ open: boolean; initialName: string }>({
    open: false, initialName: "",
  });

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

  // ── Create a new designation on-the-fly ──────────────────────────────────
  const handleCreateDesignation = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/designations`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Designation creation failed");
      const created = await res.json();
      setDesignations((prev) => [...prev, created]);
      setSelectedDesignationIds([...selectedDesignationIds, created.id]);
      toast.success(`Designation "${name}" created`);
    } catch (err) {
      console.error("Designation create error:", err);
      toast.error("Failed to create designation");
    }
  };

  const handleDeptModalConfirm = async (name: string, code: string, branchId: string | null) => {
    try {
      const res = await fetch(`${API_BASE}/departments`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, code, branch_id: branchId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Department creation failed");
      }
      const created: DepartmentOption = await res.json();
      setDepartments((prev) => [...prev, created]);
      setSelectedDepartments([...selectedDepartments, String(created.id)]);
      toast.success(`Department "${name}" (${code}) created`);
      setDeptModal({ open: false, initialName: "" });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create department");
    }
  };

  // ── Assign template ───────────────────────────────────────────────────────
  const handleAssignTemplate = async () => {
    if (isReadOnly) { toast.error("This template is in view-only mode."); return; }
    if (!savedTemplateId) {
      toast.error("Please create or save the template first before assigning.");
      return;
    }
    try {
      const assignRes = await fetch(`${API_BASE}/assign-template`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          template_id:     savedTemplateId,
          // Send under the new key; backend also accepts "role_ids" as fallback
          designation_ids: selectedDesignationIds,
          department_ids:  selectedDepartments,
          user_ids:        selectedUsers,
        }),
      });
      if (!assignRes.ok) {
        const errBody = await assignRes.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Assignment failed");
      }
      setAssignmentSaved(true);
      toast.success("Template assigned successfully!");
    } catch (err: any) {
      console.error("Assign error:", err);
      toast.error(err.message ?? "Failed to assign template");
    }
  };

  const isLocked = !isReadOnly && !savedTemplateId;

  return (
    <>
      {deptModal.open && (
        <NewDeptModal
          initialName={deptModal.initialName}
          branches={branches}
          onConfirm={handleDeptModalConfirm}
          onCancel={() => setDeptModal({ open: false, initialName: "" })}
        />
      )}

      <div className={styles.sectionDividerLabel}>
        <div className={styles.sectionDividerLine} />
        <span className={styles.sectionDividerText}>
          <span className={styles.sectionDividerNum}>2</span>
          Distribution Strategy
        </span>
        <div className={styles.sectionDividerLine} />
      </div>

      <div className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <div className={styles.sectionHeadingAccent} />
          <h3 className={styles.sectionHeadingTitle}>Distribution Strategy</h3>
          {isReadOnly && <span className={styles.sectionHeadingReadOnly}>(read-only)</span>}
        </div>

        {isLocked && (
          <div className={styles.distributionGate}>
            <div className={styles.distributionGateIcon}>
              <Lock size={18} color="#94a3b8" />
            </div>
            <div>
              <p className={styles.distributionGateTitle}>Create the template first</p>
              <p className={styles.distributionGateText}>
                Use the <strong>Create Template</strong> button above to save your template, then come back here to assign it.
              </p>
            </div>
          </div>
        )}

        <div className={`${styles.distributionContent} ${isLocked ? styles.distributionContentLocked : ""}`}>

          <div className={styles.distributionLogicNote}>
            <div className={styles.distributionLogicIcon}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <p className={styles.distributionLogicText}>
              An employee sees this template if they are assigned directly by name, <strong>or</strong> if they match the selected designation <strong>AND</strong> department together. Selecting only a designation (no department) matches all employees with that designation. Selecting only a department matches all employees in that department. Direct employee assignments always take priority over other rules.
            </p>
          </div>

          <div className={styles.distributionGrid}>

            {/* ── Left column: Employees (multi) + Designations ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <label className={styles.formFieldLabel}>
                  Assign to Employees
                  <span className={styles.optionalTag}>optional</span>
                  {selectedUsers.length > 0 && (
                    <span style={{
                      marginLeft: "8px", padding: "1px 8px", borderRadius: "20px",
                      fontSize: "10px", fontWeight: "700",
                      background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe",
                    }}>
                      {selectedUsers.length} selected
                    </span>
                  )}
                </label>

                <Select
                  instanceId="user-select"
                  styles={baseSelectStyles}
                  isDisabled={isReadOnly || isLocked}
                  isMulti
                  isSearchable
                  closeMenuOnSelect={false}
                  filterOption={(option: any, inputValue: string) => {
                    if (!inputValue) return true;
                    return option.label.toLowerCase().includes(inputValue.toLowerCase());
                  }}
                  options={users.map((u) => ({ value: u.id, label: u.full_name }))}
                  value={users
                    .filter((u) => selectedUsers.includes(u.id))
                    .map((u) => ({ value: u.id, label: u.full_name }))
                  }
                  onChange={(opts: any) =>
                    setSelectedUsers(opts ? opts.map((o: any) => o.value as string) : [])
                  }
                  isClearable
                  placeholder="Search and select employees…"
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  menuPosition="fixed"
                />
                {!isReadOnly && (
                  <p className={styles.fieldHint}>
                    Assigns directly to these individuals, overrides designation &amp; department matching.
                  </p>
                )}
              </div>

              {/* ── Designations (was "Target Roles") ── */}
              <div>
                <label className={styles.formFieldLabel}>
                  Target Designations
                  {selectedDesignationIds.length > 0 && (
                    <span style={{
                      marginLeft: "8px", padding: "1px 8px", borderRadius: "20px",
                      fontSize: "10px", fontWeight: "700",
                      background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0",
                    }}>
                      {selectedDesignationIds.length} selected
                    </span>
                  )}
                </label>
                <CreatableSelect
                  instanceId="designations-select"
                  placeholder="Type to create or select designations…"
                  styles={baseSelectStyles}
                  isMulti
                  isDisabled={isReadOnly || isLocked}
                  options={designations.map((d: any) => ({ value: d.id, label: d.name }))}
                  value={designations
                    .filter((d: any) => selectedDesignationIds.includes(d.id))
                    .map((d: any) => ({ value: d.id, label: d.name }))
                  }
                  onChange={(opts: any) =>
                    setSelectedDesignationIds(opts ? opts.map((o: any) => o.value) : [])
                  }
                  onCreateOption={handleCreateDesignation}
                  formatCreateLabel={(val: string) => `Create designation: "${val}"`}
                />
                {!isReadOnly && (
                  <p className={styles.fieldHint}>
                    Combined with a department: only employees matching <strong>both</strong> will receive this template. Without a department: all employees with this designation will receive it.
                  </p>
                )}
              </div>
            </div>

            {/* ── Right column: Branch filter + Departments ── */}
            <div>
              {branches.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                  <span style={{ fontSize: "10px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                    Filter by branch:
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                    <button
                      onClick={() => setSelectedBranchFilter(null)}
                      disabled={isLocked}
                      style={{
                        padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700",
                        cursor: isLocked ? "not-allowed" : "pointer", border: "1px solid",
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
                        onClick={() => setSelectedBranchFilter(selectedBranchFilter === b.id ? null : b.id)}
                        disabled={isLocked}
                        title={b.name}
                        style={{
                          padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700",
                          cursor: isLocked ? "not-allowed" : "pointer", border: "1px solid",
                          background:  selectedBranchFilter === b.id ? "#1e40af" : "#f8fafc",
                          color:       selectedBranchFilter === b.id ? "#fff"    : "#64748b",
                          borderColor: selectedBranchFilter === b.id ? "#1e40af" : "#e2e8f0",
                          transition: "all 0.12s",
                        }}
                      >
                        {b.code ?? b.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className={styles.formFieldLabel}>Departments</label>
              <Select
                instanceId="depts-select"
                isMulti
                isDisabled={isReadOnly || isLocked}
                placeholder={isReadOnly ? "—" : "Select departments…"}
                options={[
                  ...departmentSelectOptions,
                  ...(!isReadOnly && savedTemplateId
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
                    borderTop:  (data as any).value === "__create__" ? "1px solid #e2e8f0" : "none",
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
                  Combined with a designation: only employees matching <strong>both</strong> will receive this template. Without a designation: all employees in this department will receive it.
                </p>
              )}
            </div>
          </div>

          {/* Read-only assignment summary */}
          {isReadOnly && (selectedDesignationIds.length > 0 || selectedDepartments.length > 0 || selectedUsers.length > 0) && (
            <div className={styles.assignmentSummary}>

              {selectedUsers.length > 0 && (
                <div className={styles.assignmentSummaryRow}>
                  <span className={styles.assignmentSummaryLabel}>Direct Employees</span>
                  <div className={styles.assignmentSummaryTags}>
                    {selectedUsers.map((id) => {
                      const u = users.find((x) => x.id === id);
                      return (
                        <span key={id} className={styles.assignmentSummaryBadge}
                          style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}>
                          {u ? u.full_name : id}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedDesignationIds.length > 0 && (
                <div className={styles.assignmentSummaryRow}>
                  <span className={styles.assignmentSummaryLabel}>Designations</span>
                  <div className={styles.assignmentSummaryTags}>
                    {selectedDesignationIds.map((id) => {
                      const d = designations.find((x: any) => x.id === id);
                      return d ? (
                        <span key={id} className={styles.assignmentSummaryBadge}
                          style={{ background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0" }}>
                          {d.name}
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
                        <span key={id} className={styles.assignmentSummaryBadge}
                          style={{ background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" }}>
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

        {!isReadOnly && savedTemplateId && (
          <div className={styles.sectionCtaRow} style={{ marginTop: "24px" }}>
            <div className={styles.sectionCtaInfo}>
              {assignmentSaved ? (
                <div className={styles.sectionCtaDone}>
                  <CheckCircle2 size={16} color="#16a34a" />
                  <span>Assignment saved successfully</span>
                </div>
              ) : (
                <span className={styles.sectionCtaHint}>
                  Choose designations, departments, and/or employees above, then click Assign Template.
                </span>
              )}
            </div>
            <button className={styles.assignBtn} onClick={handleAssignTemplate}>
              <Users size={15} />
              Assign Template
            </button>
          </div>
        )}
      </div>
    </>
  );
}

