'use client';

/**
 * Branch Admin — Report Detail Page
 * Same UI as HQ Admin report detail, branch-level data from DB
 */

import { logger } from '@/utils/logger';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
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

import YearEndEmptyState from '@/components/reports/YearEndEmptyState';
import MetricCard from '@/components/shared/MetricCard';
import BellCurveChart from '@/components/bell-curve/BellCurveChart';
import ComparisonChart from '@/components/comparison/ComparisonChart';
import AIInsightCard from '@/components/ai/AIInsightCard';


import {
  branchByCodeApi,
  branchDashboardApi,
  bellCurveApi,
  comparisonLiveApi,
  branchInsightsApi,
  departmentsApi,
  metricsApi,
  activeReportYearApi,
} from '@/services/api';
import { reportRequestApi } from '@/services/reportRequestApi';
import { downloadReportAsPDF } from '@/utils/downloadReport';

import type {
  Branch,
  BranchDashboardSummary,
  BranchAIInsight,
  ReportType,
} from '@/types';

type DownloadStatus = 'idle' | 'requesting' | 'generating' | 'success' | 'failed';

const FALLBACK_INSIGHT_MID_YEAR =
  'Distribution follows a normal curve with slight right skew. Top 18% performers exceed 4.5 rating. Recommend targeted development programs for the lower 15%';

const FALLBACK_INSIGHT_YEAR_END =
  'Year-end performance shows improvement across all bands. Top performers increased by 37%. Distribution normalized successfully with 21% in exceptional category';

