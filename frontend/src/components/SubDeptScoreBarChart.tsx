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
  Legend,
  Cell,
} from 'recharts';
import { serialize } from 'v8';

export interface TeamScoreEntry {
  employeeId: string;
  name: string;
  midYearScore?: number;
  yearEndScore?: number;
}

interface SubDeptScoreBarChartProps {
  data: TeamScoreEntry[];
  currentEmployeeId: string;
  title: string;
  subtitle: string;
}

export default function SubDeptScoreBarChart({
  data,
  currentEmployeeId,
  title,
  subtitle,
}: SubDeptScoreBarChartProps) {
  // Use first name only to keep labels short
  const chartData = data.map((entry) => ({
    name: entry.name.split(' ')[0],
    fullName: entry.name,
    employeeId: entry.employeeId,
    midYear: entry.midYearScore ?? 0,
    yearEnd: entry.yearEndScore ?? 0,
    isCurrent: entry.employeeId === currentEmployeeId,
  }));

  return (
    <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        <h4 className="text-[15px] font-semibold text-[#1E293B] leading-4 mb-1.5">{title}</h4>
        <p className="text-[15px] text-[#64748B] leading-6">{subtitle}</p>
      </div>

      {/* Chart */}
      <div className="px-6 pt-4 pb-5">
        <div style={{ height: 380, width: '80%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 30 }}
              barGap={3}              // small gap between H1 and H2 bars for same employee
              barCategoryGap="0.5"    // larger gap between different employees
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#64748B', fontSize: 11 }}
                axisLine={{ stroke: '#64748B' }}
                tickLine={{ stroke: '#64748B' }}
                interval={0}
                angle={-25}
                textAnchor="end"
              />
              <YAxis
                tick={{ fill: '#64748B', fontSize: 12 }}
                axisLine={{ stroke: '#64748B' }}
                tickLine={{ stroke: '#64748B' }}
                width={36}
                domain={[0, 5]}
                ticks={[0, 1, 2, 3, 4, 5]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
                cursor={{ fill: 'rgba(0,0,0,0.04)' } }
                labelFormatter={(label, payload) => {
                  const item: any = payload?.[0]?.payload;
                  return item?.fullName ?? label;
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: '10px', fontSize: '13px' }}
              />

              {/* Mid-Year bar */}
              <Bar dataKey="midYear" name="Mid-Year" radius={[3, 3, 0, 0]} barSize={30}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`mid-${index}`}
                    fill={entry.isCurrent ? '#2563EB' : '#94A3B8'}
                  />
                ))}
              </Bar>

              {/* Year-End bar */}
              <Bar dataKey="yearEnd" name="Year-End" radius={[3, 3, 0, 0]} barSize={30}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`end-${index}`}
                    fill={entry.isCurrent ? '#1E40AF' : '#CBD5E1'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}