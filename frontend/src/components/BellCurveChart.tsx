'use client';

/**
 * Bell Curve Distribution Chart Component
 * Visualizes performance rating distribution with Figma-matching colored bars
 */

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { BellCurveData } from '@/types';

interface BellCurveChartProps {
  data: BellCurveData[];
  title: string;
  subtitle: string;
}

const BAR_COLORS = [
  '#EF4444', // 1.0–1.5  Flamingo / red
  '#F97316', // 1.5–2.0  Ecstasy / orange
  '#F59E0B', // 2.0–2.5  Buttercup / amber
  '#EAB308', // 2.5–3.0  Corn / yellow
  '#84CC16', // 3.0–3.5  Lima / lime
  '#22C55E', // 3.5–4.0  Mountain Meadow / green
  '#10B981', // 4.0–4.5  Emerald
  '#059669', // 4.5–5.0  Green Haze / dark green
];

export default function BellCurveChart({ data, title, subtitle }: BellCurveChartProps) {
  const chartData = data.map((item) => ({
    range: item.rating_range,
    count: item.employee_count,
  }));

  const maxCount = Math.max(...data.map((d) => d.employee_count), 10);
  const yMax = Math.ceil(maxCount / 10) * 10 + 10;

  return (
    <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        <h4 className="text-[15px] font-semibold text-[#1E293B] gap-2 leading-4 mb-1.5">{title}</h4>
        <p className="text-[15px] text-[#64748B] gap-2 leading-6">{subtitle}</p>
      </div>

      {/* Chart */}
      <div className="px-6 pt-4 pb-5">
        <div style={{ height: 350, width: '70%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barCategoryGap="1%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis
                dataKey="range"
                tick={{ fill: '#64748B', fontSize: 12 }}
                axisLine={{ stroke: '#64748B' }}
                tickLine={{ stroke: '#64748B' }}
              />
              <YAxis
                tick={{ fill: '#64748B', fontSize: 12 }}
                axisLine={{ stroke: '#64748B' }}
                tickLine={{ stroke: '#64748B' }}
                width={36}
                domain={[0, yMax]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={78}>
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}