'use client';

import styles from '../styles/page-header.module.css';

interface PageHeaderProps {
  title: string;
  subtitle: string;
}

export const PageHeader = ({ title, subtitle }: PageHeaderProps) => {
  return (
    <div className={styles.header}>
      <div className={styles.headerContent}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>
    </div>
  );
};
