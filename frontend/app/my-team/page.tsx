'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TeamMember } from './types';
import { TeamMemberCard } from './components/TeamMemberCard';
import { Breadcrumb } from './components/Breadcrumb';
import { PageHeader } from './components/PageHeader';
import { SearchBar } from './components/SearchBar';
import styles from './styles/page.module.css';

// Initial team data
const initialTeamMembers: TeamMember[] = [
  { id: '1', name: 'L.E Senevirathna', role: 'Senior Software Engineer', department: 'Engineering', status: 'pending' },
  { id: '2', name: 'Michael Chen', role: 'Software Engineer', department: 'Engineering', status: 'in-progress' },
  { id: '3', name: 'Emily Rodriguez', role: 'Product Manager', department: 'Product', status: 'completed' },
  { id: '4', name: 'Lisa Anderson', role: 'Data Analyst', department: 'Analytics', status: 'in-progress' },
];

export default function MyTeamPage() {
  const router = useRouter();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(initialTeamMembers);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const filteredMembers = useMemo(() => {
    return teamMembers.filter((member) => {
      const matchesSearch =
        member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.department.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = selectedStatus === 'all' || member.status === selectedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [teamMembers, searchQuery, selectedStatus]);

  const handleEvaluate = (memberId: string) => {
    const member = teamMembers.find((m) => m.id === memberId);
    if (member) {
      router.push(`/evaluate-member?memberId=${member.id}&memberName=${encodeURIComponent(member.name)}`);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainContent}>
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'My Team' }]} />
        <PageHeader title="My Team" subtitle="Evaluate and manage your team members' performance" />

        <div className={styles.searchSection}>
          <SearchBar placeholder="Search team members..." value={searchQuery} onChange={setSearchQuery} />
        </div>

        <div className={styles.filterSection}>
          <label className={styles.filterLabel}>Filter by Status:</label>
          <div className={styles.filterButtons}>
            {['all', 'pending', 'in-progress', 'completed'].map((status) => (
              <button
                key={status}
                className={`${styles.filterButton} ${selectedStatus === status ? styles.active : ''}`}
                onClick={() => setSelectedStatus(status)}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.teamListSection}>
          {filteredMembers.length > 0 ? (
            <div className={styles.teamList}>
              {filteredMembers.map((member) => (
                <TeamMemberCard key={member.id} member={member} onEvaluate={handleEvaluate} />
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>No team members found matching your search criteria.</p>
            </div>
          )}
        </div>

        <div className={styles.summarySection}>
          <div className={styles.summaryCard}>
            <h3 className={styles.summaryTitle}>Team Summary</h3>
            <div className={styles.summaryStats}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Total Members</span>
                <span className={styles.statValue}>{teamMembers.length}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Pending Evaluations</span>
                <span className={styles.statValue}>
                  {teamMembers.filter((m) => m.status === 'pending').length}
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>In Progress</span>
                <span className={styles.statValue}>
                  {teamMembers.filter((m) => m.status === 'in-progress').length}
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Completed</span>
                <span className={styles.statValue}>
                  {teamMembers.filter((m) => m.status === 'completed').length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}