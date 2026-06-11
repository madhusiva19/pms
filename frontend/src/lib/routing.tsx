// Small routing adapter that lets the app use simple Link/router helpers
// while keeping page components clean and easy to read.
import NextLink from 'next/link';
import { usePathname, useParams, useRouter as useNextRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
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
  };
}
