'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Trash2, Search, Lock, Unlock,
  ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';

// ─── KPI Scale options ────────────────────────────────────────────
export const KPI_SCALE_OPTIONS = [
  { value: 'financial_achievement', label: 'Financial Achievement',       group: 'Interpolated', scale_type: 'interpolated', input_type: 'achievement_pct',  ll: 90,   ul: 110,  inverse: false },
  { value: 'to_gp_contribution',    label: 'T/O & GP Contribution',       group: 'Interpolated', scale_type: 'interpolated', input_type: 'raw_actual_x100',  ll: 4,    ul: 15,   inverse: false },
  { value: 'effective_sales_ratio', label: 'Effective Sales Ratio',        group: 'Interpolated', scale_type: 'interpolated', input_type: 'raw_actual_x100',  ll: 20,   ul: 100,  inverse: false },
  { value: 'individual_gp_margin',  label: 'Individual GP Margin %',       group: 'Interpolated', scale_type: 'interpolated', input_type: 'raw_actual_x100',  ll: 6,    ul: 30,   inverse: false },
  { value: 'ees_360',               label: 'EES / 360 Degree Feedback',    group: 'Interpolated', scale_type: 'interpolated', input_type: 'raw_actual_x100',  ll: 65,   ul: 85,   inverse: false },
  { value: 'nps_ccr',               label: 'NPS / CCR Score',              group: 'Interpolated', scale_type: 'interpolated', input_type: 'raw_actual_x100',  ll: 20,   ul: 50,   inverse: false },
  { value: 'employee_retention',    label: 'Employee Retention',           group: 'Interpolated', scale_type: 'interpolated', input_type: 'raw_actual_x100',  ll: 75,   ul: 95,   inverse: false },
  { value: 'overall_dpam',          label: 'Overall DPAM Score',           group: 'Interpolated', scale_type: 'interpolated', input_type: 'raw_actual',       ll: 75,   ul: 90,   inverse: false },
  { value: 'statutory_legal_dpam',  label: 'Statutory & Legal Compliance', group: 'Bracket',      scale_type: 'bracket',      input_type: 'raw_actual',       ll: null, ul: null, inverse: false },
  { value: 'wip_score',             label: 'WIP Score (Days)',              group: 'Bracket',      scale_type: 'bracket',      input_type: 'raw_actual',       ll: null, ul: null, inverse: true  },
  { value: 'operations_score',      label: 'Operations Score / DPAM Ops',  group: 'Bracket',      scale_type: 'bracket',      input_type: 'raw_actual',       ll: null, ul: null, inverse: false },
  { value: 'individual_sales_gp',   label: 'Individual Sales GP',          group: 'Bracket',      scale_type: 'bracket',      input_type: 'raw_actual',       ll: null, ul: null, inverse: false },
  { value: 'manual',                label: 'Manual Rating (1–5)',           group: 'Manual',       scale_type: 'manual',       input_type: null,               ll: null, ul: null, inverse: false },
] as const;

type ScaleValue = typeof KPI_SCALE_OPTIONS[number]['value'];

// ─── Types ────────────────────────────────────────────────────────
interface Objective {
  id: number; name: string; weight: number; max_score: number;
  control_type: string; category_id: number;
  kpi_scale?: ScaleValue | null; isNew?: boolean;
}
interface Category { id: number; name: string; weight: number; type: string; objectives: Objective[]; }
interface Template  { id: number; name: string; description: string; status: string; created_by: string; categories: Category[]; }
interface Employee {
  id: string; name: string; designation: string;   // uuid string
  current_template_id:   number | null;
  current_template_name: string | null;
}
const LOCKED_ADMIN_UUID = process.env.NEXT_PUBLIC_LOCKED_ADMIN_UUID ?? '';


