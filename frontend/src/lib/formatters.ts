import { TEAM_MEMBER_STATUS } from './constants';

// Normalizes backend status values so filters, badges, and comparisons match reliably.
export const normalizeStatus = (status?: string | null): string =>
  status ? status.toLowerCase().trim().replaceAll('_', ' ') : '';

// Converts optional API values into a readable table cell value.
export const valueOrDash = (value: unknown): string | number => {
  if (value === null || value === undefined || value === '') return '-';
  return value as string | number;
};

// Parses scores from API strings/numbers while rejecting invalid values.
export const normalizeScore = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// Displays numeric scores consistently with two decimal places.
export const formatScore = (value: unknown): string => {
  const number = normalizeScore(value);
  return number === null ? '-' : number.toFixed(2);
};

// Formats notification timestamps as readable local dates and times.
export const formatNotificationTime = (value?: string | null): string => {
  if (!value) return 'Just now';

  const normalizedValue = value.includes('T') ? value : value.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalizedValue);
  const parsedDate = new Date(hasTimezone ? normalizedValue : `${normalizedValue}Z`);
  if (Number.isNaN(parsedDate.getTime())) return value;

  const now = new Date();
  const isToday = parsedDate.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = parsedDate.toDateString() === yesterday.toDateString();

  const time = parsedDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;

  return parsedDate.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: parsedDate.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

// Chooses a compact status badge color for team member cards.
export const getStatusBadgeClass = (status?: string): string => {
  switch (normalizeStatus(status)) {
    case TEAM_MEMBER_STATUS.pending:
      return 'bg-yellow-100 text-yellow-800';
    case TEAM_MEMBER_STATUS.inProgress:
      return 'bg-blue-100 text-blue-800';
    case TEAM_MEMBER_STATUS.completed:
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

// Chooses the rating badge color used by evaluation objective rows.
export const getRatingBadgeClass = (value: unknown): string => {
  const rating = normalizeScore(value);
  if (rating === null) return 'bg-gray-100 text-gray-600';
  if (rating >= 4) return 'bg-emerald-100 text-emerald-700';
  if (rating >= 3) return 'bg-yellow-100 text-yellow-700';
  if (rating >= 2) return 'bg-orange-100 text-orange-700';
  return 'bg-rose-100 text-rose-700';
};
