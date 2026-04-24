'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { EvaluationCategory, EvaluationKPI } from './types';
import { KPITable } from './components/KPITable';
import styles from './page.module.css';

interface EvaluationData {
  memberName: string;
  role: string;
  department: string;
  period: string;
  categories: EvaluationCategory[];
}

export default function EvaluateMemberPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const memberId = searchParams.get('memberId') || '1';
  const memberName = searchParams.get('memberName') || 'Team Member';
  const adminId = searchParams.get('adminId') || 'admin_hq_001';
  
  const [submitted, setSubmitted] = useState(false);
  const [categories, setCategories] = useState<EvaluationCategory[]>([]);
  const [evaluationData, setEvaluationData] = useState<EvaluationData | null>(null);
  const [feedback, setFeedback] = useState<{ feedback: string; recommendation: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchEvaluationData = async () => {
      try {
        setLoading(true);
        const [evalResponse, feedbackResponse] = await Promise.all([
          fetch(`http://localhost:5001/api/evaluations/${memberId}`),
          fetch(`http://localhost:5001/api/evaluations/${memberId}/feedback`),
        ]);

        if (!evalResponse.ok || !feedbackResponse.ok) {
          throw new Error('Failed to fetch evaluation data');
        }

        const evalData = await evalResponse.json();
        const feedbackData = await feedbackResponse.json();

        setEvaluationData(evalData);
        setCategories(evalData.categories || []);
        setFeedback(feedbackData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch evaluation data:', err);
        setError('Failed to load evaluation data');
      } finally {
        setLoading(false);
      }
    };

    fetchEvaluationData();
  }, [memberId]);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      
      const evaluationPayload = {
        memberId,
        memberName,
        adminId,
        categories,
        period: evaluationData?.period || 'Annual Performance 2024',
        department: evaluationData?.department || '',
        role: evaluationData?.role || '',
      };

      const response = await fetch('http://localhost:5001/api/evaluation/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evaluationPayload),
      });

      if (!response.ok) {
        throw new Error('Failed to submit evaluation');
      }

      const result = await response.json();
      setSubmitted(true);
      setTimeout(() => {
        router.push(`/my-team?adminId=${adminId}`);
      }, 2000);
    } catch (err) {
      console.error('Failed to submit evaluation:', err);
      alert('Failed to submit evaluation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const overallScore = categories.reduce<number>((total: number, category: EvaluationCategory) => {
    const catScore = category.kpis.reduce<number>(
      (sum: number, kpi: EvaluationKPI) => sum + kpi.rating * kpi.weight,
      0
    );
    return total + catScore * (category.percentage / 100);
  }, 0);

  return (
    <div className={styles.container}>
      {submitted && (
        <div className={styles.successToast}>
          <div style={{ background: '#10B981', color: 'white', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
            ✓
          </div>
          <span>Evaluation submitted successfully!</span>
        </div>
      )}

      <div className={styles.mainWrapper}>
        {loading && (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p>Loading evaluation data...</p>
          </div>
        )}
        {error && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>
            <p>{error}</p>
          </div>
        )}
        {!loading && !error && (
          <>
            <nav className={styles.breadcrumb}>
              <span>Home</span> / <span>My Team</span> / <span style={{ color: '#1E293B' }}>{memberName}</span>
            </nav>

            <div className={styles.headerArea}>
              <h1>Evaluate Team Member</h1>
            </div>

            <section className={styles.profileCard}>
              <div className={styles.profileInfo}>
                <h2>{memberName}</h2>
                <p>{evaluationData?.role} • {evaluationData?.department}</p>
                <p>Period: {evaluationData?.period}</p>
              </div>
              <div className={styles.scoreBadge}>
                <span className={styles.scoreVal}>{(categories.reduce<number>((total: number, category: EvaluationCategory) => {
                  const catScore = category.kpis.reduce<number>(
                    (sum: number, kpi: EvaluationKPI) => sum + kpi.rating * kpi.weight,
                    0
                  );
                  return total + catScore * (category.percentage / 100);
                }, 0)).toFixed(2)}</span>
                <span className={styles.scoreLabel}>Overall Score</span>
              </div>
            </section>

            <KPITable categories={categories} />

            <section className={styles.aiPanel}>
              <h3>Group Admin Feedback</h3>
              <p style={{ fontWeight: 300 }}>
                {feedback?.feedback || 'No feedback available.'}
              </p>
              <p style={{ marginTop: 16 }}>
                <strong>Recommendation:</strong> {feedback?.recommendation || 'No recommendation available.'}
              </p>
            </section>

            <div className={styles.footerActions}>
              <button className={styles.btnSecondary} disabled={submitting}>Cancel</button>
              <button className={styles.btnSecondary} disabled={submitting}>Save Draft</button>
              <button 
                className={styles.btnPrimary} 
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit Evaluation'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}