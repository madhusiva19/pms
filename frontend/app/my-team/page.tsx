'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TeamMember, Admin, ADMIN_LEVEL_LABELS, ADMIN_LEVEL_DESCRIPTIONS } from './types';
import { TeamMemberCard } from './components/TeamMemberCard';
import { Breadcrumb } from './components/Breadcrumb';
import { PageHeader } from './components/PageHeader';
import { SearchBar } from './components/SearchBar';
import styles from './styles/page.module.css';

export default function MyTeamPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminId = searchParams.get('adminId') || 'admin_hq_001'; // Default to HQ Admin

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState<Admin | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTeamData = async () => {
      try {
        setLoading(true);

        // Fetch current admin details
        const adminResponse = await fetch(`http://localhost:5001/api/admin/${adminId}`);
        if (!adminResponse.ok) {
          throw new Error(`Failed to fetch admin: ${adminResponse.status}`);
        }
        const adminData = await adminResponse.json();
        setCurrentAdmin(adminData);

        // Fetch admin's direct team
        const teamResponse = await fetch(`http://localhost:5001/api/admin/${adminId}/team`);
        if (!teamResponse.ok) {
          throw new Error(`Failed to fetch team: ${teamResponse.status}`);
        }
        const teamData = await teamResponse.json();
        setTeamMembers(teamData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch team data:', err);
        setError('Failed to load team data. Please make sure the backend is running on http://localhost:5001');
        setTeamMembers([]);
        setCurrentAdmin(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTeamData();
  }, [adminId]);

  const filteredMembers = useMemo(() => {
    return teamMembers.filter((member) => {
      const matchesSearch =
        member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (member.title || member.role || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.department.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = selectedStatus === 'all' || member.status === selectedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [teamMembers, searchQuery, selectedStatus]);

  const handleEvaluate = (memberId: string) => {
    const member = teamMembers.find((m) => m.id === memberId);
    if (member) {
      router.push(
        `/evaluate-member?memberId=${member.id}&memberName=${encodeURIComponent(member.name)}&adminId=${adminId}`
      );
    }
  };

  const pageTitle = currentAdmin ? `${currentAdmin.title}` : 'My Team';
  const pageSubtitle = currentAdmin
    ? `${ADMIN_LEVEL_DESCRIPTIONS[currentAdmin.level as 1 | 2 | 3 | 4 | 5]}`
    : 'Manage your team members';

  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainContent}>
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'My Team' }]} />
        <PageHeader title={pageTitle} subtitle={pageSubtitle} />

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
          {loading ? (
            <div className={styles.emptyState}>
              <p>Loading team members...</p>
            </div>
          ) : error ? (
            <div className={styles.emptyState}>
              <p style={{ color: '#ef4444' }}>{error}</p>
            </div>
          ) : filteredMembers.length > 0 ? (
            <div className={styles.teamList}>
              {filteredMembers.map((member) => (
                <TeamMemberCard 
                  key={member.id} 
                  member={member} 
                  onEvaluate={handleEvaluate}
                  isAdmin={member.level !== undefined}
                />
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