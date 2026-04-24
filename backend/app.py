from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timedelta
import uuid

app = Flask(__name__)
CORS(app)

# ==================== 5-LEVEL ADMIN HIERARCHY ====================


# Level 1: HQ Admin - Evaluates Level 2 (Country Admins)
HQ_ADMIN = {
    "id": "admin_hq_001",
    "name": "Sarah Williams",
    "title": "HQ Admin",
    "level": 1,
    "department": "Global",
    "email": "sarah.williams@hq.com",
    "reportsTo": None,
    "directReports": ["admin_country_001", "admin_country_002"]
}

# Level 2: Country Admins - Evaluate Level 3 (Branch Admins)
COUNTRY_ADMINS = [
    {
        "id": "admin_country_001",
        "name": "Michael Chen",
        "title": "Country Admin - USA",
        "level": 2,
        "department": "USA Operations",
        "email": "michael.chen@usa.com",
        "reportsTo": "admin_hq_001",
        "directReports": ["admin_branch_001", "admin_branch_002"]
    },
    {
        "id": "admin_country_002",
        "name": "Priya Sharma",
        "title": "Country Admin - APAC",
        "level": 2,
        "department": "APAC Operations",
        "email": "priya.sharma@apac.com",
        "reportsTo": "admin_hq_001",
        "directReports": ["admin_branch_003", "admin_branch_004"]
    }
]

# Level 3: Branch Admins - Evaluate Level 4 (Dept Admins)
BRANCH_ADMINS = [
    {
        "id": "admin_branch_001",
        "name": "James Rodriguez",
        "title": "Branch Admin - NYC",
        "level": 3,
        "department": "NYC Branch",
        "email": "james.rodriguez@nyc.com",
        "reportsTo": "admin_country_001",
        "directReports": ["admin_dept_001", "admin_dept_002"]
    },
    {
        "id": "admin_branch_002",
        "name": "Lisa Anderson",
        "title": "Branch Admin - LA",
        "level": 3,
        "department": "LA Branch",
        "email": "lisa.anderson@la.com",
        "reportsTo": "admin_country_001",
        "directReports": ["admin_dept_003"]
    },
    {
        "id": "admin_branch_003",
        "name": "Rajesh Kumar",
        "title": "Branch Admin - Singapore",
        "level": 3,
        "department": "Singapore Branch",
        "email": "rajesh.kumar@sg.com",
        "reportsTo": "admin_country_002",
        "directReports": ["admin_dept_004", "admin_dept_005"]
    },
    {
        "id": "admin_branch_004",
        "name": "Emma Thompson",
        "title": "Branch Admin - Sydney",
        "level": 3,
        "department": "Sydney Branch",
        "email": "emma.thompson@sydney.com",
        "reportsTo": "admin_country_002",
        "directReports": ["admin_dept_006"]
    }
]

# Level 4: Dept Admins - Evaluate Level 5 (Sub Dept Admins)
DEPT_ADMINS = [
    {
        "id": "admin_dept_001",
        "name": "David Martinez",
        "title": "Dept Admin - Engineering",
        "level": 4,
        "department": "Engineering Dept",
        "email": "david.martinez@eng.com",
        "reportsTo": "admin_branch_001",
        "directReports": ["admin_subdept_001", "admin_subdept_002"]
    },
    {
        "id": "admin_dept_002",
        "name": "Jennifer Lee",
        "title": "Dept Admin - Sales",
        "level": 4,
        "department": "Sales Dept",
        "email": "jennifer.lee@sales.com",
        "reportsTo": "admin_branch_001",
        "directReports": ["admin_subdept_003"]
    },
    {
        "id": "admin_dept_003",
        "name": "Marcus Johnson",
        "title": "Dept Admin - Finance",
        "level": 4,
        "department": "Finance Dept",
        "email": "marcus.johnson@finance.com",
        "reportsTo": "admin_branch_002",
        "directReports": ["admin_subdept_004"]
    },
    {
        "id": "admin_dept_004",
        "name": "Ananya Gupta",
        "title": "Dept Admin - Product",
        "level": 4,
        "department": "Product Dept",
        "email": "ananya.gupta@product.com",
        "reportsTo": "admin_branch_003",
        "directReports": ["admin_subdept_005"]
    },
    {
        "id": "admin_dept_005",
        "name": "Wei Zhang",
        "title": "Dept Admin - Operations",
        "level": 4,
        "department": "Operations Dept",
        "email": "wei.zhang@ops.com",
        "reportsTo": "admin_branch_003",
        "directReports": ["admin_subdept_006"]
    },
    {
        "id": "admin_dept_006",
        "name": "Sophie Brown",
        "title": "Dept Admin - HR",
        "level": 4,
        "department": "HR Dept",
        "email": "sophie.brown@hr.com",
        "reportsTo": "admin_branch_004",
        "directReports": ["admin_subdept_007"]
    }
]

