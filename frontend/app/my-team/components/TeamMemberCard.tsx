'use client';

import { TeamMember, EVALUATION_STATUS_COLORS, STATUS_LABELS } from '../types';
import styles from '../styles/team-member-card.module.css';

interface TeamMemberCardProps {
  member: TeamMember;
  onEvaluate?: (memberId: string) => void;
}

export const TeamMemberCard = ({ member, onEvaluate }: TeamMemberCardProps) => {
  const statusColors = EVALUATION_STATUS_COLORS[member.status as keyof typeof EVALUATION_STATUS_COLORS];

  return (
    <div className={styles.memberCard}>
      <div className={styles.memberContent}>
        {/* Avatar */}
        <div className={styles.avatarContainer}>
          <div className={styles.avatar}>
            <span className={styles.avatarInitials}>
              {member.name
                .split(' ')
                .map((n: string) => n[0])
                .join('')}
            </span>
          </div>
        </div>

        {/* Member Info */}
        <div className={styles.memberInfo}>
          <h3 className={styles.memberName}>{member.name}</h3>
          <p className={styles.memberRole}>{member.role}</p>
          <p className={styles.memberDepartment}>{member.department}</p>
        </div>
      </div>

      {/* Status and Action */}
      <div className={styles.memberActions}>
        <div
          className={styles.statusBadge}
          style={{
            backgroundColor: statusColors.bg,
            color: statusColors.text,
          }}
        >
          {STATUS_LABELS[member.status]}
        </div>

        <button
          className={styles.evaluateButton}
          onClick={() => onEvaluate?.(member.id)}
          type="button"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8 2V14M2 8H14"
              stroke="#FFFFFF"
              strokeWidth="1.33"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Evaluate</span>
        </button>
      </div>
    </div>
  );
};
