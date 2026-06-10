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
  rows: ReportRow[]; page: number; page_size: number; total: number; total_pages: number;
}

interface ReportRow {
  id: string; emp_id: string | null; full_name: string; role: string;
  org_location: string; h1_score: number | null; h2_score: number | null; talent_block: string | null;
}

function fiscalYear(y: number) { return `${y}/${String(y + 1).slice(-2)}`; }
// Both H1 (Jul-Dec Y) and H2 (Jan-Jun Y+1) belong to fiscal year Y/YY
function fiscalH1(y: number)   { return `H1 ${y}/${String(y + 1).slice(-2)}`; }
function fiscalH2(y: number)   { return `H2 ${y}/${String(y + 1).slice(-2)}`; }

function formatRole(role: string) {
  return ({ country_admin:'Country Admin', branch_admin:'Branch Admin', dept_admin:'Dept Admin',
            sub_dept_admin:'Sub-Dept Admin', employee:'Employee' } as Record<string,string>)[role] ?? role;
}

function TalentBadge({ value }: { value: string | null }) {
  if (!value) return <span style={{ color:'#CBD5E1', fontSize:12 }}>—</span>;
  const m: Record<string,{bg:string;color:string;label:string}> = {
    H:{bg:'#DCFCE7',color:'#166534',label:'High'},
    M:{bg:'#FEF9C3',color:'#854D0E',label:'Medium'},
    L:{bg:'#FEE2E2',color:'#991B1B',label:'Low'},
  };
  const s = m[value] ?? {bg:'#F1F5F9',color:'#475569',label:value};
  return <span style={{display:'inline-block',padding:'2px 10px',borderRadius:999,fontSize:11.5,fontWeight:600,background:s.bg,color:s.color}}>{s.label}</span>;
}

function Score({ value }: { value: number | null }) {
  if (value == null) return <span style={{color:'#CBD5E1',fontSize:12}}>—</span>;
  return <span style={{fontWeight:600,color:C.textDark,fontVariantNumeric:'tabular-nums',fontSize:13}}>{value.toFixed(2)}</span>;
}