# Level 5: Sub Dept Admins - Evaluate Employees
SUB_DEPT_ADMINS = [
    {
        "id": "admin_subdept_001",
        "name": "Oliver Taylor",
        "title": "Sub Dept Admin - Backend Team",
        "level": 5,
        "department": "Backend Engineering",
        "email": "oliver.taylor@backend.com",
        "reportsTo": "admin_dept_001",
        "directReports": ["emp_001", "emp_002", "emp_003"]
    },
    {
        "id": "admin_subdept_002",
        "name": "Sophia Garcia",
        "title": "Sub Dept Admin - Frontend Team",
        "level": 5,
        "department": "Frontend Engineering",
        "email": "sophia.garcia@frontend.com",
        "reportsTo": "admin_dept_001",
        "directReports": ["emp_004", "emp_005"]
    },
    {
        "id": "admin_subdept_003",
        "name": "Lucas Silva",
        "title": "Sub Dept Admin - Sales Team A",
        "level": 5,
        "department": "Sales Team A",
        "email": "lucas.silva@sales.com",
        "reportsTo": "admin_dept_002",
        "directReports": ["emp_006", "emp_007", "emp_008"]
    },
    {
        "id": "admin_subdept_004",
        "name": "Nina Patel",
        "title": "Sub Dept Admin - Finance Team",
        "level": 5,
        "department": "Finance Team",
        "email": "nina.patel@finance.com",
        "reportsTo": "admin_dept_003",
        "directReports": ["emp_009", "emp_010"]
    },
    {
        "id": "admin_subdept_005",
        "name": "Carlos Mendez",
        "title": "Sub Dept Admin - Product Team",
        "level": 5,
        "department": "Product Team",
        "email": "carlos.mendez@product.com",
        "reportsTo": "admin_dept_004",
        "directReports": ["emp_011", "emp_012", "emp_013"]
    },
    {
        "id": "admin_subdept_006",
        "name": "Yuki Tanaka",
        "title": "Sub Dept Admin - Operations Team",
        "level": 5,
        "department": "Operations Team",
        "email": "yuki.tanaka@ops.com",
        "reportsTo": "admin_dept_005",
        "directReports": ["emp_014", "emp_015"]
    },
    {
        "id": "admin_subdept_007",
        "name": "Grace Walsh",
        "title": "Sub Dept Admin - HR Team",
        "level": 5,
        "department": "HR Team",
        "email": "grace.walsh@hr.com",
        "reportsTo": "admin_dept_006",
        "directReports": ["emp_016", "emp_017", "emp_018"]
    }
]

