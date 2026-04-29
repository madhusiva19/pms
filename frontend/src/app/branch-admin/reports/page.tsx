'use client';

/**
 * Branch Admin — Reports Landing Page
 * Shows departments as cards for selection.
 * UI mirrors HQ Admin (CountryCard layout) via DepartmentCard component.
 */

import React, { useState, useEffect } from 'react';
import { Briefcase } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import DepartmentCard from '@/components/DepartmentCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import Breadcrumb from '@/components/Breadcrumb';
import SearchInput from '@/components/SearchInput';
import EmptyState from '@/components/EmptyState';
import { branchByCodeApi, departmentsApi } from '@/services/api';
import type { Department } from '@/types';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BranchAdminReportsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'branch_admin')) router.push('/');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.iata_branch_code) {
      setError('Branch code not assigned to your account. Please contact your administrator.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    branchByCodeApi.get(user.iata_branch_code)
      .then(branch => departmentsApi.getByBranch(branch.id))
      .then(depts => setDepartments(depts ?? []))
      .catch((err) => {
        console.error('Failed to load departments:', err);
        setError('Failed to load departments. Please try again.');
      })
      .finally(() => setLoading(false));
  }, [user?.iata_branch_code, authLoading]);

  if (authLoading || loading) return <LoadingSpinner />;
  if (!user || user.role !== 'branch_admin') return null;

  const filtered = departments.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 py-2 pb-10 flex flex-col gap-8">
      <div className="max-w-[1225px] mx-auto w-full flex flex-col gap-8">

        {/* Breadcrumb */}
        <Breadcrumb items={[{ label: 'Home', href: '/branch-admin/dashboard' }, { label: 'Reports' }]} />

        {/* Title */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Performance Reports</h1>
            <p className="text-[15px] text-[#4A5565] mt-1">
              Select a department to view detailed performance metrics and generate reports.
            </p>
          </div>
        </div>

        {/* Search */}
        <SearchInput value={search} onChange={setSearch} placeholder="Search department…" />

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center py-20 bg-red-50 rounded-2xl border border-dashed border-red-200">
            <p className="text-red-500 font-medium">{error}</p>
          </div>
        )}

        {/* Department Cards */}
        {!error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((dept) => (
              <DepartmentCard key={dept.id} department={dept} />
            ))}
          </div>
        )}

        {!error && filtered.length === 0 && (
          <EmptyState
            icon={Briefcase}
            message={search ? `No departments found matching "${search}"` : 'No departments found for your branch'}
          />
        )}

      </div>
    </div>
  );
}
