'use client';

/**
 * Sub Department Card Component
 * Displays sub-department/team information with employee count and admin name
 * Used in Dept Admin Reports landing page
 */

import React from 'react';
import { Users, User, GitBranch } from 'lucide-react';
import Link from 'next/link';
import type { SubDepartment } from '@/types';

interface SubDepartmentCardProps {
  subDepartment: SubDepartment;
  deptId: string;
}

export default function SubDepartmentCard({ subDepartment, deptId }: SubDepartmentCardProps) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 flex flex-col gap-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ease-in-out">

      {/* Top row: icon + team info */}
      <div className="flex items-start gap-4">
        {/* Icon box — 56×56, light blue bg */}
        <div className="w-14 h-14 bg-[#EFF6FF] rounded-xl flex items-center justify-center flex-shrink-0">
          <GitBranch className="w-8 h-8 text-[#155DFC]" />
        </div>

        {/* Team name + stats */}
        <div className="flex flex-col gap-2 flex-1 min-w-0 pt-0.5">
          <h3 className="text-[18px] font-semibold text-[#101828] leading-7">{subDepartment.name}</h3>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px] text-[#4A5565]">
              <Users className="w-4 h-4 flex-shrink-0" />
              <span>{(subDepartment.total_employees || 0).toLocaleString()} Employees</span>
            </div>
            {subDepartment.sub_dept_admin_name && (
              <div className="flex items-center gap-2 text-[13px] text-[#4A5565]">
                <User className="w-4 h-4 flex-shrink-0" />
                <span>{subDepartment.sub_dept_admin_name}</span>
              </div>
            )}
            <Link
              href={`/dept-admin/reports/${subDepartment.id}`}
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
