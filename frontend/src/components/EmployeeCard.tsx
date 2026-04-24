'use client';

/**
 * Employee Card Component
 * Displays employee information with name, ID, and designation
 * Used in Sub Dept Admin Reports landing page
 */

import React from 'react';
import { User, Briefcase } from 'lucide-react';
import Link from 'next/link';
import type { Employee } from '@/types';

interface EmployeeCardProps {
  employee: Employee;
}

export default function EmployeeCard({ employee }: EmployeeCardProps) {
  // Generate initials for avatar
  const initials = employee.full_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 flex flex-col gap-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ease-in-out">

      {/* Top row: avatar + employee info */}
      <div className="flex items-start gap-4">
        {/* Avatar — 56×56, light blue bg */}
        <div className="w-14 h-14 bg-[#EFF6FF] rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-[13px] font-bold text-[#155DFC]">{initials}</span>
        </div>

        {/* Employee name + details */}
        <div className="flex flex-col gap-2 flex-1 min-w-0 pt-0.5">
          <h3 className="text-[18px] font-semibold text-[#101828] leading-7 truncate">{employee.full_name}</h3>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px] text-[#4A5565]">
              <User className="w-4 h-4 flex-shrink-0" />
              <span className="font-mono text-[12px]">{employee.emp_id}</span>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[#4A5565]">
              <Briefcase className="w-4 h-4 flex-shrink-0" />
              <span>{employee.designation}</span>
            </div>
            <Link
              href={`/sub-dept-admin/reports/${employee.id}`}
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