export default function BranchAdminReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const deptId = params?.deptId as string;
  const [deptName, setDeptName] = useState('Department');

  useEffect(() => {
    if (deptId) {
      departmentsApi.getById(deptId)
        .then(dept => setDeptName(dept.name))
        .catch(() => setDeptName('Department'));
    }
  }, [deptId]);

  const [branch, setBranch] = useState<Branch | null>(null);
  const [summary, setSummary] = useState<BranchDashboardSummary | null>(null);
  const [activeTab, setActiveTab] = useState<ReportType>('mid_year');
  const [bellCurveData, setBellCurveData] = useState<any[]>([]);
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const [insights, setInsights] = useState<BranchAIInsight[]>([]);
  const [metrics, setMetrics] = useState<{
    total_evaluated: number;
    avg_score: number;
    top_performers: number;
  } | null>(null);
  const [reportYear, setReportYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');

  useEffect(() => {
    activeReportYearApi.get()
      .then(data => setReportYear(data.active_report_year))
      .catch(() => setReportYear(new Date().getFullYear()));
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'branch_admin')) router.push('/');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.iata_branch_code && reportYear !== null) fetchAllData();
  }, [user?.iata_branch_code, activeTab, reportYear]);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    setBellCurveData([]);
    setComparisonData([]);
    setInsights([]);
    setMetrics(null);

    // ── Critical: page cannot render without these ──
    let branchData: Branch;
    let summaryData: BranchDashboardSummary;
    try {
      branchData = await branchByCodeApi.get(user!.iata_branch_code!);
      setBranch(branchData);
      summaryData = await branchDashboardApi.getSummary(branchData.id);
      setSummary(summaryData);
    } catch (err) {
      logger.error('Failed to load department report data', err);
      setError('Failed to load report data. Please try again.');
      setLoading(false);
      return;
    }

    // ── Non-critical: charts/metrics degrade gracefully on failure ──
    const activeReport = activeTab === 'mid_year' ? summaryData.mid_year : summaryData.year_end;

    await Promise.allSettled([
      metricsApi.get({ period_type: activeTab, year: reportYear!, scope: 'department', scope_id: deptId })
        .then(setMetrics)
        .catch(() => setMetrics({ total_evaluated: 0, avg_score: 0, top_performers: 0 })),

      bellCurveApi.getLive({ period_type: activeTab, year: reportYear!, scope: 'department', scope_id: deptId })
        .then(d => setBellCurveData(d as any))
        .catch(() => setBellCurveData([])),

      (activeReport
        ? branchInsightsApi.getByReport(activeReport.id).then(data => {
            if (data && data.length > 0) {
              setInsights(data);
            } else {
              const fallback = activeTab === 'mid_year' ? FALLBACK_INSIGHT_MID_YEAR : FALLBACK_INSIGHT_YEAR_END;
              setInsights([{ id: 'fallback-insight', report_id: activeReport.id, insight_text: fallback, insight_type: 'distribution_analysis', created_at: new Date().toISOString() }]);
            }
          })
        : Promise.resolve()
      ).catch(() => {}),

      comparisonLiveApi.get({ year: reportYear!, scope: 'department', scope_id: deptId })
        .then(setComparisonData)
        .catch(() => setComparisonData([])),
    ]);

    setLoading(false);
  };

  const handleDownload = async () => {
    if (!branch) {
      setError('Cannot download: No branch information available.');
      setDownloadStatus('failed');
      setTimeout(() => setDownloadStatus('idle'), 3000);
      return;
    }
    try {
      setError(null);
      setDownloadStatus('requesting');
      try {
        await reportRequestApi.create(branch.country_id, activeTab, 'current-admin-id');
      } catch (logErr) {
        // intentionally ignored
      }
      setDownloadStatus('generating');
      const fileName = `${deptName}-${activeTab === 'mid_year' ? 'Mid-Year' : 'Year-End'}-${reportYear!}.pdf`;
      await new Promise(resolve => setTimeout(resolve, 800));
      await downloadReportAsPDF('report-content', fileName, {
        entityType: 'Department',
        entityName: deptName,
        reportPeriod: activeTab === 'mid_year' ? 'Mid-Year' : 'Year-End',
        reportYear: reportYear!,
        metrics: metrics ? {
          totalEvaluated: metrics.total_evaluated,
          avgScore: metrics.avg_score.toFixed(2),
          topPerformers: metrics.top_performers,
        } : undefined,
        generatedAt: new Date(),
      });
      setDownloadStatus('success');
      setTimeout(() => setDownloadStatus('idle'), 3000);
    } catch (err: any) {
      setError(`Download Error: ${err?.message || 'Download failed.'}`);
      setDownloadStatus('failed');
      setTimeout(() => setDownloadStatus('idle'), 3000);
    }
  };

  const downloadButtonContent = () => {
    switch (downloadStatus) {
      case 'requesting': return <><Loader2 className="w-4 h-4 animate-spin" /> Preparing Request...</>;
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

  if (authLoading) return <div className="flex items-center justify-center p-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (!user || user.role !== 'branch_admin') return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F9FAFB]">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (error || !branch || !summary) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F9FAFB]">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Data not found'}</p>
          <button
            onClick={() => router.push('/branch-admin/reports')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Back to Reports
          </button>
        </div>
      </div>
    );
  }

  const isYearEndEmpty = activeTab === 'year_end' && (!metrics || metrics.total_evaluated === 0);

  return (
    <main className="flex-1 bg-[#F9FAFB] min-h-screen overflow-y-auto">
      <div className="flex flex-col gap-8 max-w-[1225px] mx-auto w-full px-8 py-6 pb-10">

        {/* ── Header Block ── */}
        <div className="flex flex-col gap-4">

          {/* Title Row */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <p className="text-[15px] text-[#4A5565]">
                {deptName} - Mid-Year &amp; Year-End Analytics
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
                <span className="text-[12.7px] text-[#4A5565]">Selected Department</span>
                <span className="text-[18px] font-semibold text-[#101828] leading-7">
                  {deptName}
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push('/branch-admin/reports')}
              className="flex items-center gap-2 px-3 py-[7px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-md text-[13px] font-medium text-[#1E293B] hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              <ChevronLeft className="w-4 h-4" />
              Change Department
            </button>
          </div>
        </div>

        {/* ── Tab Switcher ── */}
        <div className="flex bg-[#F3F4F6] p-[3px] rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('mid_year')}
            className={`px-[57px] py-[3.8px] text-[13.3px] font-medium rounded-xl transition-all ${activeTab === 'mid_year'
              ? 'bg-white text-[#1E293B] shadow-sm'
              : 'text-[#1E293B] hover:bg-gray-200/60'
              }`}
          >
            Mid-Year Report
          </button>
          <button
            onClick={() => setActiveTab('year_end')}
            className={`px-[58px] py-[3.8px] text-[13px] font-medium rounded-xl transition-all ${activeTab === 'year_end'
              ? 'bg-white text-[#1E293B] shadow-sm'
              : 'text-[#1E293B] hover:bg-gray-200/60'
              }`}
          >
            Year-End Report
          </button>
        </div>
        {/* Metric Cards — dynamic */}
          {metrics && (
            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                title="Total Evaluated"
                value={metrics.total_evaluated}
                icon={Users}
                iconColor="#155DFC"
                iconBgColor="#FFFFFF"
              />
              <MetricCard
                title="Avg Score"
                value={metrics.avg_score.toFixed(2)}
                subtitle="Calculated from distribution"
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

        {/* ── Report Content ── */}
        <div id="report-content" className="flex flex-col gap-8 p-6 bg-[#FFFFFF] rounded-xl min-h-[400px]">

          {/* Bell Curve Chart */}
          {isYearEndEmpty ? (
            <YearEndEmptyState />
          ) : bellCurveData.length > 0 ? (
            <BellCurveChart
              data={bellCurveData as any}
              title={`Bell Curve Distribution - ${activeTab === 'mid_year' ? 'Mid-Year' : 'Year-End'} ${reportYear! - 1}/${String(reportYear!).slice(-2)}`}
              subtitle={
                activeTab === 'mid_year'
                  ? 'Performance rating distribution with normalization'
                  : 'Final performance rating distribution with normalization'
              }
            />
          ) : null}

          {/* AI Insight strip */}
          {insights.length > 0 && (
            <div>
              {insights.map((insight) => (
                <AIInsightCard
                  key={insight.id}
                  insight={insight.insight_text}
                  type={activeTab === 'year_end' ? 'success' : 'info'}
                />
              ))}
            </div>
          )}


          {/* Comparison chart — shown for year-end when data available */}
          {activeTab === 'year_end' && (
            isYearEndEmpty ? (
              <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-6">
                <div className="mb-6">
                  <h4 className="text-[15px] font-semibold text-[#1E293B] mb-1.5">Mid-Year vs Year-End Comparison</h4>
                  <p className="text-[14px] text-[#64748B]">Performance progression across categories</p>
                </div>
                <YearEndEmptyState description="The Mid-Year vs Year-End comparison will be available once the H2 appraisal cycle is completed." />
              </div>
            ) : comparisonData.length > 0 ? (
              <ComparisonChart
                data={comparisonData as any}
                title="Mid-Year vs Year-End Comparison"
                subtitle="Performance progression across categories"
              />
            ) : null
          )}



        </div>

      </div>
    </main>
  );
}
