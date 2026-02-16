'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EvaluationData } from './types';
import { ProfileCard } from './components/ProfileCard';
import { KPITable } from './components/KPITable';
import { AIInsights } from './components/AIInsights';
import { ActionButtons } from './components/ActionButtons';
import { EvalBreadcrumb } from './components/EvalBreadcrumb';
import styles from './styles/page.module.css';

// Mock evaluation data - Replace with actual API call
const mockEvaluationData: EvaluationData = {
  memberId: '1',
  memberName: 'L.E. Senevirathna',
  memberRole: 'Asst. General Manager (OL-4)',
  memberDepartment: 'Custom Brokerage',
  overallScore: 3.24,
  period: 'Annual Performance 2024',
  categories: [
    {
      name: 'FINANCIAL FOCUS',
      percentage: 30,
      kpis: [
        {
          id: '1',
          objective: 'Revenue Achievement',
          weight: 0.1,
          target: '4910.7M',
          actual: '4863.1M',
          achievePercentage: 99.0,
          rating: 2.81,
        },
        {
          id: '2',
          objective: 'GP Achievement',
          weight: 0.1,
          target: '527.52M',
          actual: '454.82M',
          achievePercentage: 86.2,
          rating: 1.0,
        },
      ],
    },
    {
      name: 'CUSTOMER FOCUS',
      percentage: 30,
      kpis: [
        {
          id: '3',
          objective: 'NPS Index Score',
          weight: 0.1,
          target: '0.35',
          actual: '0.27',
          achievePercentage: 78.0,
          rating: 2.0,
        },
        {
          id: '4',
          objective: 'GP on Personal Sales',
          weight: 0.04,
          target: '-',
          actual: 'High',
          achievePercentage: 100,
          rating: 5.0,
        },
      ],
    },
    {
      name: 'HUMAN RESOURCES FOCUS',
      percentage: 40,
      kpis: [
        {
          id: '5',
          objective: 'Statutory & Legal Compliance',
          weight: 0.2,
          target: '100%',
          actual: '100%',
          achievePercentage: 100,
          rating: 3.0,
        },
        {
          id: '6',
          objective: '360 Degree Feedback',
          weight: 0.05,
          target: '0.85',
          actual: '0.81',
          achievePercentage: 95.2,
          rating: 3.0,
        },
      ],
    },
  ],
  aiInsights: {
    summary:
      'L.E. Senevirathna is performing strongly in Statutory Compliance and Personal Sales. However, the GP Achievement (86.2%) is currently the primary bottleneck.',
    recommendation:
      'Recommendation: Initiate a cost-audit in the Brokerage department to identify margin leakages. Increasing NPS from 0.27 to 0.35 should be the focus for H2 to improve client retention.',
  },
};

export default function EvaluateMemberPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [evaluationData, setEvaluationData] = useState<EvaluationData>(mockEvaluationData);

  // Get member info from query parameters
  useEffect(() => {
    const memberId = searchParams.get('memberId');
    const memberName = searchParams.get('memberName');

    if (memberName) {
      setEvaluationData((prev) => ({
        ...prev,
        memberId: memberId || prev.memberId,
        memberName: decodeURIComponent(memberName),
      }));
    }
  }, [searchParams]);

  const handleCancel = () => {
    if (confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
      window.history.back();
    }
  };

  const handleSaveDraft = async () => {
    try {
      setIsSubmitting(true);
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
      console.log('Draft saved:', mockEvaluationData);
    } catch (error) {
      console.error('Error saving draft:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (
        !confirm(
          'Are you sure you want to submit this evaluation? This action cannot be undone.'
        )
      ) {
        return;
      }

      setIsSubmitting(true);
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));
      console.log('Evaluation submitted:', evaluationData);
      alert('Evaluation submitted successfully!');
      window.history.back();
    } catch (error) {
      console.error('Error submitting evaluation:', error);
      alert('Failed to submit evaluation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <EvalBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'My Team', href: '/my-team' },
            { label: evaluationData.memberName },
          ]}
        />
        <div className={styles.titleSection}>
          <div className={styles.titleContent}>
            <h1 className={styles.title}>Evaluate Team Member</h1>
          </div>
          <ActionButtons
            onCancel={handleCancel}
            onSaveDraft={handleSaveDraft}
            onSubmit={handleSubmit}
          />
        </div>
      </div>

      <div className={styles.mainContent}>
        <ProfileCard
          memberName={evaluationData.memberName}
          memberRole={evaluationData.memberRole}
          memberDepartment={evaluationData.memberDepartment}
          period={evaluationData.period}
          overallScore={evaluationData.overallScore}
        />

        <KPITable categories={evaluationData.categories} />

        <AIInsights
          summary={evaluationData.aiInsights.summary}
          recommendation={evaluationData.aiInsights.recommendation}
        />
      </div>

      {isSaved && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: '#10b981',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          ✓ Draft saved successfully
        </div>
      )}
    </div>
  );
}
