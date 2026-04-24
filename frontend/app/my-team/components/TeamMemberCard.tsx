'use client';

import React from 'react';
import styles from '../styles/team-member-card.module.css';
import { TeamMember } from '../types/index'; 

interface TeamMemberCardProps {
  member: TeamMember;
  onEvaluate?: (memberId: string) => void;
  isAdmin?: boolean;
}

export const TeamMemberCard = ({ member, onEvaluate, isAdmin = false }: TeamMemberCardProps) => {
  // For admins, use title; for employees, use role
  const displayRole = isAdmin ? member.title : (member.role || member.title);
  
  // Logic to handle CSS class mapping for status badges
  const statusKey = member.status ? member.status.replace('-', '') : 'pending';

  return (
    <div className={styles.memberCard}>
      <div className={styles.memberContent}>
        <div className={styles.avatarContainer}>
          <div className={styles.avatar}>
             {member.name.charAt(0)}
          </div>
        </div>

        <div className={styles.memberInfo}>
          <h3 className={styles.memberName}>{member.name}</h3>
          <p className={styles.memberRole}>{displayRole}</p>
          <p className={styles.memberDepartment}>{member.department}</p>
          {member.email && <p className={styles.memberEmail}>{member.email}</p>}
        </div>
      </div>

      <div className={styles.memberActions}>
        {member.status && (
          <span className={`${styles.statusBadge} ${styles[statusKey]}`}>
            {member.status}
          </span>
        )}

        {onEvaluate && (
          <button
            className={styles.evaluateButton}
            onClick={() => onEvaluate(member.id)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Evaluate
          </button>
        )}
      </div>
    </div>
  );
};