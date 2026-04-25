'use client';

/**
 * Sub Dept Admin — Report Detail Page
 * Shows team performance across the year (H1 + H2 together)
 */

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  ChevronRight,
  ChevronLeft,
  Users,
  TrendingUp,
  Award,
  MapPin,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react';

import MetricCard from '@/components/MetricCard';
import AIInsightCard from '@/components/AIInsightCard';
import AIRecommendationsList from '@/components/AIRecommendationsList';
import SubDeptScoreBarChart from '@/components/SubDeptScoreBarChart';
import type { TeamScoreEntry } from '@/components/SubDeptScoreBarChart';

import {
  employeesApi,
  performanceSummariesApi,
  metricsApi,
} from '@/services/api';
import { downloadReportAsPDF } from '@/utils/downloadReport';

type DownloadStatus = 'idle' | 'generating' | 'success' | 'failed';

export default function SubDeptAdminReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const employeeId = params?.employeeId as string;

  const [empName, setEmpName] = useState('Employee');
  const [teamScores, setTeamScores] = useState<TeamScoreEntry[]>([]);

  // Combined metrics — uses mid_year for total/top, both periods for employee score
  const [metrics, setMetrics] = useState<{
    total_evaluated: number;
    top_performers: number;
    employee_mid_year: number | null;
    employee_year_end: number | null;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');

  const recommendations = [
    { text: 'Launch targeted coaching programs for the lower 15% to move them out of the 1.0–2.0 band.' },
    { text: 'Recognize and reward the high-performing 3.5–4.0 group to maintain their momentum.' },
    { text: 'Introduce leadership development programs to grow the top performer pool beyond 4.5.' },
    { text: 'Focus mid-level employees in the 3.0–3.5 band on skill development to push them into higher ratings.' },
  ];

  const overallInsight = 'Year-over-year team performance shows progression. Compare mid-year and year-end scores to identify employees who improved, stayed stable, or need support.';

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'sub_dept_admin')) router.push('/');
  }, [user, authLoading, router]);

  // Fetch employee name
  useEffect(() => {
    if (employeeId) {
      employeesApi.getById(employeeId)
        .then(emp => setEmpName(emp.full_name))
        .catch(() => setEmpName('Employee'));
    }
  }, [employeeId]);

  // Fetch team scores (mid-year + year-end together)
  useEffect(() => {
    if (!user?.sub_department_id || !employeeId) return;
    setLoading(true);
    employeesApi.getBySubDepartment(user.sub_department_id)
      .then(async (emps) => {
        const scores = await Promise.all(
          emps.map(async (emp) => {
            const records = await performanceSummariesApi.getByUser(emp.id, 2026);
            const midYear = records.find((r: any) => r.period === 'mid_year');
            const yearEnd = records.find((r: any) => r.period === 'year_end');
            return {
              employeeId: emp.id,
              name: emp.full_name,
              midYearScore: midYear ? midYear.total_score : undefined,
              yearEndScore: yearEnd ? yearEnd.total_score : undefined,
            };
          })
        );
        setTeamScores(scores);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.sub_department_id, employeeId]);

  // Fetch metrics for both periods
  useEffect(() => {
    if (!user?.sub_department_id || !employeeId) return;
    setMetrics(null);

    Promise.all([
      metricsApi.get({
        period_type: 'mid_year',
        year: 2026,
        scope: 'sub_department',
        scope_id: String(user.sub_department_id),
        employee_id: employeeId,
      }),
      metricsApi.get({
        period_type: 'year_end',
        year: 2026,
        scope: 'sub_department',
        scope_id: String(user.sub_department_id),
        employee_id: employeeId,
      }),
    ])
      .then(([midYearMetrics, yearEndMetrics]) => {
        setMetrics({
          total_evaluated: Math.max(midYearMetrics.total_evaluated, yearEndMetrics.total_evaluated),
          top_performers: Math.max(midYearMetrics.top_performers, yearEndMetrics.top_performers),
          employee_mid_year: midYearMetrics.employee_score,
          employee_year_end: yearEndMetrics.employee_score,
        });
      })
      .catch(console.error);
  }, [user?.sub_department_id, employeeId]);

  const handleDownload = async () => {
    try {
      setDownloadStatus('generating');
      const fileName = `${empName}-Performance-2026.pdf`;
      await new Promise(resolve => setTimeout(resolve, 800));
      await downloadReportAsPDF('report-content', fileName);
      setDownloadStatus('success');
      setTimeout(() => setDownloadStatus('idle'), 3000);
    } catch (err: any) {
      setDownloadStatus('failed');
      setTimeout(() => setDownloadStatus('idle'), 3000);
    }
  };

  const downloadButtonContent = () => {
    switch (downloadStatus) {
      case 'generating': return <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF...</>;
      case 'success': return <><CheckCircle className="w-4 h-4" /> Downloaded!</>;
      case 'failed': return <><XCircle className="w-4 h-4" /> Failed. Try Again</>;
      default: return <><Download className="w-4 h-4" /> Download Report</>;
    }
  };

  const downloadButtonColor = () => {
    switch (downloadStatus) {
      case 'success': return 'bg-[#00A63E] hover:bg-[#00A63E]';
      case 'failed': return 'bg-red-500 hover:bg-red-600';
      default: return 'bg-[#2563EB] hover:bg-[#1D4ED8]';
    }
  };

  if (authLoading) return (
    <div className="flex items-center justify-center p-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
  if (!user || user.role !== 'sub_dept_admin') return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F9FAFB]">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  // Format employee score string for display
  const employeeScoreDisplay = () => {
    if (!metrics) return 'N/A';
    const mid = metrics.employee_mid_year;
    const end = metrics.employee_year_end;
    if (mid === null && end === null) return 'N/A';
    if (mid !== null && end !== null) return `${mid.toFixed(2)} / ${end.toFixed(2)}`;
    if (mid !== null) return `${mid.toFixed(2)} / —`;
    return `— / ${end?.toFixed(2)}`;
  };

  return (
    <main className="flex-1 p-2 bg-[#F9FAFB] min-h-screen overflow-y-auto">
      <div className="flex flex-col gap-8 max-w-[1225px]">

        {/* ── Header Block ── */}
        <div className="flex flex-col gap-4">

          {/* Breadcrumb */}
          <nav className="flex flex-wrap items-center gap-0 text-[13px] text-[#64748B]">
            <a href="/sub-dept-admin" className="hover:text-[#1E293B] transition-colors">Home</a>
            <ChevronRight className="w-3.5 h-3.5 mx-1.5" />
            <a href="/sub-dept-admin/reports" className="hover:text-[#1E293B] transition-colors">Reports</a>
            <ChevronRight className="w-3.5 h-3.5 mx-1.5" />
            <span className="text-[#1E293B]">{empName}</span>
          </nav>

          {/* Title Row */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <h1 className="text-[28px] font-semibold text-[#101828] leading-9">
                Performance Reports
              </h1>
              <p className="text-[15px] text-[#4A5565]">
                {empName} — Mid-Year & Year-End 2026 Analytics
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleDownload}
                disabled={downloadStatus !== 'idle'}
                className={`flex items-center gap-2 px-4 py-2.5 text-white text-[13.5px] font-medium rounded-lg active:scale-[0.98] transition-all disabled:cursor-not-allowed ${downloadButtonColor()}`}
              >
                {downloadButtonContent()}
              </button>
            </div>
          </div>

          {/* Selected Entity Banner */}
          <div
            className="w-full rounded-xl border border-[#BEDBFF] px-4 py-3 flex items-center justify-between"
            style={{ background: 'linear-gradient(90deg, #EFF6FF 0%, #F3F4F6 100%)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-[#155DFC]" />
              </div>
              <div className="flex flex-col">
                <span className="text-[12.7px] text-[#4A5565]">Selected Employee</span>
                <span className="text-[18px] font-semibold text-[#101828] leading-7">
                  {empName}
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push('/sub-dept-admin/reports')}
              className="flex items-center gap-2 px-3 py-[7px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-md text-[13px] font-medium text-[#1E293B] hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              <ChevronLeft className="w-4 h-4" />
              Change Employee
            </button>
          </div>
        </div>

        {/* ── Report Content ── */}
        <div id="report-content" className="flex flex-col gap-8 p-6 bg-[#FFFFFF] rounded-xl min-h-[400px]">

          {/* Empty state */}
          {metrics && metrics.total_evaluated === 0 && (
            <div className="flex flex-col items-center justify-center p-20 text-center bg-[#F9FAFB] rounded-lg border border-dashed border-gray-200">
              <p className="text-[#64748B] text-[15px] font-medium">No performance data found for {empName}.</p>
              <p className="text-[#94A3B8] text-[13px] mt-1">Please ensure the data is loaded in the database.</p>
            </div>
          )}

          {/* Metric Cards — Total Evaluated, Score (Mid / End), Top Performers */}
          {metrics && metrics.total_evaluated > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                title="Total Evaluated"
                value={metrics.total_evaluated}
                subtitle="In sub-department"
                subtitleColor="text-[#6A7282]"
                icon={Users}
                iconColor="#155DFC"
                iconBgColor="#FFFFFF"
              />
              <MetricCard
                title="Score (Mid / End)"
                value={employeeScoreDisplay()}
                subtitle={`${empName}'s mid-year and year-end score`}
                subtitleColor="text-[#00A63E]"
                icon={TrendingUp}
                iconColor="#0092B8"
                iconBgColor="#FFFFFF"
              />
              <MetricCard
                title="Top Performers"
                value={metrics.top_performers}
                subtitle="Rating ≥ 4.5"
                subtitleColor="text-[#6A7282]"
                icon={Award}
                iconColor="#4F39F6"
                iconBgColor="#FFFFFF"
              />
            </div>
          )}

          {/* Team Score Bar Chart — both periods together */}
          {teamScores.length > 0 && (
            <SubDeptScoreBarChart
              data={teamScores}
              currentEmployeeId={employeeId}
              title="Team Performance Scores"
              subtitle="Mid-Year & Year-End 2026 — selected employee highlighted"
            />
          )}

          {/* AI Insight strip */}
          <AIInsightCard
            insight={overallInsight}
            type="info"
          />

          {/* Recommendations */}
          <AIRecommendationsList recommendations={recommendations} />

        </div>

      </div>
    </main>
  );
}