# Employees (Level 6) - Evaluated by Sub Dept Admins
EMPLOYEES = [
    {"id": "emp_001", "name": "Alex Johnson", "title": "Senior Backend Engineer", "level": 6, "department": "Backend", "reportsTo": "admin_subdept_001"},
    {"id": "emp_002", "name": "Emma Wilson", "title": "Backend Engineer", "level": 6, "department": "Backend", "reportsTo": "admin_subdept_001"},
    {"id": "emp_003", "name": "Noah Davis", "title": "Backend Engineer", "level": 6, "department": "Backend", "reportsTo": "admin_subdept_001"},
    {"id": "emp_004", "name": "Ava Miller", "title": "Senior Frontend Engineer", "level": 6, "department": "Frontend", "reportsTo": "admin_subdept_002"},
    {"id": "emp_005", "name": "Ethan Brown", "title": "Frontend Engineer", "level": 6, "department": "Frontend", "reportsTo": "admin_subdept_002"},
    {"id": "emp_006", "name": "Olivia Martin", "title": "Sales Executive", "level": 6, "department": "Sales", "reportsTo": "admin_subdept_003"},
    {"id": "emp_007", "name": "Liam Garcia", "title": "Sales Manager", "level": 6, "department": "Sales", "reportsTo": "admin_subdept_003"},
    {"id": "emp_008", "name": "Isabella Rodriguez", "title": "Sales Associate", "level": 6, "department": "Sales", "reportsTo": "admin_subdept_003"},
    {"id": "emp_009", "name": "Mason Lee", "title": "Financial Analyst", "level": 6, "department": "Finance", "reportsTo": "admin_subdept_004"},
    {"id": "emp_010", "name": "Mia White", "title": "Accountant", "level": 6, "department": "Finance", "reportsTo": "admin_subdept_004"},
    {"id": "emp_011", "name": "Lucas Harris", "title": "Product Manager", "level": 6, "department": "Product", "reportsTo": "admin_subdept_005"},
    {"id": "emp_012", "name": "Charlotte Clark", "title": "Product Analyst", "level": 6, "department": "Product", "reportsTo": "admin_subdept_005"},
    {"id": "emp_013", "name": "Amelia Lewis", "title": "UX Designer", "level": 6, "department": "Product", "reportsTo": "admin_subdept_005"},
    {"id": "emp_014", "name": "Benjamin Walker", "title": "Operations Manager", "level": 6, "department": "Operations", "reportsTo": "admin_subdept_006"},
    {"id": "emp_015", "name": "Evelyn Hall", "title": "Operations Coordinator", "level": 6, "department": "Operations", "reportsTo": "admin_subdept_006"},
    {"id": "emp_016", "name": "Harper Allen", "title": "HR Manager", "level": 6, "department": "HR", "reportsTo": "admin_subdept_007"},
    {"id": "emp_017", "name": "Jack Young", "title": "Recruiter", "level": 6, "department": "HR", "reportsTo": "admin_subdept_007"},
    {"id": "emp_018", "name": "Lily King", "title": "HR Coordinator", "level": 6, "department": "HR", "reportsTo": "admin_subdept_007"},
]

# Combine all admins
ALL_ADMINS = [HQ_ADMIN] + COUNTRY_ADMINS + BRANCH_ADMINS + DEPT_ADMINS + SUB_DEPT_ADMINS

# Mock evaluation data
EVALUATION_TEMPLATES = {
    "admin_hq_001": {
        "memberName": "Sarah Williams",
        "role": "HQ Admin",
        "period": "Annual Performance 2024",
        "categories": [
            {
                "name": "Strategic Leadership",
                "percentage": 40,
                "kpis": [
                    {"id": "s1", "objective": "Global Strategy Execution", "weight": 0.2, "target": "100%", "actual": "95%", "achievePercentage": 95.0, "rating": 4.5},
                    {"id": "s2", "objective": "Cross-Region Coordination", "weight": 0.2, "target": "100%", "actual": "98%", "achievePercentage": 98.0, "rating": 4.8},
                ],
            },
            {
                "name": "Organizational Development",
                "percentage": 35,
                "kpis": [
                    {"id": "o1", "objective": "Team Development", "weight": 0.175, "target": "80%", "actual": "85%", "achievePercentage": 106.2, "rating": 4.2},
                    {"id": "o2", "objective": "Succession Planning", "weight": 0.175, "target": "100%", "actual": "92%", "achievePercentage": 92.0, "rating": 3.8},
                ],
            },
            {
                "name": "Business Performance",
                "percentage": 25,
                "kpis": [
                    {"id": "b1", "objective": "Revenue Target", "weight": 0.125, "target": "100M", "actual": "102M", "achievePercentage": 102.0, "rating": 4.5},
                    {"id": "b2", "objective": "Operational Efficiency", "weight": 0.125, "target": "85%", "actual": "88%", "achievePercentage": 103.5, "rating": 4.2},
                ],
            },
        ],
    }
}

# Workflow tracking
EVALUATION_WORKFLOWS = {}
NOTIFICATIONS = []

