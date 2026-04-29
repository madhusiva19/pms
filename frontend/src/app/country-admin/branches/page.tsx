'use client';

/**
 * Country Admin Branches Listing Page
 * Displays a grid of branches within the country admin's assigned country
 */

import React, { useState, useEffect } from 'react';
import { Building } from 'lucide-react';
import BranchCard from '@/components/BranchCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import Breadcrumb from '@/components/Breadcrumb';
import SearchInput from '@/components/SearchInput';
import EmptyState from '@/components/EmptyState';
import { branchesApi } from '@/services/api';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import type { Branch } from '@/types';

export default function BranchesListingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Security check: verify user is country_admin
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'country_admin')) {
      router.push('/reports');
      return;
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        if (!user?.assigned_country_id) {
          console.error('Country admin without assigned country');
          setBranches([]);
          return;
        }

        setLoading(true);
        const data = await branchesApi.getByCountry(user.assigned_country_id, searchTerm);
        setBranches(data || []);
      } catch (error) {
        console.error('Error fetching branches:', error);
        setBranches([]);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading && user?.assigned_country_id) {
      fetchBranches();
    }
  }, [user?.assigned_country_id, authLoading, searchTerm]);

  if (authLoading) {
    return <LoadingSpinner />;
  }

  if (!user || user.role !== 'country_admin') {
    return null;
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="px-4 py-2 pb-10 flex flex-col gap-8">
      <div className="max-w-[1225px] mx-auto w-full flex flex-col gap-8">

        {/* Breadcrumb */}
        <Breadcrumb items={[{ label: 'Home', href: '/country-admin' }, { label: 'Branches' }]} />

        {/* Title & Stats Overview */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Branch Reports</h1>
            <p className="text-[15px] text-[#4A5565]">
              Select a branch to view detailed performance metrics and generate reports.
            </p>
          </div>
        </div>

        {/* Search bar */}
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search branch..." />

        {/* Branches Grid */}
        {branches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {branches.map((branch) => (
              <BranchCard key={branch.id} branch={branch} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Building}
            message={searchTerm ? `No branches found matching "${searchTerm}"` : 'No branches available'}
          />
        )}
      </div>
    </div>
  );
}

