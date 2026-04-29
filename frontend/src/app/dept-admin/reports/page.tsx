'use client';

/**
 * Dept Admin — Reports Landing Page
 * Shows teams/sub-departments as cards for selection
 */

import { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import SubDepartmentCard from '@/components/SubDepartmentCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import Breadcrumb from '@/components/Breadcrumb';
import SearchInput from '@/components/SearchInput';
import EmptyState from '@/components/EmptyState';
import { subDepartmentsApi } from '@/services/api';
import type { SubDepartment } from '@/types';

// ── Page ──────────────────────────────────────────────────────

export default function DeptAdminReportsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [teams, setTeams] = useState<SubDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'dept_admin')) router.push('/');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.department_id) {
      setError('Department not assigned to your account. Please contact your administrator.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    subDepartmentsApi.getByDepartment(user.department_id)
      .then(subdepts => setTeams(subdepts ?? []))
      .catch(err => {
        console.error('Error fetching sub-departments:', err);
        setError('Failed to load sub-departments. Please try again.');
      })
      .finally(() => setLoading(false));
  }, [user?.department_id, authLoading]);

  if (authLoading || loading) return <LoadingSpinner />;
  if (!user || user.role !== 'dept_admin') return null;

  const filtered = teams.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 py-2 pb-10 flex flex-col gap-8">
      <div className="max-w-[1225px] mx-auto w-full flex flex-col gap-8">

        {/* Breadcrumb */}
        <Breadcrumb items={[{ label: 'Home', href: '/dept-admin/dashboard' }, { label: 'Reports' }]} />

        {/* Title */}
        <div>
          <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Performance Reports</h1>
          <p className="text-[15px] text-[#4A5565] mt-1">Select a sub department to view detailed performance metrics and generate reports.</p>
        </div>

        {/* Search */}
        <SearchInput value={search} onChange={setSearch} placeholder="Search sub department…" />

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center py-20 bg-red-50 rounded-2xl border border-dashed border-red-200">
            <p className="text-red-500 font-medium">{error}</p>
          </div>
        )}

        {/* Team Cards */}
        {!error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((team) => (
              <SubDepartmentCard key={team.id} subDepartment={team} deptId={user.department_id || ''} />
            ))}
          </div>
        )}

        {!error && filtered.length === 0 && (
          <EmptyState
            icon={BarChart3}
            message={search ? `No sub departments found matching "${search}"` : 'No sub departments found for your department'}
          />
        )}

      </div>
    </div>
  );
}