# ==================== HELPER FUNCTIONS ====================

def get_direct_reports(admin_id):
    """Get direct reports for an admin"""
    admin = next((a for a in ALL_ADMINS if a["id"] == admin_id), None)
    if not admin:
        return []
    
    report_ids = admin.get("directReports", [])
    reports = []
    
    if admin["level"] == 1:
        reports = [a for a in COUNTRY_ADMINS if a["id"] in report_ids]
    elif admin["level"] == 2:
        reports = [a for a in BRANCH_ADMINS if a["id"] in report_ids]
    elif admin["level"] == 3:
        reports = [a for a in DEPT_ADMINS if a["id"] in report_ids]
    elif admin["level"] == 4:
        reports = [a for a in SUB_DEPT_ADMINS if a["id"] in report_ids]
    elif admin["level"] == 5:
        reports = [e for e in EMPLOYEES if e["id"] in report_ids]
    
    return reports

def create_workflow_record(member_id, evaluation_data, admin_id):
    """Create workflow record with 5-level approval chain"""
    workflow_id = str(uuid.uuid4())
    
    # Get the evaluating admin
    evaluating_admin = next((a for a in ALL_ADMINS if a["id"] == admin_id), None)
    if not evaluating_admin:
        raise ValueError(f"Admin {admin_id} not found")
    
    # Build approval chain starting from the evaluator's superior
    approval_chain = []
    current_id = evaluating_admin.get("reportsTo")  # Start from superior, not self
    level = 1
    
    while level <= 5 and current_id:
        current_admin = next((a for a in ALL_ADMINS if a["id"] == current_id), None)
        if current_admin:
            approval_chain.append({
                "level": level,
                "approverId": current_admin["id"],
                "approverName": current_admin["name"],
                "approverTitle": current_admin["title"],
                "status": "pending" if level == 1 else "not_started",
                "submittedAt": None,
                "decision": None,
                "comments": None,
            })
            current_id = current_admin.get("reportsTo")
            level += 1
        else:
            break
    
    workflow = {
        "workflowId": workflow_id,
        "memberId": member_id,
        "memberName": evaluation_data.get("memberName", ""),
        "evaluatorId": admin_id,
        "evaluatorName": evaluating_admin["name"],
        "evaluatorTitle": evaluating_admin["title"],
        "submittedAt": datetime.now().isoformat(),
        "currentStatus": "submitted",
        "approvalChain": approval_chain,
        "evaluationData": evaluation_data,
        "rejectionHistory": [],
        "comments": [],
        "deadlineDate": (datetime.now() + timedelta(days=7)).isoformat(),
    }
    
    return workflow

def create_notification(type, recipient_id, title, message, workflow_id, related_member_id):
    """Create a notification"""
    notification = {
        "id": str(uuid.uuid4()),
        "type": type,
        "recipientId": recipient_id,
        "title": title,
        "message": message,
        "workflowId": workflow_id,
        "relatedMemberId": related_member_id,
        "createdAt": datetime.now().isoformat(),
        "read": False,
    }
    NOTIFICATIONS.append(notification)
    return notification

# ==================== ROUTES ====================

@app.route("/", methods=["GET"])
def home():
    return jsonify({"message": "PMS Backend with 5-Level Admin Hierarchy"})

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy"})

@app.route("/api/admin/<admin_id>", methods=["GET"])
def get_admin(admin_id):
    """Get admin details"""
    admin = next((a for a in ALL_ADMINS if a["id"] == admin_id), None)
    if admin:
        return jsonify(admin)
    return jsonify({"error": "Admin not found"}), 404

@app.route("/api/admin/<admin_id>/team", methods=["GET"])
def get_admin_team(admin_id):
    """Get direct reports for an admin"""
    reports = get_direct_reports(admin_id)
    return jsonify(reports)

@app.route("/api/team-members", methods=["GET"])
def get_team_members():
    """Get all team members"""
    return jsonify(EMPLOYEES)

@app.route("/api/admins", methods=["GET"])
def get_all_admins():
    """Get all admins organized by level"""
    return jsonify({
        "hq": HQ_ADMIN,
        "country": COUNTRY_ADMINS,
        "branch": BRANCH_ADMINS,
        "dept": DEPT_ADMINS,
        "subdept": SUB_DEPT_ADMINS,
    })

