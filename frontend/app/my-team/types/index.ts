export type EvaluationStatus = 'pending' | 'in-progress' | 'completed';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  department: string;
  avatar: string;
  avatarColor?: string;
  status: EvaluationStatus;
}

export interface SearchFilters {
  searchQuery: string;
  statusFilter?: EvaluationStatus | 'all';
}

export const EVALUATION_STATUS_COLORS: Record<EvaluationStatus, { bg: string; text: string }> = {
  pending: {
    bg: '#F3F4F6',
    text: '#1E2939',
  },
  'in-progress': {
    bg: '#FEF9C2',
    text: '#894B00',
  },
  completed: {
    bg: '#DCFCE7',
    text: '#016630',
  },
};

export const STATUS_LABELS: Record<EvaluationStatus, string> = {
  pending: 'pending',
  'in-progress': 'in progress',
  completed: 'completed',
};
