'use client';

/**
 * Branch Admin — Reports Landing Page
 * Shows departments as cards for selection.
 * UI mirrors HQ Admin (CountryCard layout) via DepartmentCard component.
 */

import React, { useState, useEffect } from 'react';
import { ChevronRight, Search, Briefcase } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import DepartmentCard from '@/components/DepartmentCard';
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

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (!user || user.role !== 'branch_admin') return null;

  const filtered = departments.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 py-2 pb-10 flex flex-col gap-8">
      <div className="max-w-[1225px] mx-auto w-full flex flex-col gap-8">

        {/* Breadcrumb */}
        <nav className="flex items-center text-[13px] text-[#64748B]">
          <a href="/branch-admin/dashboard" className="hover:text-[#1E293B] transition-colors">Home</a>
          <ChevronRight className="w-3.5 h-3.5 mx-1.5" />
          <span className="text-[#1E293B] font-medium">Reports</span>
        </nav>

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
        <div className="relative w-full md:w-[320px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Search department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 bg-white border border-[#E2E8F0] rounded-xl text-[14px] text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 focus:border-[#2563EB] transition-all"
          />
        </div>

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
          <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Briefcase className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">
              {search ? `No departments found matching "${search}"` : 'No departments found for your branch'}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