// ─── Normaliser ───────────────────────────────────────────────────
function normalizeTemplate(raw: unknown): Template | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const cats = Array.isArray(r.categories) ? r.categories : [];
  return {
    id: Number(r.id ?? 0), name: String(r.name ?? ''),
    description: String(r.description ?? ''), status: String(r.status ?? ''),
    created_by: String(r.created_by ?? ''),
    categories: cats.map((c: unknown) => {
      const cat = (c ?? {}) as Record<string, unknown>;
      return {
        id: Number(cat.id ?? 0), name: String(cat.name ?? ''),
        weight: Number(cat.weight ?? 0), type: String(cat.type ?? ''),
        objectives: Array.isArray(cat.objectives) ? cat.objectives.map((o: unknown) => {
          const obj = (o ?? {}) as Record<string, unknown>;
          return {
            id: Number(obj.id ?? 0), name: String(obj.name ?? ''),
            weight: Number(obj.weight ?? 0), max_score: Number(obj.max_score ?? 5),
            control_type: String(obj.control_type ?? ''),
            category_id: Number(obj.category_id ?? cat.id ?? 0),
            kpi_scale: (obj.kpi_scale as ScaleValue) ?? null,
          } as Objective;
        }) : [],
      } as Category;
    }),
  };
}

// ─── ScaleBadge ───────────────────────────────────────────────────
function ScaleBadge({ value }: { value?: ScaleValue | null }) {
  if (!value) return <span style={{ color: '#CBD5E1', fontSize: 12 }}>—</span>;
  const opt = KPI_SCALE_OPTIONS.find(o => o.value === value);
  if (!opt) return null;
  return <span style={{ fontSize: 12.5, color: '#374151', fontWeight: 500 }}>{opt.label}</span>;
}

