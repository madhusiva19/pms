import viewStyles from '../styles/views.module.css';
// My Team page: fetches team members, filters them, and starts evaluation-related work.
import { useState, useEffect } from 'react';
import Link from '../lib/routing';
import { useRoutes } from '../lib/routing';
import { getTeamMembers } from '../lib/api';
import Sidebar from '../components/Sidebar';
import LoadingScreen from '../components/LoadingScreen';
import { TEAM_MEMBER_STATUS } from '../lib/constants';
import { saveStoredMember, readTeamMembersCache, saveTeamMembersCache } from '../lib/currentMember';
import { formatRole, getStatusBadgeClass, normalizeStatus } from '../lib/formatters';
import type { TeamMember, TeamMemberStatus } from '../types';

const STATUS_FILTERS = [
  { label: 'All', value: TEAM_MEMBER_STATUS.all },
  { label: 'Pending', value: TEAM_MEMBER_STATUS.pending },
  { label: 'In Process', value: TEAM_MEMBER_STATUS.inProgress },
  { label: 'Completed', value: TEAM_MEMBER_STATUS.completed },
] as const;

export default function MyTeam({ roleFilter }: { roleFilter?: string } = {}) {
  const routes = useRoutes();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStatus, setActiveStatus] = useState<TeamMemberStatus>(TEAM_MEMBER_STATUS.all);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = readTeamMembersCache();
    if (cached.length > 0) {
      setTeamMembers(cached);
      setLoading(false);
    }

    const fetchTeamMembers = async () => {
      try {
        const response = await getTeamMembers();
        const members = roleFilter
          ? response.data.filter((m) => m.role === roleFilter)
          : response.data;
        setTeamMembers(members);
        saveTeamMembersCache(members);
      } catch (error) {
        console.error('Error fetching team members:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTeamMembers();
  }, [roleFilter]);

  // Pending = total minus those already in-progress or completed.
  const inProgressCount = teamMembers.filter((m) => normalizeStatus(m.status) === TEAM_MEMBER_STATUS.inProgress).length;
  const completedCount = teamMembers.filter((m) => normalizeStatus(m.status) === TEAM_MEMBER_STATUS.completed).length;
  const summary = {
    all: teamMembers.length,
    pending: teamMembers.length - inProgressCount - completedCount,
    inProgress: inProgressCount,
    completed: completedCount,
  };

  // Applies both the selected status filter and search input to the team list.
  const filteredMembers = teamMembers.filter((member) => {
    // Match all statuses when "All" is selected; otherwise match the selected status.
    const matchesStatus = activeStatus === TEAM_MEMBER_STATUS.all
      ? true 
      : normalizeStatus(member.status) === activeStatus;
    
    // Match team members whose names include the search text.
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // A member is shown only when both filters match.
    return matchesStatus && matchesSearch;
  });

  return (
    <div className={viewStyles.v031}>
      <Sidebar />

      <main className={viewStyles.v032}>
        <div className={viewStyles.v081}>
          {/* Header */}
          <div className={viewStyles.v054}>
            <h1 className={viewStyles.v036}>My Team</h1>
            <p className={viewStyles.v082}>Evaluate and manage your team members' performance</p>
          </div>

          {/* Quick links into the evaluation workflow pages. */}
          <div className={viewStyles.v119}>
            <Link
              href={routes.approvals}
              className={viewStyles.v120}
            >
              Approvals
            </Link>
            <Link
              href={routes.rejection}
              className={viewStyles.v121}
            >
              Rejection
            </Link>
            <Link
              href={routes.statusTracking}
              className={viewStyles.v122}
            >
               Status Tracking
            </Link>
            <Link
              href={routes.notifications}
              className={viewStyles.v123}
            >
               Notifications
            </Link>
          </div>





          {/* Search input updates searchTerm and immediately filters the member list. */}
          <div className={viewStyles.v054}>
            <label className={viewStyles.v084}>Search Team Members</label>
            <input
              type="text"
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={viewStyles.v124}
            />
          </div>



          {/* Summary cards give a fast count of total and status-based members. */}
          <div className={viewStyles.v103}>
            <h2 className={viewStyles.v104}>Team Member Summary</h2>
            <div className={viewStyles.v105}>
              <div className={viewStyles.v106}>
                <p className={viewStyles.v107}>{summary.all}</p>
                <p className={viewStyles.v108}>Total Members</p>
              </div>
              <div className={viewStyles.v125}>
                <p className={viewStyles.v126}>{summary.pending}</p>
                <p className={viewStyles.v108}>Pending</p>
              </div>
              <div className={viewStyles.v106}>
                <p className={viewStyles.v127}>{summary.inProgress}</p>
                <p className={viewStyles.v108}>In Progress</p>
              </div>
              <div className={viewStyles.v111}>
                <p className={viewStyles.v112}>{summary.completed}</p>
                <p className={viewStyles.v108}>Completed</p>
              </div>
            </div>
          </div>

          {/* Status filter buttons update activeStatus and narrow the member list. */}
          <div className={viewStyles.v054}>
            <h3 className={viewStyles.v086}>Filter by Status</h3>
            <div className={viewStyles.v128}>
              <div className={viewStyles.v088}>
                {STATUS_FILTERS.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setActiveStatus(item.value)}
                    className={`${viewStyles.v115} ${
                      activeStatus === item.value
                        ? viewStyles.v116
                        : viewStyles.v117
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          




         






          {/* Member list shows loading, empty, and populated states. */}
          {loading ? (
            <LoadingScreen />
          ) : filteredMembers.length > 0 ? (
            <div className={viewStyles.v129}>
              {filteredMembers.map((member) => (
                <div
                  key={String(member.id)}
                  className={viewStyles.v130}
                >
                  <div className={viewStyles.v131}>
                    <div className={viewStyles.v132}>
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className={viewStyles.v094}>{member.name}</h3>
                      <p className={viewStyles.v133}>{formatRole(member.role)}</p>
                      
                    </div>
                  </div>
                  <div className={viewStyles.v134}>
                    <span className={`${viewStyles.v051} ${(viewStyles as Record<string,string>)[getStatusBadgeClass(member.status)]}`}>
                      {normalizeStatus(member.status)}
                    </span>
                    <Link
                      href={`${routes.evaluate}/${member.id}`}
                      onClick={() => saveStoredMember(member)}
                      className={viewStyles.v135}
                    >
                      ✎ Evaluate
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={viewStyles.v101}>
              <p className={viewStyles.v102}>No team members found matching your criteria</p>
            </div>
          )}
          





          




        </div>
      </main>
    </div>
  );
}
