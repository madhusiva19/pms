'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Download } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:5000';

const C = {
  blue: '#155DFC', blueBg: '#EFF6FF', pageBg: '#F8F9FC', border: '#E2E8F0',
  textMain: '#101828', textSub: '#4A5565', textMuted: '#64748B', textDark: '#1E293B',
};

const PAGE_SIZE = 50;

interface PaginatedResponse {
  rows:        ReportRow[];
  page:        number;
  page_size:   number;
  total:       number;
  total_pages: number;
}

interface ReportRow {
  id:                  string;
  emp_id:              string | null;
  full_name:           string;
  role:                string;
  org_location:        string;
  h1_score:            number | null;
  h2_score:            number | null;
  talent_block:        string | null;
}

function fiscalYear(year: number): string  { return `${year}/${String(year + 1).slice(-2)}`; }
function fiscalH1(year: number): string    { return `H1 ${year}/${String(year + 1).slice(-2)}`; }
function fiscalH2(year: number): string    { return `H2 ${year - 1}/${String(year).slice(-2)}`; }

function TalentBadge({ value }: { value: string | null }) {
  if (!value) return <span style={{ color: '#CBD5E1', fontSize: 12 }}>—</span>;
  const map: Record<string, { bg: string; color: string; label: string }> = {
    H: { bg: '#DCFCE7', color: '#166534', label: 'High' },
    M: { bg: '#FEF9C3', color: '#854D0E', label: 'Medium' },
    L: { bg: '#FEE2E2', color: '#991B1B', label: 'Low' },
  };
  const s = map[value] ?? { bg: '#F1F5F9', color: '#475569', label: value };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 999,
      fontSize: 11.5, fontWeight: 600, background: s.bg, color: s.color,
    }}>{s.label}</span>
  );
}

