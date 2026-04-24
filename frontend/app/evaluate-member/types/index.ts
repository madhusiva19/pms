// Represents a single KPI
export interface EvaluationKPI {
  id: string;
  objective: string;
  weight: number;
  target: string;
  actual: string;
  achievePercentage: number;
  rating: number;
}

// Represents a KPI category containing multiple KPIs
export interface EvaluationCategory {
  name: string;
  percentage: number; // Category weight
  kpis: EvaluationKPI[];
}