import type { AssessmentStatus } from '@/types';

export const statusBadge: Record<AssessmentStatus, { label: string; cls: string }> = {
  not_started:        { label: 'Not Started',   cls: 'bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]' },
  pending_self:       { label: 'Pending Self',   cls: 'bg-[#FEF9C3] text-[#92400E] border-[#FDE68A]' },
  pending_supervisor: { label: 'Pending Review', cls: 'bg-[#DBEAFE] text-[#1D4ED8] border-[#93C5FD]' },
  completed:          { label: 'Completed',      cls: 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]' },
};


