'use client';

/**
 * Country Admin Branch Report Details Page
 * Displays comprehensive performance analytics for a selected branch
 * Shows both mid-year and year-end reports with visualizations
 */

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronRight,
  ChevronLeft,
  Users,
  TrendingUp,
  Award,
  Building,
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
import CreateReportModal from '@/components/CreateReportModal';

import {
  branchDashboardApi,
  bellCurveApi,
  comparisonLiveApi,
  branchInsightsApi,
  branchesApi,
  metricsApi,
} from '@/services/api';
import { reportRequestApi } from '@/services/reportRequestApi';
import { downloadReportAsPDF } from '@/utils/downloadReport';
import { useAuth } from '@/lib/auth-context';

import type {
  BranchDashboardSummary,
  BranchBellCurveData,
  BranchPerformanceComparison,
  BranchAIInsight,
  Branch,
  ReportType,
} from '@/types';

type DownloadStatus = 'idle' | 'requesting' | 'generating' | 'success' | 'failed';

export default function BranchReportPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const branchId = params?.branchId as string;

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
  const [requestId, setRequestId] = useState<string | null>(null);

  // ← NEW — Create Report Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createReportSuccess, setCreateReportSuccess] = useState(false);

  const recommendations = [
    { text: 'Launch targeted coaching programs for the lower 15% to move them out of the 1.0–2.0 band.' },
    { text: 'Recognize and reward the high-performing 3.5–4.0 group to maintain their momentum.' },
    { text: 'Introduce leadership development programs to grow the top performer pool beyond 4.5.' },
    { text: 'Focus mid-level employees in the 3.0–3.5 band on skill development to push them into higher ratings.' },
  ];

  // Security check: verify user is country_admin
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'country_admin')) {
      router.push('/reports');
      return;
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (branchId && !authLoading && user?.role === 'country_admin') {
      fetchAllData();
    }
  }, [branchId, activeTab, authLoading, user?.role]);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔍 Fetching branch dashboard summary for ID:', branchId);
      const summaryData = await branchDashboardApi.getSummary(branchId);
      console.log('✅ Dashboard summary:', summaryData);

      // Use branch data from dashboard summary
      const branchData = summaryData.branch;
      console.log('✅ Branch data:', branchData);

      if (!branchData) {
        setError('Branch not found');
        return;
      }

      setBranch(branchData);
      setSummary(summaryData);

      const activeReport = activeTab === 'mid_year' ? summaryData.mid_year : summaryData.year_end;
      console.log('📊 Active report:', activeReport);

      // Fetch live bell curve from performance_summaries — independent of activeReport
      const bellCurve = await bellCurveApi.getLive({
        period_type: activeTab,
        year: 2026,
        scope: 'branch',
        scope_id: branchId,
      });
      console.log('✅ Bell curve data:', bellCurve);
      setBellCurveData(bellCurve as any);

      // Fetch dynamic metrics for the branch
      const metricsData = await metricsApi.get({
        period_type: activeTab,
        year: 2026,
        scope: 'branch',
        scope_id: branchId,
      });
      setMetrics(metricsData);

      if (activeReport) {
        console.log('🔍 Fetching insights...');
        const insightsData = await branchInsightsApi.getByReport(activeReport.id);
        console.log('✅ Insights data:', insightsData);
        if (insightsData && insightsData.length > 0) {
          setInsights(insightsData);
        } else {
          // Fallback AI insight when database has no records
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
      } else {
        console.log('⚠️ No active report found for:', activeTab);
      }

      const comparison = await comparisonLiveApi.get({
        year: 2026,
        scope: 'branch',
        scope_id: branchId,
      });
      setComparisonData(comparison);
    } catch (err: any) {
      console.error('❌ Error fetching data:', err);
      console.error('Error details:', err.response?.data || err.message);
      setError(`Failed to load report data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!branch || !branchId) {
      setError('Cannot download: No branch information available.');
      setDownloadStatus('failed');
      setTimeout(() => setDownloadStatus('idle'), 3000);
      return;
    }

    let currentRequestId = null;

    try {
      setError(null);
      setDownloadStatus('requesting');

      // Try to log the request to Supabase, but don't fail if it doesn't work
      try {
        const request = await reportRequestApi.create(
          branchId,
          activeTab,
          'current-admin-id'
        );
        currentRequestId = request.id;
        setRequestId(request.id);
        console.log('✅ Report request logged:', currentRequestId);
      } catch (logErr) {
        console.warn('⚠️ Failed to log report request (continuing anyway):', logErr);
        // Don't fail - just continue with download
      }

      setDownloadStatus('generating');
      const fileName = `${branch.name}-${activeTab === 'mid_year' ? 'Mid-Year' : 'Year-End'}-2026.pdf`;

      console.log('📥 Generating PDF:', fileName);
      await new Promise(resolve => setTimeout(resolve, 800));

      await downloadReportAsPDF('report-content', fileName);
      console.log('✅ PDF downloaded successfully');

      // Try to mark as completed, but don't fail if it doesn't work
      if (currentRequestId) {
        try {
          await reportRequestApi.updateStatus(currentRequestId, 'completed');
          console.log('✅ Download status marked as completed');
        } catch (statusErr) {
          console.warn('⚠️ Failed to update download status:', statusErr);
        }
      }

      setDownloadStatus('success');
      setTimeout(() => setDownloadStatus('idle'), 3000);

    } catch (err: any) {
      console.error('❌ Download failed:', err);
      const errorMsg = err?.message || 'Download failed. Please check your connection.';
      setError(`Download Error: ${errorMsg}`);

      if (currentRequestId) {
        try {
          await reportRequestApi.updateStatus(currentRequestId, 'failed');
        } catch (statusErr) {
          console.warn('⚠️ Failed to update failure status:', statusErr);
        }
      }
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

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F9FAFB]">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== 'country_admin') {
    return null;
  }

  if (error || !branch || !summary) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F9FAFB]">
        <div className="text-center">
          <p className="text-red-600 mb-4 font-bold text-lg">{error || 'Branch or report data not found'}</p>
          {error && <p className="text-gray-600 mb-4 text-sm">{error}</p>}
          {!branch && <p className="text-gray-600 mb-4 text-sm">Branch ID: {branchId}</p>}
          <button
            onClick={() => router.push('/country-admin/reports')}
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
            <a href="/country-admin" className="hover:text-[#1E293B] transition-colors">Home</a>
            <ChevronRight className="w-3.5 h-3.5 mx-1.5" />
            <a href="/country-admin/reports" className="hover:text-[#1E293B] transition-colors">Reports</a>
            <ChevronRight className="w-3.5 h-3.5 mx-1.5" />
            <span className="text-[#1E293B]">{branch.name}</span>
          </nav>

          {/* Title Row with Download button */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <h1 className="text-[28px] font-semibold text-[#101828] leading-9">
                Performance Reports
              </h1>
              <p className="text-[15px] text-[#4A5565]">
                {branch.name} - Mid-Year &amp; Year-End Analytics
              </p>
            </div>

            {/* ← NEW Action buttons */}
            <div className="flex items-center gap-3">
              {/* Create Report button */}
              {user && (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-[#155DFC] text-[13.5px] font-medium rounded-lg border border-[#155DFC] bg-white hover:bg-[#EFF6FF] active:scale-[0.98] transition-all"
                >
                  + Create Report
                </button>
              )}

              {/* Download button */}
              <button
                onClick={handleDownload}
                disabled={downloadStatus !== 'idle'}
                className={`flex items-center gap-2 px-4 py-2.5 text-white text-[13.5px] font-medium rounded-lg active:scale-[0.98] transition-all disabled:cursor-not-allowed ${downloadButtonColor()}`}
              >
                {downloadButtonContent()}
              </button>
            </div>
          </div>

          {/* Selected Branch Banner */}
          <div
            className="w-full rounded-xl border border-[#BEDBFF] px-4 py-3 flex items-center justify-between"
            style={{ background: 'linear-gradient(90deg, #EFF6FF 0%, #F3F4F6 100%)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 flex items-center justify-center">
                <Building className="w-6 h-6 text-[#155DFC]" />
              </div>
              <div className="flex flex-col">
                <span className="text-[12.7px] text-[#4A5565]">Selected Branch</span>
                <span className="text-[18px] font-semibold text-[#101828] leading-7">
                  {branch.name}
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push('/country-admin/reports')}
              className="flex items-center gap-2 px-3 py-[7px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-md text-[13px] font-medium text-[#1E293B] hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              <ChevronLeft className="w-4 h-4" />
              Change Branch
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

        {/* ─────────────────────────────────────────
            PRINTABLE AREA → becomes the PDF
        ───────────────────────────────────────── */}
        <div id="report-content" className="flex flex-col gap-8 p-6 bg-[#FFFFFF] rounded-xl min-h-[400px]">

          {/* ── Metric Cards — dynamic ── */}
          {metrics && (
            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                title="Total Evaluated"
                value={metrics.total_evaluated}
                subtitle={
                  activeTab === 'year_end'
                    ? '100% completion'
                    : `out of ${branch.total_employees}`
                }
                subtitleColor={activeTab === 'year_end' ? 'text-[#00A63E]' : 'text-[#6A7282]'}
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

          {/* ── Bell Curve Chart ── */}
          {bellCurveData.length > 0 && (
            <BellCurveChart
              data={bellCurveData}
              title={`Bell Curve Distribution - ${activeTab === 'mid_year' ? 'Mid-Year 2026' : 'Year-End 2026'
                }`}
              subtitle={
                activeTab === 'mid_year'
                  ? 'Performance rating distribution with normalization'
                  : 'Final performance rating distribution with normalization'
              }
            />
          )}

          {/* ── AI Insight strip ── */}
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
        {/* ── End printable area ── */}

        {/* Success message after saving report */}
        {createReportSuccess && (
          <div className="fixed bottom-4 right-4 bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 shadow-lg animate-pulse">
            Report saved successfully! View it in your <a href="/saved-reports" className="font-semibold underline">saved reports</a>.
          </div>
        )}
      </div>

      {/* Create Report Modal */}
      {user && branch && summary && (
        <CreateReportModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={(savedReport) => {
            setCreateReportSuccess(true);
            setTimeout(() => setCreateReportSuccess(false), 5000);
          }}
          reportType="branch"
          countryId={branch.country_id}
          branchId={branch.id}
          reportPeriod="both"
          reportYear={summary.year_end?.report_year || new Date().getFullYear()}
          userId={user.id}
          userEmail={user.email}
        />
      )}
    </main>
  );
}

