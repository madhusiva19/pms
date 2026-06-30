import type { ObjectiveGroup } from '../types';

// Three performance profiles used as fallbacks when the DB has no records.
// Each member is assigned a profile with (memberId % 3), then the actuals and
// ratings are scaled proportionally to the member's overall score so every
// member gets visually distinct, internally-consistent data.
const PROFILES: ObjectiveGroup[][] = [
  // ── Profile 0: Strong performer ──────────────────────────────────────────
  [
    {
      category: 'FINANCIAL FOCUS (30%)',
      items: [
        { name: 'Revenue Achievement', weight: '0.10', target: '4910.7M', actual: '5205.4M', achieve: '106.0', rating: 4.2 },
        { name: 'GP Achievement',      weight: '0.10', target: '527.52M', actual: '538.1M',  achieve: '102.0', rating: 3.8 },
      ],
    },
    {
      category: 'CUSTOMER FOCUS (30%)',
      items: [
        { name: 'NPS Index Score',      weight: '0.10', target: '0.35', actual: '0.38',  achieve: '108.0', rating: 4.5 },
        { name: 'GP on Personal Sales', weight: '0.04', target: '-',    actual: 'High',  achieve: '100',   rating: 5.0 },
      ],
    },
    {
      category: 'HUMAN RESOURCES FOCUS (40%)',
      items: [
        { name: 'Statutory & Legal Compliance', weight: '0.20', target: '100%', actual: '100%', achieve: '100', rating: 4.0 },
        { name: '360 Degree Feedback',          weight: '0.05', target: '0.85', actual: '0.88', achieve: '103.5', rating: 4.0 },
      ],
    },
  ],

  // ── Profile 1: Average performer ─────────────────────────────────────────
  [
    {
      category: 'FINANCIAL FOCUS (30%)',
      items: [
        { name: 'Revenue Achievement', weight: '0.10', target: '4910.7M', actual: '4863.1M', achieve: '99.0', rating: 2.81 },
        { name: 'GP Achievement',      weight: '0.10', target: '527.52M', actual: '454.82M', achieve: '86.2', rating: 1.0  },
      ],
    },
    {
      category: 'CUSTOMER FOCUS (30%)',
      items: [
        { name: 'NPS Index Score',      weight: '0.10', target: '0.35', actual: '0.27', achieve: '78.0', rating: 2.0 },
        { name: 'GP on Personal Sales', weight: '0.04', target: '-',    actual: 'High', achieve: '100',  rating: 5.0 },
      ],
    },
    {
      category: 'HUMAN RESOURCES FOCUS (40%)',
      items: [
        { name: 'Statutory & Legal Compliance', weight: '0.20', target: '100%', actual: '100%', achieve: '100',  rating: 3.0 },
        { name: '360 Degree Feedback',          weight: '0.05', target: '0.85', actual: '0.81', achieve: '95.2', rating: 3.0 },
      ],
    },
  ],

  // ── Profile 2: Needs improvement ─────────────────────────────────────────
  [
    {
      category: 'FINANCIAL FOCUS (30%)',
      items: [
        { name: 'Revenue Achievement', weight: '0.10', target: '4910.7M', actual: '4200.0M', achieve: '85.5', rating: 2.1 },
        { name: 'GP Achievement',      weight: '0.10', target: '527.52M', actual: '368.2M',  achieve: '69.8', rating: 1.0 },
      ],
    },
    {
      category: 'CUSTOMER FOCUS (30%)',
      items: [
        { name: 'NPS Index Score',      weight: '0.10', target: '0.35', actual: '0.21', achieve: '60.0', rating: 1.5 },
        { name: 'GP on Personal Sales', weight: '0.04', target: '-',    actual: 'Low',  achieve: '72',   rating: 2.0 },
      ],
    },
    {
      category: 'HUMAN RESOURCES FOCUS (40%)',
      items: [
        { name: 'Statutory & Legal Compliance', weight: '0.20', target: '100%', actual: '92%',  achieve: '92.0', rating: 2.5 },
        { name: '360 Degree Feedback',          weight: '0.05', target: '0.85', actual: '0.71', achieve: '83.5', rating: 2.0 },
      ],
    },
  ],
];

// Parses "4863.1M" → 4863.1, "100%" → 100, "0.35" → 0.35.
// Returns null for non-numeric actuals ("High", "Low", "-").
function parseActualM(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) && cleaned.length > 0 ? num : null;
}

// Re-attaches the original unit suffix ("M", "%", "") after scaling.
function formatActualM(scaled: number, original: string): string {
  const suffix = original.replace(/[0-9.]/g, '').trim();
  return scaled.toFixed(2).replace(/\.?0+$/, '') + suffix;
}

// Scales a profile's actuals, achieve%, and ratings proportionally to `factor`.
function scaleProfile(profile: ObjectiveGroup[], factor: number): ObjectiveGroup[] {
  return profile.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const baseRating  = Number(item.rating);
      const baseAchieve = parseFloat(String(item.achieve));
      const baseActualM = parseActualM(String(item.actual));

      const scaledRating  = Number.isFinite(baseRating)
        ? +Math.min(5, baseRating * factor).toFixed(2)
        : item.rating;
      const scaledAchieve = Number.isFinite(baseAchieve)
        ? +Math.min(100, baseAchieve * factor).toFixed(1)
        : item.achieve;
      const scaledActual  = baseActualM !== null
        ? formatActualM(Math.min(baseActualM * factor, baseActualM * 1.25), String(item.actual))
        : item.actual;

      return { ...item, rating: scaledRating, achieve: scaledAchieve, actual: scaledActual };
    }),
  }));
}

// Computes a rough overall score for a profile (weighted average of ratings).
function profileBaseScore(profile: ObjectiveGroup[]): number {
  const items = profile.flatMap((g) => g.items);
  const weights = items.map((i) => parseFloat(String(i.weight)) || 0.1);
  const ratings = items.map((i) => Number(i.rating) || 3);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.reduce((sum, w, i) => sum + (w / total) * ratings[i], 0);
}

/**
 * Returns member-specific objectives.
 *
 * Logic:
 *  1. Assign a profile from PROFILES[memberId % 3] so every member gets a
 *     structurally different dataset regardless of whether overallScore is set.
 *  2. If the member's overallScore is available, scale that profile's actuals
 *     and ratings proportionally so the numbers match the displayed score.
 */
export function generateObjectivesForScore(
  score: number | string | undefined | null,
  memberId?: string | number,
): ObjectiveGroup[] {
  // Using % 7 then % 3 produces a better spread than % 3 alone — IDs that are
  // multiples of 3 apart (e.g. 2306 and 2315) still get different profiles.
  const profileIdx = ((Number(memberId) || 0) % 7) % 3; // always 0–2
  const profile    = PROFILES[profileIdx];

  const numericScore = Number(score);
  if (Number.isFinite(numericScore) && numericScore > 0) {
    const base   = profileBaseScore(profile);
    const factor = base > 0 ? numericScore / base : 1;
    return scaleProfile(profile, factor);
  }

  return profile;
}

export const DEFAULT_OBJECTIVES: ObjectiveGroup[] = PROFILES[1];

export const DEFAULT_ADMIN_FEEDBACK =
  'The team member is performing strongly in statutory compliance and personal sales. Review the lowest scoring objectives, identify practical improvement actions, and set a follow-up checkpoint before final approval.';
