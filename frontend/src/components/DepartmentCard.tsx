'use client';

/**
 * Department Card Component
 * Displays department information with employee and sub-department counts
 * Used in Branch Admin Reports landing page
 */

import React from 'react';
import { Briefcase, Users, GitBranch } from 'lucide-react';
import Link from 'next/link';
import type { Department } from '@/types';

interface DepartmentCardProps {
  department: Department;
}

export default function DepartmentCard({ department }: DepartmentCardProps) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-l p-6 flex flex-col gap-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ease-in-out">


      {/* Top row: icon + department info */}
      <div className="flex items-start gap-4">
        {/* Icon box — 56×56, light blue bg */}
        <div className="w-14 h-14 bg-[#EFF6FF] rounded-xl flex items-center justify-center flex-shrink-0">
          <Briefcase className="w-8 h-8 text-[#155DFC]" />
        </div>

        {/* Department name + stats */}
        <div className="flex flex-col gap-2 flex-1 min-w-0 pt-0.5">
          <h3 className="text-[18px] font-semibold text-[#101828] leading-7">{department.name}</h3>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px] text-[#4A5565]">
              <Users className="w-4 h-4 flex-shrink-0" />
              <span>{(department.total_employees || 0).toLocaleString()} Employees</span>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[#4A5565]">
              <GitBranch className="w-4 h-4 flex-shrink-0" />
              <span>Sub-Departments</span>

            </div>
            <Link
              href={`/branch-admin/reports/${department.id}`}
              className="w-full flex items-center justify-center h-9 px-4 bg-[#2563EB] text-white text-[13.5px] font-medium rounded-lg hover:bg-[#1D4ED8] active:scale-[0.98] transition-all duration-200"

            >
              View Reports
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