// ─── ScalePicker ──────────────────────────────────────────────────
function ScalePicker({ value, onChange, hasError }: {
  value: ScaleValue | undefined;
  onChange: (v: ScaleValue) => void;
  hasError: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = KPI_SCALE_OPTIONS.find(o => o.value === value);
  const groups = ['Interpolated', 'Bracket', 'Manual'] as const;
  const groupColor: Record<string, string> = {
    Interpolated: '#1D4ED8', Bracket: '#0891B2', Manual: '#7C3AED',
  };
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', minWidth: 180 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6,
        cursor: 'pointer', fontSize: 12.5, fontWeight: 500,
        background: selected ? '#F8FAFF' : '#fff',
        border: `1px solid ${hasError && !value ? '#F87171' : selected ? '#2563EB' : '#D1D5DC'}`,
        color: selected ? '#1E293B' : '#94A3B8', textAlign: 'left' as const,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : 'Select KPI scale *'}
        </span>
        <ChevronDown size={13} style={{
          color: '#94A3B8', flexShrink: 0, marginLeft: 6,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
        }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 300,
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.13)', overflow: 'hidden',
          minWidth: 240, width: 'max-content',
        }}>
          {groups.map((group, gi) => {
            const opts = KPI_SCALE_OPTIONS.filter(o => o.group === group);
            const color = groupColor[group];
            return (
              <div key={group} style={{ borderBottom: gi < groups.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <div style={{ padding: '7px 12px 4px', background: '#F8FAFC' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.07em', textTransform: 'uppercase' as const }}>
                    {group}
                  </span>
                </div>
                {opts.map(opt => {
                  const isSel = value === opt.value;
                  return (
                    <div key={opt.value}
                      onClick={() => { onChange(opt.value); setOpen(false); }}
                      style={{
                        padding: '8px 12px 8px 26px', cursor: 'pointer',
                        fontSize: 12.5, fontWeight: 500, color: isSel ? color : '#1E293B',
                        background: isSel
                          ? (group === 'Interpolated' ? '#EFF6FF' : group === 'Bracket' ? '#ECFEFF' : '#F5F3FF')
                          : 'transparent',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: 8, position: 'relative',
                      }}
                      onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = '#F8FAFC'; }}
                      onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                    >
                      <span style={{
                        position: 'absolute', left: 10, width: 6, height: 6,
                        borderRadius: '50%', background: isSel ? color : '#D1D5DC',
                      }} />
                      {opt.label}
                      {'inverse' in opt && opt.inverse && (
                        <span style={{ fontSize: 10, color: '#94A3B8', background: '#F1F5F9', padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                          inverse
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ControlBadge ─────────────────────────────────────────────────
function ControlBadge({ type }: { type: string }) {
  const locked = type === 'Locked';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
      background: locked ? '#DBEAFE' : '#F3F4F6',
      color: locked ? '#1447E6' : '#4A5565',
      border: locked ? '1px solid #BFDBFE' : '1px solid #D1D5DC',
    }}>
      {locked ? <Lock size={10} /> : <Unlock size={10} />}{type}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function ViewTemplatePage() {
  const params     = useParams();
  const templateId = parseInt(params.id as string, 10);

  const [template, setTemplate]             = useState<Template | null>(null);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState('');
  const [editMode, setEditMode]             = useState(false);
  const [editedData, setEditedData]         = useState<Category[]>([]);
  const [saving, setSaving]                 = useState(false);
  const [saveMsg, setSaveMsg]               = useState('');
  const [weightError, setWeightError]       = useState('');
  const [objectiveError, setObjectiveError] = useState('');

  const [assignedEmployees, setAssignedEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee]   = useState<Employee | null>(null);
  const [empSearch, setEmpSearch]           = useState('');
  const [empResults, setEmpResults]         = useState<Employee[]>([]);
  const [empSearching, setEmpSearching]     = useState(false);
  const [showDropdown, setShowDropdown]     = useState(false);
  const [assigning, setAssigning]           = useState(false);
  const [assignMsg, setAssignMsg]           = useState('');
  const [showAllocated, setShowAllocated]   = useState(false);

  // ── Conflict notification state ───────────────────────────────
  const [conflictEmployee, setConflictEmployee] = useState<Employee | null>(null);
  const [showConflictBox, setShowConflictBox]   = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:5000';

  // ── Fetch template ────────────────────────────────────────────
  const fetchTemplate = () => {
    setLoading(true);
    fetch(`${API}/api/templates/${templateId}`)
      .then(r => r.json())
      .then(raw => {
        if (raw?.error) { setError(`Backend error: ${raw.error}`); setLoading(false); return; }
        const t = normalizeTemplate(raw);
        if (t) setTemplate(t);
        else setError('Invalid template data returned from server.');
        setLoading(false);
      })
      .catch(err => {
        setError(`Network error: ${err.message} — is Flask running on port 5000?`);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!templateId || isNaN(templateId)) return;
    fetchTemplate();
    fetch(`${API}/api/templates/${templateId}/assignments`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setAssignedEmployees(d); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (empSearch.trim().length < 1) {
      setEmpResults([]); setShowDropdown(false); setSelectedEmployee(null); return;
    }
    setEmpSearching(true);
    const t = setTimeout(() => {
      fetch(`${API}/api/employees?search=${encodeURIComponent(empSearch)}`)
        .then(r => r.json())
        .then((data: Employee[]) => {
          setEmpResults(data.filter(e => !assignedEmployees.find(a => a.id === e.id)));
          setShowDropdown(true);
        })
        .catch(() => setEmpResults([]))
        .finally(() => setEmpSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [empSearch, assignedEmployees]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleSelectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp); setEmpSearch(emp.name);
    setShowDropdown(false); setEmpResults([]);
    setShowConflictBox(false); setConflictEmployee(null);
  };

  // Called when Assign button is clicked — checks for conflict first
  const handleAssign = () => {
    if (!selectedEmployee) return;
    setAssignMsg('');
    const isConflict =
      selectedEmployee.current_template_id !== null &&
      selectedEmployee.current_template_id !== templateId;
    if (isConflict) {
      setConflictEmployee(selectedEmployee);
      setShowConflictBox(true);
      return;
    }
    commitAssign(selectedEmployee);
  };

  // Commits the API call — called directly when no conflict, or after confirm
  const commitAssign = async (emp: Employee) => {
    setShowConflictBox(false); setConflictEmployee(null);
    setAssigning(true); setAssignMsg('');
    const newList = [...assignedEmployees, emp];
    try {
      const res = await fetch(`${API}/api/templates/${templateId}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: newList.map(e => e.id) }),
      });
      const data = await res.json();
      if (!res.ok) { setAssignMsg(data.error ?? 'error'); setAssigning(false); return; }
      setAssignedEmployees(newList); setSelectedEmployee(null);
      setEmpSearch(''); setAssignMsg('success'); setShowAllocated(true);
    } catch { setAssignMsg('error'); }
    setAssigning(false);
    setTimeout(() => setAssignMsg(''), 3500);
  };

  const handleRemoveEmployee = async (id: number) => {
    const newList = assignedEmployees.filter(e => e.id !== id);
    try {
      await fetch(`${API}/api/templates/${templateId}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: newList.map(e => e.id) }),
      });
      setAssignedEmployees(newList);
    } catch {}
  };

  const handleEdit = () => {
    if (template) {
      setEditedData(JSON.parse(JSON.stringify(template.categories)));
      setEditMode(true); setSaveMsg(''); setWeightError(''); setObjectiveError('');
    }
  };
  const handleCancel = () => {
    setEditMode(false); setEditedData([]);
    setSaveMsg(''); setWeightError(''); setObjectiveError('');
  };

  const updateObj = (ci: number, oi: number, patch: Partial<Objective>) => {
    const u = [...editedData];
    u[ci].objectives[oi] = { ...u[ci].objectives[oi], ...patch };
    setEditedData(u); setWeightError(''); setObjectiveError('');
  };

  const handleAddObjective = (ci: number) => {
    const u = [...editedData];
    u[ci].objectives.push({
      id: Date.now(), name: '', weight: 0, max_score: 5,
      control_type: '', category_id: u[ci].id, kpi_scale: null, isNew: true,
    });
    setEditedData(u);
  };

  const handleDeleteObjective = async (ci: number, oi: number) => {
    const u = [...editedData];
    const obj = u[ci].objectives[oi];
    if (!obj.isNew) {
      try { await fetch(`${API}/api/templates/${templateId}/objectives/${obj.id}`, { method: 'DELETE' }); } catch {}
    }
    u[ci].objectives.splice(oi, 1);
    setEditedData(u);
  };

  const getTotalWeight = (data: Category[]) =>
    data.reduce((s, c) => s + c.objectives.reduce((ss, o) => ss + (o.weight || 0), 0), 0);

  const getCatWeight = (cat: Category) =>
    Math.round(cat.objectives.reduce((s, o) => s + (o.weight || 0), 0) * 100) / 100;

  const handleSubmit = async () => {
    for (const cat of editedData) {
      for (const obj of cat.objectives) {
        if (obj.isNew) {
          if (!obj.name.trim())               { setObjectiveError(`Objective in "${cat.name}" is missing a name.`); return; }
          if (!obj.weight || obj.weight <= 0) { setObjectiveError(`"${obj.name || 'unnamed'}" must have weight > 0.`); return; }
          if (!obj.control_type)              { setObjectiveError(`"${obj.name}" must have a control type.`); return; }
          if (!obj.kpi_scale)                 { setObjectiveError(`"${obj.name}" must have a KPI scale selected.`); return; }
        }
      }
    }
    const rounded = Math.round(getTotalWeight(editedData) * 100) / 100;
    if (rounded !== 100) { setWeightError(`Total weight is ${rounded}% — must equal exactly 100%.`); return; }
    setSaving(true); setSaveMsg(''); setWeightError(''); setObjectiveError('');
    try {
      const res = await fetch(`${API}/api/templates/${templateId}/update`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: editedData }),
      });
      if (!res.ok) throw new Error();
      setSaveMsg('success'); setEditMode(false); fetchTemplate();
    } catch { setSaveMsg('error'); }
    setSaving(false);
  };

  // ── Style helpers ─────────────────────────────────────────────
  const P = '11px 16px';
  const thStyle = (align: 'left' | 'center' = 'left') => ({
    padding: P, textAlign: align as React.CSSProperties['textAlign'],
    color: '#475569', fontWeight: 700 as const, fontSize: 11,
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  });
  const tdStyle = (align: 'left' | 'center' = 'left', extra?: React.CSSProperties) => ({
    padding: P, textAlign: align as React.CSSProperties['textAlign'],
    verticalAlign: 'middle' as const, ...extra,
  });
  const initials = (n: string) => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  // ── Loading / error ───────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 24px', fontFamily: 'Inter, sans-serif', color: '#64748B', fontSize: 14 }}>
      Loading template…
    </div>
  );
  if (error) return (
    <div style={{ padding: '32px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '20px 24px', maxWidth: 680 }}>
        <div style={{ fontWeight: 700, color: '#DC2626', fontSize: 15, marginBottom: 8 }}>⚠️ Failed to Load Template</div>
        <div style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#7F1D1D', background: '#FFF1F2', padding: '10px 14px', borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{error}</div>
        <div style={{ marginTop: 14, fontSize: 13, color: '#64748B' }}>
          <strong>Common causes:</strong><br />
          1. Flask is not running — run <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 3 }}>python app.py</code><br />
          2. Template ID {templateId} does not exist in the database<br />
          3. CORS error — check Flask terminal
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={fetchTemplate} style={{ padding: '8px 18px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Retry</button>
          <Link href="/view-template" style={{ padding: '8px 18px', background: '#F1F5F9', color: '#1E293B', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>← All Templates</Link>
        </div>
      </div>
    </div>
  );
  if (!template) return null;

  const displayCategories = editMode ? editedData : template.categories;
  const totalObjectives   = template.categories.reduce((s, c) => s + c.objectives.length, 0);
  const currentTotal      = editMode ? Math.round(getTotalWeight(editedData) * 100) / 100 : 100;

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 16px', background: '#F8F9FC', minHeight: '100vh', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 13, color: '#64748B', flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: '#64748B', textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <Link href="/view-template" style={{ color: '#64748B', textDecoration: 'none' }}>Template Management</Link>
          <span>›</span>
          <span style={{ color: '#1E293B', fontWeight: 700 }}>{template.name}</span>
        </div>

        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 600, color: '#101828', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {template.name}
            </h1>
            <p style={{ color: '#4A5565', margin: '4px 0 0', fontSize: 14 }}>{template.description}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Link href="/view-template" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #E2E8F0', borderRadius: 6, background: '#F8F9FC', textDecoration: 'none', fontSize: 13, color: '#1E293B' }}>
              <ArrowLeft size={14} />Back
            </Link>
            {!editMode
              ? <button onClick={handleEdit} style={{ padding: '8px 20px', background: '#2563EB', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#fff' }}>Edit Template</button>
              : <button onClick={handleCancel} style={{ padding: '8px 16px', borderRadius: 6, background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: 13, color: '#1E293B', fontWeight: 600 }}>Cancel</button>
            }
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16 }}>
            {[
              { label: 'Status',             badge: template.status },
              { label: 'Total Categories',   value: template.categories.length },
              { label: 'Total Objectives',   value: totalObjectives },
              { label: 'Assigned Employees', value: assignedEmployees.length },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 11, color: '#4A5565', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                {s.badge
                  ? <span style={{ background: '#2563EB', color: '#fff', padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500 }}>{s.badge}</span>
                  : <div style={{ fontSize: 20, fontWeight: 600, color: '#1E293B' }}>{s.value}</div>
                }
              </div>
            ))}
          </div>
        </div>

        {/* Edit mode banner */}
        {editMode && (
          <div style={{ background: '#FEF9C3', border: '1px solid #FDE047', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#854D0E' }}>
            <strong>Edit Mode</strong> — Locked objective weights cannot be changed. New objectives require name, weight, control type, and KPI scale. Total weight must equal <strong>100%</strong>.
          </div>
        )}

        {/* Template table */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1E293B' }}>Evaluation Template Structure</h3>
            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#4A5565' }}>
              {[{ label: 'Locked', bg: '#DBEAFE', border: '#BFDBFE' }, { label: 'Editable', bg: '#fff', border: '#D1D5DC' }].map(l => (
                <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 11, height: 11, background: l.bg, border: `1px solid ${l.border}`, borderRadius: 3, display: 'inline-block' }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: editMode ? 680 : 560 }}>
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: editMode ? '28%' : '36%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: editMode ? '33%' : '35%' }} />
                {editMode ? <col style={{ width: '10%' }} /> : null}
              </colgroup>
              <thead>
                <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={thStyle('center')}>#</th>
                  <th style={thStyle('left')}>Category / Objective</th>
                  <th style={thStyle('center')}>Weight</th>
                  <th style={thStyle('center')}>Control</th>
                  <th style={thStyle('left')}>KPI Scale</th>
                  {editMode && <th style={thStyle('center')}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {displayCategories.map((cat, ci) => {
                  const catSum = editMode ? getCatWeight(cat) : cat.weight;
                  const gapOk  = editMode ? catSum === cat.weight : true;
                  return (
                    <React.Fragment key={cat.id}>
                      <tr style={{ background: '#155DFC' }}>
                        <td style={tdStyle('center', { color: '#fff', fontWeight: 700, fontSize: 13 })}>{ci + 1}</td>
                        <td style={tdStyle('left',   { color: '#fff', fontWeight: 700, fontSize: 13 })}>{cat.name}</td>
                        <td style={tdStyle('center', { color: '#fff', fontWeight: 700, fontSize: 13 })}>
                          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8, marginRight: 2 }}>GAP </span>
                          <span style={{ color: editMode && !gapOk ? '#FDE047' : '#fff' }}>{catSum}%</span>
                        </td>
                        <td style={tdStyle('center')}>
                        </td>
                        <td style={tdStyle('left')} />
                        {editMode && (
                          <td style={tdStyle('center')}>
                            <button onClick={() => handleAddObjective(ci)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: '#2563EB', fontWeight: 600 }}>
                              <Plus size={11} />Add
                            </button>
                          </td>
                        )}
                      </tr>
                      {cat.objectives.map((obj, oi) => {
                        const isLocked = obj.control_type === 'Locked';
                        const isNew    = obj.isNew === true;
                        const missing  = isNew && (!obj.name.trim() || !obj.weight || !obj.control_type || !obj.kpi_scale);
                        return (
                          <tr key={obj.id} style={{ background: isLocked ? '#EFF6FF' : '#FFFFFF', borderBottom: '1px solid #E8EDF5', outline: missing && objectiveError ? '2px solid #FCA5A5' : 'none' }}>
                            <td style={tdStyle('center', { color: '#94A3B8', fontSize: 11.5 })}>{ci + 1}.{oi + 1}</td>
                            <td style={tdStyle('left', { color: '#1C398E', fontWeight: 500, fontSize: 13 })}>
                              {editMode && isNew
                                ? <input type="text" placeholder="Objective name *" value={obj.name}
                                    onChange={e => updateObj(ci, oi, { name: e.target.value })}
                                    style={{ width: '100%', padding: '5px 9px', boxSizing: 'border-box', border: `1px solid ${objectiveError && !obj.name.trim() ? '#F87171' : '#93C5FD'}`, borderRadius: 5, fontSize: 12.5, color: '#1E293B', background: '#EFF6FF', outline: 'none' }} />
                                : obj.name}
                            </td>
                            <td style={tdStyle('center')}>
                              {editMode
                                ? isLocked && !isNew
                                  ? <span style={{ display: 'inline-block', width: 54, padding: '4px 8px', border: '1px solid #BFDBFE', borderRadius: 5, textAlign: 'center', fontSize: 12.5, color: '#9CA3AF', background: '#EFF6FF', cursor: 'not-allowed' }}>{obj.weight}%</span>
                                  : <input type="number" step="0.1" min="0" max="100" value={obj.weight}
                                      onChange={e => updateObj(ci, oi, { weight: parseFloat(e.target.value) || 0 })}
                                      style={{ width: 54, padding: '4px 8px', textAlign: 'center', border: `1px solid ${objectiveError && isNew && !obj.weight ? '#F87171' : '#93C5FD'}`, borderRadius: 5, fontSize: 12.5, color: '#1E293B', background: '#fff', outline: 'none' }} />
                                : <span style={{ color: '#475569', fontWeight: 500, fontSize: 13 }}>{obj.weight}%</span>
                              }
                            </td>
                            <td style={tdStyle('center')}>
                              {editMode && isNew
                                ? <select value={obj.control_type} onChange={e => updateObj(ci, oi, { control_type: e.target.value })}
                                    style={{ padding: '5px 6px', border: `1px solid ${objectiveError && !obj.control_type ? '#F87171' : '#93C5FD'}`, borderRadius: 5, fontSize: 12, color: obj.control_type ? '#1E293B' : '#9CA3AF', background: '#fff', outline: 'none' }}>
                                    <option value="" disabled>Select *</option>
                                    <option value="Locked">Locked</option>
                                    <option value="Editable">Editable</option>
                                  </select>
                                : <ControlBadge type={obj.control_type} />
                              }
                            </td>
                            <td style={tdStyle('left')}>
                              {editMode && isNew
                                ? <ScalePicker value={obj.kpi_scale ?? undefined} onChange={v => updateObj(ci, oi, { kpi_scale: v })} hasError={!!objectiveError} />
                                : <ScaleBadge value={obj.kpi_scale} />
                              }
                            </td>
                            {editMode && (
                              <td style={tdStyle('center')}>
                                <button onClick={() => handleDeleteObjective(ci, oi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, borderRadius: 4, display: 'inline-flex', alignItems: 'center' }}>
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
                {!editMode && (
                  <tr style={{ background: '#1C398E' }}>
                    <td colSpan={5} style={{ padding: P, color: '#fff', fontWeight: 700, textAlign: 'center', fontSize: 13, letterSpacing: '0.03em' }}>
                      TOTAL WEIGHT: 100%
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Employee Assignment */}
        {!editMode && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#101828' }}>Employee Assignment</h4>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748B' }}>Search and assign employees to this evaluation template</p>
              </div>
              {assignedEmployees.length > 0 && (
                <span style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                  {assignedEmployees.length} assigned
                </span>
              )}
            </div>

            <div ref={searchRef} style={{ position: 'relative', marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
                  <input type="text" placeholder="Search employee by name..."
                    value={empSearch}
                    onChange={e => { setEmpSearch(e.target.value); setSelectedEmployee(null); setShowConflictBox(false); }}
                    onFocus={() => empResults.length > 0 && setShowDropdown(true)}
                    style={{ width: '100%', padding: '9px 12px 9px 32px', boxSizing: 'border-box', border: `1px solid ${selectedEmployee ? '#2563EB' : '#D1D5DC'}`, borderRadius: 8, fontSize: 13, color: '#1E293B', background: selectedEmployee ? '#F0F6FF' : '#fff', outline: 'none' }} />
                  {empSearching && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94A3B8' }}>Searching…</span>}
                </div>
                <button onClick={handleAssign} disabled={!selectedEmployee || assigning} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none',
                  background: selectedEmployee ? '#2563EB' : '#E5E7EB',
                  color: selectedEmployee ? '#fff' : '#9CA3AF',
                  cursor: selectedEmployee ? 'pointer' : 'not-allowed',
                  fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  {assigning ? 'Assigning…' : 'Assign'}
                </button>
              </div>

              {/* Search results dropdown */}
              {showDropdown && empResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 90, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 100, maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
                  {empResults.map((emp, i) => {
                    const hasConflict = emp.current_template_id !== null && emp.current_template_id !== templateId;
                    return (
                      <div key={emp.id} onClick={() => handleSelectEmployee(emp)}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: i < empResults.length - 1 ? '1px solid #F1F5F9' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFF')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {initials(emp.name)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>{emp.name}</div>
                        </div>
                        {/* ⚠ Conflict badge — already on a different template */}
                        {hasConflict && (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            ⚠ On {emp.current_template_name ?? `Template ${emp.current_template_id}`}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {showDropdown && !empSearching && empSearch.trim().length > 0 && empResults.length === 0 && !selectedEmployee && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 90, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 100, padding: 14, fontSize: 13, color: '#94A3B8', marginTop: 4, textAlign: 'center' }}>
                  No employees found matching &quot;{empSearch}&quot;
                </div>
              )}
            </div>

            {/* ── Conflict confirmation box ─────────────────────── */}
            {showConflictBox && conflictEmployee && (
              <div style={{ border: '1px solid #FDE68A', background: '#FFFBEB', borderRadius: 10, padding: '13px 15px', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 10 }}>
                  <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E', margin: '0 0 3px' }}>
                      This employee is already assigned to another template
                    </p>
                    <p style={{ fontSize: 12.5, color: '#78350F', margin: 0, lineHeight: '18px' }}>
                      <strong>{conflictEmployee.name}</strong> is currently assigned to{' '}
                      <strong>{conflictEmployee.current_template_name ?? `Template ${conflictEmployee.current_template_id}`}</strong>.
                      Proceeding will move them to <strong>{template.name}</strong> and remove their previous assignment.
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => commitAssign(conflictEmployee)} disabled={assigning} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#D97706', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                    {assigning ? 'Assigning…' : 'Yes, reassign'}
                  </button>
                  <button onClick={() => { setShowConflictBox(false); setConflictEmployee(null); setSelectedEmployee(null); setEmpSearch(''); }}
                    style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #FDE68A', cursor: 'pointer', background: 'transparent', fontSize: 12, color: '#92400E', fontWeight: 600 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Success / error */}
            {assignMsg === 'success' && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12.5, color: '#16A34A' }}>
                ✅ Employee assigned successfully
              </div>
            )}
            {assignMsg !== '' && assignMsg !== 'success' && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12.5, color: '#DC2626' }}>
                ❌ {assignMsg === 'error' ? 'Failed to assign. Please try again.' : assignMsg}
              </div>
            )}

            {/* Assigned employees list */}
            {assignedEmployees.length > 0 && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                <button onClick={() => setShowAllocated(p => !p)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F8FAFF', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1E293B' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    Assigned Employees
                    <span style={{ background: '#2563EB', color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{assignedEmployees.length}</span>
                  </span>
                  {showAllocated ? <ChevronUp size={16} color="#64748B" /> : <ChevronDown size={16} color="#64748B" />}
                </button>
                {showAllocated && assignedEmployees.map((emp, i) => (
                  <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: i % 2 === 0 ? '#fff' : '#F9FAFB', borderTop: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {initials(emp.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</div>
                    </div>
                    {emp.id === LOCKED_ADMIN_UUID ? (
                      <span style={{ padding: '4px 12px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>
                        Assigned by superior
                      </span>
                    ) : (
                      <button onClick={() => handleRemoveEmployee(emp.id)}
                        style={{ padding: '4px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#DC2626' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#DC2626'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626'; }}
                      >Remove</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {assignedEmployees.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: 13 }}>
                No employees assigned yet. Search above to get started.
              </div>
            )}
          </div>
        )}

        {/* Validation banners */}
        {objectiveError && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#DC2626' }}>⚠️ {objectiveError}</div>
        )}
        {weightError && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#DC2626' }}>⚠️ {weightError}</div>
        )}
        {saveMsg === 'success' && (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#16A34A' }}>✅ Template saved successfully!</div>
        )}
        {saveMsg === 'error' && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#DC2626' }}>❌ Failed to save. Please try again.</div>
        )}

        {/* Submit bar */}
        {editMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, flex: 1, color: currentTotal === 100 ? '#16A34A' : '#DC2626' }}>
              {currentTotal === 100 ? '✅ Total weight is 100% — ready to save.' : `⚠️ Total weight: ${currentTotal}% (must be 100%)`}
            </span>
            <button onClick={handleCancel} style={{ padding: '10px 20px', borderRadius: 6, background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: 13, color: '#1E293B', fontWeight: 600 }}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving} style={{ padding: '10px 24px', borderRadius: 6, background: saving ? '#93C5FD' : '#16A34A', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, color: '#fff', fontWeight: 600 }}>
              {saving ? 'Saving…' : 'Submit'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}