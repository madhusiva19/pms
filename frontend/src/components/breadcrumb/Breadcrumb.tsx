'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import styles from './breadcrumb.module.css';

export default function Breadcrumb() {
  const pathname = usePathname();

  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((seg, i, arr) => ({
      label: seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      href: '/' + arr.slice(0, i + 1).join('/'),
      isLast: i === arr.length - 1,
    }));

  return (
    <nav className={styles.breadcrumb}>
      <Link href="/" className={styles.homeLink}>
        <Home size={14} />
      </Link>

      {segments.map((seg) => (
        <span key={seg.href} className={styles.segment}>
          <ChevronRight size={14} className={styles.separator} />
          {seg.isLast ? (
            <span className={styles.current}>{seg.label}</span>
          ) : (
            <Link href={seg.href} className={styles.link}>{seg.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}