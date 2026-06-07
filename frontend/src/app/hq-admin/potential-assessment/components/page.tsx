'use client';

  {/* HQ admin assesment component page*/}

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Breadcrumb from '@/components/Breadcrumb';
import LoadingSpinner from '@/components/LoadingSpinner';
import { assessmentComponentsApi } from '@/services/potentialAssessmentApi';
import type { AssessmentComponent, PillarType, AppraiseeRole } from '@/types';
import { Plus, Edit2, Trash2, AlertCircle, CheckCircle, X, Loader2, Settings2 } from 'lucide-react';

const PILLARS: { key: PillarType; label: string; cls: string }[] = [
  { key: 'ability',     label: 'Ability',     cls: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]' },
  { key: 'aspiration',  label: 'Aspiration',  cls: 'bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]' },
  { key: 'leadership',  label: 'Leadership',  cls: 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' },
];

const ROLES: { key: AppraiseeRole; label: string }[] = [
  { key: 'country_admin',  label: 'Country Admin'  },
  { key: 'branch_admin',   label: 'Branch Admin'   },
  { key: 'dept_admin',     label: 'Dept Admin'     },
  { key: 'sub_dept_admin', label: 'Sub Dept Admin' },
  { key: 'employee',       label: 'Employee'       },
];

const FILTER_OPTIONS = [
  { value: 'all',    label: 'All Components' },
  { value: 'global', label: 'Global (All Roles)' },
  ...ROLES.map(r => ({ value: r.key, label: r.label })),
];

type FilterValue = 'all' | 'global' | AppraiseeRole;

interface ComponentForm {
  pillar: PillarType;
  component_number: 1 | 2 | 3;
  description: string;
  scope: 'global' | 'role';
  assigned_role: AppraiseeRole;
}

const DEFAULT_FORM: ComponentForm = {
  pillar: 'ability',
  component_number: 1,
  description: '',
  scope: 'global',
  assigned_role: 'country_admin',
};

export default function HQAdminAssessmentComponentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [components, setComponents] = useState<AssessmentComponent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filter, setFilter]         = useState<FilterValue>('all');

  const [showModal, setShowModal]   = useState(false);
  const [editTarget, setEditTarget] = useState<AssessmentComponent | null>(null);
  const [form, setForm]             = useState<ComponentForm>(DEFAULT_FORM);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);

  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [deleting, setDeleting]   = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'hq_admin')) router.push('/');
  }, [user, authLoading, router]);

  const loadComponents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await assessmentComponentsApi.getAll();
      setComponents(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to load components.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user?.role === 'hq_admin') loadComponents();
  }, [user, authLoading, loadComponents]);

  const filtered = [...components]
    .filter(c => {
      if (filter === 'all')    return true;
      if (filter === 'global') return c.scope === 'global';
      return c.scope === 'role' && c.assigned_role === filter;
    })
    .sort((a, b) => a.pillar.localeCompare(b.pillar) || a.component_number - b.component_number);

  const openAdd = () => {
    setEditTarget(null);
    setForm(DEFAULT_FORM);
    setSaveError(null);
    setShowModal(true);
  };

  const openEdit = (comp: AssessmentComponent) => {
    setEditTarget(comp);
    setForm({
      pillar: comp.pillar,
      component_number: comp.component_number,
      description: comp.description,
      scope: comp.scope,
      assigned_role: (comp.assigned_role as AppraiseeRole) ?? 'country_admin',
    });
    setSaveError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    const desc = form.description.trim();
    if (desc.length < 10) { setSaveError('Description must be at least 10 characters.'); return; }
    if (desc.length > 500) { setSaveError('Description must not exceed 500 characters.'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        pillar: form.pillar,
        component_number: form.component_number,
        description: form.description.trim(),
        scope: form.scope,
        assigned_role: form.scope === 'role' ? form.assigned_role : null,
        created_by: user?.id ?? null,
      };
      if (editTarget) {
        const updated = await assessmentComponentsApi.update(editTarget.id, payload);
        setComponents(prev => prev.map(c => c.id === editTarget.id ? updated : c));
      } else {
        const created = await assessmentComponentsApi.create(payload as any);
        setComponents(prev => [...prev, created]);
      }
      setShowModal(false);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error ?? 'Failed to save. A component with the same pillar, question number, and scope may already exist.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await assessmentComponentsApi.delete(deleteId);
      setComponents(prev => prev.filter(c => c.id !== deleteId));
      setDeleteId(null);
    } catch (err: any) {
      setDeleteError(err?.response?.data?.error ?? 'Failed to delete.');
    } finally {
      setDeleting(false);
    }
  };

  const getPillarCls  = (p: PillarType) => PILLARS.find(x => x.key === p)!;
  const getRoleLabel  = (role: string | null) => ROLES.find(r => r.key === role)?.label ?? role ?? '—';

  if (authLoading || loading) return <LoadingSpinner />;
  if (!user || user.role !== 'hq_admin') return null;

  return (
    <div className="flex flex-col gap-8 max-w-[1225px] mx-auto w-full">
      <Breadcrumb items={[
        { label: 'Home', href: '/hq-admin/dashboard' },
        { label: 'Potential Assessment', href: '/hq-admin/potential-assessment' },
        { label: 'Assessment Components' },
      ]} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-[#1D4ED8]" />
          </div>
          <div>
            <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Assessment Components</h1>
            <p className="text-[15px] text-[#4A5565] mt-0.5">
              Manage questions used in Potential Assessments. Assign globally or to specific roles.
            </p>
          </div>
        </div>
        {/* BUTTON — "Add Component" (opens Add/Edit modal in add mode)
            Why: HQ Admin creates new question overrides per role or globally;
            the modal opens with a blank form so no existing component is accidentally overwritten */}
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] text-white text-[13.5px] font-semibold rounded-lg hover:bg-[#2563EB] transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> Add Component
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-[13.5px] text-red-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Components',   count: components.length,                                    pillCls: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]' },
          { label: 'Global (All Roles)', count: components.filter(c => c.scope === 'global').length,  pillCls: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]' },
          { label: 'Role-Specific',      count: components.filter(c => c.scope === 'role').length,    pillCls: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]' },
        ].map(({ label, count, pillCls }) => (
          <div key={label} className="bg-white rounded-xl border border-[#E5E7EB] border-l-4 border-l-[#2563EB] px-5 py-4 flex flex-col gap-3">
            <span className={`inline-flex w-fit items-center px-2.5 py-1 rounded-full text-[12px] font-semibold border ${pillCls}`}>
              {label}
            </span>
            <p className="text-[28px] font-bold text-[#101828]">{count}</p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between gap-4">
          <p className="text-[13.5px] font-semibold text-[#101828]">
            {filter === 'all'    ? 'All Components' :
             filter === 'global' ? 'Global Components' :
             `${getRoleLabel(filter)} Components`}
            <span className="ml-2 text-[12px] font-normal text-[#94A3B8]">({filtered.length})</span>
          </p>
          {/* FILTER SELECT — filters the table by scope or assigned role
              Why: with up to 45 possible components (9 slots × 5 roles + globals) the list
              grows long; filtering by role lets HQ Admin quickly check what is set for a specific audience */}
          <select
            aria-label="Filter components"
            value={filter}
            onChange={e => setFilter(e.target.value as FilterValue)}
            className="px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-lg text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
          >
            {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* TABLE — components list: Pillar | Q# | Description | Assigned To | Actions
            Why: single view of all DB question overrides; empty state guides HQ Admin to
            add the first component; alternating row shading aids readability */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB]">
              <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Pillar</th>
              <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-12">Question</th>
              <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Description</th>
              <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-40">Assigned To</th>
              <th className="text-right px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-14 text-center text-[#94A3B8] text-[14px]">
                  {filter === 'all'
                    ? 'No components yet. Click "Add Component" to create the first one.'
                    : 'No components match this filter.'}
                </td>
              </tr>
            ) : filtered.map((comp, idx) => {
              const pc = getPillarCls(comp.pillar);
              return (
                <tr key={comp.id} className={`border-b border-[#F1F5F9] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}`}>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold border ${pc.cls}`}>
                      {pc.label}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[13px] font-semibold text-[#64748B]">Q{comp.component_number}</td>
                  <td className="px-5 py-4 text-[13.5px] text-[#1E293B] leading-6">{comp.description}</td>
                  <td className="px-5 py-4">
                    {comp.scope === 'global' ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]">
                        All Roles
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                        {getRoleLabel(comp.assigned_role)}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {/* BUTTON — "Edit" (opens Add/Edit modal pre-populated with this row)
                          Why: HQ Admin can correct a description or reassign scope without
                          deleting and recreating the component, preserving the component ID */}
                      <button
                        type="button"
                        onClick={() => openEdit(comp)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-[#1E3A8A] border border-[#BFDBFE] bg-[#EFF6FF] rounded-lg hover:bg-[#DBEAFE] transition-colors"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                      {/* BUTTON — "Delete" (opens delete confirmation modal for this row)
                          Why: destructive action gated behind a confirmation modal; deletion
                          causes assessment forms to fall back to the hardcoded default for this slot */}
                      <button
                        type="button"
                        onClick={() => { setDeleteId(comp.id); setDeleteError(null); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-[#DC2626] border border-[#FCA5A5] bg-[#FEF2F2] rounded-lg hover:bg-[#FEE2E2] transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col gap-5 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-[#101828]">
                {editTarget ? 'Edit Component' : 'Add Component'}
              </h2>
              {/* BUTTON — X icon (close Add/Edit modal without saving)
                  Why: quick dismiss when HQ Admin opens the modal accidentally */}
              <button type="button" onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-[#F1F5F9] transition-colors">
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            {saveError && (
              <div className="flex items-start gap-2 bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg px-4 py-3 text-[13px] text-[#DC2626]">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{saveError}
              </div>
            )}

            <div className="flex flex-col gap-4">
              {/* Pillar + Q# */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-pillar" className="text-[12px] font-semibold text-[#374151] uppercase tracking-wide">Pillar</label>
                  <select
                    id="form-pillar"
                    value={form.pillar}
                    onChange={e => setForm(f => ({ ...f, pillar: e.target.value as PillarType }))}
                    className="px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-[13.5px] text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  >
                    {PILLARS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-component-number" className="text-[12px] font-semibold text-[#374151] uppercase tracking-wide">Question #</label>
                  <select
                    id="form-component-number"
                    value={form.component_number}
                    onChange={e => setForm(f => ({ ...f, component_number: Number(e.target.value) as 1 | 2 | 3 }))}
                    className="px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-[13.5px] text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  >
                    <option value={1}>Q1</option>
                    <option value={2}>Q2</option>
                    <option value={3}>Q3</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#374151] uppercase tracking-wide">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe what this component assesses…"
                  rows={3}
                  className="resize-none px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-[13.5px] text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] transition-all"
                />
              </div>

              {/* Assignment */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-semibold text-[#374151] uppercase tracking-wide">Assign To</label>
                {(['global', 'role'] as const).map(scopeVal => (
                  <label
                    key={scopeVal}
                    className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors"
                    style={form.scope === scopeVal
                      ? { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' }
                      : { borderColor: '#E5E7EB' }}
                  >
                    <input
                      type="radio"
                      name="scope"
                      value={scopeVal}
                      checked={form.scope === scopeVal}
                      onChange={() => setForm(f => ({ ...f, scope: scopeVal }))}
                      className="mt-0.5 accent-[#1E3A8A]"
                    />
                    <div>
                      <p className="text-[13.5px] font-medium text-[#1E293B]">
                        {scopeVal === 'global' ? 'All Roles (Global)' : 'Specific Role'}
                      </p>
                      <p className="text-[12px] text-[#64748B] mt-0.5">
                        {scopeVal === 'global'
                          ? 'Applies to all roles unless overridden by a role-specific component'
                          : 'Overrides the global component for the selected role only'}
                      </p>
                    </div>
                  </label>
                ))}

                {form.scope === 'role' && (
                  <select
                    aria-label="Select role"
                    value={form.assigned_role}
                    onChange={e => setForm(f => ({ ...f, assigned_role: e.target.value as AppraiseeRole }))}
                    className="mt-1 px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-[13.5px] text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  >
                    {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                )}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t border-[#F1F5F9]">
              {/* BUTTON — "Cancel" (close Add/Edit modal without saving)
                  Why: lets HQ Admin abort an accidental edit; no DB write occurs */}
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-[13.5px] font-medium text-[#374151] border border-[#E5E7EB] rounded-lg hover:bg-[#F8FAFC] transition-colors"
              >
                Cancel
              </button>
              {/* BUTTON — "Save Changes" / "Add Component" (submit the modal form to API)
                  Why: disabled while saving to prevent duplicate submissions; label switches
                  based on editTarget presence — add mode vs edit mode */}
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2 bg-[#1E3A8A] text-white text-[13.5px] font-semibold rounded-lg hover:bg-[#1E40AF] transition-colors disabled:opacity-70"
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : <><CheckCircle className="w-4 h-4" /> {editTarget ? 'Save Changes' : 'Add Component'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full flex flex-col gap-5 p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-[#DC2626]" />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-[#101828]">Delete Component</h2>
                <p className="text-[13.5px] text-[#64748B] mt-1 leading-6">
                  This component will be permanently removed. Self-assessment forms will fall back to the global default for this slot.
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="flex items-center gap-2 bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg px-4 py-3 text-[13px] text-[#DC2626]">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{deleteError}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              {/* BUTTON — "Cancel" (close delete confirmation modal without deleting)
                  Why: second chance to abort before permanent removal from the DB */}
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-[13.5px] font-medium text-[#374151] border border-[#E5E7EB] rounded-lg hover:bg-[#F8FAFC] transition-colors"
              >
                Cancel
              </button>
              {/* BUTTON — "Delete" (confirm permanent deletion of the component)
                  Why: once confirmed the DB row is removed; assessment forms using this slot
                  fall back to the hardcoded default description — this cannot be undone */}
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 bg-[#DC2626] text-white text-[13.5px] font-semibold rounded-lg hover:bg-[#B91C1C] transition-colors disabled:opacity-70"
              >
                {deleting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
                  : <><Trash2 className="w-4 h-4" /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
