'use client';

/**
 * AI Recommendations List Component
 * Displays actionable insights and recommendations
 */

import React from 'react';
import { Sparkles } from 'lucide-react';

interface Recommendation {
    text: string;
}

interface AIRecommendationsListProps {
    recommendations: Recommendation[];
}

export default function AIRecommendationsList({ recommendations }: AIRecommendationsListProps) {
    return (
        <div className="bg-white border border-[#E5E7EB] rounded-xl px-6 pt-6 pb-6">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1.5">
                <div className="w-5 h-5 flex items-center justify-center bg-[#F3E8FF] rounded-md">
                    <Sparkles className="w-4 h-4 text-[#9810FA]" />
                </div>
                <h4 className="text-[16px] font-semibold text-[#1E293B] leading-4">
                    AI-Powered Recommendations
                </h4>
            </div>

            <p className="text-[15px] text-[#64748B] leading-6 mb-6 pl-7">
                Personalized insights based on your performance data
            </p>

            {/* List */}
            <div className="flex flex-col gap-3">
                {recommendations.map((item, index) => (
                    <div key={index} className="flex items-start gap-3">
                        <div className="mt-[9px] w-1.5 h-1.5 rounded-full bg-[#AD46FF] flex-shrink-0" />
                        <p className="text-[15px] text-[#364153] leading-6">{item.text}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}