@app.route("/api/evaluations/<member_id>", methods=["GET"])
def get_evaluation(member_id):
    """Get evaluation template"""
    if member_id in EVALUATION_TEMPLATES:
        return jsonify(EVALUATION_TEMPLATES[member_id])
    
    return jsonify({
        "memberName": f"Member {member_id}",
        "role": "Team Member",
        "period": "Annual Performance 2024",
        "categories": [],
    })

@app.route("/api/evaluation/submit", methods=["POST"])
def submit_evaluation():
    """Submit an evaluation"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    required_fields = ["memberId", "memberName", "categories", "adminId"]
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
    
    member_id = data["memberId"]
    admin_id = data["adminId"]
    
    # Create workflow
    workflow = create_workflow_record(member_id, data, admin_id)
    EVALUATION_WORKFLOWS[workflow["workflowId"]] = workflow
    
    # Notify first approver
    first_approver = workflow["approvalChain"][0]
    create_notification(
        type="approval_pending",
        recipient_id=first_approver["approverId"],
        title="Evaluation Pending Approval",
        message=f"Evaluation for {workflow['memberName']} is pending your approval",
        workflow_id=workflow["workflowId"],
        related_member_id=member_id
    )
    
    return jsonify({
        "success": True,
        "workflowId": workflow["workflowId"],
        "currentStatus": workflow["currentStatus"],
        "nextApprover": first_approver
    }), 201

@app.route("/api/workflow/<workflow_id>", methods=["GET"])
def get_workflow(workflow_id):
    """Get workflow details"""
    workflow = EVALUATION_WORKFLOWS.get(workflow_id)
    if not workflow:
        return jsonify({"error": "Workflow not found"}), 404
    return jsonify(workflow)

@app.route("/api/workflow/<workflow_id>/approve", methods=["POST"])
def approve_evaluation(workflow_id):
    """Approve evaluation"""
    data = request.get_json()
    workflow = EVALUATION_WORKFLOWS.get(workflow_id)
    
    if not workflow:
        return jsonify({"error": "Workflow not found"}), 404
    
    approver_id = data.get("approverId")
    comments = data.get("comments", "")
    
    # Find current pending approval
    current_approval = None
    for approval in workflow["approvalChain"]:
        if approval["status"] == "pending":
            current_approval = approval
            break
    
    if not current_approval:
        return jsonify({"error": "No pending approval"}), 400
    
    if current_approval["approverId"] != approver_id:
        return jsonify({"error": "Not authorized"}), 403
    
    # Mark as approved
    current_approval["status"] = "approved"
    current_approval["decision"] = "approved"
    current_approval["submittedAt"] = datetime.now().isoformat()
    current_approval["comments"] = comments
    
    # Find next pending
    next_approval = None
    for approval in workflow["approvalChain"]:
        if approval["status"] == "not_started":
            approval["status"] = "pending"
            next_approval = approval
            break
    
    if next_approval:
        workflow["currentStatus"] = f"pending_level{next_approval['level']}"
        create_notification(
            type="approval_pending",
            recipient_id=next_approval["approverId"],
            title="Evaluation Pending Approval",
            message=f"Evaluation for {workflow['memberName']} is pending your approval (Level {next_approval['level']})",
            workflow_id=workflow_id,
            related_member_id=workflow["memberId"]
        )
    else:
        workflow["currentStatus"] = "approved"
        create_notification(
            type="approved",
            recipient_id=workflow["memberId"],
            title="Evaluation Approved",
            message="Your evaluation has been approved at all levels",
            workflow_id=workflow_id,
            related_member_id=workflow["memberId"]
        )
    
    return jsonify({
        "success": True,
        "nextApprover": next_approval,
        "currentStatus": workflow["currentStatus"]
    }), 200

@app.route("/api/workflow/<workflow_id>/reject", methods=["POST"])
def reject_evaluation(workflow_id):
    """Reject evaluation"""
    data = request.get_json()
    workflow = EVALUATION_WORKFLOWS.get(workflow_id)
    
    if not workflow:
        return jsonify({"error": "Workflow not found"}), 404
    
    approver_id = data.get("approverId")
    rejection_reason = data.get("rejectionReason", "")
    comments = data.get("comments", "")
    
    # Find current pending
    current_approval = None
    for approval in workflow["approvalChain"]:
        if approval["status"] == "pending":
            current_approval = approval
            break
    
    if not current_approval:
        return jsonify({"error": "No pending approval"}), 400
    
    if current_approval["approverId"] != approver_id:
        return jsonify({"error": "Not authorized"}), 403
    
    # Mark as rejected
    current_approval["status"] = "rejected"
    current_approval["decision"] = "rejected"
    current_approval["submittedAt"] = datetime.now().isoformat()
    current_approval["comments"] = comments
    
    # Reset approval chain
    for approval in workflow["approvalChain"]:
        approval["status"] = "not_started"
        approval["decision"] = None
        approval["submittedAt"] = None
        approval["comments"] = None
    
    workflow["approvalChain"][0]["status"] = "pending"
    workflow["rejectionHistory"].append({
        "timestamp": datetime.now().isoformat(),
        "rejectedBy": current_approval["approverName"],
        "reason": rejection_reason,
        "comments": comments,
        "level": current_approval["level"]
    })
    
    workflow["currentStatus"] = "rejected"
    
    create_notification(
        type="rejected",
        recipient_id=workflow["memberId"],
        title="Evaluation Rejected",
        message=f"Your evaluation was rejected: {rejection_reason}",
        workflow_id=workflow_id,
        related_member_id=workflow["memberId"]
    )
    
    return jsonify({
        "success": True,
        "currentStatus": workflow["currentStatus"]
    }), 200

@app.route("/api/workflow/<workflow_id>/resubmit", methods=["POST"])
def resubmit_evaluation(workflow_id):
    """Resubmit evaluation"""
    data = request.get_json()
    workflow = EVALUATION_WORKFLOWS.get(workflow_id)
    
    if not workflow:
        return jsonify({"error": "Workflow not found"}), 404
    
    if workflow["currentStatus"] != "rejected":
        return jsonify({"error": "Can only resubmit rejected evaluations"}), 400
    
    if "evaluationData" in data:
        workflow["evaluationData"] = data["evaluationData"]
    
    # Reset approval chain
    for approval in workflow["approvalChain"]:
        approval["status"] = "not_started"
        approval["decision"] = None
        approval["submittedAt"] = None
        approval["comments"] = None
    
    workflow["approvalChain"][0]["status"] = "pending"
    workflow["currentStatus"] = "pending_level1"
    
    first_approver = workflow["approvalChain"][0]
    create_notification(
        type="approval_pending",
        recipient_id=first_approver["approverId"],
        title="Evaluation Resubmitted",
        message=f"Evaluation for {workflow['memberName']} has been resubmitted",
        workflow_id=workflow_id,
        related_member_id=workflow["memberId"]
    )
    
    return jsonify({
        "success": True,
        "currentStatus": workflow["currentStatus"]
    }), 200

@app.route("/api/approvals/pending", methods=["GET"])
def get_pending_approvals():
    """Get pending approvals for admin"""
    approver_id = request.args.get("approverId")
    
    if not approver_id:
        return jsonify({"error": "approverId required"}), 400
    
    pending = []
    for workflow_id, workflow in EVALUATION_WORKFLOWS.items():
        for approval in workflow["approvalChain"]:
            if approval["approverId"] == approver_id and approval["status"] == "pending":
                pending.append({
                    "workflowId": workflow_id,
                    "memberName": workflow["memberName"],
                    "submittedAt": workflow["submittedAt"],
                    "currentLevel": approval["level"],
                    "deadlineDate": workflow["deadlineDate"],
                })
    
    return jsonify({
        "pendingCount": len(pending),
        "approvals": pending
    })

@app.route("/api/evaluations/status-tracking", methods=["GET"])
def get_status_tracking():
    """Get all workflow statuses"""
    admin_id = request.args.get("adminId")
    
    workflows_data = []
    for workflow_id, workflow in EVALUATION_WORKFLOWS.items():
        if admin_id:
            # Check if admin is in approval chain
            in_chain = any(a["approverId"] == admin_id for a in workflow["approvalChain"])
            if not in_chain:
                continue
        
        workflows_data.append({
            "workflowId": workflow_id,
            "memberName": workflow["memberName"],
            "memberId": workflow["memberId"],
            "currentStatus": workflow["currentStatus"],
            "submittedAt": workflow["submittedAt"],
            "deadlineDate": workflow["deadlineDate"],
            "approvalChain": workflow["approvalChain"],
            "rejectionCount": len(workflow["rejectionHistory"]),
        })
    
    return jsonify(workflows_data)

@app.route("/api/dashboard-stats", methods=["GET"])
def get_dashboard_stats():
    """Get dashboard stats"""
    admin_id = request.args.get("adminId")
    
    pending_approvals = 0
    rejected_count = 0
    approved_count = 0
    
    for workflow in EVALUATION_WORKFLOWS.values():
        if admin_id:
            in_chain = any(a["approverId"] == admin_id for a in workflow["approvalChain"])
            if not in_chain:
                continue
        
        for approval in workflow["approvalChain"]:
            if approval["approverId"] == admin_id:
                if approval["status"] == "pending":
                    pending_approvals += 1
        
        if workflow["currentStatus"] == "rejected":
            rejected_count += 1
        elif workflow["currentStatus"] == "approved":
            approved_count += 1
    
    return jsonify({
        "workflowStats": {
            "pendingApprovals": pending_approvals,
            "rejected": rejected_count,
            "approved": approved_count,
        }
    })

@app.route("/api/notifications", methods=["GET"])
def get_notifications():
    """Get notifications"""
    user_id = request.args.get("userId")
    
    if not user_id:
        return jsonify({"error": "userId required"}), 400
    
    user_notifications = [n for n in NOTIFICATIONS if n["recipientId"] == user_id]
    unread_count = len([n for n in user_notifications if not n["read"]])
    
    return jsonify({
        "notifications": sorted(user_notifications, key=lambda x: x["createdAt"], reverse=True),
        "unreadCount": unread_count,
    })

@app.route("/api/notifications/<notification_id>/read", methods=["POST"])
def mark_notification_read(notification_id):
    """Mark notification as read"""
    notification = next((n for n in NOTIFICATIONS if n["id"] == notification_id), None)
    if not notification:
        return jsonify({"error": "Notification not found"}), 404
    
    notification["read"] = True
    return jsonify({"success": True})

@app.route("/api/evaluations/<member_id>/feedback", methods=["GET"])
def get_ai_feedback(member_id):
    """Get AI/admin feedback for a team member"""
    feedback_map = {
        "emp_001": "Strong backend engineer with excellent technical skills. Demonstrates leadership potential.",
        "emp_002": "Solid performer with consistent contributions. Good team collaboration.",
        "emp_003": "Effective engineer with strong problem-solving abilities.",
        "emp_004": "Excellent frontend development skills. Innovative approach to UI/UX.",
        "emp_005": "Reliable performer with good attention to detail.",
        "emp_006": "Strong sales performance with excellent client relationships.",
        "emp_007": "Good sales management skills and team coordination.",
        "emp_008": "Dedicated sales associate with improving performance.",
    }
    
    feedback = feedback_map.get(member_id, "Consistent performer with good results.")
    
    recommendation_map = {
        "emp_001": "Continue leading architecture discussions. Consider mentoring junior engineers.",
        "emp_002": "Build on current momentum. Take on more complex projects.",
        "emp_003": "Develop communication skills for team lead opportunities.",
        "emp_004": "Explore design patterns and system architecture.",
        "emp_005": "Focus on performance optimization and code review quality.",
        "emp_006": "Target premium client segments for higher revenue opportunities.",
        "emp_007": "Strengthen team coaching and development initiatives.",
        "emp_008": "Increase client engagement and networking activities.",
    }
    
    recommendation = recommendation_map.get(member_id, "Continue current trajectory.")
    
    return jsonify({
        "feedback": feedback,
        "recommendation": recommendation,
    })

if __name__ == "__main__":
    app.run(debug=True, port=5001)
