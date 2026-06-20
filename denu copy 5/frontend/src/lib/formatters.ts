import { TEAM_MEMBER_STATUS } from './constants';

// Normalizes backend status values so filters, badges, and comparisons match reliably.
export const normalizeStatus = (status?: string | null): string =>
  status ? status.toLowerCase().trim().replaceAll('_', ' ') : '';

// Formats a role key from the team_members table into a readable label.
// e.g. "sub_dept_admin" → "Sub Dept Admin", "employee" → "Employee"
export const formatRole = (role?: string | null): string => {
  if (!role) return '';
  return role
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

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

// Returns the CSS module key for the status badge (look up via viewStyles[key]).
export const getStatusBadgeClass = (status?: string): string => {
  switch (normalizeStatus(status)) {
    case TEAM_MEMBER_STATUS.pending:    return 'statusPending';
    case TEAM_MEMBER_STATUS.inProgress: return 'statusInProgress';
    case TEAM_MEMBER_STATUS.completed:  return 'statusCompleted';
    default:                            return 'statusDefault';
  }
};

// Returns the CSS module key for the rating badge (look up via viewStyles[key]).
export const getRatingBadgeClass = (value: unknown): string => {
  const rating = normalizeScore(value);
  if (rating === null) return 'ratingGray';
  if (rating >= 4)     return 'ratingGreen';
  if (rating >= 3)     return 'ratingYellow';
  if (rating >= 2)     return 'ratingOrange';
  return 'ratingRed';
};
