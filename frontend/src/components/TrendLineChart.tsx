'use client';

/**
 * Trend Line Chart Component
 * Visualizes metric progression across multiple periods using a line chart
 */

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TrendAnalysis } from '@/types';

interface TrendLineChartProps {
  data: TrendAnalysis;
  title?: string;
  subtitle?: string;
}

export default function TrendLineChart({
  data,
  title = 'Performance Trends',
  subtitle = 'Metric progression across periods',
}: TrendLineChartProps) {
  if (!data.periods || data.periods.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No trend data available</p>
      </div>
    );
  }

  // Prepare chart data
  const chartData = data.periods.map((period) => ({
    name: period.period.replace(/_/g, ' ').toUpperCase(),
    'Avg Score': period.metrics.avg_score,
    'Top Performers (÷10)': period.metrics.top_performers / 10, // Scale down for visibility
    'Completion %': period.metrics.completion_percentage,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-[#E2E8F0]">
          <p className="text-sm font-medium text-[#374151]">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p
              key={index}
              style={{ color: entry.color }}
              className="text-sm font-medium"
            >
              {entry.name}: {entry.value.toFixed(2)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-4 bg-white rounded-lg border border-[#E2E8F0] p-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-[#101828]">{title}</h2>
        <p className="text-sm text-[#6B7280]">{subtitle}</p>
      </div>

      {/* Chart */}
      <div className="w-full h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis
              dataKey="name"
              stroke="#6B7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke="#6B7280"
              style={{ fontSize: '12px' }}
              label={{ value: 'Value', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
              formatter={(value) => (
                <span style={{ color: '#6B7280', fontSize: '12px' }}>
                  {value}
                </span>
              )}
            />

            {/* Avg Score Line */}
            <Line
              type="monotone"
              dataKey="Avg Score"
              stroke="#2563EB"
              strokeWidth={3}
              dot={{ fill: '#2563EB', r: 6 }}
              activeDot={{ r: 8 }}
              isAnimationActive={true}
            />

            {/* Top Performers Line (scaled) */}
            <Line
              type="monotone"
              dataKey="Top Performers (÷10)"
              stroke="#10B981"
              strokeWidth={3}
              dot={{ fill: '#10B981', r: 6 }}
              activeDot={{ r: 8 }}
              isAnimationActive={true}
            />

            {/* Completion % Line */}
            <Line
              type="monotone"
              dataKey="Completion %"
              stroke="#F59E0B"
              strokeWidth={3}
              dot={{ fill: '#F59E0B', r: 6 }}
              activeDot={{ r: 8 }}
              isAnimationActive={true}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend Info */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#E2E8F0]">
        <div className="text-center">
          <p className="text-xs text-[#6B7280] mb-1">Avg Score</p>
          <div className="w-2 h-2 bg-[#2563EB] rounded-full mx-auto"></div>
        </div>
        <div className="text-center">
          <p className="text-xs text-[#6B7280] mb-1">Top Performers (÷10)</p>
          <div className="w-2 h-2 bg-[#10B981] rounded-full mx-auto"></div>
        </div>
        <div className="text-center">
          <p className="text-xs text-[#6B7280] mb-1">Completion %</p>
          <div className="w-2 h-2 bg-[#F59E0B] rounded-full mx-auto"></div>
        </div>
      </div>

      {/* Note */}
      <p className="text-xs text-[#6B7280] text-center">
        Note: Top Performers scaled ÷10 for visibility alongside other metrics
      </p>
    </div>
  );
}
