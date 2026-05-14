from typing import TypedDict, Optional, List


class PerformanceReport(TypedDict):
    id: str
    country_id: str
    report_type: str        # 'mid_year' | 'year_end'
    report_year: int
    total_evaluated: Optional[int]
    avg_score: Optional[float]
    top_performers: Optional[int]
    completion_percentage: Optional[float]


class BranchPerformanceReport(TypedDict):
    id: str
    branch_id: str
    country_id: str
    report_type: str
    report_year: int
    total_evaluated: Optional[int]
    avg_score: Optional[float]
    top_performers: Optional[int]
    completion_percentage: Optional[float]


class BellCurveBucket(TypedDict):
    rating_range: str
    employee_count: int
    percentage: float
