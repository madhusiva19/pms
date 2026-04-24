'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

interface AdminLevel {
  id: string;
  name: string;
  title: string;
  level: number;
  department: string;
  directReports?: string[];
}

export default function HomePage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<{
    hq?: AdminLevel;
    country?: AdminLevel[];
    branch?: AdminLevel[];
    dept?: AdminLevel[];
    subdept?: AdminLevel[];
  }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const response = await fetch('http://localhost:5001/api/admins');
        if (response.ok) {
          const data = await response.json();
          setAdmins(data);
        }
      } catch (err) {
        console.error('Failed to fetch admins:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAdmins();
  }, []);

  const handleAdminSelect = (adminId: string) => {
    router.push(`/my-team?adminId=${adminId}`);
  };

  const levelColors: Record<number, string> = {
    1: '#DC2626',    // Red
    2: '#EA580C',    // Orange
    3: '#F59E0B',    // Amber
    4: '#EAB308',    // Yellow
    5: '#84CC16',    // Lime
  };

  return (
    <div style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '10px', textAlign: 'center' }}>
        🎯 Performance Management System
      </h1>
      <p style={{ fontSize: '16px', marginBottom: '40px', color: '#666', textAlign: 'center' }}>
        5-Level Admin Hierarchy - Select an admin to view their team
      </p>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#999' }}>Loading admin hierarchy...</p>
      ) : (
        <div>
          {/* Level 1: HQ Admin */}
          {admins.hq && (
            <div style={{ marginBottom: '40px' }}>
              <div
                style={{
                  backgroundColor: levelColors[1],
                  color: 'white',
                  padding: '16px',
                  borderRadius: '8px 8px 0 0',
                  fontSize: '18px',
                  fontWeight: 'bold',
                }}
              >
                Level 1: HQ Admin
              </div>
              <div style={{ 
                border: `2px solid ${levelColors[1]}`,
                borderTop: 'none',
                padding: '16px',
                borderRadius: '0 0 8px 8px',
                marginBottom: '16px',
              }}>
                <button
                  onClick={() => handleAdminSelect(admins.hq.id)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    backgroundColor: '#f3f4f6',
                    border: `1px solid ${levelColors[1]}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    textAlign: 'left',
                    marginBottom: '8px',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = levelColors[1];
                    (e.target as HTMLElement).style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = '#f3f4f6';
                    (e.target as HTMLElement).style.color = 'black';
                  }}
                >
                  <strong>{admins.hq.name}</strong> - {admins.hq.title}
                </button>
              </div>
            </div>
          )}

          {/* Level 2: Country Admins */}
          {admins.country && admins.country.length > 0 && (
            <div style={{ marginBottom: '40px' }}>
              <div
                style={{
                  backgroundColor: levelColors[2],
                  color: 'white',
                  padding: '16px',
                  borderRadius: '8px 8px 0 0',
                  fontSize: '18px',
                  fontWeight: 'bold',
                }}
              >
                Level 2: Country Admins
              </div>
              <div style={{ 
                border: `2px solid ${levelColors[2]}`,
                borderTop: 'none',
                padding: '16px',
                borderRadius: '0 0 8px 8px',
                marginBottom: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '12px',
              }}>
                {admins.country.map((admin) => (
                  <button
                    key={admin.id}
                    onClick={() => handleAdminSelect(admin.id)}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#f3f4f6',
                      border: `1px solid ${levelColors[2]}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      textAlign: 'left',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = levelColors[2];
                      (e.target as HTMLElement).style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = '#f3f4f6';
                      (e.target as HTMLElement).style.color = 'black';
                    }}
                  >
                    <strong>{admin.name}</strong><br />
                    <small>{admin.title}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Level 3: Branch Admins */}
          {admins.branch && admins.branch.length > 0 && (
            <div style={{ marginBottom: '40px' }}>
              <div
                style={{
                  backgroundColor: levelColors[3],
                  color: 'white',
                  padding: '16px',
                  borderRadius: '8px 8px 0 0',
                  fontSize: '18px',
                  fontWeight: 'bold',
                }}
              >
                Level 3: Branch Admins
              </div>
              <div style={{ 
                border: `2px solid ${levelColors[3]}`,
                borderTop: 'none',
                padding: '16px',
                borderRadius: '0 0 8px 8px',
                marginBottom: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '12px',
              }}>
                {admins.branch.map((admin) => (
                  <button
                    key={admin.id}
                    onClick={() => handleAdminSelect(admin.id)}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#f3f4f6',
                      border: `1px solid ${levelColors[3]}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      textAlign: 'left',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = levelColors[3];
                      (e.target as HTMLElement).style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = '#f3f4f6';
                      (e.target as HTMLElement).style.color = 'black';
                    }}
                  >
                    <strong>{admin.name}</strong><br />
                    <small>{admin.title}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Level 4: Dept Admins */}
          {admins.dept && admins.dept.length > 0 && (
            <div style={{ marginBottom: '40px' }}>
              <div
                style={{
                  backgroundColor: levelColors[4],
                  color: 'white',
                  padding: '16px',
                  borderRadius: '8px 8px 0 0',
                  fontSize: '18px',
                  fontWeight: 'bold',
                }}
              >
                Level 4: Department Admins
              </div>
              <div style={{ 
                border: `2px solid ${levelColors[4]}`,
                borderTop: 'none',
                padding: '16px',
                borderRadius: '0 0 8px 8px',
                marginBottom: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '12px',
              }}>
                {admins.dept.map((admin) => (
                  <button
                    key={admin.id}
                    onClick={() => handleAdminSelect(admin.id)}
                    style={{
                      padding: '10px 14px',
                      backgroundColor: '#f3f4f6',
                      border: `1px solid ${levelColors[4]}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      textAlign: 'left',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = levelColors[4];
                      (e.target as HTMLElement).style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = '#f3f4f6';
                      (e.target as HTMLElement).style.color = 'black';
                    }}
                  >
                    <strong>{admin.name}</strong><br />
                    <small>{admin.title}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Level 5: Sub Dept Admins */}
          {admins.subdept && admins.subdept.length > 0 && (
            <div style={{ marginBottom: '40px' }}>
              <div
                style={{
                  backgroundColor: levelColors[5],
                  color: 'white',
                  padding: '16px',
                  borderRadius: '8px 8px 0 0',
                  fontSize: '18px',
                  fontWeight: 'bold',
                }}
              >
                Level 5: Sub-Department Admins
              </div>
              <div style={{ 
                border: `2px solid ${levelColors[5]}`,
                borderTop: 'none',
                padding: '16px',
                borderRadius: '0 0 8px 8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '10px',
              }}>
                {admins.subdept.map((admin) => (
                  <button
                    key={admin.id}
                    onClick={() => handleAdminSelect(admin.id)}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: '#f3f4f6',
                      border: `1px solid ${levelColors[5]}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      textAlign: 'left',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = levelColors[5];
                      (e.target as HTMLElement).style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = '#f3f4f6';
                      (e.target as HTMLElement).style.color = 'black';
                    }}
                  >
                    <strong>{admin.name}</strong><br />
                    <small>{admin.title}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f0f9ff', borderRadius: '8px', textAlign: 'center' }}>
        <p style={{ color: '#0369a1', fontSize: '14px' }}>
          💡 <strong>Hierarchy Structure:</strong> Each admin level evaluates only their direct subordinates<br />
          L1→L2→L3→L4→L5→Employees
        </p>
      </div>
    </div>
  );
}
