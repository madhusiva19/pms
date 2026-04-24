'use client';

/**
 * Trend Analysis View Component
 * Displays multi-period performance trends with metrics and changes
 */

import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Award,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import type { TrendAnalysis } from '@/types';

interface TrendAnalysisViewProps {
  data: TrendAnalysis;
  reportName: string;
  reportType: 'country' | 'branch';
}

export default function TrendAnalysisView({
  data,
  reportName,
  reportType,
}: TrendAnalysisViewProps) {
  const getTrendIcon = (
    direction: 'up' | 'down' | 'stable',
    trend: 'improving' | 'declining' | 'stable' | 'growing'
  ) => {
    if (direction === 'up') {
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    } else if (direction === 'down') {
      return <TrendingDown className="w-4 h-4 text-red-600" />;
    } else {
      return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTrendColor = (direction: 'up' | 'down' | 'stable') => {
    if (direction === 'up') return 'text-green-700 bg-green-50';
    if (direction === 'down') return 'text-red-700 bg-red-50';
    return 'text-gray-700 bg-gray-50';
  };

  const formatMetricValue = (metric: string, value: number) => {
    if (metric === 'avg_score') {
      return value.toFixed(2);
    }
    if (metric === 'completion_percentage') {
      return `${value}%`;
    }
    return value.toLocaleString();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-[#101828] mb-2">
          {reportName}
        </h1>
        <p className="text-[#6B7280]">
          Trend analysis comparing {data.periods.length} reporting periods
        </p>
      </div>

      {/* Timeline View - Show all periods */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-6">
        <h2 className="text-lg font-semibold text-[#101828] mb-4">
          Performance Timeline
        </h2>

        <div className="space-y-6">
          {/* Average Score */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#374151] flex items-center gap-2">
                Average Score
                {getTrendIcon(
                  data.changes.avg_score.direction,
                  data.trends.avg_score_trend
                )}
                <span className={`text-xs px-2 py-1 rounded ${getTrendColor(data.changes.avg_score.direction)}`}>
                  {data.trends.avg_score_trend === 'improving'
                    ? '📈 Improving'
                    : data.trends.avg_score_trend === 'declining'
                    ? '📉 Declining'
                    : '➡️ Stable'}
                </span>
              </h3>
              <span className="text-sm font-semibold text-[#2563EB]">
                {data.changes.avg_score.label}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {data.periods.map((period, idx) => (
                <div
                  key={period.period}
                  className="flex items-center justify-between p-3 bg-[#F9FAFB] rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-sm text-[#6B7280] mb-1">
                      {period.period.replace(/_/g, ' ').toUpperCase()}
                    </p>
                    <p className="text-lg font-semibold text-[#101828]">
                      {formatMetricValue('avg_score', period.metrics.avg_score)}
                    </p>
                  </div>
                  {idx > 0 && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-[#6B7280]">
                        Change
                      </p>
                      <p className={`text-lg font-semibold ${
                        period.metrics.avg_score >
                        data.periods[idx - 1].metrics.avg_score
                          ? 'text-green-700'
                          : 'text-red-700'
                      }`}>
                        {(
                          period.metrics.avg_score -
                          data.periods[idx - 1].metrics.avg_score
                        ).toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Top Performers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#374151] flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600" />
                Top Performers
                {getTrendIcon(
                  data.changes.top_performers.direction,
                  data.trends.top_performers_trend
                )}
                <span className={`text-xs px-2 py-1 rounded ${getTrendColor(data.changes.top_performers.direction)}`}>
                  {data.trends.top_performers_trend === 'improving'
                    ? '📈 Growing'
                    : data.trends.top_performers_trend === 'declining'
                    ? '📉 Shrinking'
                    : '➡️ Stable'}
                </span>
              </h3>
              <span className="text-sm font-semibold text-[#2563EB]">
                {data.changes.top_performers.label}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {data.periods.map((period, idx) => (
                <div
                  key={period.period}
                  className="flex items-center justify-between p-3 bg-[#F9FAFB] rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-sm text-[#6B7280] mb-1">
                      {period.period.replace(/_/g, ' ').toUpperCase()}
                    </p>
                    <p className="text-lg font-semibold text-[#101828]">
                      {period.metrics.top_performers} employees
                    </p>
                  </div>
                  {idx > 0 && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-[#6B7280]">
                        Change
                      </p>
                      <p className={`text-lg font-semibold ${
                        period.metrics.top_performers >
                        data.periods[idx - 1].metrics.top_performers
                          ? 'text-green-700'
                          : 'text-red-700'
                      }`}>
                        {period.metrics.top_performers -
                          data.periods[idx - 1].metrics.top_performers >= 0
                          ? '+'
                          : ''}
                        {period.metrics.top_performers -
                          data.periods[idx - 1].metrics.top_performers}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Total Evaluated */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#374151] flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                Total Evaluated
                {getTrendIcon(
                  data.changes.total_evaluated.direction,
                  data.trends.evaluated_trend
                )}
                <span className={`text-xs px-2 py-1 rounded ${getTrendColor(data.changes.total_evaluated.direction)}`}>
                  {data.trends.evaluated_trend === 'growing'
                    ? '📈 Growing'
                    : data.trends.evaluated_trend === 'declining'
                    ? '📉 Declining'
                    : '➡️ Stable'}
                </span>
              </h3>
              <span className="text-sm font-semibold text-[#2563EB]">
                {data.changes.total_evaluated.label}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {data.periods.map((period, idx) => (
                <div
                  key={period.period}
                  className="flex items-center justify-between p-3 bg-[#F9FAFB] rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-sm text-[#6B7280] mb-1">
                      {period.period.replace(/_/g, ' ').toUpperCase()}
                    </p>
                    <p className="text-lg font-semibold text-[#101828]">
                      {period.metrics.total_evaluated}
                    </p>
                  </div>
                  {idx > 0 && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-[#6B7280]">
                        Change
                      </p>
                      <p className={`text-lg font-semibold ${
                        period.metrics.total_evaluated >
                        data.periods[idx - 1].metrics.total_evaluated
                          ? 'text-green-700'
                          : 'text-red-700'
                      }`}>
                        {period.metrics.total_evaluated -
                          data.periods[idx - 1].metrics.total_evaluated >=
                        0
                          ? '+'
                          : ''}
                        {period.metrics.total_evaluated -
                          data.periods[idx - 1].metrics.total_evaluated}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-[#101828] mb-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-blue-600" />
          Trend Summary
        </h2>

        <div className="space-y-3 text-sm text-[#374151]">
          {data.trends.avg_score_trend === 'improving' ? (
            <p className="flex items-center gap-2 text-green-700">
              <TrendingUp className="w-4 h-4" />
              Average score is improving consistently across periods
            </p>
          ) : data.trends.avg_score_trend === 'declining' ? (
            <p className="flex items-center gap-2 text-red-700">
              <TrendingDown className="w-4 h-4" />
              Average score is declining - attention needed
            </p>
          ) : (
            <p className="flex items-center gap-2 text-gray-600">
              <Minus className="w-4 h-4" />
              Average score is stable
            </p>
          )}

          {data.trends.top_performers_trend === 'improving' ? (
            <p className="flex items-center gap-2 text-green-700">
              <TrendingUp className="w-4 h-4" />
              Top performer pool is growing - strong development
            </p>
          ) : data.trends.top_performers_trend === 'declining' ? (
            <p className="flex items-center gap-2 text-red-700">
              <TrendingDown className="w-4 h-4" />
              Top performer pool is shrinking - review programs
            </p>
          ) : (
            <p className="flex items-center gap-2 text-gray-600">
              <Minus className="w-4 h-4" />
              Top performer count is stable
            </p>
          )}

          {data.trends.evaluated_trend === 'growing' ? (
            <p className="flex items-center gap-2 text-green-700">
              <TrendingUp className="w-4 h-4" />
              Evaluation scale is growing - more employees being assessed
            </p>
          ) : data.trends.evaluated_trend === 'declining' ? (
            <p className="flex items-center gap-2 text-red-700">
              <TrendingDown className="w-4 h-4" />
              Evaluation scale is declining - fewer employees being assessed
            </p>
          ) : (
            <p className="flex items-center gap-2 text-gray-600">
              <Minus className="w-4 h-4" />
              Evaluation scale is stable
            </p>
          )}
        </div>
      </div>

      {/* Overall Recommendation */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-[#101828] mb-2 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          Insight
        </h2>
        <p className="text-[#6B7280]">
          This trend analysis spans {data.periods.length} periods ({
            data.periods[0].period
          } through {data.periods[data.periods.length - 1].period}). Use this
          data to track progress against organizational goals and identify areas
          for targeted improvement initiatives.
        </p>
      </div>
    </div>
  );
}
