'use client';

/**
 * AI Insight Card Component
 * Displays AI-generated performance insights
 * info type  → blue bg (#EFF6FF), blue text (#1C398E) — Mid-Year
 * success type → blue bg (#EFF6FF), dark green text (#0D542B) — Year-End
 */

import React from 'react';

interface AIInsightCardProps {
  insight: string;
  type?: 'info' | 'success';
}

export default function AIInsightCard({ insight, type = 'info' }: AIInsightCardProps) {
  const textColor = type === 'success' ? '#0D542B' : '#1C398E';

  return (
    <div className="bg-[#EFF6FF] rounded-lg px-4 py-4 w-full">
      <p className="text-[13px] leading-5" style={{ color: textColor }}>
        <span className="font-bold">AI Insight:</span>{' '}
        <span className="font-semibold">{insight}</span>
      </p>
    </div>
  );
}