async function handlePdfDownload(userId: string, year: number) {
  // Fetch all rows in one call from the /all endpoint
  const res = await fetch(`${API}/api/workforce-report/all?pms_year=${year}&requester_id=${userId}`);
  if (!res.ok) throw new Error('Failed to fetch report data');
  const allRows: ReportRow[] = await res.json();

  const talentLabel = (v: string|null) =>
    v === 'H' ? 'High' : v === 'M' ? 'Medium' : v === 'L' ? 'Low' : '—';
  const talentColor = (v: string|null) =>
    v === 'H' ? 'background:#DCFCE7;color:#166534' :
    v === 'M' ? 'background:#FEF9C3;color:#854D0E' :
    v === 'L' ? 'background:#FEE2E2;color:#991B1B' : '';

  const tableRows = allRows.map((r, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="empid">${r.emp_id ?? '—'}</td>
      <td><div class="name">${r.full_name}</div><div class="role">${formatRole(r.role)}</div></td>
      <td class="org">${r.org_location}</td>
      <td class="c">${r.h1_score != null ? `<span class="score">${r.h1_score.toFixed(2)}</span>` : '<span class="dash">—</span>'}</td>
      <td class="c">${r.h2_score != null ? `<span class="score">${r.h2_score.toFixed(2)}</span>` : '<span class="dash">—</span>'}</td>
      <td class="c">${r.talent_block ? `<span class="badge b${r.talent_block}">${talentLabel(r.talent_block)}</span>` : '<span class="dash">—</span>'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Workforce Report - ` + fiscalYear(year) + `</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,Arial,sans-serif;background:#fff;color:#1E293B}
.cover{background:linear-gradient(135deg,#1D4ED8 0%,#2563EB 100%);padding:26px 32px 22px;color:#fff}
.cover-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
.cover h1{font-size:21px;font-weight:700;margin-bottom:4px}
.cover p{font-size:12px;color:#BFDBFE}
.cover-badge{background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:7px 16px;font-size:16px;font-weight:700;color:#fff}
.cover-stats{display:flex;gap:24px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.2)}
.stat-value{font-size:19px;font-weight:700;color:#fff}
.stat-label{font-size:10px;color:#93C5FD;margin-top:1px;text-transform:uppercase;letter-spacing:.05em}
.table-wrap{padding:20px 24px 28px}
table{width:100%;border-collapse:collapse}
thead tr{background:#F1F5F9}
th{padding:8px 10px;text-align:left;font-size:9.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.07em;border-bottom:2px solid #CBD5E1;white-space:nowrap}
th.c{text-align:center}
td{padding:8px 10px;border-bottom:1px solid #F1F5F9;font-size:12px;vertical-align:middle}
tbody tr:nth-child(even) td{background:#F8FAFC}
.num{color:#94A3B8;font-size:11px}
.empid{color:#64748B;font-size:11px;font-variant-numeric:tabular-nums}
.nm{font-weight:600;color:#0F172A;font-size:12px}
.rl{font-size:10px;color:#94A3B8;margin-top:1px}
.org{color:#475569;font-size:11.5px;line-height:1.35}
.score{font-weight:600;color:#0F172A;font-variant-numeric:tabular-nums}
.dash{color:#CBD5E1}
.c{text-align:center}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:600}
.bH{background:#DCFCE7;color:#166534}
.bM{background:#FEF9C3;color:#854D0E}
.bL{background:#FEE2E2;color:#991B1B}
@media print{
  body{background:#fff}
  @page{margin:8mm;size:A4 landscape}
  .cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  thead{display:table-header-group}
  tr{page-break-inside:avoid}
  tbody tr:nth-child(even) td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>
<div class="cover">
  <div class="cover-top">
    <div>
      <h1>Workforce Performance Report</h1>
      <p>DGL &middot; Annual Performance &amp; Potential Summary &middot; ` + new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) + `</p>
    </div>
    <span class="cover-badge">` + fiscalYear(year) + `</span>
  </div>
  <div class="cover-stats">
    <div><div class="stat-value">` + allRows.length + `</div><div class="stat-label">Total Employees</div></div>
    <div><div class="stat-value">` + allRows.filter(r=>r.h1_score!=null||r.h2_score!=null).length + `</div><div class="stat-label">With Performance Data</div></div>
    <div><div class="stat-value">` + allRows.filter(r=>r.talent_block!=null).length + `</div><div class="stat-label">With Potential Assessment</div></div>
    <div><div class="stat-value">` + allRows.filter(r=>r.talent_block==='H').length + `</div><div class="stat-label">High Potential</div></div>
  </div>
</div>
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th style="width:3.5%">#</th>
        <th style="width:7%">Emp ID</th>
        <th style="width:17%">Name</th>
        <th style="width:33%">Org Location</th>
        <th class="c" style="width:11%">` + fiscalH1(year) + `</th>
        <th class="c" style="width:11%">` + fiscalH2(year) + `</th>
        <th class="c" style="width:17%">Talent Block</th>
      </tr>
    </thead>
    <tbody>` + tableRows + `</tbody>
  </table>
</div>
</body>
</html>`

  // Use blob download instead of window.open to avoid popup blockers
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `workforce-report-${fiscalYear(year)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function WorkforceReport() {
  const { user, loading: authLoading } = useAuth();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear() - 1);
  const [rows,         setRows]         = useState<ReportRow[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [pdfLoading,   setPdfLoading]   = useState(false);
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
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/workforce-report?pms_year=${selectedYear}&requester_id=${user.id}&page=${pageNum}`);
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as {error?:string}).error ?? `HTTP ${res.status}`); }
      const data: PaginatedResponse = await res.json();
      setRows(data.rows); setPage(data.page); setTotalPages(data.total_pages); setTotal(data.total);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load.'); }
    setLoading(false);
  }, [user?.id, selectedYear]);

  useEffect(() => {
    if (!authLoading && user) { setPage(1); fetchReport(1); }
  }, [authLoading, user, fetchReport]);

  const onPdf = async () => {
    if (!user?.id) return;
    setPdfLoading(true);
    await handlePdfDownload(user.id, selectedYear);
    setPdfLoading(false);
  };

  const th: React.CSSProperties = {
    padding:'9px 12px', textAlign:'left', fontSize:10.5, fontWeight:700, color:'#64748B',
    textTransform:'uppercase', letterSpacing:'0.06em', background:'#F8FAFC',
    borderBottom:'1px solid #E2E8F0', whiteSpace:'nowrap',
  };

  return (
    <div style={{minHeight:'100vh',background:C.pageBg,fontFamily:'Inter, system-ui, sans-serif'}}>
      <div style={{padding:'24px 32px',maxWidth:1100,margin:'0 auto'}}>

        {/* Breadcrumb */}
        <div style={{display:'flex',gap:6,marginBottom:16,fontSize:13,color:C.textMuted,alignItems:'center'}}>
          <Link href="/dashboard" style={{color:C.textMuted,textDecoration:'none'}}>Home</Link>
          <span>›</span>
          <span style={{color:C.textDark}}>Workforce Report</span>
        </div>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24,flexWrap:'wrap',gap:12}}>
          <div>
            <h1 style={{fontSize:26,fontWeight:600,color:C.textMain,margin:'0 0 4px'}}>Workforce Performance Report</h1>
            <p style={{fontSize:14,color:C.textSub,margin:0}}>
              {fiscalYear(selectedYear)} · {user?.role === 'country_admin' ? 'Your country' : 'All countries'}
            </p>
          </div>
          {total > 0 && (
            <button onClick={onPdf} disabled={pdfLoading} style={{
              display:'flex',alignItems:'center',gap:6,padding:'7px 16px',borderRadius:8,
              border:'1px solid #BFDBFE',background:C.blueBg,color:C.blue,
              fontSize:13,fontWeight:600,cursor:pdfLoading?'wait':'pointer',fontFamily:'inherit',
              opacity:pdfLoading?0.7:1,
            }}>
              <Download size={13} /> {pdfLoading ? 'Preparing…' : 'Download PDF'}
            </button>
          )}
        </div>

        {/* Table card */}
        <div style={{background:'#fff',border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${C.border}`,borderLeft:'4px solid #2563EB',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <h3 style={{margin:0,fontSize:14,fontWeight:600,color:C.textMain}}>{fiscalYear(selectedYear)} Annual Report</h3>
              <p style={{margin:'2px 0 0',fontSize:12,color:C.textMuted}}>
                {loading ? 'Loading…' : `${total} employees · sorted by country, branch, department`}
              </p>
            </div>
          </div>

          {loading && <div style={{padding:'60px 24px',textAlign:'center',color:C.textMuted,fontSize:14}}>Loading…</div>}
          {!loading && error && <div style={{padding:'32px',textAlign:'center',color:'#DC2626',fontSize:13}}>{error}</div>}
          {!loading && !error && rows.length === 0 && <div style={{padding:'60px 24px',textAlign:'center',color:C.textMuted,fontSize:14}}>No data found for {fiscalYear(selectedYear)}.</div>}

          {!loading && !error && rows.length > 0 && (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <colgroup>
                  <col style={{width:'4%'}} /><col style={{width:'8%'}} /><col style={{width:'18%'}} />
                  <col style={{width:'35%'}} /><col style={{width:'11%'}} /><col style={{width:'11%'}} /><col style={{width:'13%'}} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={th}>#</th>
                    <th style={th}>Emp ID</th>
                    <th style={th}>Name</th>
                    <th style={th}>Org Location</th>
                    <th style={{...th,textAlign:'center'}}>{fiscalH1(selectedYear)}</th>
                    <th style={{...th,textAlign:'center'}}>{fiscalH2(selectedYear)}</th>
                    <th style={{...th,textAlign:'center'}}>Talent Block</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const gi = (page - 1) * PAGE_SIZE + idx;
                    const even = gi % 2 === 0;
                    return (
                      <tr key={row.id}
                        style={{background: even ? '#fff' : '#FAFBFD', transition:'background 0.1s'}}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F0F7FF')}
                        onMouseLeave={e => (e.currentTarget.style.background = even ? '#fff' : '#FAFBFD')}>
                        <td style={{padding:'10px 12px',color:'#94A3B8',fontSize:12}}>{gi + 1}</td>
                        <td style={{padding:'10px 12px',color:C.textMuted,fontSize:12,fontVariantNumeric:'tabular-nums'}}>{row.emp_id ?? '—'}</td>
                        <td style={{padding:'10px 12px'}}>
                          <div style={{fontWeight:600,fontSize:13,color:C.textDark}}>{row.full_name}</div>
                          <div style={{fontSize:11,color:'#94A3B8',marginTop:1}}>{formatRole(row.role)}</div>
                        </td>
                        <td style={{padding:'10px 12px',color:C.textSub,fontSize:12.5,lineHeight:1.4}}>{row.org_location}</td>
                        <td style={{padding:'10px 12px',textAlign:'center'}}><Score value={row.h1_score} /></td>
                        <td style={{padding:'10px 12px',textAlign:'center'}}><Score value={row.h2_score} /></td>
                        <td style={{padding:'10px 12px',textAlign:'center'}}><TalentBadge value={row.talent_block} /></td>
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
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:16,flexWrap:'wrap',gap:8}}>
            <span style={{fontSize:12.5,color:C.textMuted}}>
              {((page-1)*PAGE_SIZE)+1}&#8211;{Math.min(page*PAGE_SIZE,total)} of {total}
            </span>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <button onClick={() => fetchReport(page-1)} disabled={page===1}
                style={{padding:'5px 12px',borderRadius:6,border:`1px solid ${C.border}`,background:'#fff',
                  color:page===1?'#CBD5E1':C.textDark,fontSize:12.5,cursor:page===1?'not-allowed':'pointer',fontFamily:'inherit'}}>
                ← Prev
              </button>
              {Array.from({length:totalPages},(_,i)=>i+1)
                .filter(p=>p===1||p===totalPages||Math.abs(p-page)<=1)
                .reduce((acc:(number|string)[],p,i,arr)=>{
                  if(i>0&&(p as number)-(arr[i-1] as number)>1) acc.push('...');
                  acc.push(p); return acc;
                },[])
                .map((p,i)=>p==='...'
                  ? <input
                      key={`e-${i}`}
                      type="number"
                      min={1}
                      max={totalPages}
                      placeholder="..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const val = parseInt((e.target as HTMLInputElement).value);
                          if (val >= 1 && val <= totalPages) { fetchReport(val); (e.target as HTMLInputElement).value = ''; }
                        }
                      }}
                      style={{
                        width: 48, padding: '4px 0', borderRadius: 6, textAlign: 'center',
                        border: `1px solid ${C.border}`, fontSize: 12.5, color: C.textMuted,
                        fontFamily: 'inherit', outline: 'none', background: '#fff',
                      }}
                    />
                  : <button key={p} onClick={()=>fetchReport(p as number)} style={{
                      padding:'5px 10px',borderRadius:6,
                      border:`1px solid ${p===page?C.blue:C.border}`,
                      background:p===page?C.blueBg:'#fff',color:p===page?C.blue:C.textDark,
                      fontSize:12.5,fontWeight:p===page?700:400,cursor:'pointer',fontFamily:'inherit'}}>{p}</button>
                )}
              <button onClick={() => fetchReport(page+1)} disabled={page===totalPages}
                style={{padding:'5px 12px',borderRadius:6,border:`1px solid ${C.border}`,background:'#fff',
                  color:page===totalPages?'#CBD5E1':C.textDark,fontSize:12.5,cursor:page===totalPages?'not-allowed':'pointer',fontFamily:'inherit'}}>
                Next →
              </button>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}