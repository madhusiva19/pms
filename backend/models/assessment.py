from typing import TypedDict, Optional, List


class AssessmentItem(TypedDict):
    id: str
    assessment_id: str
    pillar: str             # 'ability' | 'aspiration' | 'leadership'
    component_number: int   # 1 | 2 | 3
    self_rating: Optional[str]          # 'H' | 'M' | 'L'
    self_example: Optional[str]
    supervisor_rating: Optional[str]    # 'H' | 'M' | 'L'
    supervisor_justification: Optional[str]


class PotentialAssessment(TypedDict):
    id: str
    employee_id: str
    supervisor_id: str
    appraisee_role: str
    appraisal_cycle: str
    status: str             # 'pending_self' | 'pending_supervisor' | 'completed'
    overall_ability: Optional[str]
    overall_aspiration: Optional[str]
    overall_leadership: Optional[str]
    talent_block: Optional[str]         # 'H' | 'M' | 'L'
