'use client';

import React from 'react';
import styles from '../styles/page.module.css';

interface ProfileCardProps {
  memberName: string;
  memberRole: string;
  memberDepartment: string;
  period: string;
  overallScore: number;
}

export const ProfileCard = ({
  memberName,
  memberRole,
  memberDepartment,
  period,
  overallScore,
}: ProfileCardProps) => {
  return (
    <div className={styles.profileCard}>
      <div className={styles.profileInfo}>
        <h1 className={styles.profileName}>{memberName}</h1>
        <p className={styles.profileRole}>
          {memberRole} • {memberDepartment}
        </p>
        <p className={styles.profilePeriod}>Period: {period}</p>
      </div>
      <div className={styles.scoreBadge}>
        <div className={styles.scoreValue}>{overallScore.toFixed(2)}</div>
        <div className={styles.scoreLabel}>Overall Score</div>
      </div>
    </div>
  );
};
