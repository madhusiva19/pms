import viewStyles from '../styles/views.module.css';
// Test Connection page: verifies Supabase env values and displays available table data.
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Sidebar from '../components/Sidebar';

export default function TestConnection() {
  // Human-readable connection status shown at the top of the page.
  const [supabaseStatus, setSupabaseStatus] = useState('Checking...');
  // Team member rows loaded directly from Supabase.
  const [teamMembers, setTeamMembers] = useState([]);
  // Approval rows loaded directly from Supabase.
  const [approvals, setApprovals] = useState([]);
  // Controls loading and empty table messages.
  const [loading, setLoading] = useState(true);
  // Stores the latest connection error message, if one occurs.
  const [error, setError] = useState(null);

  // Runs three checks: table access, team member data, and approval data.
  useEffect(() => {
    const testConnection = async () => {
      try {
        // Check whether the team_members table is reachable.
        console.log('Testing Supabase connection...');
        const { data: healthData, error: healthError } = await supabase
          .from('team_members')
          .select('count()', { count: 'exact' });

        if (healthError) {
          setSupabaseStatus(`❌ Error: ${healthError.message}`);
          setError(healthError.message);
        } else {
          setSupabaseStatus('✅ Supabase Connected');
        }

        // Fetch team members so the page can confirm real data access.
        console.log('Fetching team members...');
        const { data: membersData, error: membersError } = await supabase
          .from('team_members')
          .select('*');

        if (membersError) {
          console.error('Team members error:', membersError);
        } else {
          setTeamMembers(membersData || []);
          console.log('Team members:', membersData);
        }

        // Fetch approvals to verify another app table is reachable.
        console.log('Fetching approvals...');
        const { data: approvalsData, error: approvalsError } = await supabase
          .from('approvals')
          .select('*');

        if (approvalsError) {
          console.error('Approvals error:', approvalsError);
        } else {
          setApprovals(approvalsData || []);
          console.log('Approvals:', approvalsData);
        }

        setLoading(false);
      } catch (err) {
        console.error('Connection test error:', err);
        setSupabaseStatus(`❌ Connection Error: ${err.message}`);
        setError(err.message);
        setLoading(false);
      }
    };

    testConnection();
  }, []);

  return (
    <div className={viewStyles.v031}>
      <Sidebar />

      <main className={viewStyles.v032}>
        <div className={viewStyles.v136}>
          {/* Header */}
          <div className={viewStyles.v054}>
            <h1 className={viewStyles.v036}>Supabase Connection Test</h1>
            <p className={viewStyles.v082}>Verify your Supabase database connection</p>
          </div>

          {/* Connection status card shows success or the latest error. */}
          <div className={viewStyles.v205}>
            <h2 className={viewStyles.v206}>Connection Status</h2>
            <div className={viewStyles.v207}>
              {supabaseStatus}
            </div>
            {error && (
              <div className={viewStyles.v208}>
                <p className={viewStyles.v209}>Error Details:</p>
                <p className={viewStyles.v210}>{error}</p>
              </div>
            )}
          </div>

          {/* Environment variable card confirms Next.js can read Supabase settings. */}
          <div className={viewStyles.v205}>
            <h2 className={viewStyles.v206}>Environment Variables</h2>
            <div className={viewStyles.v171}>
              <div className={viewStyles.v211}>
                <p className={viewStyles.v196}>NEXT_PUBLIC_SUPABASE_URL</p>
                <p className={viewStyles.v212}>
                  {process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not set'}
                </p>
              </div>
              <div className={viewStyles.v211}>
                <p className={viewStyles.v196}>NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
                <p className={viewStyles.v212}>
                  {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                    ? `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 30)}...`
                    : 'Not set'}
                </p>
              </div>
            </div>
          </div>

          {/* Team members table previews rows returned from Supabase. */}
          <div className={viewStyles.v205}>
            <h2 className={viewStyles.v206}>
              Team Members ({teamMembers.length})
            </h2>
            {teamMembers.length > 0 ? (
              <div className={viewStyles.v018}>
                <table className={viewStyles.v041}>
                  <thead className={viewStyles.v213}>
                    <tr>
                      <th className={viewStyles.v214}>ID</th>
                      <th className={viewStyles.v214}>Name</th>
                      <th className={viewStyles.v214}>Role</th>
                      <th className={viewStyles.v214}>Department</th>
                      <th className={viewStyles.v214}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((member) => (
                      <tr key={member.id} className={viewStyles.v044}>
                        <td className={viewStyles.v215}>{member.id}</td>
                        <td className={viewStyles.v216}>{member.name}</td>
                        <td className={viewStyles.v215}>{member.role}</td>
                        <td className={viewStyles.v215}>{member.department}</td>
                        <td className={viewStyles.v215}>
                          <span className={`${viewStyles.v221} ${
                            member.status === 'pending' ? viewStyles.v222 :
                            member.status === 'in progress' ? viewStyles.v223 :
                            viewStyles.v224
                          }`}>
                            {member.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={viewStyles.v082}>
                {loading ? 'Loading...' : '❌ No team members found in Supabase'}
              </p>
            )}
          </div>

          {/* Approvals table previews approval rows returned from Supabase. */}
          <div className={viewStyles.v205}>
            <h2 className={viewStyles.v206}>
              Approvals ({approvals.length})
            </h2>
            {approvals.length > 0 ? (
              <div className={viewStyles.v018}>
                <table className={viewStyles.v041}>
                  <thead className={viewStyles.v213}>
                    <tr>
                      <th className={viewStyles.v214}>ID</th>
                      <th className={viewStyles.v214}>Employee</th>
                      <th className={viewStyles.v214}>Level</th>
                      <th className={viewStyles.v214}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvals.map((approval) => (
                      <tr key={approval.id} className={viewStyles.v044}>
                        <td className={viewStyles.v215}>{approval.id}</td>
                        <td className={viewStyles.v216}>{approval.employee}</td>
                        <td className={viewStyles.v215}>{approval.level}</td>
                        <td className={viewStyles.v215}>
                          <span className={`${viewStyles.v221} ${
                            approval.status === 'pending' ? viewStyles.v222 :
                            approval.status === 'approved' ? viewStyles.v224 :
                            viewStyles.v225
                          }`}>
                            {approval.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={viewStyles.v082}>
                {loading ? 'Loading...' : '❌ No approvals found in Supabase'}
              </p>
            )}
          </div>

          {/* Debug instructions help verify connection details in the browser. */}
          <div className={viewStyles.v217}>
            <h2 className={viewStyles.v218}>How to Check Connection:</h2>
            <ol className={viewStyles.v219}>
              <li>
                <strong>1. Open Browser Console:</strong> Press <code className={viewStyles.v220}>F12</code> or <code className={viewStyles.v220}>Right-click → Inspect</code>
              </li>
              <li>
                <strong>2. Check Console Tab:</strong> Look for error messages. If no errors, connection is working!
              </li>
              <li>
                <strong>3. Check Network Tab:</strong> Look for requests to your Supabase URL (yqdrcdkqwiqtmbyuntwk.supabase.co)
              </li>
              <li>
                <strong>4. Check this page:</strong> If you see team members and approvals listed above, Supabase is connected ✅
              </li>
            </ol>
          </div>
        </div>
      </main>
    </div>
  );
}
