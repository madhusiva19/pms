'use client';

import styles from '../styles/breadcrumb.module.css';

interface BreadcrumbProps {
  items: Array<{
    label: string;
    href?: string;
  }>;
}

export const Breadcrumb = ({ items }: BreadcrumbProps) => {
  return (
    <nav className={styles.breadcrumb}>
      {items.map((item: BreadcrumbProps['items'][0], index: number) => (
        <div key={index} className={styles.breadcrumbItem}>
          {item.href ? (
            <a href={item.href} className={styles.breadcrumbLink}>
              {item.label}
            </a>
          ) : (
            <span className={styles.breadcrumbText}>{item.label}</span>
          )}
          {index < items.length - 1 && (
            <span className={styles.breadcrumbSeparator}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 11L9 7L5 3"
                  stroke="#64748B"
                  strokeWidth="1.17"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
        </div>
      ))}
    </nav>
  );
};
