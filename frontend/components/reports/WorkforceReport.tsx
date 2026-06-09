'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Download } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:5000';

// Shared colour tokens — same as MyPerformance and RatingSettings
const C = {
  blue: '#155DFC', blueBg: '#EFF6FF', pageBg: '#F8F9FC', border: '#E2E8F0',
  textMain: '#101828', textSub: '#4A5565', textMuted: '#64748B', textDark: '#1E293B',
};

interface ReportRow {
  id:                  string;
  emp_id:              string | null;
  full_name:           string;
  role:                string;
  org_location:        string;
  country:             string | null;
  branch:              string | null;
  department:          string | null;
  sub_department:      string | null;
  avg_score:           number | null;
  talent_block:        string | null;
  overall_ability:     string | null;
  overall_aspiration:  string | null;
  overall_leadership:  string | null;
}

// Formats pms_year to fiscal display e.g. 2025 → "2025/26"
function fiscalYear(year: number): string {
  return `${year}/${String(year + 1).slice(-2)}`;
}

// Colour-codes the talent block badge
function TalentBadge({ value }: { value: string | null }) {
  if (!value) return <span style={{ color: C.textMuted, fontSize: 12 }}>—</span>;
  const map: Record<string, { bg: string; color: string }> = {
    H: { bg: '#DCFCE7', color: '#166534' },
    M: { bg: '#FEF9C3', color: '#854D0E' },
    L: { bg: '#FEE2E2', color: '#991B1B' },
  };
  const style = map[value] ?? { bg: '#F3F4F6', color: '#374151' };
  const labels: Record<string, string> = { H: 'High', M: 'Medium', L: 'Low' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 999,
      fontSize: 11.5, fontWeight: 700,
      background: style.bg, color: style.color,
    }}>
      {labels[value] ?? value}
    </span>
  );
}

