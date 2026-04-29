'use client';

/**
 * Sub Dept Admin — Reports Landing Page
 * Shows direct-report employees as cards for selection
 */

import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import EmployeeCard from '@/components/EmployeeCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import Breadcrumb from '@/components/Breadcrumb';
import SearchInput from '@/components/SearchInput';
import EmptyState from '@/components/EmptyState';
import { employeesApi } from '@/services/api';
import type { Employee } from '@/types';

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

  if (authLoading || loading) return <LoadingSpinner />;
  if (!user || user.role !== 'sub_dept_admin') return null;

  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    e.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 py-2 pb-10 flex flex-col gap-8">
      <div className="max-w-[1225px] mx-auto w-full flex flex-col gap-8">

        {/* Breadcrumb */}
        <Breadcrumb items={[{ label: 'Home', href: '/sub-dept-admin/dashboard' }, { label: 'Reports' }]} />

        {/* Title */}
        <div>
          <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Team Performance Reports</h1>
          <p className="text-[15px] text-[#4A5565] mt-1">View performance reports for your direct reports.</p>
        </div>

        {/* Search */}
        <SearchInput value={search} onChange={setSearch} placeholder="Search employee…" />

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
          <EmptyState
            icon={User}
            message={search ? `No employees found matching "${search}"` : 'No employees found for your sub-department'}
          />
        )}

      </div>
    </div>
  );
}
