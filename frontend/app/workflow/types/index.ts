export interface ApprovalLevel {
  level: number;
  approverId: string;
  approverName: string;
  approverRole: string;
  status: "pending" | "approved" | "rejected" | "not_started";
  submittedAt: string | null;
  decision: "approved" | "rejected" | null;
  comments: string | null;
}

export interface RejectionRecord {
  timestamp: string;
  rejectedBy: string;
  reason: string;
  comments: string;
}

export interface EvaluationWorkflow {
  workflowId: string;
  memberId: string;
  memberName: string;
  submittedAt: string;
  currentStatus: string;
  approvalChain: ApprovalLevel[];
  evaluationData: any;
  rejectionHistory: RejectionRecord[];
  comments: string[];
  deadlineDate: string;
}

export interface Notification {
  id: string;
  type: "approval_pending" | "approved" | "rejected" | "deadline_warning";
  recipientId: string;
  title: string;
  message: string;
  workflowId: string;
  relatedMemberId: string;
  createdAt: string;
  read: boolean;
}

export interface PendingApproval {
  workflowId: string;
  memberName: string;
  submittedAt: string;
  currentLevel: number;
  deadlineDate: string;
  approvalLevel: string;
}

export const STATUS_COLORS = {
  draft: "#94A3B8",
  submitted: "#3B82F6",
  pending_level1: "#F59E0B",
  pending_level2: "#F59E0B",
  pending_level3: "#F59E0B",
  approved: "#10B981",
  rejected: "#EF4444",
  resubmitted: "#8B5CF6",
};

export const STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  pending_level1: "Pending L1 Approval",
  pending_level2: "Pending L2 Approval",
  pending_level3: "Pending L3 Approval",
  approved: "Approved",
  rejected: "Rejected",
  resubmitted: "Resubmitted",
};
