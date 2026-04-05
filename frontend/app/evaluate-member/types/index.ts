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
