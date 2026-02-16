'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TeamMember } from './types';
import { Breadcrumb } from './components/Breadcrumb';
import { SearchBar } from './components/SearchBar';
import { PageHeader } from './components/PageHeader';
import { TeamMemberCard } from './components/TeamMemberCard';
import styles from './styles/page.module.css';

// Mock data - Replace with actual API call
const mockTeamMembers: TeamMember[] = [
  {
    id: '1',
    name: 'L.E Senevirathna',
    role: 'Senior Software Engineer',
    department: 'Engineering',
    avatar: 'LE',
    status: 'pending',
  },
  {
    id: '2',
    name: 'Michael Chen',
    role: 'Software Engineer',
    department: 'Engineering',
    avatar: 'MC',
    status: 'in-progress',
  },
  {
    id: '3',
    name: 'Emily Rodriguez',
    role: 'Product Manager',
    department: 'Product',
    avatar: 'ER',
    status: 'completed',
  },
  {
    id: '4',
    name: 'Lisa Anderson',
    role: 'Data Analyst',
    department: 'Analytics',
    avatar: 'LA',
    status: 'in-progress',
  },
];

export default function MyTeamPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Filter team members
  const filteredMembers = useMemo(() => {
    return mockTeamMembers.filter((member) => {
      const matchesSearch =
        member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.department.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = selectedStatus === 'all' || member.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, selectedStatus]);

  const handleEvaluate = (memberId: string) => {
    // Find the member data
    const member = mockTeamMembers.find((m) => m.id === memberId);
    if (member) {
      // Navigate to evaluate-member page with member ID
      router.push(`/evaluate-member?memberId=${memberId}&memberName=${encodeURIComponent(member.name)}`);
    }
  };

  return (
    <div className={styles.pageContainer}>
      {/* Sidebar would be here in full implementation */}

      <main className={styles.mainContent}>
        {/* Breadcrumb Navigation */}
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'My Team' },
          ]}
        />

        {/* Page Header */}
        <PageHeader
          title="My Team"
          subtitle="Evaluate and manage your team members' performance"
        />

        {/* Search Bar */}
        <div className={styles.searchSection}>
          <SearchBar
            placeholder="Search team members..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>

        {/* Status Filter */}
        <div className={styles.filterSection}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Filter by Status:</label>
            <div className={styles.filterButtons}>
              {['all', 'pending', 'in-progress', 'completed'].map((status) => (
                <button
                  key={status}
                  className={`${styles.filterButton} ${
                    selectedStatus === status ? styles.active : ''
                  }`}
                  onClick={() => setSelectedStatus(status)}
                >
                  {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Team Members List */}
        <div className={styles.teamListSection}>
          {filteredMembers.length > 0 ? (
            <div className={styles.teamList}>
              {filteredMembers.map((member) => (
                <TeamMemberCard
                  key={member.id}
                  member={member}
                  onEvaluate={handleEvaluate}
                />
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>No team members found matching your search criteria.</p>
            </div>
          )}
        </div>

        {/* Summary Section */}
        <div className={styles.summarySection}>
          <div className={styles.summaryCard}>
            <h3 className={styles.summaryTitle}>Team Summary</h3>
            <div className={styles.summaryStats}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Total Members</span>
                <span className={styles.statValue}>{mockTeamMembers.length}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Pending Evaluations</span>
                <span className={styles.statValue}>
                  {mockTeamMembers.filter((m) => m.status === 'pending').length}
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>In Progress</span>
                <span className={styles.statValue}>
                  {mockTeamMembers.filter((m) => m.status === 'in-progress').length}
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Completed</span>
                <span className={styles.statValue}>
                  {mockTeamMembers.filter((m) => m.status === 'completed').length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