function Score({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span style={{ color: '#CBD5E1', fontSize: 12 }}>—</span>;
  return (
    <span style={{ fontWeight: 600, color: C.textDark, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
      {value.toFixed(2)}
    </span>
  );
}

function formatRole(role: string): string {
  const map: Record<string, string> = {
    country_admin: 'Country Admin', branch_admin: 'Branch Admin',
    dept_admin: 'Dept Admin', sub_dept_admin: 'Sub-Dept Admin', employee: 'Employee',
  };
  return map[role] ?? role;
}

function downloadCsv(rows: ReportRow[], year: number) {
  const headers = ['Emp ID', 'Name', 'Role', 'Org Location', `${fiscalH1(year)}`, `${fiscalH2(year)}`, 'Talent Block'];
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      r.emp_id ?? '',
      `"${r.full_name}"`,
      formatRole(r.role),
      `"${r.org_location}"`,
      r.h1_score != null ? r.h1_score.toFixed(2) : '',
      r.h2_score != null ? r.h2_score.toFixed(2) : '',
      r.talent_block ?? '',
    ].join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `workforce-report-${fiscalYear(year)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function downloadPdf(rows: ReportRow[], year: number) {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Workforce Report ${fiscalYear(year)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1E293B; margin: 20px; }
  h1 { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
  p  { font-size: 11px; color: #64748B; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #F1F5F9; padding: 7px 10px; text-align: left; font-size: 10px;
       font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .04em;
       border-bottom: 2px solid #CBD5E1; }
  td { padding: 7px 10px; border-bottom: 1px solid #F1F5F9; }
  tr:nth-child(even) td { background: #F8FAFC; }
  .role { font-size: 10px; color: #94A3B8; }
  .badge-H { background:#DCFCE7;color:#166534;padding:1px 7px;border-radius:999px;font-weight:600; }
  .badge-M { background:#FEF9C3;color:#854D0E;padding:1px 7px;border-radius:999px;font-weight:600; }
  .badge-L { background:#FEE2E2;color:#991B1B;padding:1px 7px;border-radius:999px;font-weight:600; }
  .center   { text-align: center; }
  .muted    { color: #CBD5E1; }
</style>
</head>
<body>
<h1>Workforce Performance Report — ${fiscalYear(year)}</h1>
<p>Annual summary of performance scores and potential assessments</p>
<table>
<thead>
<tr>
  <th>#</th><th>Emp ID</th><th>Name</th><th>Org Location</th>
  <th class="center">${fiscalH1(year)}</th>
  <th class="center">${fiscalH2(year)}</th>
  <th class="center">Talent Block</th>
</tr>
</thead>
<tbody>
${rows.map((r, i) => `<tr>
  <td>${i + 1}</td>
  <td>${r.emp_id ?? '—'}</td>
  <td>${r.full_name}<br><span class="role">${formatRole(r.role)}</span></td>
  <td>${r.org_location}</td>
  <td class="center">${r.h1_score != null ? r.h1_score.toFixed(2) : '<span class="muted">—</span>'}</td>
  <td class="center">${r.h2_score != null ? r.h2_score.toFixed(2) : '<span class="muted">—</span>'}</td>
  <td class="center">${r.talent_block ? `<span class="badge-${r.talent_block}">${r.talent_block === 'H' ? 'High' : r.talent_block === 'M' ? 'Medium' : 'Low'}</span>` : '<span class="muted">—</span>'}</td>
</tr>`).join('')}
</tbody>
</table>
</body>
</html>`;
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }
}

export default function WorkforceReport() {
  const { user, loading: authLoading } = useAuth();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear() - 1);
  const [rows,         setRows]         = useState<ReportRow[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [page,         setPage]         = useState(1);
  const [totalPages,   setTotalPages]   = useState(0);
  const [total,        setTotal]        = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    fetch(`${API}/api/rating-periods/current?user_id=${user.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.pms_year) setSelectedYear(d.pms_year); })
      .catch(() => {});
  }, [user?.id]);

  const fetchReport = useCallback(async (pageNum = 1) => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${API}/api/workforce-report?pms_year=${selectedYear}&requester_id=${user.id}&page=${pageNum}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data: PaginatedResponse = await res.json();
      setRows(data.rows);
      setPage(data.page);
      setTotalPages(data.total_pages);
      setTotal(data.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load report.');
    }
    setLoading(false);
  }, [user?.id, selectedYear]);

  useEffect(() => {
    if (!authLoading && user) { setPage(1); fetchReport(1); }
  }, [authLoading, user, fetchReport]);

  const th: React.CSSProperties = {
    padding: '9px 12px', textAlign: 'left',
    fontSize: 10.5, fontWeight: 700, color: '#64748B',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, fontSize: 13, color: C.textMuted, alignItems: 'center' }}>
          <Link href="/dashboard" style={{ color: C.textMuted, textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <span style={{ color: C.textDark }}>Workforce Report</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 600, color: C.textMain, margin: '0 0 4px' }}>
              Workforce Performance Report
            </h1>
            <p style={{ fontSize: 14, color: C.textSub, margin: 0 }}>
              {fiscalYear(selectedYear)} · {user?.role === 'country_admin' ? 'Your country' : 'All countries'}
            </p>
          </div>
          {rows.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => downloadCsv(rows, selectedYear)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8,
                border: `1px solid ${C.border}`, background: '#fff', color: C.textSub,
                fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <Download size={13} /> CSV
              </button>
              <button onClick={() => downloadPdf(rows, selectedYear)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8,
                border: '1px solid #BFDBFE', background: C.blueBg, color: C.blue,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <Download size={13} /> PDF
              </button>
            </div>
          )}
        </div>

        {/* Table card */}
        <div style={{
          background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8,
          overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          {/* Card header */}
          <div style={{
            padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
            borderLeft: '4px solid #2563EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.textMain }}>
                {fiscalYear(selectedYear)} Annual Report
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textMuted }}>
                {loading ? 'Loading…' : `${total} employees · sorted by country, branch, department`}
              </p>
            </div>
          </div>

          {loading && (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: C.textMuted, fontSize: 14 }}>
              Loading…
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: '32px', textAlign: 'center', color: '#DC2626', fontSize: 13 }}>{error}</div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: C.textMuted, fontSize: 14 }}>
              No data found for {fiscalYear(selectedYear)}.
            </div>
          )}

          {!loading && !error && rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <colgroup>
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '35%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '13%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={th}>#</th>
                    <th style={th}>Emp ID</th>
                    <th style={th}>Name</th>
                    <th style={th}>Org Location</th>
                    <th style={{ ...th, textAlign: 'center' }}>{fiscalH1(selectedYear)}</th>
                    <th style={{ ...th, textAlign: 'center' }}>{fiscalH2(selectedYear)}</th>
                    <th style={{ ...th, textAlign: 'center' }}>Talent Block</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const globalIdx = (page - 1) * PAGE_SIZE + idx;
                    const even = globalIdx % 2 === 0;
                    return (
                      <tr key={row.id}
                        style={{ background: even ? '#fff' : '#FAFBFD', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F0F7FF')}
                        onMouseLeave={e => (e.currentTarget.style.background = even ? '#fff' : '#FAFBFD')}>
                        <td style={{ padding: '10px 12px', color: '#94A3B8', fontSize: 12 }}>
                          {globalIdx + 1}
                        </td>
                        <td style={{ padding: '10px 12px', color: C.textMuted, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                          {row.emp_id ?? '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: C.textDark }}>{row.full_name}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{formatRole(row.role)}</div>
                        </td>
                        <td style={{ padding: '10px 12px', color: C.textSub, fontSize: 12.5, lineHeight: 1.4 }}>
                          {row.org_location}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <Score value={row.h1_score} />
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <Score value={row.h2_score} />
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <TalentBadge value={row.talent_block} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
            <span style={{ fontSize: 12.5, color: C.textMuted }}>
              {((page - 1) * PAGE_SIZE) + 1}&#8211;{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => fetchReport(page - 1)} disabled={page === 1}
                style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
                  background: '#fff', color: page === 1 ? '#CBD5E1' : C.textDark,
                  fontSize: 12.5, cursor: page === 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                ← Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce((acc: (number | string)[], p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p); return acc;
                }, [])
                .map((p, i) => p === '...' ? (
                  <span key={`e-${i}`} style={{ padding: '5px 4px', fontSize: 12.5, color: C.textMuted }}>…</span>
                ) : (
                  <button key={p} onClick={() => fetchReport(p as number)} style={{
                    padding: '5px 10px', borderRadius: 6,
                    border: `1px solid ${p === page ? C.blue : C.border}`,
                    background: p === page ? C.blueBg : '#fff',
                    color: p === page ? C.blue : C.textDark,
                    fontSize: 12.5, fontWeight: p === page ? 700 : 400,
                    cursor: 'pointer', fontFamily: 'inherit' }}>
                    {p}
                  </button>
                ))}
              <button onClick={() => fetchReport(page + 1)} disabled={page === totalPages}
                style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
                  background: '#fff', color: page === totalPages ? '#CBD5E1' : C.textDark,
                  fontSize: 12.5, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                Next →
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}