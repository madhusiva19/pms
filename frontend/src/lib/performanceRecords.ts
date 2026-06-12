import type { ObjectiveGroup, ObjectiveItem, PerformanceRecord } from '../types';
import { valueOrDash } from './formatters';

// Checks whether an ID can be used with member-specific numeric backend endpoints.
export const isNumericId = (value: unknown): boolean => /^\d+$/.test(String(value || ''));

// Converts flat performance records into grouped objective sections for evaluation tables.
export const groupPerformanceRecords = (records: PerformanceRecord[]): ObjectiveGroup[] => {
  if (!records.length) return [];

  const groups = new Map<string, ObjectiveItem[]>();

  records.forEach((record) => {
    const category =
      record.category ||
      record.category_name ||
      record.focus_area ||
      record.section ||
      'PERFORMANCE RECORDS';

    if (!groups.has(category)) {
      groups.set(category, []);
    }

    groups.get(category)?.push({
      name: record.objective || record.metric_name || record.item_name || record.name || 'Performance Metric',
      weight: valueOrDash(record.weight),
      target: valueOrDash(record.target_value || record.target),
      actual: valueOrDash(record.actual_value || record.actual),
      achieve: valueOrDash(record.achievement_percentage || record.achieve || record.achieve_percentage),
      rating: valueOrDash(record.rating || record.score),
    });
  });

  return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
};
