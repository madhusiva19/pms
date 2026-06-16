'use client';

/**
 * Metric Card Component
 * Displays key performance metrics
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  subtitleColor?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  progressBar?: {
    value: number;
    color: string;
  };
}

export default function MetricCard({
  title,
  value,
  subtitle,
  subtitleColor = 'text-[#6A7282]',
  icon: Icon,
  iconColor = '#155DFC',
  iconBgColor = '#FFFFFF',

}: MetricCardProps) {
  return (
    <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl relative overflow-hidden" style={{ minHeight: '134px' }}>
      <div className="p-6 flex flex-col gap-2 h-full">
        {/* Icon + Label row */}
        <div className="flex items-center gap-3">
          <div
            className="w-5 h-5 flex items-center justify-center"
            style={{ backgroundColor: iconBgColor }}
          >
            <Icon className="w-5 h-5" style={{ color: iconColor }} />
          </div>
          <span className="text-[12.8px] text-[#4A5565]">{title}</span>
        </div>

        {/* Value */}
        <p className="text-[26px] font-semibold text-[#1E293B] leading-9 mt-1">{value}</p>

        {/* Subtitle */}
        {subtitle && (
          <p className={`text-[11px] leading-4 ${subtitleColor}`}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}