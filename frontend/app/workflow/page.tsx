'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { NotificationCenter } from './components/NotificationCenter';

interface DashboardStats {
  totalEvaluations: number;
  completed: number;
  pending: number;
  inProgress: number;
  workflowStats: {
    pendingApprovals: number;
    rejected: number;
    approved: number;
  };
}

export default function WorkflowDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  // Mock user ID - in real app, get from auth
  const userId = '101';

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:5001/api/dashboard-stats');
        if (!response.ok) throw new Error('Failed to fetch stats');
        const data = await response.json();
        setStats(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
        setError('Failed to load dashboard statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Workflow Management</h1>
          <p className={styles.subtitle}>
            Complete evaluation workflow with multi-level approvals
          </p>
        </div>
        <button
          className={styles.notificationBtn}
          onClick={() => setShowNotifications(!showNotifications)}
        >
          🔔
        </button>
      </div>

      {showNotifications && (
        <div className={styles.notificationPanel}>
          <NotificationCenter userId={userId} onClose={() => setShowNotifications(false)} />
        </div>
      )}

      {/* Statistics Cards */}
      {!loading && stats && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Total Evaluations</div>
            <div className={styles.statValue}>{stats.totalEvaluations}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Pending Approvals</div>
            <div className={`${styles.statValue} ${styles.pending}`}>
              {stats.workflowStats.pendingApprovals}
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Approved</div>
            <div className={`${styles.statValue} ${styles.approved}`}>
              {stats.workflowStats.approved}
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Rejected</div>
            <div className={`${styles.statValue} ${styles.rejected}`}>
              {stats.workflowStats.rejected}
            </div>
          </div>
        </div>
      )}

      {/* Feature Sections */}
      <div className={styles.featuresGrid}>
        {/* Approval Management */}
        <div className={styles.featureCard}>
          <div className={styles.cardIcon}>📋</div>
          <h2>Approval Management</h2>
          <p>
            Review and approve evaluations with multi-level approval chain. Provide feedback at
            each level.
          </p>
          <div className={styles.features}>
            <div className={styles.featureItem}>✓ Multi-level approvals</div>
            <div className={styles.featureItem}>✓ Approval comments</div>
            <div className={styles.featureItem}>✓ Deadline tracking</div>
          </div>
          <Link href="/workflow/approvals" className={styles.cta}>
            Go to Approvals →
          </Link>
        </div>

        {/* Status Tracking */}
        <div className={styles.featureCard}>
          <div className={styles.cardIcon}>📊</div>
          <h2>Status Tracking</h2>
          <p>
            Monitor the current stage of each evaluation and see who has approved at each level.
          </p>
          <div className={styles.features}>
            <div className={styles.featureItem}>✓ Real-time status</div>
            <div className={styles.featureItem}>✓ Approval chain view</div>
            <div className={styles.featureItem}>✓ Rejection history</div>
          </div>
          <Link href="/workflow/status-tracker" className={styles.cta}>
            View Status →
          </Link>
        </div>

        {/* Rejection Management */}
        <div className={styles.featureCard}>
          <div className={styles.cardIcon}>↩️</div>
          <h2>Rejection & Re-submission</h2>
          <p>
            Send evaluations back with detailed comments. Employees can resubmit with updates.
          </p>
          <div className={styles.features}>
            <div className={styles.featureItem}>✓ Rejection with reason</div>
            <div className={styles.featureItem}>✓ Detailed comments</div>
            <div className={styles.featureItem}>✓ Re-submission workflow</div>
          </div>
          <Link href="/workflow/approvals" className={styles.cta}>
            Manage Rejections →
          </Link>
        </div>

        {/* Notifications */}
        <div className={styles.featureCard}>
          <div className={styles.cardIcon}>🔔</div>
          <h2>Smart Notifications</h2>
          <p>
            Automatic alerts for pending approvals, rejections, and approaching deadlines.
          </p>
          <div className={styles.features}>
            <div className={styles.featureItem}>✓ Approval pending alerts</div>
            <div className={styles.featureItem}>✓ Rejection notifications</div>
            <div className={styles.featureItem}>✓ Deadline warnings</div>
          </div>
          <button
            className={styles.cta}
            onClick={() => setShowNotifications(!showNotifications)}
          >
            View Notifications →
          </button>
        </div>
      </div>

      {/* Workflow Process Diagram */}
      <div className={styles.processSection}>
        <h2>Evaluation Workflow Process</h2>
        <div className={styles.processFlow}>
          <div className={styles.processStep}>
            <div className={styles.stepCircle}>1</div>
            <div className={styles.stepLabel}>Employee Submits</div>
          </div>
          <div className={styles.processArrow}>→</div>
          <div className={styles.processStep}>
            <div className={styles.stepCircle}>2</div>
            <div className={styles.stepLabel}>L1 Manager Approves</div>
          </div>
          <div className={styles.processArrow}>→</div>
          <div className={styles.processStep}>
            <div className={styles.stepCircle}>3</div>
            <div className={styles.stepLabel}>L2 Manager Approves</div>
          </div>
          <div className={styles.processArrow}>→</div>
          <div className={styles.processStep}>
            <div className={styles.stepCircle}>4</div>
            <div className={styles.stepLabel}>L3 Director Approves</div>
          </div>
          <div className={styles.processArrow}>→</div>
          <div className={styles.processStep}>
            <div className={styles.stepCircle}>✓</div>
            <div className={styles.stepLabel}>Complete</div>
          </div>
        </div>
        <p className={styles.processNote}>
          At any step, approver can request changes or reject, sending back to the previous step.
        </p>
      </div>

      {/* Additional Features */}
      <div className={styles.additionalFeatures}>
        <h2>Key Features</h2>
        <div className={styles.featuresList}>
          <div className={styles.featureListItem}>
            <span className={styles.featureIcon}>⚙️</span>
            <div>
              <strong>Configurable Approval Chains</strong>
              <p>Set up custom approval hierarchies based on department or role</p>
            </div>
          </div>
          <div className={styles.featureListItem}>
            <span className={styles.featureIcon}>📧</span>
            <div>
              <strong>Automated Notifications</strong>
              <p>Email and in-app notifications for all workflow events</p>
            </div>
          </div>
          <div className={styles.featureListItem}>
            <span className={styles.featureIcon}>📝</span>
            <div>
              <strong>Comment & Feedback</strong>
              <p>Detailed comments at each approval level for guidance</p>
            </div>
          </div>
          <div className={styles.featureListItem}>
            <span className={styles.featureIcon}>⏳</span>
            <div>
              <strong>Deadline Management</strong>
              <p>Track and enforce evaluation deadlines with escalation</p>
            </div>
          </div>
          <div className={styles.featureListItem}>
            <span className={styles.featureIcon}>📊</span>
            <div>
              <strong>Audit Trail</strong>
              <p>Complete history of all approvals, rejections, and changes</p>
            </div>
          </div>
          <div className={styles.featureListItem}>
            <span className={styles.featureIcon}>🔄</span>
            <div>
              <strong>Re-submission Workflow</strong>
              <p>Employees can update and resubmit rejected evaluations</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
