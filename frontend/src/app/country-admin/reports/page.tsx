'use client';

/**
 * Country Admin Reports Page (Branch Listing)
 * Displays a grid of branches within the country admin's assigned country (India)
 */

import React, { useState, useEffect } from 'react';
import { ChevronRight, Search, Building } from 'lucide-react';
import BranchCard from '@/components/BranchCard';
import { branchesApi } from '@/services/api';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import type { Branch } from '@/types';

export default function CountryAdminReportsPage() {
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
    if (authLoading) return;
    if (!user?.assigned_country_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    branchesApi.getByCountry(user.assigned_country_id, searchTerm)
      .then(data => setBranches(data || []))
      .catch(err => {
        console.error('Error fetching branches:', err);
        setBranches([]);
      })
      .finally(() => setLoading(false));
  }, [user?.assigned_country_id, authLoading, searchTerm]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user || user.role !== 'country_admin') {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="px-4 py-2 pb-10 flex flex-col gap-8">
      <div className="max-w-[1225px] mx-auto w-full flex flex-col gap-8">

        {/* Breadcrumb */}
        <nav className="flex items-center text-[13px] text-[#64748B]">
          <a href="/country-admin" className="hover:text-[#1E293B] transition-colors">Home</a>
          <ChevronRight className="w-3.5 h-3.5 mx-1.5" />
          <span className="text-[#1E293B] font-medium">Reports</span>
        </nav>

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
        <div className="relative w-full md:w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Search branch..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-11 pl-10 pr-4 bg-white border border-[#E2E8F0] rounded-xl text-[14px] text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 focus:border-[#2563EB] transition-all"
          />
        </div>

        {/* Branches Grid */}
        {branches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {branches.map((branch) => (
              <BranchCard key={branch.id} branch={branch} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Building className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">
              {searchTerm ? `No branches found matching "${searchTerm}"` : 'No branches available'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

