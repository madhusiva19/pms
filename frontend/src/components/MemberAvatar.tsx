'use client';

import styles from './sidebar.module.css';
import type { TeamMember } from '../types';

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface MemberAvatarProps {
  member?: TeamMember;
  name?: string;
  size?: 'small' | 'medium' | 'large';
}

export default function MemberAvatar({ member, name, size = 'medium' }: MemberAvatarProps) {
  const displayName = member?.name ?? name;
  const initials = getInitials(displayName);
  const title = member
    ? `${member.name} - ${member.role || 'Team Member'}`
    : (displayName ?? '');

  return (
    <div
      className={styles.avatarCircle}
      title={title}
      style={{ fontSize: size === 'small' ? '0.9rem' : size === 'large' ? '1.8rem' : '1.2rem' }}
    >
      {initials}
    </div>
  );
}
