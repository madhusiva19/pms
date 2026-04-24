'use client';

/**
 * Performance Comparison Chart Component
 * Compares mid-year vs year-end performance
 * Supports both PerformanceComparison[] and { current, previous, labels } formats
 */

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { PerformanceComparison } from '@/types';

// ── Format A: from reports/[countryId]/page.tsx ──
// PerformanceComparison[] → { rating_range, mid_year_count, year_end_count }

// ── Format B: from saved-reports page ──
// { current: number[], previous: number[], labels: string[] }

interface FormatB {
  current: number[];
  previous: number[];
  labels: string[];
}

type ComparisonData = PerformanceComparison[] | FormatB;

interface ComparisonChartProps {
  data: ComparisonData;
  title?: string;
  subtitle?: string;
  currentLabel?: string | number;  // used as Year-End label in saved reports
  pastLabel?: string | number;     // used as Mid-Year label in saved reports
}

function isFormatB(data: ComparisonData): data is FormatB {
  return !Array.isArray(data) && 'current' in data && 'previous' in data && 'labels' in data;
}

export default function ComparisonChart({
  data,
  title,
  subtitle,
  currentLabel,
  pastLabel,
}: ComparisonChartProps) {

  // ── Safety check ──
  if (!data) {
    return (
      <div className="w-full p-8 text-center bg-[#F9FAFB] rounded-xl border border-dashed border-[#E5E7EB]">
        <p className="text-[#64748B] text-[14px]">No comparison data available.</p>
      </div>
    );
  }

  // ── Normalize both formats into chartData ──
  let chartData: { range: string; 'Mid-Year': number; 'Year-End': number }[] = [];
  let midYearLabel = pastLabel ? String(pastLabel) : 'Mid-Year';
  let yearEndLabel = currentLabel ? String(currentLabel) : 'Year-End';

  if (isFormatB(data)) {
    if (!Array.isArray(data.current) || !Array.isArray(data.previous)) {
      return (
        <div className="w-full p-8 text-center bg-[#F9FAFB] rounded-xl border border-dashed border-[#E5E7EB]">
          <p className="text-[#64748B] text-[14px]">Comparison data format error.</p>
        </div>
      );
    }
    chartData = data.labels.map((label, idx) => ({
      range: label,
      'Mid-Year': data.previous[idx] ?? 0,
      'Year-End': data.current[idx] ?? 0,
    }));
  } else {
    if (!Array.isArray(data) || data.length === 0) {
      return (
        <div className="w-full p-8 text-center bg-[#F9FAFB] rounded-xl border border-dashed border-[#E5E7EB]">
          <p className="text-[#64748B] text-[14px]">No comparison data available.</p>
        </div>
      );
    }
    chartData = data.map((item) => ({
      range: item.rating_range,
      'Mid-Year': item.mid_year_count,
      'Year-End': item.year_end_count,
    }));
  }

  return (
    <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-6">

      {/* Header */}
      {(title || subtitle) && (
        <div className="mb-6">
          {title && <h4 className="text-[15px] font-semibold text-[#1E293B] mb-1.5">{title}</h4>}
          {subtitle && <p className="text-[14px] text-[#64748B]">{subtitle}</p>}
        </div>
      )}

      {/* Chart */}
      <div className="pt-2 pb-2">
        <div style={{ height: 350, width: '70%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="range"
              tick={{ fill: '#64748B', fontSize: 12 }}
              axisLine={{ stroke: '#64748B' }}
            />
            <YAxis
              tick={{ fill: '#64748B', fontSize: 12 }}
              axisLine={{ stroke: '#64748B' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
              }}
            />
            <Legend />
            {/* Mid-Year — blue #2B7FFF */}
            <Bar
              dataKey="Mid-Year"
              name={midYearLabel}
              fill="#2B7FFF"
              radius={[4, 4, 0, 0]}
            />
            {/* Year-End — green #41C400 */}
            <Bar
              dataKey="Year-End"
              name={yearEndLabel}
              fill="#41C400"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}