// Colour-codes a score out of 5
function ScoreBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span style={{ color: C.textMuted, fontSize: 12 }}>—</span>;
  const color = value >= 4 ? '#16A34A' : value >= 3 ? '#D97706' : '#DC2626';
  return (
    <span style={{ fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
      {value.toFixed(2)}
    </span>
  );
}

// Formats role string for display
function formatRole(role: string): string {
  const map: Record<string, string> = {
    country_admin:  'Country Admin',
    branch_admin:   'Branch Admin',
    dept_admin:     'Dept Admin',
    sub_dept_admin: 'Sub-Dept Admin',
    employee:       'Employee',
  };
  return map[role] ?? role;
}

// Downloads the report as a CSV file
function downloadCsv(rows: ReportRow[], year: number) {
  const headers = [
    'Emp ID', 'Name', 'Role', 'Location',
    'Avg Score', 'Talent Block',
    'Ability', 'Aspiration', 'Leadership',
  ];
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      r.emp_id ?? '',
      `"${r.full_name}"`,
      formatRole(r.role),
      `"${r.org_location}"`,
      r.avg_score != null ? r.avg_score.toFixed(2) : '',
      r.talent_block ?? '',
      r.overall_ability ?? '',
      r.overall_aspiration ?? '',
      r.overall_leadership ?? '',
    ].join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `workforce-report-${fiscalYear(year)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WorkforceReport() {
  const { user, loading: authLoading } = useAuth();

  // Available PMS years — current year and previous 2
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1].filter(y => y >= 2024);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear - 1);
  const [rows,         setRows]         = useState<ReportRow[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  const fetchReport = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${API}/api/workforce-report?pms_year=${selectedYear}&requester_id=${user.id}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setRows(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load report.');
    }
    setLoading(false);
  }, [user?.id, selectedYear]);

  useEffect(() => {
    if (!authLoading && user) fetchReport();
  }, [authLoading, user, fetchReport]);

  const thStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left',
    fontSize: 11, fontWeight: 700, color: '#475569',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    background: '#F9FAFB', borderBottom: '2px solid #E5E7EB',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, fontSize: 13, color: C.textMuted, alignItems: 'center' }}>
          <Link href="/dashboard" style={{ color: C.textMuted, textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <span style={{ color: C.textDark }}>Workforce Report</span>
        </div>

        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: C.textMain, margin: '0 0 6px' }}>
              Workforce Performance Report
            </h1>
            <p style={{ fontSize: 15, color: C.textSub, margin: 0 }}>
              Annual summary of performance scores and potential assessments
              {user?.role === 'country_admin' ? ' for your country' : ' across all countries'}
            </p>
          </div>

          {/* Year selector + Download */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 10, padding: 3 }}>
              {years.map(y => {
                const active = y === selectedYear;
                return (
                  <button key={y} onClick={() => setSelectedYear(y)} style={{
                    padding: '5px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                    background: active ? '#fff' : 'transparent',
                    color: active ? C.textDark : C.textMuted,
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}>
                    {fiscalYear(y)}
                  </button>
                );
              })}
            </div>

            {rows.length > 0 && (
              <button onClick={() => downloadCsv(rows, selectedYear)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 10,
                border: '1px solid #BFDBFE', background: C.blueBg, color: C.blue,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <Download size={14} /> Download CSV
              </button>
            )}
          </div>
        </div>

        {/* Summary banner */}
        <div style={{
          background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6,
          padding: '16px 24px', marginBottom: 24,
          borderLeft: '28px solid #2563EB', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          display: 'flex', gap: 32, flexWrap: 'wrap',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              PMS Year
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: C.textDark }}>
              {fiscalYear(selectedYear)}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Total Users
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: C.textDark }}>
              {loading ? '—' : rows.length}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              With Performance Data
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: '#16A34A' }}>
              {loading ? '—' : rows.filter(r => r.avg_score != null).length}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              With Potential Assessment
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: '#D97706' }}>
              {loading ? '—' : rows.filter(r => r.talent_block).length}
            </p>
          </div>
        </div>

        {/* Report table */}
        <div style={{
          background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6,
          overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>

          {/* Table header */}
          <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}`, borderLeft: '28px solid #2563EB' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.textMain }}>
              Employee Report — {fiscalYear(selectedYear)}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.textMuted }}>
              Performance scores shown are the average of H1 and H2 for the fiscal year
            </p>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: C.textMuted, fontSize: 14 }}>
              Loading report…
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: '#DC2626', fontSize: 14 }}>
              {error}
            </div>
          )}

          {/* Empty */}
          {!loading && !error && rows.length === 0 && (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: C.textMuted, fontSize: 14 }}>
              No data found for {fiscalYear(selectedYear)}.
            </div>
          )}

          {/* Table */}
          {!loading && !error && rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '5%' }}>#</th>
                    <th style={{ ...thStyle, width: '7%' }}>Emp ID</th>
                    <th style={{ ...thStyle, width: '16%' }}>Name</th>
                    <th style={{ ...thStyle, width: '11%' }}>Role</th>
                    <th style={{ ...thStyle, width: '26%' }}>Location</th>
                    <th style={{ ...thStyle, width: '10%', textAlign: 'center' }}>Avg Score</th>
                    <th style={{ ...thStyle, width: '10%', textAlign: 'center' }}>Talent Block</th>
                    <th style={{ ...thStyle, width: '5%', textAlign: 'center' }}>Ability</th>
                    <th style={{ ...thStyle, width: '5%', textAlign: 'center' }}>Aspiration</th>
                    <th style={{ ...thStyle, width: '5%', textAlign: 'center' }}>Leadership</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr
                      key={row.id}
                      style={{ borderBottom: '1px solid #F1F5F9', background: '#fff' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFF')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                    >
                      <td style={{ padding: '10px 14px', color: C.textMuted, fontSize: 12 }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '10px 14px', color: C.textMuted, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                        {row.emp_id ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: C.textDark, fontWeight: 600 }}>
                        {row.full_name}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                          fontSize: 11, fontWeight: 600,
                          background: '#F1F5F9', color: '#475569',
                        }}>
                          {formatRole(row.role)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: C.textSub, fontSize: 12.5 }}>
                        {row.org_location}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <ScoreBadge value={row.avg_score} />
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <TalentBadge value={row.talent_block} />
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
                        {row.overall_ability ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
                        {row.overall_aspiration ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
                        {row.overall_leadership ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}