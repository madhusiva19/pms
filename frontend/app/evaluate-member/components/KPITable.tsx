'use client';

import React from 'react';
import { EvaluationCategory, EvaluationKPI } from '../types';
import styles from '../styles/page.module.css';

interface KPITableProps {
  categories: EvaluationCategory[];
}

const getRatingBadgeClass = (rating: number): string => {
  if (rating >= 4.5) return styles.badgeGreen;
  if (rating >= 3.5) return styles.badgeYellow;
  if (rating >= 2.5) return styles.badgeOrange;
  if (rating >= 1.5) return styles.badgeRed;
  return styles.badgeRed;
};

export const KPITable = ({ categories }: KPITableProps) => {
  const allKPIs = categories.flatMap((cat) =>
    cat.kpis.map((kpi) => ({
      ...kpi,
      categoryName: cat.name,
      categoryPercentage: cat.percentage,
    }))
  );

  return (
    <div className={styles.kpiContainer}>
      <table className={styles.kpiTable}>
        <thead className={styles.tableHeader}>
          <tr>
            <th className={styles.tableHeaderCell}>Objective</th>
            <th className={styles.tableHeaderCell}>Weight</th>
            <th className={styles.tableHeaderCell}>Target</th>
            <th className={styles.tableHeaderCell}>Actual</th>
            <th className={styles.tableHeaderCell}>Achieve %</th>
            <th className={styles.tableHeaderCell}>Rating</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category, catIndex) => (
            <React.Fragment key={`cat-${catIndex}`}>
              <tr className={styles.categoryRow}>
                <td colSpan={6} className={styles.categoryCell}>
                  {category.name} ({category.percentage}%)
                </td>
              </tr>
              {category.kpis.map((kpi) => (
                <tr key={kpi.id} className={styles.tableBodyRow}>
                  <td className={styles.tableDataCell}>{kpi.objective}</td>
                  <td className={styles.tableDataCell}>{kpi.weight.toFixed(2)}</td>
                  <td className={styles.tableDataCell}>{kpi.target}</td>
                  <td className={styles.tableDataCell}>{kpi.actual}</td>
                  <td className={styles.tableDataCell}>{kpi.achievePercentage.toFixed(1)}%</td>
                  <td className={styles.tableDataCell}>
                    <span className={`${styles.ratingBadge} ${getRatingBadgeClass(kpi.rating)}`}>
                      {kpi.rating.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};
