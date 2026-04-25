'use client';

/**
 * Country Report Details Page
 * Displays comprehensive performance analytics for a selected country
 * Shows both mid-year and year-end reports with visualizations
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
  Download,       // ← NEW
  Loader2,        // ← NEW
  CheckCircle,    // ← NEW
  XCircle,        // ← NEW
} from 'lucide-react';

import MetricCard from '@/components/MetricCard';
import BellCurveChart from '@/components/BellCurveChart';
import ComparisonChart from '@/components/ComparisonChart';
import AIInsightCard from '@/components/AIInsightCard';
import AIRecommendationsList from '@/components/AIRecommendationsList';
import CreateReportModal from '@/components/CreateReportModal';

import {
  dashboardApi,
  bellCurveApi,
  comparisonApi,
  insightsApi,
  countriesApi,
  metricsApi,
} from '@/services/api';
import { reportRequestApi } from '@/services/reportRequestApi';  // ← NEW
import { downloadReportAsPDF } from '@/utils/downloadReport';    // ← NEW

import type {
  DashboardSummary,
  BellCurveData,
  PerformanceComparison,
  AIInsight,
  Country,
  ReportType,
} from '@/types';

// ← NEW
type DownloadStatus = 'idle' | 'requesting' | 'generating' | 'success' | 'failed';

export default function CountryReportPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const countryId = params?.countryId as string;

  const [country, setCountry] = useState<Country | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activeTab, setActiveTab] = useState<ReportType>('mid_year');
  const [bellCurveData, setBellCurveData] = useState<BellCurveData[]>([]);
  const [comparisonData, setComparisonData] = useState<PerformanceComparison[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [metrics, setMetrics] = useState<{
    total_evaluated: number;
    avg_score: number;
    top_performers: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ← NEW — Create Report Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createReportSuccess, setCreateReportSuccess] = useState(false);

  // ← NEW — download state
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');
  const [requestId, setRequestId] = useState<string | null>(null);

  const recommendations = [
    { text: 'Launch targeted coaching programs for the lower 15% to move them out of the 1.0–2.0 band.' },
    { text: 'Recognize and reward the high-performing 3.5–4.0 group to maintain their momentum.' },
    { text: 'Introduce leadership development programs to grow the top performer pool beyond 4.5.' },
    { text: 'Focus mid-level employees in the 3.0–3.5 band on skill development to push them into higher ratings.' },
  ];

  useEffect(() => {
    if (countryId) {
      fetchAllData();
    }
  }, [countryId, activeTab]);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      const countryData = await countriesApi.getById(countryId);
      setCountry(countryData);

      const summaryData = await dashboardApi.getSummary(countryId);
      setSummary(summaryData);

      const activeReport = activeTab === 'mid_year' ? summaryData.mid_year : summaryData.year_end;

      // Fetch live bell curve from performance_summaries
      const bellCurve = await bellCurveApi.getLive({
        period_type: activeTab,
        year: 2026,
        scope: 'country',
        scope_id: countryId,
      });
      setBellCurveData(bellCurve);

      // Fetch dynamic metrics (total_evaluated, avg_score, top_performers)
      const metricsData = await metricsApi.get({
        period_type: activeTab,
        year: 2026,
        scope: 'country',
        scope_id: countryId,
      });
      setMetrics(metricsData);

      if (activeReport) {
        const insightsData = await insightsApi.getByReport(activeReport.id);
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
      }

      if (activeTab === 'year_end') {
        const comparison = await comparisonApi.getByCountry(
          countryId,
          summaryData.year_end?.report_year
        );
        setComparisonData(comparison);
      }
    } catch (err) {
      setError('Failed to load report data. Please try again.');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── NEW — Download flow ──────────────────────────────────────────────
  // Step 1 — POST to report_requests table (status: "pending")
  // Step 2 — Generate PDF using html2canvas + jsPDF
  // Step 3 — PATCH status to "completed" or "failed"
  // ────────────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!country || !countryId) {
      setError('Cannot download: No country information available.');
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
          countryId,
          activeTab,
          user?.id ?? 'unknown'
        );
        currentRequestId = request.id;
        setRequestId(request.id);
        console.log('✅ Report request logged:', currentRequestId);
      } catch (logErr) {
        console.warn('⚠️ Failed to log report request (continuing anyway):', logErr);
        // Don't fail - just continue with download
      }

      setDownloadStatus('generating');
      const fileName = `${country.name}-${activeTab === 'mid_year' ? 'Mid-Year' : 'Year-End'}-2026.pdf`;

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

  // ← NEW — button appearance based on download status
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
  // ── END NEW ──────────────────────────────────────────────────────────

  const activeReport = activeTab === 'mid_year' ? summary?.mid_year : summary?.year_end;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F9FAFB]">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (error || !country || !summary) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F9FAFB]">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Country not found'}</p>
          <button
            onClick={() => router.push('/hq-admin/reports')}
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

          {/* Breadcrumb — unchanged */}
          <nav className="flex flex-wrap items-center gap-0 text-[13px] text-[#64748B]">
            <a href="/" className="hover:text-[#1E293B] transition-colors">Home</a>
            <ChevronRight className="w-3.5 h-3.5 mx-1.5" />
            <a href="/hq-admin/reports" className="hover:text-[#1E293B] transition-colors">Reports</a>
            <ChevronRight className="w-3.5 h-3.5 mx-1.5" />
            <span className="text-[#1E293B]">{country.name}</span>
          </nav>

          {/* Title Row — NEW: Download button added on right */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <h1 className="text-[28px] font-semibold text-[#101828] leading-9">
                Performance Reports
              </h1>
              <p className="text-[15px] text-[#4A5565]">
                {country.name} - Mid-Year &amp; Year-End Analytics
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

          {/* Selected Country Banner — unchanged */}
          <div
            className="w-full rounded-xl border border-[#BEDBFF] px-4 py-3 flex items-center justify-between"
            style={{ background: 'linear-gradient(90deg, #EFF6FF 0%, #F3F4F6 100%)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-[#155DFC]" />
              </div>
              <div className="flex flex-col">
                <span className="text-[12.7px] text-[#4A5565]">Selected Country</span>
                <span className="text-[18px] font-semibold text-[#101828] leading-7">
                  {country.name}
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push('/hq-admin/reports')}
              className="flex items-center gap-2 px-3 py-[7px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-md text-[13px] font-medium text-[#1E293B] hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              <ChevronLeft className="w-4 h-4" />
              Change Country
            </button>
          </div>
        </div>

        {/* ── Tab Switcher — unchanged ── */}
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
         {/* ── Metric Cards — dynamic ── */}
          {metrics && (
            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                title="Total Evaluated"
                value={metrics.total_evaluated}
                subtitle={
                  activeTab === 'year_end'
                    ? '100% completion'
                    : `out of ${country.total_employees}`
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

        {/* ─────────────────────────────────────────
            PRINTABLE AREA → becomes the PDF
            ← NEW: added id="report-content"
        ───────────────────────────────────────── */}
        <div id="report-content" className="flex flex-col gap-8 p-6 bg-[#FFFFFF] rounded-xl min-h-[400px]">

          {!activeReport && (
            <div className="flex flex-col items-center justify-center p-20 text-center bg-[#F9FAFB] rounded-lg border border-dashed border-gray-200">
              <p className="text-[#64748B] text-[15px] font-medium">No {activeTab === 'mid_year' ? 'mid-year' : 'year-end'} report data found for {country.name}.</p>
              <p className="text-[#94A3B8] text-[13px] mt-1">Please ensure the data is loaded in the database.</p>
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

          {/* ── Bottom Section: Recommendations OR Comparison — unchanged ── */}
          {activeTab === 'mid_year' ? (
            <AIRecommendationsList recommendations={recommendations} />
          ) : (
            comparisonData.length > 0 && (
              <ComparisonChart
                data={comparisonData}
                title="Mid-Year vs Year-End Comparison"
                subtitle="Performance progression across categories"
              />
            )
          )}

        </div>
        {/* ── End printable area ── */}

        {/* Success toast after creating report */}
        {createReportSuccess && (
          <div className="fixed bottom-4 right-4 bg-green-50 border border-green-200 rounded-lg px-5 py-3.5 text-green-700 shadow-lg flex items-center gap-2 text-[13.5px] font-medium">
            <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Report saved &amp; downloaded successfully!
          </div>
        )}
      </div>

      {/* Create Report Modal */}
      {user && (
        <CreateReportModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={(savedReport) => {
            setCreateReportSuccess(true);
            setTimeout(() => setCreateReportSuccess(false), 5000);
          }}
          reportType="country"
          countryId={countryId}
          reportPeriod="both"
          reportYear={summary?.year_end?.report_year || new Date().getFullYear()}
          userId={user.id}
          userEmail={user.email}
        />
      )}
    </main>
  );
}
