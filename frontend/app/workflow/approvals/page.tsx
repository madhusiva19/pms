'use client';

import React, { useState, useEffect } from 'react';
import styles from './page.module.css';
import { PendingApproval, ApprovalLevel } from '../types';

export default function ApprovalsPage() {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [approvalDetails, setApprovalDetails] = useState<any>(null);
  const [approvalForm, setApprovalForm] = useState({
    decision: 'approve',
    comments: '',
  });

  // Mock approver ID - in real app, get from auth
  const approverId = '101';

  useEffect(() => {
    const fetchPendingApprovals = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `http://localhost:5001/api/approvals/pending?approverId=${approverId}`
        );
        if (!response.ok) throw new Error('Failed to fetch approvals');
        const data = await response.json();
        setPendingApprovals(data.approvals || []);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch approvals:', err);
        setError('Failed to load pending approvals');
      } finally {
        setLoading(false);
      }
    };

    fetchPendingApprovals();
  }, []);

  const handleSelectApproval = async (workflowId: string) => {
    try {
      const response = await fetch(`http://localhost:5001/api/workflow/${workflowId}`);
      if (!response.ok) throw new Error('Failed to fetch workflow');
      const data = await response.json();
      setApprovalDetails(data);
      setSelectedApproval(workflowId);
    } catch (err) {
      console.error('Failed to fetch workflow details:', err);
    }
  };

  const handleApprove = async () => {
    if (!selectedApproval) return;

    try {
      const response = await fetch(
        `http://localhost:5001/api/workflow/${selectedApproval}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approverId,
            comments: approvalForm.comments,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to approve');
      const result = await response.json();

      // Show success message
      alert('Evaluation approved successfully!');

      // Reset and refresh
      setSelectedApproval(null);
      setApprovalDetails(null);
      setApprovalForm({ decision: 'approve', comments: '' });

      // Refresh list
      const refreshResponse = await fetch(
        `http://localhost:5001/api/approvals/pending?approverId=${approverId}`
      );
      const refreshData = await refreshResponse.json();
      setPendingApprovals(refreshData.approvals || []);
    } catch (err) {
      console.error('Failed to approve:', err);
      alert('Failed to approve evaluation');
    }
  };

  const handleReject = async () => {
    if (!selectedApproval) return;

    const rejectionReason = prompt('Enter rejection reason:');
    if (!rejectionReason) return;

    try {
      const response = await fetch(
        `http://localhost:5001/api/workflow/${selectedApproval}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approverId,
            rejectionReason,
            comments: approvalForm.comments,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to reject');

      alert('Evaluation rejected successfully!');

      setSelectedApproval(null);
      setApprovalDetails(null);
      setApprovalForm({ decision: 'approve', comments: '' });

      const refreshResponse = await fetch(
        `http://localhost:5001/api/approvals/pending?approverId=${approverId}`
      );
      const refreshData = await refreshResponse.json();
      setPendingApprovals(refreshData.approvals || []);
    } catch (err) {
      console.error('Failed to reject:', err);
      alert('Failed to reject evaluation');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Evaluation Approvals</h1>
        <p className={styles.subtitle}>Manage pending evaluations requiring your approval</p>
      </div>

      <div className={styles.content}>
        {/* Pending Approvals List */}
        <div className={styles.approvalsList}>
          <h2 className={styles.sectionTitle}>
            Pending Approvals ({pendingApprovals.length})
          </h2>

          {loading ? (
            <div className={styles.message}>Loading approvals...</div>
          ) : error ? (
            <div className={styles.errorMessage}>{error}</div>
          ) : pendingApprovals.length === 0 ? (
            <div className={styles.message}>No pending approvals</div>
          ) : (
            <div className={styles.approvalsGrid}>
              {pendingApprovals.map((approval) => (
                <div
                  key={approval.workflowId}
                  className={`${styles.approvalCard} ${
                    selectedApproval === approval.workflowId ? styles.selected : ''
                  }`}
                  onClick={() => handleSelectApproval(approval.workflowId)}
                >
                  <div className={styles.cardHeader}>
                    <h3 className={styles.memberName}>{approval.memberName}</h3>
                    <span className={styles.levelBadge}>{approval.approvalLevel}</span>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.submitDate}>
                      Submitted: {new Date(approval.submittedAt).toLocaleDateString()}
                    </p>
                    <p className={styles.deadline}>
                      Deadline: {new Date(approval.deadlineDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className={styles.cardFooter}>
                    <button className={styles.selectButton}>Review</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Approval Details and Actions */}
        {approvalDetails && (
          <div className={styles.approvalDetails}>
            <h2 className={styles.sectionTitle}>Evaluation Details</h2>

            <div className={styles.detailsCard}>
              <div className={styles.detailSection}>
                <h3>Employee Information</h3>
                <p>
                  <strong>Name:</strong> {approvalDetails.memberName}
                </p>
                <p>
                  <strong>Period:</strong> {approvalDetails.evaluationData.period}
                </p>
              </div>

              <div className={styles.detailSection}>
                <h3>Approval Chain</h3>
                <div className={styles.approvalChain}>
                  {approvalDetails.approvalChain.map((approval: ApprovalLevel) => (
                    <div
                      key={approval.level}
                      className={`${styles.chainItem} ${styles[approval.status]}`}
                    >
                      <div className={styles.chainLevel}>Level {approval.level}</div>
                      <div className={styles.chainName}>{approval.approverName}</div>
                      <div className={styles.chainStatus}>{approval.status}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.detailSection}>
                <h3>Performance Summary</h3>
                {approvalDetails.evaluationData.categories?.map(
                  (category: any, idx: number) => (
                    <div key={idx} className={styles.categoryItem}>
                      <strong>{category.name}</strong> ({category.percentage}%)
                    </div>
                  )
                )}
              </div>

              <div className={styles.detailSection}>
                <h3>Comments</h3>
                <textarea
                  className={styles.textarea}
                  placeholder="Add approval or rejection comments..."
                  value={approvalForm.comments}
                  onChange={(e) =>
                    setApprovalForm({ ...approvalForm, comments: e.target.value })
                  }
                />
              </div>

              <div className={styles.actions}>
                <button className={styles.rejectButton} onClick={handleReject}>
                  Reject & Send Back
                </button>
                <button className={styles.approveButton} onClick={handleApprove}>
                  Approve
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
