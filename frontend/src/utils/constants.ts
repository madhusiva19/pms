/**
 * Application constants and configuration
 */

export const REPORT_YEAR = 2026;

export const FALLBACK_INSIGHT_MID_YEAR =
  'Distribution follows a normal curve with slight right skew. Top 18% performers exceed 4.5 rating. Recommend targeted development programs for the lower 15%';

export const FALLBACK_INSIGHT_YEAR_END =
  'Year-end performance shows improvement across all bands. Top performers increased by 37%. Distribution normalized successfully with 21% in exceptional category';

export const DEFAULT_RECOMMENDATIONS = [
  { text: 'Launch targeted coaching programs for the lower 15% to move them out of the 1.0–2.0 band.' },
  { text: 'Recognize and reward the high-performing 3.5–4.0 group to maintain their momentum.' },
  { text: 'Introduce leadership development programs to grow the top performer pool beyond 4.5.' },
  { text: 'Focus mid-level employees in the 3.0–3.5 band on skill development to push them into higher ratings.' },
];

export const OVERALL_TEAM_INSIGHT =
  'Year-over-year team performance shows progression. Compare mid-year and year-end scores to identify employees who improved, stayed stable, or need support.';

export const COLORS = {
  primary: '#1E3A8A', // Navy blue for sidebar
  secondary: '#3B82F6', // Blue for active states
  accent: '#2563EB', // Lighter blue for buttons
  background: '#F9FAFB',
  cardBackground: '#FFFFFF',
  text: {
    primary: '#1E293B',
    secondary: '#4A5565',
    muted: '#64748B',
  },
  chart: {
    red: '#EF4444',
    orange: '#F97316',
    amber: '#F59E0B',
    yellow: '#EAB308',
    lime: '#84CC16',
    green: '#22C55E',
    emerald: '#10B981',
    teal: '#059669',
  },
};

export const RATING_RANGES = [
  '1.0-1.5',
  '1.5-2.0',
  '2.0-2.5',
  '2.5-3.0',
  '3.0-3.5',
  '3.5-4.0',
  '4.0-4.5',
  '4.5-5.0',
];

export const RATING_LABELS = {
  '1.0-1.5': 'Unsatisfactory',
  '1.5-2.0': 'Needs Significant Improvement',
  '2.0-2.5': 'Needs Improvement',
  '2.5-3.0': 'Meets Minimum Expectations',
  '3.0-3.5': 'Meets Expectations',
  '3.5-4.0': 'Exceeds Expectations',
  '4.0-4.5': 'Excellent Performance',
  '4.5-5.0': 'Exceptional Performance',
};

export const CHART_COLORS = [
  COLORS.chart.red,
  COLORS.chart.orange,
  COLORS.chart.amber,
  COLORS.chart.yellow,
  COLORS.chart.lime,
  COLORS.chart.green,
  COLORS.chart.emerald,
  COLORS.chart.teal,
];