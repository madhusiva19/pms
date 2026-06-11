import type { ObjectiveGroup } from '../types';

// Fallback objectives are used only when the backend has no performance records yet.
export const DEFAULT_OBJECTIVES: ObjectiveGroup[] = [
  {
    category: 'FINANCIAL FOCUS (30%)',
    items: [
      { name: 'Revenue Achievement', weight: '0.10', target: '4910.7M', actual: '4863.1M', achieve: '99.0', rating: 2.81 },
      { name: 'GP Achievement', weight: '0.10', target: '527.52M', actual: '454.82M', achieve: '86.2', rating: 1.0 },
    ],
  },
  {
    category: 'CUSTOMER FOCUS (30%)',
    items: [
      { name: 'NPS Index Score', weight: '0.10', target: '0.35', actual: '0.27', achieve: '78.0', rating: 2.0 },
      { name: 'GP on Personal Sales', weight: '0.04', target: '-', actual: 'High', achieve: '100', rating: 5.0 },
    ],
  },
  {
    category: 'HUMAN RESOURCES FOCUS (40%)',
    items: [
      { name: 'Statutory & Legal Compliance', weight: '0.20', target: '100%', actual: '100%', achieve: '100', rating: 3.0 },
      { name: '360 Degree Feedback', weight: '0.05', target: '0.85', actual: '0.81', achieve: '95.2', rating: 3.0 },
    ],
  },
];

export const DEFAULT_ADMIN_FEEDBACK =
  'The team member is performing strongly in statutory compliance and personal sales. Review the lowest scoring objectives, identify practical improvement actions, and set a follow-up checkpoint before final approval.';
