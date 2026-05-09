'use client';
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

// ── Types ──────────────────────────────────────────────────────────
interface Objective {
  objective_id: number; objective_name: string; category_name: string;
  weight: number; control_type: string; target: number | null; actual: number | null;
  manual_rating: number | null; achievement_pct: number | null; rating: number;
  score: number; scale_type: string; input_type: string | null;
  ll: number | null; ul: number | null; log_column: string; status: string;
}
interface Category {
  category_name: string; category_weight: number; category_score: number;
  max_possible: number; objectives: Objective[];
}
interface PerformanceData {
  employee: { id: string; name: string; designation: string; department: string };
  period: string; year: number;
  final_score: number;
  max_score: number;
  categories: Category[];
}

// ── Helpers ────────────────────────────────────────────────────────
const isChartable = (obj: Objective) =>
  obj.scale_type === 'interpolated' &&
  (obj.input_type === 'achievement_pct' || obj.input_type === 'raw_actual_x100') &&
  (obj.actual !== null || obj.achievement_pct !== null);

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:5000';

const C = {
  blue: '#155DFC', blueBg: '#EFF6FF', pageBg: '#F8F9FC', border: '#E2E8F0',
  textMain: '#101828', textSub: '#4A5565', textMuted: '#64748B', textDark: '#1E293B', green: '#00A63E',
};

function isRealUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function formatVal(val: number | null, inputType?: string | null): string {
  if (val === null) return '—';
  if (inputType === 'raw_actual_x100') return (val * 100).toFixed(1) + '%';
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function getFinalScore(d: PerformanceData | null): number | undefined {
  if (!d) return undefined;
  return (d as unknown as Record<string, number>)['final_score']
    ?? (d as unknown as Record<string, number>)['total_score'];
}

function isValidData(d: unknown): d is PerformanceData {
  if (!d || typeof d !== 'object') return false;
  const p = d as PerformanceData;
  return Array.isArray(p.categories) && p.categories.length > 0 &&
    p.categories.some(c => Array.isArray(c.objectives) && c.objectives.length > 0);
}

function ChartSkeleton() {
  return (
    <div style={{ height: 420, display: 'flex', alignItems: 'flex-end', gap: 12, padding: '20px 24px 0', paddingBottom: 8 }}>
      {[80, 55, 95, 70, 60, 85, 72, 90].map((h, i) => (
        <div key={i} style={{ flex: 1, height: `${h}%`, background: '#E2E8F0', borderRadius: '4px 4px 0 0' }} />
      ))}
    </div>
  );
}

function CustomXAxisTick(props: { x?: number; y?: number; payload?: { value: string } }) {
  const { x = 0, y = 0, payload } = props;
  if (!payload?.value) return null;
  const words = payload.value.split(' ');
  const mid   = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(' ');
  const line2 = words.slice(mid).join(' ');
  const needsWrap = payload.value.length > 14;
  return (
    <g transform={`translate(${x},${y})`}>
      {needsWrap ? (
        <>
          <text x={0} y={0} dy={14} textAnchor="middle" fontSize={10} fill="rgba(0,0,0,0.55)">{line1}</text>
          <text x={0} y={0} dy={26} textAnchor="middle" fontSize={10} fill="rgba(0,0,0,0.55)">{line2}</text>
        </>
      ) : (
        <text x={0} y={0} dy={14} textAnchor="middle" fontSize={10} fill="rgba(0,0,0,0.55)">{payload.value}</text>
      )}
    </g>
  );
}

// ── Custom Bar Label ───────────────────────────────────────────────
type ChartEntry = {
  name: string; fullName: string;
  Achievement: number; BlueVal: number; GreenVal: number; rating: number;
};

function BarLabel(props: Record<string, unknown>) {
  const { x, y, width, payload } = props as {
    x: number; y: number; width: number; payload?: ChartEntry;
  };
  if (!payload?.Achievement) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      textAnchor="middle"
      fontSize={10}
      fill="rgba(0,0,0,0.5)"
    >
      {Math.round(payload.Achievement)}%
    </text>
  );
}

