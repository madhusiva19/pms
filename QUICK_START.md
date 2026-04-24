# 🚀 Quick Start Guide - Workflow Management System

## ✅ What's Implemented

Your PMS now includes a complete **multi-level evaluation workflow system** with:

### 1. ✅ **Multi-Level Approval Process**
- 3-tier approval hierarchy (Manager → Senior Manager → Director)
- Each level can approve or reject
- Automatic progression through levels
- Real-time status tracking

### 2. ✅ **Rejection & Re-submission Flow**
- Approvers can reject with detailed reasons
- Comments provided at each rejection
- Employees can edit and resubmit
- Complete rejection history maintained
- Auto-reset to Level 1 on resubmission

### 3. ✅ **Status Tracking View**
- Real-time evaluation status display
- Visual approval chain timeline
- Rejection history with reasons
- Performance category breakdown
- Deadline countdown

### 4. ✅ **Smart Notifications**
- Auto alerts for pending approvals
- Rejection notifications with reason
- Approval confirmations
- Deadline warnings
- Unread count badge
- Auto-refresh every 10 seconds

---

## 🎯 How to Use

### **For Employees - Submit Evaluation**

1. Go to **My Team** → Select a team member
2. Click **"Evaluate Member"** button
3. Fill in the evaluation form
4. Click **"Submit Evaluation"**
5. Evaluation enters **Level 1 Approval** stage
6. Monitor status in **Status Tracker**

### **For Managers - Approve/Reject**

1. Go to **Workflow** → **Approval Management**
2. View all **Pending Approvals** in your queue
3. Click evaluation to review details
4. View complete **Approval Chain** 
5. **Approve** → Moves to next level OR
6. **Reject & Send Back** → Employee gets feedback
7. Employee can resubmit with updates

### **For Anyone - Track Status**

1. Go to **Workflow** → **Status Tracker**
2. View all evaluations with current status
3. See approval timeline for each
4. Check rejection history if applicable
5. View performance categories

### **For All - Get Notifications**

1. Click **🔔** notification bell in **Workflow Dashboard**
2. View all notifications
3. See unread count badge
4. Click to mark as read

---

## 📊 Workflow Status Stages

```
DRAFT
   ↓
SUBMITTED (Initial submission)
   ↓
PENDING L1 (Manager review) → [APPROVE] or [REJECT]
   ↓
PENDING L2 (Sr. Manager review) → [APPROVE] or [REJECT]
   ↓
PENDING L3 (Director review) → [APPROVE] or [REJECT]
   ↓
APPROVED ✅ (Complete)

If REJECTED at any level:
   → Employee gets notification with reason
   → Employee can RESUBMIT
   → Back to PENDING L1
```

---

## 🔌 API Endpoints

### Submit Evaluation
```
POST /api/evaluation/submit
```

### Workflow Actions
```
GET /api/workflow/{workflowId}
POST /api/workflow/{workflowId}/approve
POST /api/workflow/{workflowId}/reject
POST /api/workflow/{workflowId}/resubmit
```

### Approvals & Status
```
GET /api/approvals/pending?approverId=101
GET /api/evaluations/status-tracking
```

### Notifications
```
GET /api/notifications?userId=101
POST /api/notifications/{notificationId}/read
```

---

## 🎨 Frontend Routes

| Route | Purpose |
|-------|---------|
| `/workflow` | Main dashboard with overview |
| `/workflow/approvals` | Manager approval interface |
| `/workflow/status-tracker` | Status tracking for all evaluations |
| `/my-team` | View team members (existing) |
| `/evaluate-member` | Fill evaluation form (existing) |

---

## ⚙️ System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   WORKFLOW SYSTEM                    │
├─────────────────────────────────────────────────────┤
│                                                       │
│  BACKEND (Flask - Port 5001)                        │
│  ├─ Workflow Management Logic                       │
│  ├─ Multi-level Approval Chain                      │
│  ├─ Rejection Handling                              │
│  ├─ Notification Triggers                           │
│  └─ Mock Data Storage                               │
│                                                       │
│  FRONTEND (Next.js - Port 3000)                     │
│  ├─ Workflow Dashboard                              │
│  ├─ Approval Interface                              │
│  ├─ Status Tracker                                  │
│  ├─ Notification Center                             │
│  └─ Evaluation Forms                                │
│                                                       │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 Running the System

### Terminal 1 - Start Backend
```bash
cd /Users/denushathavaruban/Desktop/pms/backend
/Users/denushathavaruban/Desktop/pms/backend/venv/bin/python app.py
```

### Terminal 2 - Start Frontend
```bash
cd /Users/denushathavaruban/Desktop/pms/frontend
npm run dev
```

### Access
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5001
- **Workflow Dashboard**: http://localhost:3000/workflow

---

## 📝 Key Features

### Approval Chain
- 3-level hierarchical approvals
- Each approver can see previous level comments
- Progress visualization
- Deadline tracking

### Rejection Management
- Detailed rejection reasons
- Comments for feedback
- Multiple rejection attempts allowed
- Complete audit trail

### Notifications
- Real-time alerts
- Approval pending notifications
- Rejection notifications with reason
- Deadline warnings
- Auto-refresh system

### Status Tracking
- Current approval stage
- Who approved at each level
- Rejection history
- Deadline date
- Days remaining indicator

---

## 🔐 Security Notes

**Current Setup (Development):**
- Using mock approver IDs: "101" (Manager), "102" (Sr. Manager), "100" (Director)
- User authentication not implemented
- Mock data in memory

**For Production:**
- Implement proper user authentication
- Add role-based access control (RBAC)
- Use database instead of in-memory storage
- Add email notifications
- Implement audit logging
- Add data encryption

---

## 📚 Additional Resources

- See `WORKFLOW_DOCUMENTATION.md` for detailed documentation
- Check `app.py` for backend implementation
- Review `frontend/app/workflow/` for UI components
- Type definitions in `frontend/app/workflow/types/index.ts`

---

## ❓ Troubleshooting

### Port 5001 already in use?
```bash
lsof -i :5001 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### Backend not starting?
```bash
# Check if virtual environment is activated
source /Users/denushathavaruban/Desktop/pms/backend/venv/bin/activate

# Run with full path
/Users/denushathavaruban/Desktop/pms/backend/venv/bin/python \
  /Users/denushathavaruban/Desktop/pms/backend/app.py
```

### Frontend not connecting to backend?
- Ensure backend is running on port 5001
- Check browser console for CORS errors
- Verify API URL is `http://localhost:5001`

---

## ✨ What's Next?

1. **Database Integration** - Replace mock data with real database
2. **Email Notifications** - Send emails for approvals/rejections
3. **Analytics** - Track approval times and metrics
4. **Custom Templates** - Allow custom evaluation templates
5. **Bulk Operations** - Approve multiple evaluations at once

---

**System Ready! 🎉** Start using the workflow at http://localhost:3000/workflow
