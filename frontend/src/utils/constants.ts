/**
 * Application constants and configuration
 */

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