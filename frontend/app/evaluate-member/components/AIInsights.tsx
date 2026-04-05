'use client';

import React from 'react';
import styles from '../styles/page.module.css';

interface AIInsightsProps {
  summary: string;
  recommendation: string;
}

export const AIInsights = ({ summary, recommendation }: AIInsightsProps) => {
  return (
    <div className={styles.aiInsights}>
      <div className={styles.aiInsightsTitle}>
        <span className={styles.aiTag}>AI</span>
        Group Admin Feedback
      </div>
      <div className={styles.aiInsightsContent}>
        <p className={styles.aiInsightsParagraph}>{summary}</p>
        <p className={styles.aiInsightsRecommendation}>{recommendation}</p>
      </div>
    </div>
  );
};
