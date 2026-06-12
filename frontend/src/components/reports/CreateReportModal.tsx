'use client';

import React, { useState, useEffect } from 'react';
import {
  X, Brain, Download,
  CheckCircle, Globe, Clock, Loader2,
} from 'lucide-react';
import { generateSavedReportPDF } from '@/utils/generateSavedReportPDF';
import { savedReportsApi, countriesApi, dashboardApi, metricsApi } from '@/services/api';
import type { SavedReport, Country } from '@/types';

type ReportMode = 'year_comparison' | 'multi_country';
type PeriodType = 'mid_year' | 'year_end' | 'both';
type SaveStep = 'idle' | 'fetching' | 'saving' | 'downloading' | 'done';

interface CreateReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (savedReport: SavedReport) => void;
  reportType: 'country' | 'branch';
  countryId: string;
  branchId?: string;
  reportPeriod: 'mid_year' | 'year_end' | 'both';
  reportYear: number;
  userId: string;
  userEmail?: string;
}

const MODE_CARDS = [
  {
    id: 'year_comparison' as ReportMode,
    Icon: Clock,
    activeBorder: 'border-[#2563EB]',
    activeBg: 'bg-[#EFF6FF]',
    activeIconBg: 'bg-[#2563EB]',
    activeBtnBg: 'bg-[#2563EB] hover:bg-[#1D4ED8]',
    title: 'Compare Past Years',
    desc: 'Track trends across multiple years',
  },
  {
    id: 'multi_country' as ReportMode,
    Icon: Globe,
    activeBorder: 'border-[#2563EB]',
    activeBg: 'bg-[#EFF6FF]',
    activeIconBg: 'bg-[#2563EB]',
    activeBtnBg: 'bg-[#2563EB] hover:bg-[#1D4ED8]',
    title: 'Multi-Country',
    desc: 'Compare countries side by side',
  },
];

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: 'mid_year', label: 'Mid-Year' },
  { value: 'year_end', label: 'Year-End' },
  { value: 'both',     label: 'Both' },
];

