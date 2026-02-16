export interface EvaluationKPI {
  id: string;
  objective: string;
  weight: number;
  target: string | number;
  actual: string | number;
  achievePercentage: number;
  rating: number;
}

export interface EvaluationCategory {
  name: string;
  percentage: number;
  kpis: EvaluationKPI[];
}

export interface EvaluationData {
  memberId: string;
  memberName: string;
  memberRole: string;
  memberDepartment: string;
  overallScore: number;
  period: string;
  categories: EvaluationCategory[];
  aiInsights: {
    summary: string;
    recommendation: string;
  };
}

export interface RatingBadgeConfig {
  color: 'bg-orange-50' | 'bg-red-50' | 'bg-yellow-50' | 'bg-green-50' | 'bg-blue-50';
  textColor: 'text-orange-900' | 'text-red-900' | 'text-yellow-900' | 'text-green-900' | 'text-blue-900';
  borderColor: 'border-orange-200' | 'border-red-200' | 'border-yellow-200' | 'border-green-200' | 'border-blue-200';
}
