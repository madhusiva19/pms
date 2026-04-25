'use client';

/**
 * Sub Dept Admin — Reports Landing Page
 * Shows direct-report employees as cards for selection
 */

import React, { useState, useEffect } from 'react';
import { ChevronRight, Search, User, Hash, Briefcase } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { employeesApi } from '@/services/api';
import type { Employee } from '@/types';

// ── Employee Card ─────────────────────────────────────────────

function EmployeeCard({ employee }: { employee: Employee }) {
  const router = useRouter();
  const initials = employee.full_name.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-l p-6 flex flex-col gap-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ease-in-out">

      {/* Top row: avatar + employee info */}
      <div className="flex items-start gap-4">

        {/* Avatar box — 56×56, light blue bg */}
        <div className="w-14 h-14 bg-[#EFF6FF] rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-[16px] font-bold text-[#155DFC]">{initials}</span>
        </div>

        {/* Employee name + stats */}
        <div className="flex flex-col gap-2 flex-1 min-w-0 pt-0.5">
          <h3 className="text-[18px] font-semibold text-[#101828] leading-7">{employee.full_name}</h3>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px] text-[#4A5565]">
              <Hash className="w-4 h-4 flex-shrink-0" />
              <span className="font-mono">{employee.id}</span>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[#4A5565]">
              <Briefcase className="w-4 h-4 flex-shrink-0" />
              <span>{employee.designation}</span>
            </div>
            <button
              onClick={() => router.push(`/sub-dept-admin/reports/${employee.id}`)}
              className="w-full flex items-center justify-center h-9 px-4 bg-[#2563EB] text-white text-[13.5px] font-medium rounded-lg hover:bg-[#1D4ED8] active:scale-[0.98] transition-all duration-200"
            >
              View Reports
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function SubDeptAdminReportsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'sub_dept_admin')) router.push('/');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.sub_department_id) {
      setError('Sub-department not assigned to your account. Please contact your administrator.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    employeesApi.getBySubDepartment(user.sub_department_id)
      .then(emps => setEmployees(emps ?? []))
      .catch(err => {
        console.error('Error fetching employees:', err);
        setError('Failed to load employees. Please try again.');
      })
      .finally(() => setLoading(false));
  }, [user?.sub_department_id, authLoading]);

  if (authLoading || loading) return (
    <div className="flex items-center justify-center p-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
  if (!user || user.role !== 'sub_dept_admin') return null;

  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    e.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 py-2 pb-10 flex flex-col gap-8">
      <div className="max-w-[1225px] mx-auto w-full flex flex-col gap-8">

        {/* Breadcrumb */}
        <nav className="flex items-center text-[13px] text-[#64748B]">
          <a href="/sub-dept-admin/dashboard" className="hover:text-[#1E293B] transition-colors">Home</a>
          <ChevronRight className="w-3.5 h-3.5 mx-1.5" />
          <span className="text-[#1E293B] font-medium">Reports</span>
        </nav>

        {/* Title */}
        <div>
          <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Team Performance Reports</h1>
          <p className="text-[15px] text-[#4A5565] mt-1">View performance reports for your direct reports.</p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Search employee…"
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

        {/* Employee Cards */}
        {!error && filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((employee) => (
              <EmployeeCard key={employee.id} employee={employee} />
            ))}
          </div>
        ) : !error && (
          <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <User className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">
              {search ? `No employees found matching "${search}"` : 'No employees found for your sub-department'}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