export default function CreateReportModal({
  isOpen, onClose, onSuccess,
  reportType, countryId, branchId,
  reportPeriod, reportYear,
  userId, userEmail,
}: CreateReportModalProps) {

  const [mode, setMode] = useState<ReportMode>('year_comparison');

  // Common fields
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [adminComment, setAdminComment] = useState('');

  // Year comparison
  const [selectedPastYears, setSelectedPastYears] = useState<number[]>([]);
  const [ycPeriod, setYcPeriod] = useState<PeriodType>('year_end');

  // Multi-country
  const [countries, setCountries] = useState<Country[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [selectedCountryIds, setSelectedCountryIds] = useState<string[]>([]);
  const [mcPeriod, setMcPeriod] = useState<PeriodType>('year_end');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStep, setSaveStep] = useState<SaveStep>('idle');

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setMode('year_comparison');
      setReportName('');
      setReportDescription('');
      setAdminComment('');
      setSelectedPastYears([]);
      setYcPeriod('year_end');
      setSelectedCountryIds([]);
      setMcPeriod('year_end');
      setIsLoading(false);
      setError(null);
      setSaveStep('idle');
    }
  }, [isOpen, reportPeriod]);

  // Load countries when switching to multi_country mode
  useEffect(() => {
    if (mode === 'multi_country' && countries.length === 0 && !countriesLoading) {
      setCountriesLoading(true);
      countriesApi.getAll()
        .then(setCountries)
        .catch(() => setError('Failed to load countries'))
        .finally(() => setCountriesLoading(false));
    }
  }, [mode, countries.length, countriesLoading]);

  // Handlers
  const togglePastYear = (year: number) => {
    setSelectedPastYears(prev =>
      prev.includes(year)
        ? prev.filter(y => y !== year)
        : prev.length < 3 ? [...prev, year] : prev
    );
  };

  const toggleCountry = (id: string) => {
    setSelectedCountryIds(prev =>
      prev.includes(id)
        ? prev.filter(c => c !== id)
        : prev.length < 5 ? [...prev, id] : prev
    );
  };

  const fetchMetrics = async (periodType: 'mid_year' | 'year_end', year: number, scope: string, scopeId: string) => {
    const m = await metricsApi.get({ period_type: periodType, year, scope: scope as any, scope_id: scopeId });
    return m && m.total_evaluated > 0 ? m : null;
  };

  // Submit
  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError(null);

    if (!reportName.trim()) { setError('Report name is required'); return; }
    if (mode === 'multi_country' && selectedCountryIds.length < 2) {
      setError('Select at least 2 countries for comparison'); return;
    }
    if (mode === 'year_comparison' && selectedPastYears.length === 0) {
      setError('Select at least 1 past year to compare'); return;
    }

    setIsLoading(true);
    setSaveStep('fetching');

    try {
      let trendMetrics: Record<string, any> = { type: mode };
      if (adminComment.trim()) trendMetrics.admin_comment = adminComment.trim();

      if (mode === 'year_comparison') {
        const years = [reportYear, ...selectedPastYears].sort((a, b) => b - a);
        const scope = reportType === 'branch' ? 'branch' : 'country';
        const scopeId = reportType === 'branch' ? (branchId ?? countryId) : countryId;
        const periods: ('mid_year' | 'year_end')[] = ycPeriod === 'both'
          ? ['mid_year', 'year_end']
          : [ycPeriod];

        const yearData = await Promise.all(
          years.map(async (year) => {
            const entry: Record<string, any> = { year };
            for (const p of periods) {
              try {
                const m = await fetchMetrics(p, year, scope, scopeId);
                entry[p] = m
                  ? { avg_score: m.avg_score, top_performers: m.top_performers, total_evaluated: m.total_evaluated }
                  : { avg_score: 0, top_performers: 0, total_evaluated: 0 };
              } catch {
                entry[p] = { avg_score: 0, top_performers: 0, total_evaluated: 0 };
              }
            }
            return entry;
          })
        );

        trendMetrics.year_data = yearData;
        trendMetrics.comparison_years = selectedPastYears;
        trendMetrics.period = ycPeriod;
      }

      if (mode === 'multi_country') {
        const periods: ('mid_year' | 'year_end')[] = mcPeriod === 'both'
          ? ['mid_year', 'year_end']
          : [mcPeriod];

        const countryData = await Promise.all(
          selectedCountryIds.map(async (cId) => {
            const country = countries.find(c => c.id === cId);
            const entry: Record<string, any> = {
              country_id: cId,
              country_name: country?.name ?? cId,
            };
            try {
              const summary = await dashboardApi.getSummary(cId);
              for (const p of periods) {
                const r = p === 'mid_year' ? summary.mid_year : summary.year_end;
                entry[p] = r
                  ? { avg_score: r.avg_score, top_performers: r.top_performers, total_evaluated: r.total_evaluated }
                  : { avg_score: 0, top_performers: 0, total_evaluated: 0 };
              }
            } catch {
              for (const p of periods) {
                entry[p] = { avg_score: 0, top_performers: 0, total_evaluated: 0 };
              }
            }
            return entry;
          })
        );

        trendMetrics.country_data = countryData;
        trendMetrics.comparison_period = mcPeriod;
      }

      // Save to DB
      setSaveStep('saving');
      const dbPayload = {
        user_id: userId,
        report_name: reportName.trim(),
        ...(reportDescription.trim() && { report_description: reportDescription.trim() }),
        report_type: reportType,
        country_id: mode === 'multi_country'
          ? (selectedCountryIds[0] ?? countryId)
          : countryId,
        ...(branchId && { branch_id: branchId }),
        report_period: mode === 'multi_country' ? mcPeriod : ycPeriod,
        report_year: reportYear,
        metrics_included: [],
        charts_included: [],
        include_ai_insights: false,
        include_comparison: false,
        created_by_email: userEmail,
        is_trend_report: true,
        selected_periods: [],
        trend_metrics: trendMetrics,
        is_shared: false,
        shared_with_emails: [],
      };

      let savedReport: SavedReport;
      try {
        savedReport = await savedReportsApi.create(dbPayload);
      } catch {
        savedReport = {
          ...dbPayload,
          id: `local-${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as SavedReport;
      }

      // Generate + Download PDF
      setSaveStep('downloading');
      await generateSavedReportPDF({ ...savedReport, trend_metrics: trendMetrics, is_trend_report: true } as any);

      setSaveStep('done');
      setTimeout(() => {
        onClose();
        onSuccess?.(savedReport);
      }, 1200);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSaveStep('idle');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const activeCard = MODE_CARDS.find(c => c.id === mode)!;
  const ActiveIcon = activeCard.Icon;

  const submitLabel = () => {
    switch (saveStep) {
      case 'fetching':    return <><Loader2 className="w-4 h-4 animate-spin" /> Fetching data…</>;
      case 'saving':      return <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>;
      case 'downloading': return <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…</>;
      case 'done':        return <><CheckCircle className="w-4 h-4" /> Saved!</>;
      default:            return <><Download className="w-4 h-4" /> Save &amp; Download</>;
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={onClose} />

      {/* Modal shell */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-8 py-6 border-b border-[#E2E8F0] bg-gradient-to-r from-[#EFF6FF] to-[#F8FAFF]">
            <div className="flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm ${activeCard.activeIconBg}`}>
                <ActiveIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-[18px] font-semibold text-[#101828]">Create Report</h2>
                <p className="text-[13px] text-[#4A5565] mt-0.5">{activeCard.desc}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[#6B7280] hover:text-[#101828] hover:bg-[#F3F4F6] transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
            <div className="px-8 py-6 space-y-6 flex-1">

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[13px] text-red-700">
                  {error}
                </div>
              )}

              {/* Mode selector — 2 cards */}
              <div className="grid grid-cols-2 gap-3">
                {MODE_CARDS.map(card => {
                  const isActive = mode === card.id;
                  const CardIcon = card.Icon;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      disabled={isLoading}
                      onClick={() => setMode(card.id)}
                      className={`rounded-xl border-2 p-3.5 text-left transition-all ${
                        isActive
                          ? `${card.activeBorder} ${card.activeBg}`
                          : 'border-[#E2E8F0] bg-[#F9FAFB] hover:border-[#C7D2FE]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? card.activeIconBg : 'bg-[#E2E8F0]'}`}>
                          <CardIcon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#6B7280]'}`} />
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-[#101828]">{card.title}</p>
                          <p className="text-[11px] text-[#6B7280] leading-tight mt-0.5">{card.desc}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Report Name */}
              <div className="space-y-1.5">
                <label className="block text-[13px] font-semibold text-[#374151]">
                  Report Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={reportName}
                  onChange={e => setReportName(e.target.value)}
                  placeholder={
                    mode === 'multi_country'   ? 'e.g., Global Country Comparison 2026' :
                                                 'e.g., India 3-Year Performance Trend'
                  }
                  className="w-full h-11 px-4 bg-white border border-[#E2E8F0] rounded-xl text-[14px] text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/15 focus:border-[#2563EB] transition-all"
                  disabled={isLoading}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="block text-[13px] font-semibold text-[#374151]">
                  Description{' '}
                  <span className="text-[#94A3B8] font-normal">(Optional)</span>
                </label>
                <textarea
                  value={reportDescription}
                  onChange={e => setReportDescription(e.target.value)}
                  placeholder="Add context or notes for this report"
                  rows={2}
                  className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-xl text-[14px] text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/15 focus:border-[#2563EB] transition-all resize-none"
                  disabled={isLoading}
                />
              </div>

              {/* HQ Admin Remarks */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[13px] font-semibold text-[#374151]">
                  <Brain className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  HQ Admin Remarks{' '}
                  <span className="text-[#94A3B8] font-normal">(Optional)</span>
                </label>
                <textarea
                  value={adminComment}
                  onChange={e => setAdminComment(e.target.value)}
                  placeholder="Add key findings or recommendations for the board"
                  rows={2}
                  className="w-full px-4 py-3 bg-[#FAF5FF] border border-[#E9D5FF] rounded-xl text-[14px] text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/15 focus:border-[#8B5CF6] transition-all resize-none"
                  disabled={isLoading}
                />
              </div>

              {/* YEAR COMPARISON */}
              {mode === 'year_comparison' && (
                <>
                  {/* Trend period toggle */}
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-semibold text-[#374151] shrink-0">
                      Trend period:
                    </span>
                    {PERIOD_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        disabled={isLoading}
                        onClick={() => setYcPeriod(value)}
                        className={`px-4 py-2 rounded-lg border text-[13px] font-medium transition-all ${
                          ycPeriod === value
                            ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]'
                            : 'border-[#E2E8F0] text-[#6B7280] hover:border-[#2563EB]/50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Past year chips */}
                  <div className="border border-[#E2E8F0] rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 bg-[#F9FAFB] border-b border-[#E2E8F0] flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-[#101828]">
                        Select Past Years <span className="text-red-500">*</span>
                      </span>
                      <span className="text-[12px] text-[#6B7280]">
                        Compare with {reportYear} (up to 3)
                      </span>
                    </div>
                    <div className="p-5 flex flex-wrap gap-3">
                      {[reportYear - 1, reportYear - 2, reportYear - 3].map(year => {
                        const selected = selectedPastYears.includes(year);
                        const maxed = !selected && selectedPastYears.length >= 3;
                        return (
                          <button
                            key={year}
                            type="button"
                            disabled={isLoading || maxed}
                            onClick={() => togglePastYear(year)}
                            className={`px-5 py-3 rounded-xl border-2 text-[14px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                              selected
                                ? 'border-[#0892B8] bg-[#ECFEFF] text-[#0892B8]'
                                : 'border-[#E2E8F0] bg-white text-[#374151] hover:border-[#0892B8]/50'
                            }`}
                          >
                            {year}
                          </button>
                        );
                      })}
                    </div>
                    {selectedPastYears.length > 0 && (
                      <div className="px-5 pb-4 text-[12px] text-[#4A5565]">
                        Comparing:{' '}
                        <span className="font-semibold text-[#0892B8]">
                          {[reportYear, ...selectedPastYears].sort((a, b) => b - a).join(' → ')}
                        </span>
                        {ycPeriod !== 'year_end' && (
                          <span className="ml-2 text-[#2563EB] font-semibold">
                            · {ycPeriod === 'both' ? 'Mid-Year & Year-End' : 'Mid-Year'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* MULTI-COUNTRY */}
              {mode === 'multi_country' && (
                <>
                  {/* Trend period toggle */}
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-semibold text-[#374151] shrink-0">
                      Trend period:
                    </span>
                    {PERIOD_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        disabled={isLoading}
                        onClick={() => setMcPeriod(value)}
                        className={`px-4 py-2 rounded-lg border text-[13px] font-medium transition-all ${
                          mcPeriod === value
                            ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]'
                            : 'border-[#E2E8F0] text-[#6B7280] hover:border-[#2563EB]/50'
                        }`}
                      >
                        {label} {value !== 'both' ? reportYear : ''}
                      </button>
                    ))}
                  </div>

                  {/* Country list */}
                  <div className="border border-[#E2E8F0] rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 bg-[#F9FAFB] border-b border-[#E2E8F0] flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-[#101828]">
                        Select Countries <span className="text-red-500">*</span>
                      </span>
                      <span className="text-[12px] text-[#6B7280]">
                        {selectedCountryIds.length > 0
                          ? `${selectedCountryIds.length} selected (min 2, max 5)`
                          : 'Select at least 2'}
                      </span>
                    </div>

                    {countriesLoading ? (
                      <div className="flex items-center justify-center gap-2 p-8 text-[13px] text-[#6B7280]">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading countries…
                      </div>
                    ) : (
                      <div className="divide-y divide-[#F3F4F6] max-h-[220px] overflow-y-auto">
                        {countries.map(country => {
                          const checked  = selectedCountryIds.includes(country.id);
                          const disabled = !checked && selectedCountryIds.length >= 5;
                          return (
                            <label
                              key={country.id}
                              className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
                                disabled
                                  ? 'opacity-40 cursor-not-allowed'
                                  : checked
                                  ? 'bg-[#EFF6FF]'
                                  : 'hover:bg-[#F9FAFB]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => !disabled && toggleCountry(country.id)}
                                disabled={isLoading || disabled}
                                className="w-4 h-4 accent-[#2563EB]"
                              />
                              <div className="flex-1 min-w-0">
                                <span className="text-[13.5px] font-medium text-[#374151]">
                                  {country.name}
                                </span>
                                <span className="text-[12px] text-[#94A3B8] ml-2">
                                  {country.total_employees?.toLocaleString()} employees
                                </span>
                              </div>
                              {checked && (
                                <span className="text-[11px] font-semibold text-[#2563EB] bg-[#DBEAFE] px-2 py-0.5 rounded-full">
                                  Selected
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-[#E2E8F0] bg-white flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1 h-11 px-4 text-[#374151] bg-[#F3F4F6] rounded-xl hover:bg-[#E5E7EB] transition-colors disabled:opacity-50 font-medium text-[13.5px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isLoading ||
                  saveStep !== 'idle' ||
                  !reportName.trim() ||
                  (mode === 'multi_country' && selectedCountryIds.length < 2) ||
                  (mode === 'year_comparison' && selectedPastYears.length === 0)
                }
                className={`flex-1 h-11 px-4 text-white rounded-xl transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed font-medium text-[13.5px] flex items-center justify-center gap-2 ${saveStep === 'done' ? 'bg-[#00A63E] hover:bg-[#00913A]' : activeCard.activeBtnBg}`}
              >
                {submitLabel()}
              </button>
            </div>
          </form>

        </div>
      </div>
    </>
  );
}
