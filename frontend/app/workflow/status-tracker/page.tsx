'use client';

import React, { useState, useEffect } from 'react';
import styles from './page.module.css';
import { EvaluationWorkflow, STATUS_COLORS, STATUS_LABELS } from '../types';

export default function StatusTrackerPage() {
  const [workflows, setWorkflows] = useState<EvaluationWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [selectedWorkflowData, setSelectedWorkflowData] = useState<EvaluationWorkflow | null>(null);

  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:5001/api/evaluations/status-tracking');
        if (!response.ok) throw new Error('Failed to fetch workflows');
        const data = await response.json();
        setWorkflows(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch workflows:', err);
        setError('Failed to load evaluation status');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkflows();
  }, []);

  const handleSelectWorkflow = async (workflowId: string) => {
    try {
      const response = await fetch(`http://localhost:5001/api/workflow/${workflowId}`);
      if (!response.ok) throw new Error('Failed to fetch workflow');
      const data = await response.json();
      setSelectedWorkflowData(data);
      setSelectedWorkflow(workflowId);
    } catch (err) {
      console.error('Failed to fetch workflow details:', err);
    }
  };

  const getStatusColor = (status: string) => {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#64748b';
  };

  const getStatusLabel = (status: string) => {
    return STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status;
  };

  const daysUntilDeadline = (deadline: string) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Evaluation Status Tracking</h1>
        <p className={styles.subtitle}>Monitor the approval status of all evaluations</p>
      </div>

      <div className={styles.content}>
        {/* Evaluations List */}
        <div className={styles.evaluationsList}>
          <h2 className={styles.sectionTitle}>Evaluations ({workflows.length})</h2>

          {loading ? (
            <div className={styles.message}>Loading evaluations...</div>
          ) : error ? (
            <div className={styles.errorMessage}>{error}</div>
          ) : workflows.length === 0 ? (
            <div className={styles.message}>No evaluations found</div>
          ) : (
            <div className={styles.evaluationsGrid}>
              {workflows.map((workflow) => (
                <div
                  key={workflow.workflowId}
                  className={`${styles.evaluationCard} ${
                    selectedWorkflow === workflow.workflowId ? styles.selected : ''
                  }`}
                  onClick={() => handleSelectWorkflow(workflow.workflowId)}
                >
                  <div className={styles.cardHeader}>
                    <h3 className={styles.memberName}>{workflow.memberName}</h3>
                    <span
                      className={styles.statusBadge}
                      style={{ backgroundColor: getStatusColor(workflow.currentStatus) }}
                    >
                      {getStatusLabel(workflow.currentStatus)}
                    </span>
                  </div>

                  <div className={styles.cardBody}>
                    <div className={styles.statusTimeline}>
                      <div className={styles.timelineItem}>
                        <span className={styles.label}>Submitted:</span>
                        <span className={styles.value}>
                          {new Date(workflow.submittedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {workflow.rejectionHistory.length > 0 && (
  <div className={styles.timelineItem}>
    <span className={styles.label}>Rejections:</span>
    <span className={`${styles.value} ${styles.rejected}`}>
      {workflow.rejectionHistory.length}
    </span>
  </div>

)}
                    </div>

                    <div className={styles.deadline}>
                      <span>Deadline: </span>
                      <span
                        className={
                          daysUntilDeadline(workflow.deadlineDate) <= 2 ? styles.urgentDeadline : ''
                        }
                      >
                        {new Date(workflow.deadlineDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{
                        width: `${
                          (workflow.approvalChain.filter((a) => a.status === 'approved').length /
                            workflow.approvalChain.length) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Workflow Details */}
        {selectedWorkflowData && (
          <div className={styles.workflowDetails}>
            <h2 className={styles.sectionTitle}>Workflow Details</h2>

            <div className={styles.detailsCard}>
              {/* Employee Info */}
              <div className={styles.section}>
                <h3>Employee Information</h3>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <label>Name</label>
                    <p>{selectedWorkflowData.memberName}</p>
                  </div>
                  <div className={styles.infoItem}>
                    <label>Current Status</label>
                    <p
                      style={{
                        color: getStatusColor(selectedWorkflowData.currentStatus),
                        fontWeight: 600,
                      }}
                    >
                      {getStatusLabel(selectedWorkflowData.currentStatus)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Approval Chain */}
              <div className={styles.section}>
                <h3>Approval Chain</h3>
                <div className={styles.approvalChain}>
                  {selectedWorkflowData.approvalChain.map((approval, idx) => (
                    <div key={idx} className={styles.approvalStep}>
                      <div className={styles.stepNumber}>{approval.level}</div>
                      <div className={styles.stepContent}>
                        <div className={styles.stepApprover}>{approval.approverName}</div>
                        <div className={styles.stepRole}>{approval.approverRole}</div>
                        <div
                          className={`${styles.stepStatus} ${styles[approval.status]}`}
                        >
                          {approval.status.replace(/_/g, ' ').toUpperCase()}
                        </div>
                        {approval.comments && (
                          <div className={styles.stepComments}>{approval.comments}</div>
                        )}
                      </div>
                      {approval.submittedAt && (
                        <div className={styles.stepDate}>
                          {new Date(approval.submittedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rejection History */}
              {selectedWorkflowData.rejectionHistory.length > 0 && (
                <div className={styles.section}>
                  <h3>Rejection History</h3>
                  <div className={styles.rejectionHistory}>
                    {selectedWorkflowData.rejectionHistory.map((rejection, idx) => (
                      <div key={idx} className={styles.rejectionItem}>
                        <div className={styles.rejectionHeader}>
                          <strong>{rejection.rejectedBy}</strong>
                          <span className={styles.rejectionDate}>
                            {new Date(rejection.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        <p className={styles.rejectionReason}>
                          <strong>Reason:</strong> {rejection.reason}
                        </p>
                        {rejection.comments && (
                          <p className={styles.rejectionComments}>
                            <strong>Comments:</strong> {rejection.comments}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Performance Categories */}
              <div className={styles.section}>
                <h3>Evaluation Categories</h3>
                <div className={styles.categoriesList}>
                  {selectedWorkflowData.evaluationData.categories?.map(
                    (category: any, idx: number) => (
                      <div key={idx} className={styles.categoryItem}>
                        <div className={styles.categoryName}>{category.name}</div>
                        <div className={styles.categoryPercentage}>{category.percentage}%</div>
                        <div className={styles.categoryKpis}>
                          {category.kpis?.map((kpi: any) => (
                            <span key={kpi.id} className={styles.kpiTag}>
                              {kpi.objective}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
