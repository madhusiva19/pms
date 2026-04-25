'use client';

/**
 * Dept Admin — Report Detail Page
 * Same UI as HQ Admin report detail, branch-level data from DB
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
import BellCurveChart from '@/components/BellCurveChart';
import ComparisonChart from '@/components/ComparisonChart';
import AIInsightCard from '@/components/AIInsightCard';
import AIRecommendationsList from '@/components/AIRecommendationsList';


import {
  branchByCodeApi,
  branchDashboardApi,
  bellCurveApi,
  comparisonLiveApi,
  branchInsightsApi,
  subDepartmentsApi,
  metricsApi,
} from '@/services/api';
import { reportRequestApi } from '@/services/reportRequestApi';
import { downloadReportAsPDF } from '@/utils/downloadReport';

import type {
  Branch,
  BranchDashboardSummary,
  BranchBellCurveData,
  BranchPerformanceComparison,
  BranchAIInsight,
  ReportType,
} from '@/types';

type DownloadStatus = 'idle' | 'requesting' | 'generating' | 'success' | 'failed';

export default function DeptAdminReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const subDeptId = params?.subDeptId as string;
  const [teamName, setTeamName] = useState('Team');

  useEffect(() => {
    if (subDeptId) {
      subDepartmentsApi.getById(subDeptId)
        .then(subdept => setTeamName(subdept.name))
        .catch(() => setTeamName('Team'));
    }
  }, [subDeptId]);

  const [branch, setBranch] = useState<Branch | null>(null);
  const [summary, setSummary] = useState<BranchDashboardSummary | null>(null);
  const [activeTab, setActiveTab] = useState<ReportType>('mid_year');
  const [bellCurveData, setBellCurveData] = useState<BranchBellCurveData[]>([]);
  const [comparisonData, setComparisonData] = useState<BranchPerformanceComparison[]>([]);
  const [insights, setInsights] = useState<BranchAIInsight[]>([]);
  const [metrics, setMetrics] = useState<{
    total_evaluated: number;
    avg_score: number;
    top_performers: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');

  const recommendations = [
    { text: 'Launch targeted coaching programs for the lower 15% to move them out of the 1.0–2.0 band.' },
    { text: 'Recognize and reward the high-performing 3.5–4.0 group to maintain their momentum.' },
    { text: 'Introduce leadership development programs to grow the top performer pool beyond 4.5.' },
    { text: 'Focus mid-level employees in the 3.0–3.5 band on skill development to push them into higher ratings.' },
  ];

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'dept_admin')) router.push('/');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.iata_branch_code) fetchAllData();
  }, [user?.iata_branch_code, activeTab]);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Clear previous data to prevent stale charts showing on tab switch
      setBellCurveData([]);
      setComparisonData([]);
      setInsights([]);
      setMetrics(null);

      const branchData = await branchByCodeApi.get(user!.iata_branch_code!);
      setBranch(branchData);

      const summaryData = await branchDashboardApi.getSummary(branchData.id);
      setSummary(summaryData);

      const activeReport = activeTab === 'mid_year' ? summaryData.mid_year : summaryData.year_end;

      // Fetch dynamic metrics scoped to this sub-department
      const metricsData = await metricsApi.get({
        period_type: activeTab,
        year: 2026,
        scope: 'sub_department',
        scope_id: subDeptId,
      });
      setMetrics(metricsData);

      // Bell curve — always fetch, independent of activeReport
      const bellCurve = await bellCurveApi.getLive({
        period_type: activeTab,
        year: 2026,
        scope: 'sub_department',
        scope_id: subDeptId,
      });
      setBellCurveData(bellCurve as any);

      // Insights — still gated on activeReport (uses legacy report table IDs)
      if (activeReport) {
        const insightsData = await branchInsightsApi.getByReport(activeReport.id);
        if (insightsData && insightsData.length > 0) {
          setInsights(insightsData);
        } else {
          const fallbackInsight = activeTab === 'mid_year'
            ? 'Distribution follows a normal curve with slight right skew. Top 18% performers exceed 4.5 rating. Recommend targeted development programs for the lower 15%'
            : 'Year-end performance shows improvement across all bands. Top performers increased by 37%. Distribution normalized successfully with 21% in exceptional category';
          setInsights([{
            id: 'fallback-insight',
            report_id: activeReport.id,
            insight_text: fallbackInsight,
            insight_type: 'distribution_analysis',
            created_at: new Date().toISOString(),
          }]);
        }
      }

      // Comparison — always fetch live data for both periods
      const comparison = await comparisonLiveApi.get({
        year: 2026,
        scope: 'sub_department',
        scope_id: subDeptId,
      });
      setComparisonData(comparison);
    } catch (err) {
      setError('Failed to load report data. Please try again.');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
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
        console.warn('⚠️ Failed to log report request:', logErr);
      }
      setDownloadStatus('generating');
      const fileName = `${teamName}-${activeTab === 'mid_year' ? 'Mid-Year' : 'Year-End'}-2026.pdf`;
      await new Promise(resolve => setTimeout(resolve, 800));
      await downloadReportAsPDF('report-content', fileName);
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
  if (!user || user.role !== 'dept_admin') return null;

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
            onClick={() => router.push('/dept-admin/reports')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Back to Reports
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 p-2 bg-[#F9FAFB] min-h-screen overflow-y-auto">
      <div className="flex flex-col gap-8 max-w-[1225px]">

        {/* ── Header Block ── */}
        <div className="flex flex-col gap-4">

          {/* Breadcrumb */}
          <nav className="flex flex-wrap items-center gap-0 text-[13px] text-[#64748B]">
            <a href="/dept-admin" className="hover:text-[#1E293B] transition-colors">Home</a>
            <ChevronRight className="w-3.5 h-3.5 mx-1.5" />
            <a href="/dept-admin/reports" className="hover:text-[#1E293B] transition-colors">Reports</a>
            <ChevronRight className="w-3.5 h-3.5 mx-1.5" />
            <span className="text-[#1E293B]">{teamName}</span>
          </nav>

          {/* Title Row */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <h1 className="text-[28px] font-semibold text-[#101828] leading-9">
                Performance Reports
              </h1>
              <p className="text-[15px] text-[#4A5565]">
                {teamName} - Mid-Year &amp; Year-End Analytics
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
                <span className="text-[12.7px] text-[#4A5565]">Selected Team</span>
                <span className="text-[18px] font-semibold text-[#101828] leading-7">
                  {teamName}
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push('/dept-admin/reports')}
              className="flex items-center gap-2 px-3 py-[7px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-md text-[13px] font-medium text-[#1E293B] hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              <ChevronLeft className="w-4 h-4" />
              Change Team
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
                subtitle="In team"
                subtitleColor="text-[#6A7282]"
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
          {bellCurveData.length > 0 && (
            <BellCurveChart
              data={bellCurveData as any}
              title={`Bell Curve Distribution - ${activeTab === 'mid_year' ? 'Mid-Year 2026' : 'Year-End 2026'}`}
              subtitle={
                activeTab === 'mid_year'
                  ? 'Performance rating distribution with normalization'
                  : 'Final performance rating distribution with normalization'
              }
            />
          )}

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

          {/* Recommendations (mid-year only) */}
          {activeTab === 'mid_year' && (
            <AIRecommendationsList recommendations={recommendations} />
          )}

           {/* Comparison chart — always shown when data available */}
                    {activeTab === 'year_end' && comparisonData.length > 0 && (
                      <ComparisonChart
                        data={comparisonData as any}
                        title="Mid-Year vs Year-End Comparison"
                        subtitle="Performance progression across categories"
                      />
                    )}
                    
          

        </div>

      </div>
    </main>
  );
}
