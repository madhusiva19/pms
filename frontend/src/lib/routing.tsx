// Small routing adapter that lets the app use simple Link/router helpers
// while keeping page components clean and easy to read.
import NextLink from 'next/link';
import { usePathname, useParams, useRouter as useNextRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, type ReactNode } from 'react';
import { ROLE_ROUTE_PREFIX, STORAGE_KEYS } from './constants';
import type { EntityId } from '../types';

type Href =
  | string
  | {
      pathname: string;
      query?: Record<string, EntityId>;
    };

interface LinkProps {
  href?: Href;
  to?: Href;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}

// Converts either a string path or a pathname/query object into a router URL.
const toPath = (href: Href | undefined): string => {
  if (!href) return '#';
  if (typeof href === 'string') return href;

  const params = new URLSearchParams();
  Object.entries(href.query || {}).forEach(([key, value]) => {
    if (value === undefined) return;

    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
      return;
    }

    params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `${href.pathname}?${query}` : href.pathname;
};

// Shared link component so pages can use href-style navigation consistently.
export default function Link({ href, to, className, onClick, children }: LinkProps) {
  return (
    <NextLink href={toPath(to || href)} className={className} onClick={onClick}>
      {children}
    </NextLink>
  );
}

// Reads the user's role from localStorage and returns role-prefixed route paths.
export function useRoutes() {
  const [prefix, setPrefix] = useState('/branch-admin');

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || 'null') as { role?: string } | null;
      const role = stored?.role || 'branch_admin';
      setPrefix(ROLE_ROUTE_PREFIX[role] || '/branch-admin');
    } catch {
      // keep default prefix
    }
  }, []);

  return {
    home: '/' as string,
    myTeam: `${prefix}/my-team`,
    members: `${prefix}/members`,
    approvals: `${prefix}/approvals`,
    evaluate: `${prefix}/evaluate`,
    rejection: `${prefix}/rejection`,
    statusTracking: `${prefix}/status-tracking`,
    enquiry: `${prefix}/enquiry`,
    notifications: `${prefix}/notifications`,
    testConnection: `${prefix}/test-connection`,
  };
}

// Small router helper that exposes pathname, query params, and programmatic push.
export function useRouter() {
  const router = useNextRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  const query = { ...params } as Record<string, EntityId>;

  // Merge query-string values with route params into one simple query object.
  searchParams?.forEach((value, key) => {
    query[key] = value;
  });

  return {
    pathname,
    query,
    push: (href: Href) => router.push(toPath(href)),
    prefetch: (href: string) => router.prefetch(href),
  };
}
