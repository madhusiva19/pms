'use client';

import viewStyles from '../styles/views.module.css';
// Members page: displays the full team directory with search and department filters.
import { useState, useEffect } from 'react';
import { getTeamMembers } from '../lib/api';
import Sidebar from '../components/Sidebar';
import MemberAvatar from '../components/MemberAvatar';
import { getStatusBadgeClass, normalizeStatus } from '../lib/formatters';
import type { TeamMember } from '../types';

const ALL_DEPARTMENTS = 'all';

export default function Members() {
  // Stores all members returned from the backend.
  const [members, setMembers] = useState<TeamMember[]>([]);
  // Stores the directory search text.
  const [searchTerm, setSearchTerm] = useState('');
  // Stores the currently selected department filter.
  const [departmentFilter, setDepartmentFilter] = useState(ALL_DEPARTMENTS);
  // Controls loading and loaded page states.
  const [loading, setLoading] = useState(true);
  // Stores unique departments extracted from the member list.
  const [departments, setDepartments] = useState<string[]>([]);

  // Loads members once and derives the department filter options from the response.
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const response = await getTeamMembers();
        setMembers(response.data);
        
        // Remove duplicate and empty department values before showing filter chips.
        const uniqueDepts = [...new Set(response.data.map((member) => member.department))].filter(Boolean) as string[];
        setDepartments(uniqueDepts);
        
      } catch (error) {
        console.error('Error fetching members:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, []);

  // Filters the directory by name/role search and selected department.
  const filteredMembers = members.filter((member) => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (member.role || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDepartment = departmentFilter === ALL_DEPARTMENTS || member.department === departmentFilter;
    
    return matchesSearch && matchesDepartment;
  });

  return (
    <div className={viewStyles.v031}>
      <Sidebar />

      <main className={viewStyles.v032}>
        <div className={viewStyles.v081}>
          {/* Header */}
          <div className={viewStyles.v054}>
            <h1 className={viewStyles.v036}>Member Directory</h1>
            <p className={viewStyles.v082}>View all team members and their details</p>
          </div>

          {/* Search input filters by member name or role. */}
          <div className={viewStyles.v083}>
            <label className={viewStyles.v084}>Search Members</label>
            <input
              type="text"
              placeholder="Search by name or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={viewStyles.v085}
            />
          </div>

          {/* Department chips appear only after departments are found in the data. */}
          {departments.length > 0 && (
            <div className={viewStyles.v054}>
              <h3 className={viewStyles.v086}>Filter by Department</h3>
              <div className={viewStyles.v087}>
                <div className={viewStyles.v088}>
                  <button
                    onClick={() => setDepartmentFilter(ALL_DEPARTMENTS)}
                    className={`${viewStyles.v115} ${
                      departmentFilter === ALL_DEPARTMENTS
                        ? viewStyles.v116
                        : viewStyles.v117
                    }`}
                  >
                    All Departments
                  </button>
                  {departments.map((dept) => (
                    <button
                      key={dept}
                      onClick={() => setDepartmentFilter(dept)}
                      className={`${viewStyles.v115} ${
                        departmentFilter === dept
                          ? viewStyles.v116
                          : viewStyles.v117
                      }`}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Member cards show contact details when the backend provides them. */}
          {loading ? (
            <div className={viewStyles.v039}>
              <p className={viewStyles.v082}>Loading members...</p>
            </div>
          ) : filteredMembers.length > 0 ? (
            <div className={viewStyles.v089}>
              {filteredMembers.map((member) => (
                <div
                  key={String(member.id)}
                  className={viewStyles.v090}
                >
                  <div className={viewStyles.v091}>
                    <MemberAvatar member={member} size="medium" />
                    <div className={viewStyles.v093}>
                      <h3 className={viewStyles.v094}>{member.name}</h3>
                      <p className={viewStyles.v095}>{member.role}</p>
                    </div>
                  </div>

                  <div className={viewStyles.v060}>
                    {member.department && (
                      <div className={viewStyles.v096}>
                        <span className={viewStyles.v097}>Department:</span>
                        <span className={viewStyles.v098}>{member.department}</span>
                      </div>
                    )}
                    {member.email && (
                      <div className={viewStyles.v096}>
                        <span className={viewStyles.v097}>Email:</span>
                        <span className={viewStyles.v099}>{member.email}</span>
                      </div>
                    )}
                    {member.phone && (
                      <div className={viewStyles.v096}>
                        <span className={viewStyles.v097}>Phone:</span>
                        <span className={viewStyles.v098}>{member.phone}</span>
                      </div>
                    )}
                  </div>

                  {member.status && (
                    <div className={viewStyles.v100}>
                      <span className={`${viewStyles.v118} ${getStatusBadgeClass(member.status)}`}>
                        {normalizeStatus(member.status)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className={viewStyles.v101}>
              <p className={viewStyles.v102}>No members found matching your criteria</p>
            </div>
          )}

          {/* Summary cards explain how many records are loaded and displayed. */}
          {!loading && (
            <div className={viewStyles.v103}>
              <h2 className={viewStyles.v104}>Member Summary</h2>
              <div className={viewStyles.v105}>
                <div className={viewStyles.v106}>
                  <p className={viewStyles.v107}>{members.length}</p>
                  <p className={viewStyles.v108}>Total Members</p>
                </div>
                <div className={viewStyles.v109}>
                  <p className={viewStyles.v110}>{departments.length}</p>
                  <p className={viewStyles.v108}>Departments</p>
                </div>
                <div className={viewStyles.v111}>
                  <p className={viewStyles.v112}>{filteredMembers.length}</p>
                  <p className={viewStyles.v108}>Displayed</p>
                </div>
                <div className={viewStyles.v113}>
                  <p className={viewStyles.v114}>{members.length ? Math.round((filteredMembers.length / members.length) * 100) : 0}%</p>
                  <p className={viewStyles.v108}>Match Rate</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
