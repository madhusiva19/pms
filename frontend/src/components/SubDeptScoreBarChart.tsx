'use client';

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

export interface TeamScoreEntry {
  employeeId: string;
  name: string;
  midYearScore: number | undefined;
  yearEndScore: number | undefined;
}

interface SubDeptScoreBarChartProps {
  data: TeamScoreEntry[];
  currentEmployeeId: string;
  title: string;
  subtitle: string;
}

const HIGHLIGHT_MID = '#93C5FD';
const HIGHLIGHT_END = '#2563EB';
const NEUTRAL_MID   = '#CBD5E1';
const NEUTRAL_END   = '#94A3B8';

function getShortName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export default function SubDeptScoreBarChart({
  data,
  currentEmployeeId,
  title,
  subtitle,
}: SubDeptScoreBarChartProps) {
  const chartData = data.map(entry => ({
    name: getShortName(entry.name),
    mid_year: entry.midYearScore,
    year_end: entry.yearEndScore,
    isCurrent: entry.employeeId === currentEmployeeId,
  }));

  return (
    <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl">
      <div className="px-6 pt-6 pb-0">
        <h4 className="text-[15px] font-semibold text-[#1E293B] leading-4 mb-1.5">{title}</h4>
        <p className="text-[15px] text-[#64748B] leading-6">{subtitle}</p>
      </div>

      <div className="px-6 pt-4 pb-5">
        <div style={{ height: 350 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barCategoryGap="20%"
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#64748B', fontSize: 11 }}
                axisLine={{ stroke: '#64748B' }}
                tickLine={{ stroke: '#64748B' }}
              />
              <YAxis
                domain={[0, 5]}
                ticks={[0, 1, 2, 3, 4, 5]}
                tick={{ fill: '#64748B', fontSize: 12 }}
                axisLine={{ stroke: '#64748B' }}
                tickLine={{ stroke: '#64748B' }}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
                formatter={(value: number, name: string) => [
                  value != null ? value.toFixed(2) : '—',
                  name === 'mid_year' ? 'Mid-Year' : 'Year-End',
                ]}
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              />
              <Bar dataKey="mid_year" radius={[3, 3, 0, 0]} maxBarSize={28}>
                {chartData.map((entry, index) => (
                  <Cell key={`mid-${index}`} fill={entry.isCurrent ? HIGHLIGHT_MID : NEUTRAL_MID} />
                ))}
              </Bar>
              <Bar dataKey="year_end" radius={[3, 3, 0, 0]} maxBarSize={28}>
                {chartData.map((entry, index) => (
                  <Cell key={`end-${index}`} fill={entry.isCurrent ? HIGHLIGHT_END : NEUTRAL_END} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center gap-6 mt-3 text-[12px] text-[#64748B]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: HIGHLIGHT_END }} />
            <span>Selected employee</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: NEUTRAL_END }} />
            <span>Other team members</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: HIGHLIGHT_MID }} />
            <span>Mid-Year</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: NEUTRAL_MID }} />
            <span>Year-End</span>
          </div>
        </div>
      </div>
    </div>
  );
}
