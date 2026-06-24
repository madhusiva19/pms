'use client';

import { Calendar } from 'lucide-react';

interface Props {
  description?: string;
}

export default function YearEndEmptyState({
  description = 'Year-End appraisal results will be available once the H2 cycle is completed.',
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 rounded-xl border border-dashed border-[#E5E7EB] bg-[#F9FAFB]">
      <Calendar className="w-10 h-10 text-[#CBD5E1]" />
      <div className="text-center">
        <p className="text-[15px] font-semibold text-[#64748B]">Year-End Data Not Yet Available</p>
        <p className="text-[13px] text-[#94A3B8] mt-1">{description}</p>
      </div>
    </div>
  );
}