// ── Shared My Performance Component ───────────────────────────────
export default function MyPerformance() {
  const searchParams               = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [resolving,  setResolving]  = useState(true);

  useEffect(() => {
    if (authLoading) return;

    const idFromUrl = searchParams.get('employee');
    if (idFromUrl && isRealUuid(idFromUrl)) {
      setEmployeeId(idFromUrl);
      setResolving(false);
      return;
    }

    if (user?.id && isRealUuid(user.id)) {
      setEmployeeId(user.id);
      setResolving(false);
      return;
    }

    const demoEmail =
      searchParams.get('demo-email') ??
      (typeof window !== 'undefined' ? localStorage.getItem('demo-email') : null);

    if (demoEmail) {
      fetch(`${API_BASE}/api/users/by-email?email=${encodeURIComponent(demoEmail)}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { id: string } | null) => {
          if (data?.id && isRealUuid(data.id)) {
            setEmployeeId(data.id);
          } else {
            setEmployeeId(null);
          }
        })
        .catch(() => setEmployeeId(null))
        .finally(() => setResolving(false));
      return;
    }

    setEmployeeId(null);
    setResolving(false);
  }, [authLoading, user, searchParams]);

  const [selectedPeriod, setSelectedPeriod] = useState<'H1' | 'H2'>('H1');
  const [showDetail,     setShowDetail]     = useState(false);
  const [openCats,       setOpenCats]       = useState<Record<string, boolean>>({});
  const [dataH1,         setDataH1]         = useState<PerformanceData | null>(null);
  const [dataH2,         setDataH2]         = useState<PerformanceData | null>(null);
  const [loading,        setLoading]        = useState(false);

  const fetchPeriod = async (empId: string, period: 'H1' | 'H2'): Promise<PerformanceData | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/performance/${empId}/2025/${period}`);
      if (!res.ok) return null;
      const d = await res.json();
      return isValidData(d) ? d : null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!employeeId) return;
    setDataH1(null); setDataH2(null); setShowDetail(false); setOpenCats({});
    setLoading(true);
    let cancelled = false;
    Promise.all([fetchPeriod(employeeId, 'H1'), fetchPeriod(employeeId, 'H2')])
      .then(([h1, h2]) => { if (!cancelled) { setDataH1(h1); setDataH2(h2); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId]);

  const data       = selectedPeriod === 'H1' ? dataH1 : dataH2;
  const categories = data?.categories ?? [];
  const toggle     = (n: string) => setOpenCats(p => ({ ...p, [n]: !p[n] }));

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.categories.flatMap(cat =>
      cat.objectives.filter(isChartable).map(obj => {
        let pct: number;
        if (obj.input_type === 'raw_actual_x100') {
          pct = obj.actual != null ? parseFloat((obj.actual * 100).toFixed(1))
              : obj.achievement_pct != null ? parseFloat(Number(obj.achievement_pct).toFixed(1)) : 0;
        } else {
          pct = obj.actual != null && obj.target != null && obj.target !== 0
              ? parseFloat(((obj.actual / obj.target) * 100).toFixed(1))
              : obj.achievement_pct != null ? parseFloat(Number(obj.achievement_pct).toFixed(1)) : 0;
        }
        return {
          name: obj.objective_name, fullName: obj.objective_name,
          Achievement: pct, BlueVal: Math.min(pct, 100),
          GreenVal: pct > 100 ? parseFloat((pct - 100).toFixed(1)) : 0,
          rating: obj.rating,
        };
      })
    );
  }, [data]);

  const isStillLoading = resolving || authLoading || loading;
  const noData         = !resolving && !authLoading && !loading && employeeId !== null && dataH1 === null && dataH2 === null;
  const noEmployee     = !resolving && !authLoading && employeeId === null;

  const [supervisorFeedback, setSupervisorFeedback] = useState<{
    feedback: string | null;
    evaluator: { name: string; designation: string } | null;
  } | null>(null);
  const [recommendations, setRecommendations] = useState<{ insight_text: string; insight_type: string }[]>([]);

  useEffect(() => {
    if (!employeeId) return;
    fetch(`${API_BASE}/api/feedback/${employeeId}/2025/${selectedPeriod}`)
      .then(r => r.json()).then(setSupervisorFeedback).catch(() => setSupervisorFeedback(null));
    fetch(`${API_BASE}/api/recommendations/${employeeId}/2025/${selectedPeriod}`)
      .then(r => r.json()).then(setRecommendations).catch(() => setRecommendations([]));
  }, [employeeId, selectedPeriod]);

  const displayName        = data?.employee?.name        ?? user?.full_name ?? null;
  const displayDesignation = data?.employee?.designation ?? null;

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ padding: '24px' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, fontSize: 13, color: C.textMuted, alignItems: 'center' }}>
          <Link href="/dashboard" style={{ color: C.textMuted, textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <span style={{ color: C.textDark }}>My Performance</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: C.textMain, margin: '0 0 4px' }}>My Performance</h1>
            <p style={{ fontSize: 15, color: C.textSub, margin: 0 }}>
              {isStillLoading ? 'Loading…'
                : displayName
                  ? displayDesignation ? `${displayName} · ${displayDesignation}` : displayName
                  : 'No profile found'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isStillLoading && <span style={{ fontSize: 12, color: C.textMuted }}>Loading…</span>}
            <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 12, padding: 3 }}>
              {(['H1', 'H2'] as const).map(p => {
                const active = p === selectedPeriod;
                return (
                  <button key={p} onClick={() => { setSelectedPeriod(p); setShowDetail(false); setOpenCats({}); }}
                    style={{ padding: '5px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      background: active ? '#fff' : 'transparent', color: active ? C.textDark : C.textMuted,
                      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                    {p} 2025
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Loading state */}
        {isStillLoading && (
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 16, color: C.textMuted, margin: 0 }}>Loading performance data…</p>
          </div>
        )}

        {/* No employee resolved */}
        {noEmployee && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 16, color: '#DC2626', margin: '0 0 8px', fontWeight: 600 }}>Could not identify employee</p>
            <p style={{ fontSize: 13, color: '#7F1D1D', margin: 0 }}>
              Use <code style={{ background: '#FEE2E2', padding: '1px 5px', borderRadius: 3 }}>?demo-email=ba.colombo@dartglobal.com</code> or sign in with a valid account.
            </p>
          </div>
        )}

        {/* No data found — clean message, no debug UUID */}
        {noData && (
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 16, color: C.textMuted, margin: '0 0 8px', fontWeight: 600 }}>
              No performance data found
            </p>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              Performance records for 2025 have not been entered yet. Please contact your administrator.
            </p>
          </div>
        )}

        {/* Main content */}
        {!isStillLoading && !noData && !noEmployee && (
          <>
            {/* Score Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              {([
                { label: 'H1', title: 'H1 Score', sub: 'First Half 2025',  score: getFinalScore(dataH1), accent: '#155DFC', bg: '#EFF6FF' },
                { label: 'H2', title: 'H2 Score', sub: 'Second Half 2025', score: getFinalScore(dataH2), accent: '#0092B8', bg: '#E0F7FA' },
              ] as const).map(card => {
                const isActive = card.label === selectedPeriod;
                return (
                  <div key={card.label}
                    onClick={() => { setSelectedPeriod(card.label); setShowDetail(false); setOpenCats({}); }}
                    style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, cursor: 'pointer',
                      opacity: isActive ? 1 : 0.38, transition: 'opacity 0.25s ease' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <div style={{ width: 36, height: 36, background: card.bg, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: card.accent, fontSize: 13, fontWeight: 700 }}>{card.label}</span>
                      </div>
                      <span style={{ fontSize: 14, color: C.textSub }}>{card.title}</span>
                    </div>
                    {card.score === undefined ? (
                      <div style={{ height: 44, background: '#F1F5F9', borderRadius: 6, marginBottom: 4, width: 120 }} />
                    ) : (
                      <>
                        <p style={{ fontSize: 36, fontWeight: 700, color: C.textDark, margin: '0 0 4px', fontVariantNumeric: 'tabular-nums' }}>
                          {card.score != null ? card.score.toFixed(2) : '—'}
                        </p>
                        <p style={{ fontSize: 13, color: C.green, margin: '0 0 12px' }}>{card.sub}</p>
                        <div style={{ height: 4, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${((card.score ?? 0) / 5) * 100}%`, height: '100%', background: card.accent, borderRadius: 4, transition: 'width 0.6s ease' }} />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Chart */}
            <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 24 }}>
              <div style={{ padding: '20px 24px 8px' }}>
                <h4 style={{ fontSize: 15, fontWeight: 600, color: C.textDark, margin: '0 0 2px' }}>Performance Breakdown — {selectedPeriod} 2025</h4>
                <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
                  Achievement % for financial & percentage-based KPIs
                  <span style={{ fontSize: 11, color: '#818ea0', marginLeft: 8 }}>(bracket & manual KPIs excluded)</span>
                </p>
              </div>
              <div style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 8 }}>
                {chartData.length === 0 ? <ChartSkeleton /> : (
                  <ResponsiveContainer width="100%" height={460}>
                    <BarChart data={chartData} barCategoryGap="40%" barSize={32} margin={{ top: 20, right: 8, bottom: 60, left: 8 }}>
                      <CartesianGrid strokeDasharray="0" stroke="rgba(0,0,0,0.13)" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} height={60} tick={<CustomXAxisTick />} />
                      <YAxis tick={{ fontSize: 11, fill: 'rgba(0,0,0,0.5)' }} axisLine={false} tickLine={false}
                        tickFormatter={(v: number) => v + '%'} domain={[0, 120]} ticks={[0, 20, 40, 60, 80, 100, 120]} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const e = payload[0]?.payload as typeof chartData[0];
                        if (!e) return null;
                        const pct = e.Achievement;
                        return (
                          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 16px', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxWidth: 240 }}>
                            <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#1E293B', fontSize: 13 }}>{e.fullName}</p>
                            <p style={{ margin: '2px 0', color: pct >= 100 ? '#10B981' : '#216BEB', fontWeight: 700, fontSize: 16 }}>
                              {pct.toFixed(1)}%<span style={{ fontSize: 11, fontWeight: 400, color: '#64748B', marginLeft: 6 }}>achievement</span>
                            </p>
                            {pct > 100 && <p style={{ margin: '4px 0 0', color: '#10B981', fontSize: 11 }}>+{(pct - 100).toFixed(1)}% above target</p>}
                            <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 11 }}>Rating: {e.rating.toFixed(2)} / 5</p>
                          </div>
                        );
                      }} />
                      <Bar dataKey="BlueVal" stackId="a" radius={[0, 0, 0, 0]} isAnimationActive={false}>
                        {chartData.map((_e, i) => <Cell key={i} fill="#216BEB" opacity={0.88} />)}
                      </Bar>
                      <Bar dataKey="GreenVal" stackId="a" radius={[4, 4, 0, 0]} isAnimationActive={false}
                        label={<BarLabel />}>
                        {chartData.map((e, i) => <Cell key={i} fill={e.GreenVal > 0 ? '#10B981' : 'transparent'} opacity={0.9} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div style={{ display: 'flex', gap: 20, justifyContent: 'center', paddingBottom: 16 }}>
                  {[{ color: '#216BEB', label: 'Below 100%' }, { color: '#10B981', label: 'Above 100%' }].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 11, height: 11, borderRadius: 3, background: l.color }} />
                      <span style={{ fontSize: 12, color: '#64748B' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: '0 24px 20px' }}>
                <button onClick={() => setShowDetail(d => !d)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                  borderRadius: 8, cursor: 'pointer', border: `1px solid ${C.border}`,
                  background: showDetail ? C.blueBg : '#fff', color: showDetail ? C.blue : C.textDark, fontSize: 14, fontWeight: 600 }}>
                  {showDetail ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  {showDetail ? 'Collapse Objective Breakdown' : 'View Full Objective Breakdown'}
                </button>
              </div>

              {showDetail && data && (
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  {categories.map(cat => (
                    <div key={cat.category_name}>
                      <div onClick={() => toggle(cat.category_name)} style={{ background: '#eff3fd', borderTop: '2px solid #d2e5fb', borderBottom: '1px solid #d2e4fa',
                        padding: '13px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#1E3A8A' }}>{cat.category_name}</span>
                          <span style={{ fontSize: 11, color: '#1D4ED8', background: '#cee1fa', padding: '2px 9px', borderRadius: 20, fontWeight: 600 }}>{cat.category_weight}%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#1E3A8A' }}>{cat.category_score.toFixed(2)}</span>
                            <span style={{ fontWeight: 400, color: '#64748B', fontSize: 12 }}> / {cat.max_possible.toFixed(2)}</span>
                          </div>
                          <div style={{ width: 56, height: 5, background: '#BFDBFE', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, (cat.category_score / cat.max_possible) * 100)}%`, height: '100%', background: '#1D4ED8', borderRadius: 3 }} />
                          </div>
                          {openCats[cat.category_name] ? <ChevronUp size={15} color="#1D4ED8" /> : <ChevronDown size={15} color="#1D4ED8" />}
                        </div>
                      </div>
                      {openCats[cat.category_name] && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead>
                              <tr style={{ background: '#F8FAFF' }}>
                                {[{ label: 'Objective', w: '32%' }, { label: 'Wt', w: '6%' }, { label: 'Target', w: '11%' },
                                  { label: 'Actual', w: '11%' }, { label: 'Rating', w: '22%' }, { label: 'Score', w: '8%' }].map(h => (
                                  <th key={h.label} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                                    color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em',
                                    borderBottom: '2px solid #E2E8F0', width: h.w }}>{h.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {cat.objectives.map(obj => (
                                <tr key={obj.objective_id} style={{ background: '#fff', borderBottom: '1px solid #F1F5F9' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFF')}
                                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                                  <td style={{ padding: '11px 12px', color: '#1E293B', fontWeight: 500 }}>{obj.objective_name}</td>
                                  <td style={{ padding: '11px 12px', color: '#64748B' }}>{obj.weight}%</td>
                                  <td style={{ padding: '11px 12px', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                                    {obj.scale_type === 'manual' ? '—' : formatVal(obj.target, obj.input_type)}
                                  </td>
                                  <td style={{ padding: '11px 12px', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                                    {obj.scale_type === 'manual'
                                      ? <span style={{ color: '#6366F1', fontSize: 11, background: '#EEF2FF', padding: '2px 7px', borderRadius: 4 }}>Rated {obj.manual_rating} / 5</span>
                                      : formatVal(obj.actual, obj.input_type)}
                                  </td>
                                  <td style={{ padding: '11px 12px', color: '#1E293B', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                    {obj.rating.toFixed(2)}<span style={{ opacity: 0.35, fontSize: 10, fontWeight: 400, marginLeft: 3 }}>/ 5</span>
                                  </td>
                                  <td style={{ padding: '11px 12px', fontWeight: 700, color: '#1E293B', fontVariantNumeric: 'tabular-nums' }}>{obj.score.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ background: '#2563EB' }}>
                                <td colSpan={5} style={{ padding: '11px 12px', color: '#93C5FD', fontWeight: 600, fontSize: 12 }}>Category Total</td>
                                <td style={{ padding: '11px 12px', color: '#fff', fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{cat.category_score.toFixed(2)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ background: '#1E40AF', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#ddecff', fontWeight: 700, fontSize: 15 }}>Grand Total — {selectedPeriod} 2025</span>
                    <div>
                      <span style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{getFinalScore(data)?.toFixed(2) ?? '—'}</span>
                      <span style={{ color: '#93C5FD', fontSize: 13, marginLeft: 6 }}>/ 5.00</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Supervisor Feedback */}
            <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 24 }}>
              <div style={{ padding: '20px 24px 8px' }}>
                <h4 style={{ fontSize: 15, fontWeight: 600, color: C.textDark, margin: 0 }}>Supervisor Feedback</h4>
                <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 0' }}>
                  {selectedPeriod} 2025 — {supervisorFeedback?.evaluator?.name ?? 'Supervisor'} Review
                </p>
              </div>
              <div style={{ padding: '0 24px 20px' }}>
                <div style={{ background: C.blueBg, borderRadius: 8, padding: '14px 16px', borderLeft: '3px solid #155DFC' }}>
                  <p style={{ fontSize: 14, color: '#364153', lineHeight: '26px', margin: 0 }}>
                    {supervisorFeedback?.feedback ?? 'No feedback available for this period.'}
                  </p>
                </div>
              </div>
            </div>

            {/* AI Recommendations */}
            <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12 }}>
              <div style={{ padding: '20px 24px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 18 }}>✦</span>
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: C.textDark, margin: 0 }}>AI-Powered Recommendations</h4>
                </div>
                <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 16px' }}>
                  Personalized insights based on your {selectedPeriod} 2025 KPI results
                </p>
              </div>
              <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {recommendations.length > 0
                  ? recommendations.map((rec, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#AD46FF', flexShrink: 0, marginTop: 8 }} />
                        <p style={{ fontSize: 14, color: '#364153', lineHeight: '23px', margin: 0 }}>{rec.insight_text}</p>
                      </div>
                    ))
                  : <p style={{ fontSize: 14, color: C.textMuted, margin: 0 }}>No recommendations available for this period.</p>
                }
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}