'use client';

import React from 'react';

interface ReportMetrics {
  totalEvaluated?: number;
  avgScore?: string;
  topPerformers?: number;
  employeeScore?: string;
}

interface ReportPDFHeaderProps {
  entityType: 'Country' | 'Branch' | 'Department' | 'Team' | 'Employee';
  entityName: string;
  reportPeriod?: string;
  reportYear: number;
  metrics?: ReportMetrics;
  generatedAt: Date;
}

export default function ReportPDFHeader({
  entityType,
  entityName,
  reportPeriod,
  reportYear,
  metrics,
  generatedAt,
}: ReportPDFHeaderProps) {
  const formattedDate = generatedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = generatedAt.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const periodLabel = reportPeriod ? `${reportPeriod} ${reportYear}` : `Full Year ${reportYear}`;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">

      {/* Company branding bar */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ backgroundColor: '#0F2D5A' }}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Dart_Logo_new.png"
            alt="DART Global"
            style={{ height: '36px', width: 'auto', objectFit: 'contain' }}
          />
          <div>
            <div style={{ color: '#FFFFFF', fontWeight: 700, fontSize: '15px', lineHeight: '1.2' }}>
              DART Global
            </div>
            <div style={{ color: '#93C5FD', fontSize: '11px' }}>
              Performance Management System
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '13px' }}>
            Performance Report
          </div>
          <div style={{ color: '#93C5FD', fontSize: '11px' }}>
            Confidential — Internal Use Only
          </div>
        </div>
      </div>

      {/* Report context row */}
      <div
        className="flex items-start justify-between px-5 py-3 border-b border-gray-200"
        style={{ backgroundColor: '#F8FAFC' }}
      >
        <div>
          <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {entityType} Report
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#101828', marginTop: '2px' }}>
            {entityName}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#2563EB' }}>
            {periodLabel}
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
            Generated: {formattedDate} at {formattedTime}
          </div>
        </div>
      </div>

      {/* Metrics summary row */}
      {metrics && (
        <div className="grid grid-cols-3 divide-x divide-gray-200 bg-white">
          <div className="px-4 py-2.5 text-center">
            <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Total Evaluated
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#101828', lineHeight: '1.3' }}>
              {metrics.totalEvaluated ?? '—'}
            </div>
          </div>

          <div className="px-4 py-2.5 text-center">
            <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {metrics.employeeScore !== undefined ? 'Score (Mid / End)' : 'Avg Score'}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#101828', lineHeight: '1.3' }}>
              {metrics.employeeScore ?? metrics.avgScore ?? '—'}
            </div>
          </div>

          <div className="px-4 py-2.5 text-center">
            <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Top Performers
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#101828', lineHeight: '1.3' }}>
              {metrics.topPerformers ?? '—'}
            </div>
            <div style={{ fontSize: '10px', color: '#6B7280' }}>Rating ≥ 4.5</div>
          </div>
        </div>
      )}
    </div>
  );
}
