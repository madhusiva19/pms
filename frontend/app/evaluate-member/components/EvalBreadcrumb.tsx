'use client';

import React from 'react';
import styles from '../styles/page.module.css';

interface BreadcrumbProps {
  items: Array<{
    label: string;
    href?: string;
  }>;
}

const ChevronIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M5.25 2L9.25 7L5.25 12"
      stroke="#99A1AF"
      strokeWidth="1.16667"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const EvalBreadcrumb = ({ items }: BreadcrumbProps) => {
  return (
    <div className={styles.breadcrumbWrapper}>
      <nav style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', width: '14px' }}>
                <ChevronIcon />
              </div>
            )}
            <a
              href={item.href || '#'}
              style={{
                fontSize: '12.7px',
                color: '#64748B',
                textDecoration: 'none',
                fontFamily: 'Inter',
                fontWeight: 400,
              }}
            >
              {item.label}
            </a>
          </React.Fragment>
        ))}
      </nav>
    </div>
  );
};
